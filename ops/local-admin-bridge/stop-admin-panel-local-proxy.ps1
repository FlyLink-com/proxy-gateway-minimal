param(
  [int]$ProxyPort = 5177,
  [int]$TunnelPort = 5176,
  [int]$RemoteAdminPort = 3456,
  [string]$ProxyScript = $(Join-Path $PSScriptRoot "admin-panel-local-proxy.mjs"),
  [string]$RouteMarker = $(Join-Path $env:LOCALAPPDATA "proxy-gateway\admin-panel-local-proxy.route-created"),
  [switch]$ForceUnknownListeners
)

$ErrorActionPreference = "Stop"

function Get-ProcessCommandLine([int]$ProcessId) {
  try {
    $process = Get-CimInstance Win32_Process -Filter "ProcessId = $ProcessId" -ErrorAction Stop
    return [string]$process.CommandLine
  } catch {
    return ""
  }
}

function Stop-ListenerIfOwned([int]$Port) {
  $connections = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  foreach ($connection in $connections) {
    $process = Get-Process -Id $connection.OwningProcess -ErrorAction SilentlyContinue
    if (-not $process) {
      continue
    }

    $commandLine = Get-ProcessCommandLine $process.Id
    $isOwnedProxy = (
      $Port -eq $ProxyPort -and
      $process.ProcessName -eq "node" -and
      $commandLine -and
      $commandLine.Contains($ProxyScript)
    )
    $isOwnedTunnel = (
      $Port -eq $TunnelPort -and
      $process.ProcessName -eq "ssh" -and
      $commandLine -and
      $commandLine.Contains("-L") -and
      $commandLine.Contains("$TunnelPort`:127.0.0.1:$RemoteAdminPort")
    )

    if ($isOwnedProxy -or $isOwnedTunnel -or $ForceUnknownListeners) {
      Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
      Write-Host "Stopped $($process.ProcessName) on port $Port"
      continue
    }

    Write-Warning "Skipping unknown listener on 127.0.0.1:$Port owned by process $($process.Id). Re-run with -ForceUnknownListeners only if you have verified it is safe."
  }
}

Stop-ListenerIfOwned -Port $ProxyPort
Stop-ListenerIfOwned -Port $TunnelPort

if (Test-Path -LiteralPath $RouteMarker) {
  $routeFacts = @{}
  foreach ($line in (Get-Content -LiteralPath $RouteMarker)) {
    if ($line -match "^([^=]+)=(.*)$") {
      $routeFacts[$Matches[1]] = $Matches[2]
    }
  }

  $routeHost = $routeFacts["host"]
  if ($routeHost) {
    & route.exe DELETE $routeHost MASK 255.255.255.255 | Out-Null
    if ($LASTEXITCODE -eq 0) {
      Write-Host "Removed temporary direct host route for $routeHost"
      Remove-Item -LiteralPath $RouteMarker -Force
    } else {
      Write-Warning "Temporary direct host route for $routeHost was already absent or could not be removed automatically."
    }
  } else {
    Remove-Item -LiteralPath $RouteMarker -Force
  }
}
