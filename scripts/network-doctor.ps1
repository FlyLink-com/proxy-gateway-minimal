# network-doctor.ps1 - Windows proxy stack diagnostics and repair
# Usage:
#   .\scripts\network-doctor.ps1 status [-Json]
#   .\scripts\network-doctor.ps1 repair [-Json] [-IncludeWinHttp]
#   .\scripts\network-doctor.ps1 reset [-Json] [-IncludeWinHttp]

param(
    [ValidateSet("status", "repair", "reset")]
    [string]$Action = "status",
    [switch]$Json,
    [switch]$IncludeWinHttp
)

$ErrorActionPreference = "SilentlyContinue"

$RootDir = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$RegPath = "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
$ProxyAddr = "127.0.0.1"
$ConsolePort = 3456
$SocksPort = 1080
$HttpPort = 18180
$ExpectedHttpProxy = "http://${ProxyAddr}:${HttpPort}"
$ExpectedHttpServer = "${ProxyAddr}:${HttpPort}"
$ExpectedSocksProxy = "socks5://${ProxyAddr}:${SocksPort}"
$ProxyOverride = "localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.3*;192.168.*;*.local"

function Coalesce {
    param($Value, $Fallback)
    if ($null -ne $Value) { return $Value }
    return $Fallback
}

function Ensure-InternetSettingsKey {
    if (-not (Test-Path $RegPath)) {
        New-Item -Path $RegPath | Out-Null
    }
}

function Ensure-WinInetType {
    if (-not ([System.Management.Automation.PSTypeName]"ProxyGateway.WinInet").Type) {
        Add-Type -Namespace ProxyGateway -Name WinInet -MemberDefinition @"
[DllImport("wininet.dll", SetLastError = true)]
public static extern bool InternetSetOption(System.IntPtr hInternet, int dwOption, System.IntPtr lpBuffer, int dwBufferLength);
"@
    }
}

function Ensure-BroadcastType {
    if (-not ([System.Management.Automation.PSTypeName]"ProxyGateway.Broadcast").Type) {
        Add-Type -Namespace ProxyGateway -Name Broadcast -MemberDefinition @"
[DllImport("user32.dll", SetLastError = true, CharSet = CharSet.Auto)]
public static extern System.IntPtr SendMessageTimeout(System.IntPtr hWnd, uint Msg, System.IntPtr wParam, string lParam, uint fuFlags, uint uTimeout, out System.IntPtr lpdwResult);
"@
    }
}

function Send-SettingChange {
    param([string]$Area)

    Ensure-BroadcastType
    $HWND_BROADCAST = [IntPtr]0xffff
    $WM_SETTINGCHANGE = 0x1a
    $SMTO_ABORTIFHUNG = 0x2
    $result = [IntPtr]::Zero
    [ProxyGateway.Broadcast]::SendMessageTimeout($HWND_BROADCAST, $WM_SETTINGCHANGE, [IntPtr]::Zero, $Area, $SMTO_ABORTIFHUNG, 5000, [ref]$result) | Out-Null
}

function Refresh-WindowsProxy {
    Ensure-InternetSettingsKey
    Set-ItemProperty -Path $RegPath -Name "ProxySettingsPerUser" -Value 1 -ErrorAction SilentlyContinue

    Ensure-WinInetType
    [ProxyGateway.WinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
    [ProxyGateway.WinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
    Send-SettingChange "Software\Microsoft\Windows\CurrentVersion\Internet Settings"
}

function Send-EnvironmentChange {
    Send-SettingChange "Environment"
}

function Get-InternetSettings {
    Ensure-InternetSettingsKey
    $props = Get-ItemProperty -Path $RegPath
    return [ordered]@{
        ProxyEnable = [int](Coalesce $props.ProxyEnable 0)
        ProxyServer = [string](Coalesce $props.ProxyServer "")
        AutoConfigURL = [string](Coalesce $props.AutoConfigURL "")
        ProxyOverride = [string](Coalesce $props.ProxyOverride "")
    }
}

function Get-ProxyEnv {
    $names = @("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY")
    $user = [ordered]@{}
    $process = [ordered]@{}
    foreach ($name in $names) {
        $user[$name] = [Environment]::GetEnvironmentVariable($name, "User")
        $process[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
    }
    return [ordered]@{ user = $user; process = $process }
}

function Get-ProcessNameSafe {
    param([int]$ProcessId)
    if (-not $ProcessId) { return $null }
    $proc = Get-Process -Id $ProcessId -ErrorAction SilentlyContinue
    if ($proc) { return $proc.ProcessName }
    return $null
}

function Get-PortState {
    param([int]$Port)

    $entry = $null
    try {
        $entry = Get-NetTCPConnection -State Listen -LocalPort $Port -ErrorAction Stop |
            Where-Object { @("127.0.0.1", "::1", "0.0.0.0", "::") -contains $_.LocalAddress } |
            Select-Object -First 1
    } catch {}

    if ($entry) {
        return [ordered]@{
            port = $Port
            listening = $true
            localAddress = $entry.LocalAddress
            pid = $entry.OwningProcess
            process = (Get-ProcessNameSafe $entry.OwningProcess)
        }
    }

    $line = $null
    try {
        $line = netstat -ano |
            Select-String -Pattern "LISTENING" |
            Where-Object { $_.Line -match "[:.]$Port\s" } |
            Select-Object -First 1
    } catch {}

    if ($line) {
        $pid = $null
        if ($line.Line -match "\s+(\d+)\s*$") {
            $pid = [int]$Matches[1]
        }
        return [ordered]@{
            port = $Port
            listening = $true
            localAddress = $null
            pid = $pid
            process = (Get-ProcessNameSafe $pid)
        }
    }

    return [ordered]@{
        port = $Port
        listening = $false
        localAddress = $null
        pid = $null
        process = $null
    }
}

function Get-WinHttpProxy {
    $output = ""
    try {
        $output = (netsh winhttp show proxy 2>&1) -join "`n"
    } catch {
        $output = $_.Exception.Message
    }

    return [ordered]@{
        active = ($output -notmatch "Direct access" -and $output -match "Proxy")
        targetOk = ($output -match [regex]::Escape($ExpectedHttpServer))
        output = $output.Trim()
    }
}

function Read-TextIfExists {
    param([string]$Path)
    if (Test-Path $Path) {
        return Get-Content -LiteralPath $Path -Raw -ErrorAction SilentlyContinue
    }
    return ""
}

function Find-YamlValue {
    param([string]$Text, [string]$Key)
    if ($Text -match "(?m)^\s*$([regex]::Escape($Key)):\s*(.*?)\s*$") {
        return ($Matches[1] -replace "^[`"']|[`"']$", "").Trim()
    }
    return $null
}

function To-NullableBool {
    param([string]$Value)
    if ($null -eq $Value) { return $null }
    return $Value -match "^(true|1|yes)$"
}

function To-NullableInt {
    param([string]$Value)
    if ($null -eq $Value) { return $null }
    $parsed = 0
    if ([int]::TryParse($Value, [ref]$parsed)) { return $parsed }
    return $null
}

function Get-ClashSummary {
    $appData = [Environment]::GetFolderPath("ApplicationData")
    $dir = Join-Path $appData "io.github.clash-verge-rev.clash-verge-rev"
    $vergePath = Join-Path $dir "verge.yaml"
    $configPath = Join-Path $dir "config.yaml"
    $profilesPath = Join-Path $dir "profiles.yaml"
    $verge = Read-TextIfExists $vergePath
    $config = Read-TextIfExists $configPath
    $profiles = Read-TextIfExists $profilesPath
    $mixedPort = To-NullableInt (Find-YamlValue $config "mixed-port")
    if ($null -eq $mixedPort) { $mixedPort = To-NullableInt (Find-YamlValue $verge "verge_mixed_port") }
    $clashSocksPort = To-NullableInt (Find-YamlValue $config "socks-port")
    if ($null -eq $clashSocksPort) { $clashSocksPort = To-NullableInt (Find-YamlValue $verge "verge_socks_port") }
    $clashHttpPort = To-NullableInt (Find-YamlValue $config "port")
    if ($null -eq $clashHttpPort) { $clashHttpPort = To-NullableInt (Find-YamlValue $verge "verge_port") }
    $running = @(
        Get-Process -ErrorAction SilentlyContinue |
            Where-Object { $_.ProcessName -match "clash|mihomo|verge" } |
            Select-Object -First 8 |
            ForEach-Object { [ordered]@{ name = $_.ProcessName; pid = $_.Id } }
    )

    return [ordered]@{
        configPresent = [bool]($verge -or $config)
        running = $running
        enableSystemProxy = (To-NullableBool (Find-YamlValue $verge "enable_system_proxy"))
        enableProxyGuard = (To-NullableBool (Find-YamlValue $verge "enable_proxy_guard"))
        tunEnabled = (To-NullableBool (Find-YamlValue $verge "enable_tun_mode"))
        proxyAutoConfig = (To-NullableBool (Find-YamlValue $verge "proxy_auto_config"))
        currentProfile = (Find-YamlValue $profiles "current")
        subscriptionExpired = (($verge + "`n" + $config) -match "expired|renew|subscription|订阅已过期|续费")
        ports = [ordered]@{
            mixed = $mixedPort
            socks = $clashSocksPort
            http = $clashHttpPort
        }
    }
}

function Get-AutostartState {
    $task = Get-ScheduledTask -TaskName "ProxyGatewayConsole" -ErrorAction SilentlyContinue
    if (-not $task) {
        return [ordered]@{ enabled = $false; state = "missing"; taskName = "ProxyGatewayConsole" }
    }
    return [ordered]@{
        enabled = ($task.State -ne "Disabled")
        state = [string]$task.State
        taskName = "ProxyGatewayConsole"
    }
}

function New-Issue {
    param([string]$Code, [string]$Severity, [string]$Message)
    return [ordered]@{ code = $Code; severity = $Severity; message = $Message }
}

function Measure-NetworkState {
    param([string]$ActionName, [string[]]$Actions = @())

    $systemProxy = Get-InternetSettings
    $envProxy = Get-ProxyEnv
    $winHttp = Get-WinHttpProxy
    $clash = Get-ClashSummary
    $autostart = Get-AutostartState
    $ports = [ordered]@{
        console = (Get-PortState $ConsolePort)
        socks = (Get-PortState $SocksPort)
        httpProxy = (Get-PortState $HttpPort)
        clashMixed = (Get-PortState 7897)
        clashSocks = (Get-PortState 7898)
        clashHttp = (Get-PortState 7899)
    }

    $systemProxyTargetOk = ($systemProxy.ProxyEnable -eq 1 -and $systemProxy.ProxyServer -eq $ExpectedHttpServer -and -not $systemProxy.AutoConfigURL)
    $envUser = $envProxy.user
    $envProxyTargetOk = (
        $envUser.HTTP_PROXY -eq $ExpectedHttpProxy -and
        $envUser.HTTPS_PROXY -eq $ExpectedHttpProxy -and
        $envUser.ALL_PROXY -eq $ExpectedSocksProxy
    )
    $clashPotentialConflict = (
        $ports.clashMixed.listening -or
        $ports.clashSocks.listening -or
        $ports.clashHttp.listening -or
        ($clash.running.Count -gt 0) -or
        $clash.enableSystemProxy -eq $true -or
        $clash.enableProxyGuard -eq $true -or
        $clash.proxyAutoConfig -eq $true -or
        $clash.tunEnabled -eq $true
    )

    $issues = @()
    if (-not $ports.console.listening) {
        $issues += New-Issue "console-port-down" "error" "Console port 4077 is not listening."
    }
    if (-not $ports.httpProxy.listening) {
        $issues += New-Issue "http-proxy-port-down" "error" "HTTP proxy port 18180 is not listening."
    }
    if (-not $ports.socks.listening) {
        $issues += New-Issue "socks-port-down" "error" "SOCKS5 port 1080 is not listening."
    }
    if ($systemProxy.AutoConfigURL) {
        $issues += New-Issue "pac-enabled" "warning" "WinINet PAC is enabled and can override the expected local HTTP proxy."
    }
    if ($systemProxy.ProxyEnable -eq 1 -and $systemProxy.ProxyServer -ne $ExpectedHttpServer) {
        $issues += New-Issue "system-proxy-conflict" "warning" "WinINet proxy does not point to 127.0.0.1:18180."
    }
    if (($envUser.HTTP_PROXY -or $envUser.HTTPS_PROXY -or $envUser.ALL_PROXY) -and -not $envProxyTargetOk) {
        $issues += New-Issue "env-proxy-conflict" "warning" "User proxy environment variables do not match this project."
    }
    if ($winHttp.active -and -not $winHttp.targetOk) {
        $issues += New-Issue "winhttp-proxy-conflict" "warning" "WinHTTP proxy is set to a different target."
    }
    if ($clashPotentialConflict) {
        $issues += New-Issue "clash-mihomo-conflict" "warning" "Clash/Mihomo is installed, running, or owns common proxy ports."
    }
    if ($clash.subscriptionExpired) {
        $issues += New-Issue "clash-subscription-expired" "warning" "Clash Verge has expired subscription markers; prefer this project as the active proxy owner."
    }

    $hasError = @($issues | Where-Object { $_.severity -eq "error" }).Count -gt 0

    return [ordered]@{
        ok = (-not $hasError)
        action = $ActionName
        generatedAt = (Get-Date).ToString("o")
        expected = [ordered]@{
            console = "http://${ProxyAddr}:${ConsolePort}/"
            socks = $ExpectedSocksProxy
            httpProxy = $ExpectedHttpProxy
            pac = "http://${ProxyAddr}:${ConsolePort}/proxy.pac"
        }
        summary = [ordered]@{
            consoleListening = [bool]$ports.console.listening
            socksListening = [bool]$ports.socks.listening
            httpProxyListening = [bool]$ports.httpProxy.listening
            systemProxyTargetOk = [bool]$systemProxyTargetOk
            envProxyTargetOk = [bool]$envProxyTargetOk
            winHttpTargetOk = [bool]$winHttp.targetOk
            clashPotentialConflict = [bool]$clashPotentialConflict
            autostartEnabled = [bool]$autostart.enabled
        }
        ports = $ports
        systemProxy = $systemProxy
        environment = $envProxy
        winHttp = $winHttp
        autostart = $autostart
        clash = $clash
        issues = @($issues)
        actions = @($Actions)
    }
}

function Set-SystemProxy {
    Ensure-InternetSettingsKey
    Set-ItemProperty -Path $RegPath -Name "ProxyEnable" -Value 1
    Set-ItemProperty -Path $RegPath -Name "ProxyServer" -Value $ExpectedHttpServer
    Set-ItemProperty -Path $RegPath -Name "AutoConfigURL" -Value ""
    Set-ItemProperty -Path $RegPath -Name "ProxyOverride" -Value $ProxyOverride
    Refresh-WindowsProxy
}

function Clear-SystemProxy {
    Ensure-InternetSettingsKey
    Set-ItemProperty -Path $RegPath -Name "ProxyEnable" -Value 0
    Set-ItemProperty -Path $RegPath -Name "ProxyServer" -Value ""
    Set-ItemProperty -Path $RegPath -Name "AutoConfigURL" -Value ""
    Refresh-WindowsProxy
}

function Set-ProxyEnvironment {
    [Environment]::SetEnvironmentVariable("HTTP_PROXY", $ExpectedHttpProxy, "User")
    [Environment]::SetEnvironmentVariable("HTTPS_PROXY", $ExpectedHttpProxy, "User")
    [Environment]::SetEnvironmentVariable("ALL_PROXY", $ExpectedSocksProxy, "User")
    [Environment]::SetEnvironmentVariable("NO_PROXY", "localhost,127.0.0.1,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.2*,172.3*,192.168.*,*.local", "User")
    Send-EnvironmentChange
}

function Clear-ProxyEnvironment {
    [Environment]::SetEnvironmentVariable("HTTP_PROXY", $null, "User")
    [Environment]::SetEnvironmentVariable("HTTPS_PROXY", $null, "User")
    [Environment]::SetEnvironmentVariable("ALL_PROXY", $null, "User")
    [Environment]::SetEnvironmentVariable("NO_PROXY", $null, "User")
    Send-EnvironmentChange
}

function Set-WinHttpProxy {
    netsh winhttp set proxy proxy-server="$ExpectedHttpServer" bypass-list="$ProxyOverride" | Out-Null
}

function Clear-WinHttpProxy {
    netsh winhttp reset proxy | Out-Null
}

function Wait-ForPort {
    param([int]$Port, [int]$Attempts = 12)
    for ($i = 0; $i -lt $Attempts; $i++) {
        if ((Get-PortState $Port).listening) { return $true }
        Start-Sleep -Milliseconds 500
    }
    return $false
}

function Start-ConsoleDaemon {
    $bat = Join-Path $RootDir "start-detached.bat"
    if (Test-Path $bat) {
        Start-Process -FilePath "cmd.exe" -ArgumentList "/c", "`"$bat`"" -WorkingDirectory $RootDir -WindowStyle Hidden | Out-Null
        return $true
    }

    $daemon = Join-Path $RootDir "daemon.mjs"
    if (Test-Path $daemon) {
        Start-Process -FilePath "node" -ArgumentList "daemon.mjs" -WorkingDirectory $RootDir -WindowStyle Hidden | Out-Null
        return $true
    }

    return $false
}

function Get-ConsoleToken {
    $envToken = [Environment]::GetEnvironmentVariable("CONSOLE_TOKEN", "Process")
    if ($envToken) { return $envToken.Trim() }
    $tokenPath = Join-Path $RootDir ".proxy-gateway\console-token"
    if (Test-Path $tokenPath) {
        return (Get-Content -LiteralPath $tokenPath -Raw).Trim()
    }
    return $null
}

function Start-ProxyStackThroughConsole {
    $token = Get-ConsoleToken
    if (-not $token) { return $false }

    for ($i = 0; $i -lt 10; $i++) {
        try {
            Invoke-RestMethod -Method Post -Uri "http://${ProxyAddr}:${ConsolePort}/api/proxy/start" -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 10 | Out-Null
            return $true
        } catch {
            Start-Sleep -Milliseconds 700
        }
    }

    return $false
}

function Invoke-Repair {
    $actions = @()
    $state = Measure-NetworkState "repair"

    if (-not $state.summary.consoleListening) {
        if (Start-ConsoleDaemon) {
            $actions += "start-daemon"
            Wait-ForPort $ConsolePort | Out-Null
        }
    }

    $state = Measure-NetworkState "repair" $actions
    if (-not $state.summary.socksListening -or -not $state.summary.httpProxyListening) {
        if (Start-ProxyStackThroughConsole) {
            $actions += "start-proxy-stack"
            Wait-ForPort $SocksPort | Out-Null
            Wait-ForPort $HttpPort | Out-Null
        }
    }

    Set-SystemProxy
    $actions += "apply-system-proxy"
    Set-ProxyEnvironment
    $actions += "apply-env-proxy"

    if ($IncludeWinHttp) {
        Set-WinHttpProxy
        $actions += "apply-winhttp-proxy"
    }

    return Measure-NetworkState "repair" $actions
}

function Invoke-Reset {
    $actions = @()
    Clear-SystemProxy
    $actions += "clear-system-proxy"
    Clear-ProxyEnvironment
    $actions += "clear-env-proxy"

    if ($IncludeWinHttp) {
        Clear-WinHttpProxy
        $actions += "clear-winhttp-proxy"
    }

    return Measure-NetworkState "reset" $actions
}

function Write-HumanReport {
    param($Report)

    Write-Host "Proxy Gateway Network Doctor"
    Write-Host "Action: $($Report.action)"
    Write-Host "OK: $($Report.ok)"
    Write-Host ""
    Write-Host "Ports:"
    Write-Host "  Console 4077: $($Report.summary.consoleListening)"
    Write-Host "  SOCKS5 1080: $($Report.summary.socksListening)"
    Write-Host "  HTTP 18180:  $($Report.summary.httpProxyListening)"
    Write-Host ""
    Write-Host "Proxy ownership:"
    Write-Host "  WinINet target: $($Report.summary.systemProxyTargetOk)"
    Write-Host "  Env target:     $($Report.summary.envProxyTargetOk)"
    Write-Host "  WinHTTP target: $($Report.summary.winHttpTargetOk)"
    Write-Host "  Clash/Mihomo:   $($Report.summary.clashPotentialConflict)"
    if ($Report.actions.Count -gt 0) {
        Write-Host ""
        Write-Host "Actions:"
        $Report.actions | ForEach-Object { Write-Host "  - $_" }
    }
    if ($Report.issues.Count -gt 0) {
        Write-Host ""
        Write-Host "Issues:"
        $Report.issues | ForEach-Object { Write-Host "  [$($_.severity)] $($_.code): $($_.message)" }
    }
}

switch ($Action) {
    "repair" { $report = Invoke-Repair }
    "reset" { $report = Invoke-Reset }
    default { $report = Measure-NetworkState "status" }
}

if ($Json) {
    $report | ConvertTo-Json -Depth 8 -Compress
} else {
    Write-HumanReport $report
}
