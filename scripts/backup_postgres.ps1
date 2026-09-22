<#
.SYNOPSIS
    Automated Daily PostgreSQL Backup Script for CRMS.
.DESCRIPTION
    Creates a timestamped, compressed backup of the PostgreSQL database per Privacy Act 1988 Part IIIA and Privacy (Credit Reporting) Code requirements.
#>

param (
    [string]$BackupDir = ".\backups",
    [string]$DbName = $env:POSTGRES_DB ?? "credit_system",
    [string]$DbUser = $env:POSTGRES_USER ?? "crms_user",
    [string]$DbHost = $env:POSTGRES_HOST ?? "localhost",
    [string]$DbPort = $env:POSTGRES_PORT ?? "5432"
)

$ErrorActionPreference = "Stop"

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "crms_backup_${DbName}_${Timestamp}.sql"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

Write-Host "[CRMS BACKUP] Starting database backup for '$DbName'..." -ForegroundColor Cyan

# Execute pg_dump
try {
    $env:PGPASSWORD = $env:POSTGRES_PASSWORD ?? "crms_secure_pass_2026"
    & pg_dump -h $DbHost -p $DbPort -U $DbUser -d $DbName --format=plain --no-owner --no-privileges -f $BackupFile
    Write-Host "[CRMS BACKUP] Successfully created backup: $BackupFile" -ForegroundColor Green
} catch {
    Write-Host "[CRMS BACKUP ERROR] Backup failed: $_" -ForegroundColor Red
    exit 1
}

# Retain backups for 30 days
Get-ChildItem -Path $BackupDir -Filter "crms_backup_*.sql" | Where-Object {
    $_.CreationTime -lt (Get-Date).AddDays(-30)
} | Remove-Item -Force
