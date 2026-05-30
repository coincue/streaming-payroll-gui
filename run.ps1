$ErrorActionPreference = 'Stop'

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'node_modules'))) {
    npm install
}

$braveCandidates = @(
    (Get-Command brave -ErrorAction SilentlyContinue).Source,
    (Get-Command brave.exe -ErrorAction SilentlyContinue).Source,
    (Join-Path $env:ProgramFiles 'BraveSoftware\Brave-Browser\Application\brave.exe'),
    (Join-Path ${env:ProgramFiles(x86)} 'BraveSoftware\Brave-Browser\Application\brave.exe'),
    (Join-Path $env:LocalAppData 'BraveSoftware\Brave-Browser\Application\brave.exe')
) | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1

if (-not $braveCandidates) {
    throw 'Brave browser was not found. Install Brave or add it to PATH.'
}

Start-Process -FilePath 'npm.cmd' -ArgumentList @('start') -WorkingDirectory $projectRoot
Start-Process -FilePath $braveCandidates -ArgumentList @('http://localhost:5173')