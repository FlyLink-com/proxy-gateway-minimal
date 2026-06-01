# Start Proxy Gateway Console as a native Windows background process
$projectDir = "$PSScriptRoot"
$nodeExe = (Get-Command node).Source
$consolePort = $env:CONSOLE_PORT
if (-not $consolePort) {
  $envFile = Join-Path $projectDir ".env"
  if (Test-Path $envFile) {
    $portLine = Get-Content -Path $envFile | Where-Object { $_ -match '^\s*CONSOLE_PORT\s*=' } | Select-Object -First 1
    if ($portLine -match '^\s*CONSOLE_PORT\s*=\s*(.+?)\s*$') {
      $consolePort = $Matches[1].Trim().Trim('"').Trim("'")
    }
  }
}
if (-not $consolePort) {
  $consolePort = "3456"
}

Write-Host "Starting Proxy Gateway Console..."
Write-Host "  Project: $projectDir"
Write-Host "  Node: $nodeExe"

$proc = Start-Process -FilePath $nodeExe `
  -ArgumentList "server/index.mjs" `
  -WorkingDirectory $projectDir `
  -WindowStyle Hidden `
  -PassThru

Write-Host "  PID: $($proc.Id)"
Write-Host "  Console: http://127.0.0.1:$consolePort/"
Write-Host "  Token stored in: $projectDir/.proxy-gateway/console-token"
