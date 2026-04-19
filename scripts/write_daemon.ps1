#!/usr/bin/env pwsh
# Écrit un fichier daemon.json Docker (DNS IPv4, ipv6 disabled)
$path = 'C:\ProgramData\Docker\config\daemon.json'
$dir = Split-Path $path
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}
$json = @'
{"ipv6": false, "dns": ["1.1.1.1","8.8.8.8"]}
'@
$json | Out-File -FilePath $path -Encoding utf8
Get-Content -Path $path -Raw
