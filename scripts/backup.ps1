# Full backup of the WaterPortal database to a .bak file (SQL Server native backup, with checksum + verify).
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\backup.ps1 [-Folder D:\Backups\WaterPortal] [-Keep 30]
# Schedule daily with Windows Task Scheduler. Copy the .bak files to another machine/disk as well.
param(
  [string]$Folder = "C:\Backups\WaterPortal",
  [int]$Keep = 30,
  [string]$Server = "localhost,1433",
  [string]$Database = "WaterPortal"
)
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force $Folder | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$file = Join-Path $Folder "$Database-$stamp.bak"
# Windows authentication: run as a Windows account that is sysadmin on the instance (the installing user is).
& sqlcmd -S "tcp:$Server" -E -C -b -Q "BACKUP DATABASE [$Database] TO DISK = N'$file' WITH INIT, CHECKSUM, NAME = N'$Database full $stamp'; RESTORE VERIFYONLY FROM DISK = N'$file' WITH CHECKSUM;"
if ($LASTEXITCODE -ne 0) { throw "Backup failed ($LASTEXITCODE)" }
Write-Output "Backup written and verified: $file"
Get-ChildItem $Folder -Filter "$Database-*.bak" | Sort-Object LastWriteTime -Descending | Select-Object -Skip $Keep | Remove-Item -Force
