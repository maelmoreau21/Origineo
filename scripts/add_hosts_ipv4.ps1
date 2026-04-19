#!/usr/bin/env pwsh
# Ajoute une ligne dans le fichier hosts pour forcer une résolution IPv4
$hostsPath = 'C:\Windows\System32\drivers\etc\hosts'
$entryIp = '172.64.66.1'
$entryHost = 'docker-images-prod.6aa30f8b08e16409b46e0173d6de2f56.r2.cloudflarestorage.com'
$entry = "$entryIp`t$entryHost"
try {
    if (-not (Test-Path $hostsPath)) {
        Throw "Hosts file not found: $hostsPath"
    }
    $hostsText = Get-Content -Path $hostsPath -Raw -ErrorAction Stop
    if ($hostsText -like "*$entryHost*") {
        Write-Output "Host entry already present for $entryHost"
        exit 0
    }
    Add-Content -Path $hostsPath -Value "`n# Added by Origineo helper`n$entry" -Encoding ASCII
    Write-Output "Added host entry: $entry"
    exit 0
} catch {
    Write-Error "Failed to update hosts file: $($_.Exception.Message)"
    Write-Error ($_.Exception | Format-List -Force | Out-String)
    exit 1
}
