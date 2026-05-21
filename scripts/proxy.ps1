# proxy.ps1 - Windows system proxy management
# Usage: .\scripts\proxy.ps1 [on|off|status|pac]

param([string]$Action = "status")

$ProxyAddr = "127.0.0.1"
$SocksPort = 1080
$HttpPort  = 18180
$PacUrl    = "http://127.0.0.1:3456/proxy.pac"

function Get-RegPath {
    return "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
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

function Refresh-Proxy {
    Set-ItemProperty -Path (Get-RegPath) -Name "ProxySettingsPerUser" -Value 1 -ErrorAction SilentlyContinue
    Ensure-WinInetType
    [ProxyGateway.WinInet]::InternetSetOption([IntPtr]::Zero, 39, [IntPtr]::Zero, 0) | Out-Null
    [ProxyGateway.WinInet]::InternetSetOption([IntPtr]::Zero, 37, [IntPtr]::Zero, 0) | Out-Null
    Send-SettingChange "Software\Microsoft\Windows\CurrentVersion\Internet Settings"
}

function Refresh-Environment {
    Send-SettingChange "Environment"
}

function Proxy-On {
    $reg = Get-RegPath
    Set-ItemProperty -Path $reg -Name "ProxyEnable" -Value 1
    Set-ItemProperty -Path $reg -Name "ProxyServer" -Value "${ProxyAddr}:${HttpPort}"
    Set-ItemProperty -Path $reg -Name "AutoConfigURL" -Value ""
    Set-ItemProperty -Path $reg -Name "ProxyOverride" -Value "localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.3*;192.168.*;*.local"
    Refresh-Proxy
    Write-Host "[ON] System proxy -> ${ProxyAddr}:${HttpPort}"
}

function Proxy-Off {
    $reg = Get-RegPath
    Set-ItemProperty -Path $reg -Name "ProxyEnable" -Value 0
    Set-ItemProperty -Path $reg -Name "ProxyServer" -Value ""
    Set-ItemProperty -Path $reg -Name "AutoConfigURL" -Value ""
    Refresh-Proxy
    Write-Host "[OFF] System proxy disabled"
}

function Proxy-PAC {
    $reg = Get-RegPath
    Set-ItemProperty -Path $reg -Name "ProxyEnable" -Value 0
    Set-ItemProperty -Path $reg -Name "ProxyServer" -Value ""
    Set-ItemProperty -Path $reg -Name "AutoConfigURL" -Value $PacUrl
    Set-ItemProperty -Path $reg -Name "ProxyOverride" -Value "localhost;127.*;10.*;172.16.*;172.17.*;172.18.*;172.19.*;172.2*;172.3*;192.168.*;*.local"
    Refresh-Proxy
    Write-Host "[PAC] Auto proxy config -> $PacUrl"
}

function Proxy-EnvOn {
    [Environment]::SetEnvironmentVariable("HTTP_PROXY", "http://${ProxyAddr}:${HttpPort}", "User")
    [Environment]::SetEnvironmentVariable("HTTPS_PROXY", "http://${ProxyAddr}:${HttpPort}", "User")
    [Environment]::SetEnvironmentVariable("ALL_PROXY", "socks5://${ProxyAddr}:${SocksPort}", "User")
    [Environment]::SetEnvironmentVariable("NO_PROXY", "localhost,127.0.0.1,10.*,172.16.*,172.17.*,172.18.*,172.19.*,172.2*,172.3*,192.168.*,*.local", "User")
    Refresh-Environment
    Write-Host "[ENV] Proxy environment variables set for current user"
}

function Proxy-EnvOff {
    [Environment]::SetEnvironmentVariable("HTTP_PROXY", $null, "User")
    [Environment]::SetEnvironmentVariable("HTTPS_PROXY", $null, "User")
    [Environment]::SetEnvironmentVariable("ALL_PROXY", $null, "User")
    [Environment]::SetEnvironmentVariable("NO_PROXY", $null, "User")
    Refresh-Environment
    Write-Host "[ENV] Proxy environment variables cleared"
}

function Proxy-Status {
    $reg = Get-RegPath
    $enabled = (Get-ItemProperty -Path $reg -Name "ProxyEnable").ProxyEnable
    $server = (Get-ItemProperty -Path $reg -Name "ProxyServer").ProxyServer
    $autoUrl = ""
    try { $autoUrl = (Get-ItemProperty -Path $reg -Name "AutoConfigURL").AutoConfigURL } catch {}

    if ($autoUrl) {
        Write-Host "[PAC] Proxy: PAC Mode -> $autoUrl"
    } elseif ($enabled -eq 1) {
        Write-Host "[ON] Proxy: $server"
    } else {
        Write-Host "[OFF] Proxy: Disabled"
    }
}

switch ($Action) {
    "on"      { Proxy-On }
    "off"     { Proxy-Off }
    "pac"     { Proxy-PAC }
    "env"     { Proxy-EnvOn }
    "env-off" { Proxy-EnvOff }
    "status"  { Proxy-Status }
    default   { Proxy-Status }
}
