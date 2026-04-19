#!/usr/bin/env pwsh
# Restart Docker Desktop (if present), shutdown WSL, wait for Docker, then run compose build+up
$exe = 'C:\Program Files\Docker\Docker\Docker Desktop.exe'
if (Test-Path $exe) {
  Start-Process -FilePath $exe
  Write-Output "Started Docker Desktop"
} else {
  Write-Output "Docker Desktop executable not found at $exe"
}
Start-Sleep -Seconds 10
wsl --shutdown
Start-Sleep -Seconds 5
$max = 60
for ($i = 0; $i -lt $max; $i++) {
  try {
    docker info | Out-Null
    Write-Output "docker-ready"
    break
  } catch {
    Write-Output "waiting docker... $i"
    Start-Sleep -Seconds 2
  }
}
if ($i -ge $max) {
  Write-Error "Docker did not become ready in time"
  exit 1
}
docker compose up -d --build
