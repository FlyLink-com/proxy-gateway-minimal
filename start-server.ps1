# Start Proxy Gateway Console as a native Windows background process
$projectDir = "$PSScriptRoot"
$nodeExe = (Get-Command node).Source

Write-Host "Starting Proxy Gateway Console..."
Write-Host "  Project: $projectDir"
Write-Host "  Node: $nodeExe"

$proc = Start-Process -FilePath $nodeExe `
  -ArgumentList "server/index.mjs" `
  -WorkingDirectory $projectDir `
  -WindowStyle Hidden `
  -PassThru

Write-Host "  PID: $($proc.Id)"
Write-Host "  Console: http://127.0.0.1:4077/"
Write-Host "  Token stored in: $projectDir/.proxy-gateway/console-token"
