# ===== Mundo Pets — backup automático de MySQL =====
# Genera un dump de la BD con timestamp en <repo>/backups y conserva los últimos 14.
# Lee las credenciales desde backend/.env (no se hardcodean aquí).
# Uso: powershell -NoProfile -ExecutionPolicy Bypass -File scripts/backup-db.ps1

$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$envFile = Join-Path $root 'backend\.env'
if (-not (Test-Path $envFile)) { throw "No existe $envFile" }

# Parsear backend/.env
$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*?)\s*$') {
    $vars[$matches[1]] = $matches[2]
  }
}

$dbHost = if ($vars['DB_HOST']) { $vars['DB_HOST'] } else { 'localhost' }
$dbPort = if ($vars['DB_PORT']) { $vars['DB_PORT'] } else { '3306' }
$dbUser = if ($vars['DB_USER']) { $vars['DB_USER'] } else { 'root' }
$dbName = if ($vars['DB_NAME']) { $vars['DB_NAME'] } else { 'mundo_pets' }

# Localizar mysqldump
$mysqldump = (Get-Command 'mysqldump.exe' -ErrorAction SilentlyContinue).Source
if (-not $mysqldump) {
  $candidates = @(
    'C:\Program Files\MySQL\MySQL Server 8.0\bin\mysqldump.exe',
    'C:\ProgramData\MySQL\MySQL Server 8.0\bin\mysqldump.exe'
  )
  $mysqldump = $candidates | Where-Object { Test-Path $_ } | Select-Object -First 1
}
if (-not $mysqldump) { throw 'mysqldump.exe no encontrado. Verifica la ruta de MySQL.' }

$backupDir = Join-Path $root 'backups'
New-Item -ItemType Directory -Force -Path $backupDir | Out-Null

$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$file = Join-Path $backupDir ("mundo_pets_{0}.sql" -f $stamp)

$env:MYSQL_PWD = $vars['DB_PASSWORD']
try {
  & $mysqldump -h $dbHost -P $dbPort -u $dbUser --single-transaction --routines --default-character-set=utf8mb4 $dbName 2>$null | Out-File -Encoding utf8 -FilePath $file
} finally {
  Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
}

if (-not (Test-Path $file) -or (Get-Item $file).Length -eq 0) {
  throw "El backup no se generó correctamente."
}

# Conservar los últimos 14 backups
$keep = 14
Get-ChildItem $backupDir -Filter 'mundo_pets_*.sql' |
  Sort-Object Name -Descending |
  Select-Object -Skip $keep |
  Remove-Item -Force -ErrorAction SilentlyContinue

Write-Host "Backup creado: $file"
Write-Host ("Tamaño: {0:N1} KB" -f ((Get-Item $file).Length / 1KB))