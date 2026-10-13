<#
  Entorno local AISLADO para la prueba de integración real (supabase/tests/integracion-real.mjs).

  Requiere Docker en marcha y la CLI de Supabase. NUNCA toca producción:
    - trabaja en .supabase-test\ (ignorado por git), con proyecto "limpia-test" y puertos 544xx propios;
    - no usa `supabase link`, ni tokens, ni claves de la nube. Las claves del stack local las lee la CLI de
      su propio contenedor (`supabase status`) y solo viven en variables de entorno de este proceso:
      no se imprimen ni se guardan en archivos.

  Uso:
    pwsh supabase\tests\entorno-local.ps1                 # prepara, levanta, siembra, aplica la 0015, verifica y apaga
    pwsh supabase\tests\entorno-local.ps1 -Conservar      # igual, pero deja el stack encendido al terminar
    pwsh supabase\tests\entorno-local.ps1 -SoloPreparar   # solo arma .supabase-test\ (no necesita Docker)
#>
param([switch]$SoloPreparar, [switch]$Conservar)

$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$dir = Join-Path $repo '.supabase-test'
$migraciones = Join-Path $repo 'supabase\migrations'

function Fallar([string]$mensaje, [int]$codigo = 1) {
  Write-Host $mensaje -ForegroundColor Red
  exit $codigo
}

if (-not (Get-Command supabase -ErrorAction SilentlyContinue)) {
  Fallar 'Falta la CLI de Supabase. Instálala con: npm i -g supabase (o scoop install supabase).' 3
}
if (-not $SoloPreparar) {
  if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    Fallar 'Docker no está instalado. Pasos en docs/pruebas-integracion.md.' 3
  }
  docker info *> $null
  if ($LASTEXITCODE -ne 0) { Fallar 'Docker está instalado pero no está corriendo. Ábrelo y espera a que diga "Engine running".' 3 }
}

# ---------- 1. Proyecto local aislado ----------
if (Test-Path $dir) {
  Remove-Item $dir -Recurse -Force
}
New-Item -ItemType Directory $dir | Out-Null
Push-Location $dir
try { supabase init 2>&1 | Out-Null } finally { Pop-Location }

$config = Join-Path $dir 'supabase\config.toml'
$texto = Get-Content $config -Raw
$texto = $texto -replace 'project_id = ".*"', 'project_id = "limpia-test"'
# Puertos propios (5432x -> 5442x) para no chocar con otros stacks locales.
$texto = $texto -replace 'port = 543(\d\d)', 'port = 544$1'
Set-Content $config $texto -Encoding utf8

# ---------- 2. Migraciones: schema.sql + 0001..0014 (la 0015 se aplica DESPUÉS, con datos viejos) ----------
$destino = Join-Path $dir 'supabase\migrations'
New-Item -ItemType Directory $destino -Force | Out-Null
Copy-Item (Join-Path $repo 'supabase\schema.sql') (Join-Path $destino '20260101000000_schema.sql')
foreach ($archivo in Get-ChildItem $migraciones -Filter '*.sql' | Sort-Object Name) {
  if ($archivo.Name -notmatch '^(\d{4})_(.+)\.sql$') { continue }
  $n = [int]$Matches[1]
  if ($n -gt 14) { continue }
  $version = '20260101{0:D6}' -f $n
  Copy-Item $archivo.FullName (Join-Path $destino "${version}_$($archivo.Name)")
}
Write-Host "Proyecto local preparado en $dir ($((Get-ChildItem $destino).Count) migraciones previas a la 0015)."
if ($SoloPreparar) { exit 0 }

# ---------- 3. Levantar el stack (sin los servicios que no se necesitan) ----------
$excluir = 'studio,imgproxy,logflare,vector,edge-runtime,mailpit,postgres-meta,supavisor'
supabase --workdir $dir start -x $excluir
if ($LASTEXITCODE -ne 0) { Fallar 'No se pudo levantar el stack local.' 4 }

try {
  # Claves del stack LOCAL: solo en variables de entorno de este proceso.
  $estado = supabase --workdir $dir status -o env | Out-String
  function Valor([string]$clave) {
    if ($estado -match "(?m)^$clave=`"?([^`"\r\n]+)`"?") { return $Matches[1] }
    Fallar "No pude leer $clave de 'supabase status'." 4
  }
  $env:TEST_SUPABASE_URL = Valor 'API_URL'
  $env:TEST_SUPABASE_ANON_KEY = Valor 'ANON_KEY'
  $env:TEST_SUPABASE_SERVICE_KEY = Valor 'SERVICE_ROLE_KEY'
  $env:TEST_CONFIRMO_ENTORNO_DE_PRUEBAS = 'si'
  # El contenedor de la base alcanza el servidor de captura de avisos por este nombre (Docker Desktop).
  if (-not $env:TEST_PUSH_CAPTURE_HOST) { $env:TEST_PUSH_CAPTURE_HOST = 'host.docker.internal' }

  if ($env:TEST_SUPABASE_URL -notmatch '^http://(127\.0\.0\.1|localhost):') { Fallar 'La URL no es local: me niego a continuar.' 5 }

  # ---------- 4. Sembrar con el esquema ANTERIOR a la 0015 ----------
  node (Join-Path $repo 'supabase\tests\integracion-real.mjs') sembrar
  if ($LASTEXITCODE -ne 0) { Fallar 'Falló la siembra.' 6 }

  # ---------- 5. Aplicar la 0015 sobre esos datos y verificar ----------
  Copy-Item (Join-Path $migraciones '0015_experiencia_cliente.sql') (Join-Path $destino '20260101000015_0015_experiencia_cliente.sql')
  supabase --workdir $dir migration up --local
  if ($LASTEXITCODE -ne 0) { Fallar 'La migración 0015 falló sobre los datos anteriores.' 7 }

  node (Join-Path $repo 'supabase\tests\integracion-real.mjs') verificar
  $resultado = $LASTEXITCODE
}
finally {
  Remove-Item Env:TEST_SUPABASE_URL, Env:TEST_SUPABASE_ANON_KEY, Env:TEST_SUPABASE_SERVICE_KEY, Env:TEST_CONFIRMO_ENTORNO_DE_PRUEBAS -ErrorAction SilentlyContinue
  if (-not $Conservar) { supabase --workdir $dir stop --no-backup | Out-Null }
}
exit $resultado
