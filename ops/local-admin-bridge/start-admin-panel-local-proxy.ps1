param(
  [switch]$NoOpen,
  [switch]$DryRun,
  [switch]$NoDirectRoute,
  [switch]$AllowDirectRoute,
  [int]$ProxyPort = 5177,
  [int]$TunnelPort = 5176,
  [int]$RemoteAdminPort = 3456,
  [string]$SshHost = $env:GCC_ADMIN_SSH_HOST,
  [string]$SshUser = $(if ($env:GCC_ADMIN_SSH_USER) { $env:GCC_ADMIN_SSH_USER } else { "root" }),
  [string]$SshKey = $(if ($env:GCC_ADMIN_SSH_KEY) { $env:GCC_ADMIN_SSH_KEY } else { Join-Path $env:USERPROFILE ".ssh\gao_new.pem" }),
  [string]$AdminDist = $(Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..")) "admin\dist"),
  [string]$ProxyScript = $(Join-Path $PSScriptRoot "admin-panel-local-proxy.mjs"),
  [string]$RouteMarker = $(Join-Path $env:LOCALAPPDATA "proxy-gateway\admin-panel-local-proxy.route-created")
)

$ErrorActionPreference = "Stop"

$apiTarget = "http://127.0.0.1:$TunnelPort"
$panelUrl = "http://127.0.0.1:$ProxyPort/"
$stopScript = Join-Path $PSScriptRoot "stop-admin-panel-local-proxy.ps1"

function Resolve-SshTarget {
  if (-not $SshHost) {
    throw "GCC_ADMIN_SSH_HOST or -SshHost is required."
  }
  return "$SshUser@$SshHost"
}

function Test-LocalPort([int]$Port) {
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  return [bool]$connections
}

function Test-AdminTunnelHealth {
  try {
    $response = Invoke-WebRequest -Uri "$apiTarget/api/health" -UseBasicParsing -TimeoutSec 3
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Test-LocalProxySession {
  try {
    $response = Invoke-WebRequest -Uri "http://127.0.0.1:$ProxyPort/__local-admin/status" -UseBasicParsing -TimeoutSec 3
    return ($response.StatusCode -eq 200)
  } catch {
    return $false
  }
}

function Get-ProcessCommandLine([int]$ProcessId) {
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    return [string]$process.CommandLine
  } catch {
    return ""
  }
}

function Stop-StaleLocalAdminProxy {
  $connections = Get-NetTCPConnection -LocalPort $ProxyPort -State Listen -ErrorAction SilentlyContinue
  if (-not $connections) {
    return $true
  }

  $stoppedAny = $false
  foreach ($connection in $connections) {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if (-not $process) {
      continue
    }

    $commandLine = Get-ProcessCommandLine $process.Id
    $isOwnedProxy = (
      $process.ProcessName -eq "node" -and
      $commandLine -and
      $commandLine.Contains($ProxyScript)
    )
    if (-not $isOwnedProxy) {
      return $false
    }

    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    Write-Host "Stopped stale local admin proxy on 127.0.0.1:$ProxyPort"
    $stoppedAny = $true
  }

  if ($stoppedAny) {
    for ($i = 0; $i -lt 20; $i++) {
      Start-Sleep -Milliseconds 250
      if (-not (Test-LocalPort $ProxyPort)) {
        return $true
      }
    }
  }

  return -not (Test-LocalPort $ProxyPort)
}

function New-LocalSecret {
  $bytes = New-Object byte[] 32
  $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  } finally {
    $rng.Dispose()
  }
  return -join ($bytes | ForEach-Object { $_.ToString("x2") })
}

function Get-SshRouteSummary {
  try {
    $route = Find-NetRoute -RemoteIPAddress $SshHost -ErrorAction Stop | Select-Object -First 1
    if (-not $route) {
      return "unknown"
    }
    return "$($route.InterfaceAlias) / $($route.IPAddress)"
  } catch {
    return "unknown"
  }
}

function Test-IsElevated {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

function Get-WlanDefaultRoute {
  return Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue |
    Where-Object { $_.InterfaceAlias -eq "WLAN" -and $_.NextHop } |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1
}

function Get-SshHostRoute {
  return Get-NetRoute -DestinationPrefix "$SshHost/32" -ErrorAction SilentlyContinue |
    Sort-Object RouteMetric, InterfaceMetric |
    Select-Object -First 1
}

function Ensure-SshDirectHostRoute {
  $routeSummary = Get-SshRouteSummary
  Write-Host "SSH route to ${SshHost}: $routeSummary"
  if (-not ($routeSummary -match "(?i)Mihomo|198\.18\.")) {
    return
  }

  if ($NoDirectRoute -or -not $AllowDirectRoute) {
    Write-Host "SSH is currently routed through Mihomo/TUN. Leaving routing to Clash/Mihomo; no direct host route will be added."
    return
  }

  $wlanRoute = Get-WlanDefaultRoute
  if (-not $wlanRoute) {
    throw "SSH is routed through Mihomo/TUN, and no WLAN default route was found. Set $SshHost to DIRECT in Mihomo first."
  }

  $hostRoute = Get-SshHostRoute
  if ($hostRoute -and $hostRoute.NextHop -eq $wlanRoute.NextHop -and $hostRoute.InterfaceIndex -eq $wlanRoute.InterfaceIndex) {
    Write-Host "Reusing direct host route for ${SshHost}: $($wlanRoute.NextHop) via if $($wlanRoute.InterfaceIndex)"
    return
  }

  if (-not (Test-IsElevated)) {
    throw "SSH is routed through Mihomo/TUN. Rerun this script from an elevated PowerShell with -AllowDirectRoute, or keep the route managed by Mihomo/Clash."
  }

  $routeDir = Split-Path -Parent $RouteMarker
  if ($routeDir -and -not (Test-Path -LiteralPath $routeDir)) {
    New-Item -ItemType Directory -Path $routeDir -Force | Out-Null
  }

  Write-Host "Adding temporary direct host route for ${SshHost}: $($wlanRoute.NextHop) via if $($wlanRoute.InterfaceIndex)"
  & route.exe ADD $SshHost MASK 255.255.255.255 $wlanRoute.NextHop METRIC 1 IF $wlanRoute.InterfaceIndex | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to add temporary direct host route for $SshHost."
  }
  Set-Content -LiteralPath $RouteMarker -Value "host=$SshHost`nnextHop=$($wlanRoute.NextHop)`ninterfaceIndex=$($wlanRoute.InterfaceIndex)" -Encoding ASCII

  $afterSummary = Get-SshRouteSummary
  Write-Host "SSH route after direct host route: $afterSummary"
}

function Wait-AdminTunnelReady($Process) {
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if ((Test-LocalPort $TunnelPort) -and (Test-AdminTunnelHealth)) {
      return $true
    }
    if ($Process -and $Process.HasExited) {
      return $false
    }
  }
  return $false
}

function Start-SshAdminTunnel {
  $sshTarget = Resolve-SshTarget
  if (Test-LocalPort $TunnelPort) {
    if (Test-AdminTunnelHealth) {
      Write-Host "Reusing SSH admin tunnel: 127.0.0.1:$TunnelPort -> 127.0.0.1:$RemoteAdminPort"
      return
    }
    throw "Local port 127.0.0.1:$TunnelPort is already listening, but remote /api/health is not reachable through it. Run the recovery command: powershell -ExecutionPolicy Bypass -File `"$stopScript`" ; then rerun this script."
  }

  Ensure-SshDirectHostRoute

  $sshOptions = @(
    "-o", "BatchMode=yes",
    "-o", "ExitOnForwardFailure=yes",
    "-o", "IdentitiesOnly=yes",
    "-o", "ServerAliveInterval=30",
    "-o", "ServerAliveCountMax=2",
    "-i", $SshKey
  )
  $forwardSpec = "$TunnelPort`:127.0.0.1:$RemoteAdminPort"
  $sshArgs = $sshOptions + @("-N", "-L", $forwardSpec, $sshTarget)
  Write-Host "Starting SSH admin tunnel: 127.0.0.1:$TunnelPort -> 127.0.0.1:$RemoteAdminPort"
  $process = Start-Process -FilePath "ssh" -ArgumentList $sshArgs -WindowStyle Hidden -PassThru

  if (-not (Wait-AdminTunnelReady $process)) {
    if ($process -and -not $process.HasExited) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    }
    throw "SSH admin tunnel did not become ready on 127.0.0.1:$TunnelPort. Check SSH target '$sshTarget' and remote admin service on 127.0.0.1:$RemoteAdminPort."
  }
}

function Read-RemoteConsoleToken {
  $sshTarget = Resolve-SshTarget
  $sshOptions = @(
    "-o", "BatchMode=yes",
    "-o", "IdentitiesOnly=yes",
    "-i", $SshKey
  )
  $remoteTokenCommand = @'
set -eu
files=$(systemctl show -p EnvironmentFiles --value proxy-gateway-candidate.service 2>/dev/null || true)
for item in $files; do
  clean=${item#-}
  if [ -f "$clean" ]; then
    set -a
    . "$clean"
    set +a
  fi
done
if [ -z "${CONSOLE_TOKEN:-}" ]; then
  exit 1
fi
printf "%s" "$CONSOLE_TOKEN"
'@
  $token = & ssh @sshOptions $sshTarget $remoteTokenCommand 2>$null
  if (($LASTEXITCODE -ne 0) -or (-not $token)) {
    throw "Console token could not be loaded through SSH target '$sshTarget'."
  }
  return $token
}

if ($DryRun) {
  Write-Host "Admin panel local proxy dry run:"
  Write-Host "  SSH target: $(Resolve-SshTarget)"
  Write-Host "  SSH key: $SshKey"
  Write-Host "  SSH tunnel: 127.0.0.1:$TunnelPort -> 127.0.0.1:$RemoteAdminPort"
  Write-Host "  API target: $apiTarget"
  Write-Host "  Panel URL: $panelUrl"
  Write-Host "  Admin dist: $AdminDist"
  Write-Host "  Proxy script: $ProxyScript"
  Write-Host "  Local admin auth: one-time bootstrap + HttpOnly SameSite session cookie"
  Write-Host "  Direct route mode: $AllowDirectRoute"
  Write-Host "  Direct route marker: $RouteMarker"
  return
}

if (-not (Test-Path -LiteralPath (Join-Path $AdminDist "index.html"))) {
  throw "Admin dist is missing: $AdminDist"
}

if (-not (Test-Path -LiteralPath $ProxyScript)) {
  throw "Local proxy script is missing: $ProxyScript"
}

if (-not (Test-Path -LiteralPath $SshKey)) {
  throw "SSH key is missing: $SshKey"
}

Start-SshAdminTunnel
$token = Read-RemoteConsoleToken
$localBootstrapToken = New-LocalSecret
$localSessionSecret = New-LocalSecret

[Environment]::SetEnvironmentVariable("GCC_ADMIN_PANEL_URL", $panelUrl, "User")
[Environment]::SetEnvironmentVariable("GCC_ADMIN_API_TUNNEL_URL", $apiTarget, "User")

function Start-LocalAdminProxyProcess {
  $env:CONSOLE_TOKEN = $token
  $env:ADMIN_API_TARGET = $apiTarget
  $env:ADMIN_PANEL_DIST = $AdminDist
  $env:ADMIN_PANEL_PROXY_PORT = [string]$ProxyPort
  $env:LOCAL_ADMIN_PROXY_BOOTSTRAP_TOKEN = $localBootstrapToken
  $env:LOCAL_ADMIN_PROXY_SESSION_SECRET = $localSessionSecret
  Start-Process -FilePath "node" -ArgumentList @($ProxyScript) -WindowStyle Hidden
}

if (-not (Test-LocalPort $ProxyPort)) {
  Start-LocalAdminProxyProcess
} elseif (-not (Test-LocalProxySession)) {
  if (-not (Stop-StaleLocalAdminProxy)) {
    throw "Local admin proxy port 127.0.0.1:$ProxyPort is already in use but does not have an authenticated local session. Run the recovery command: powershell -ExecutionPolicy Bypass -File `"$stopScript`" ; then rerun this script."
  }
  Start-LocalAdminProxyProcess
}

$proxyReady = $false
for ($i = 0; $i -lt 20; $i++) {
  Start-Sleep -Milliseconds 500
  if (Test-LocalPort $ProxyPort) {
    $proxyReady = $true
    break
  }
}
if (-not $proxyReady) {
  throw "Local admin proxy did not become ready on 127.0.0.1:$ProxyPort"
}

if (-not $NoOpen) {
  $bootstrapUrl = "http://127.0.0.1:$ProxyPort/__local-admin/bootstrap?token=$localBootstrapToken"
  Start-Process $bootstrapUrl
  Write-Host "Admin panel opened: $panelUrl"
} else {
  Write-Host "Admin panel ready but locked: $panelUrl"
  Write-Host "Run without -NoOpen to create the one-time local admin session."
}
Write-Host "API tunnel: $apiTarget"
Write-Host "Token handling: remote Console Token loaded into the local proxy process only; not written to this file or browser storage."
