# proxy.ps1 - Windows system proxy management
# Usage: .\scripts\proxy.ps1 [on|off|status|pac]

param([string]$Action = "status")

$ProxyAddr = "127.0.0.1"
$SocksPort = 1080
$HttpPort  = 18180
$PacUrl    = "http://127.0.0.1:4077/proxy.pac"

function Get-RegPath {
    return "HKCU:\Software\Microsoft\Windows\CurrentVersion\Internet Settings"
}

function Refresh-Proxy {
    # Use registry flags to notify running applications
    Set-ItemProperty -Path (Get-RegPath) -Name "ProxySettingsPerUser" -Value 1 -ErrorAction SilentlyContinue
    # Force WinINet to re-read settings
    try {
        reg add "HKCU\Software\Microsoft\Windows\CurrentVersion\Internet Settings\Connections" /v DefaultConnectionSettings /f | Out-Null
    } catch {}
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
    Write-Host "[ENV] Proxy environment variables set for current user"
}

function Proxy-EnvOff {
    [Environment]::SetEnvironmentVariable("HTTP_PROXY", $null, "User")
    [Environment]::SetEnvironmentVariable("HTTPS_PROXY", $null, "User")
    [Environment]::SetEnvironmentVariable("ALL_PROXY", $null, "User")
    [Environment]::SetEnvironmentVariable("NO_PROXY", $null, "User")
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
