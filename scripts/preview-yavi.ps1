# Vista previa AISLADA de YAVI para revisar desde el iPhone, con datos de PRUEBA (proyecto LIMPIA).
#   - Lee .env.test.local (TEST_SUPABASE_URL / TEST_SUPABASE_ANON_KEY). Nunca usa .env (producción).
#   - Rechaza cualquier proyecto que no sea LIMPIA.
#   - Es una vista previa de Vercel (nunca --prod) con alias propio, distinto del de limpi-pruebas.
#   - Por defecto NO publica: valida, compila en una carpeta temporal y muestra el comando.
# Uso:
#   pwsh scripts/preview-yavi.ps1             # simulacro: valida y compila, no publica
#   pwsh scripts/preview-yavi.ps1 -Publicar   # publica la vista previa y apunta el alias
param(
  [switch]$Publicar,
  [string]$Alias = 'yavi-pruebas.vercel.app'
)
$ErrorActionPreference = 'Stop'
$raiz = Split-Path -Parent $PSScriptRoot
Set-Location $raiz

$LIMPIA = 'ztlxmdeviurdhqyabhvb'
$archivo = Join-Path $raiz '.env.test.local'
if (-not (Test-Path $archivo)) { throw 'Falta .env.test.local (datos del proyecto de pruebas).' }
$env_ = @{}
Get-Content $archivo | Where-Object { $_ -match '^[A-Z_]+=' } | ForEach-Object {
  $i = $_.IndexOf('=')
  $env_[$_.Substring(0, $i)] = $_.Substring($i + 1).Trim()
}
$url = $env_['TEST_SUPABASE_URL']; $anon = $env_['TEST_SUPABASE_ANON_KEY']
if (-not $url -or -not $anon) { throw 'Falta TEST_SUPABASE_URL o TEST_SUPABASE_ANON_KEY en .env.test.local.' }
if ($url -ne "https://$LIMPIA.supabase.co") { throw "Rechazado: $url no es el proyecto de pruebas LIMPIA ($LIMPIA)." }

Write-Host "Proyecto de pruebas: $url (LIMPIA)"
Write-Host 'Banderas de la vista previa: VITE_ENTORNO_PRUEBAS=si, VITE_PROPUESTAS_ACTIVAS=1 (las mismas que la vista previa actual; no se activa nada nuevo).'

# Verificaciones antes de compilar.
npx tsc -b; if ($LASTEXITCODE) { throw 'tsc falló.' }
npx vitest run; if ($LASTEXITCODE) { throw 'Las pruebas fallaron.' }

# Compilación de comprobación en una carpeta temporal (no toca dist/).
$tmp = Join-Path ([IO.Path]::GetTempPath()) 'yavi-preview-dist'
$env:VITE_SUPABASE_URL = $url; $env:VITE_SUPABASE_ANON_KEY = $anon
$env:VITE_ENTORNO_PRUEBAS = 'si'; $env:VITE_PROPUESTAS_ACTIVAS = '1'
try {
  npx vite build --outDir $tmp --emptyOutDir; if ($LASTEXITCODE) { throw 'La compilación falló.' }
} finally {
  Remove-Item Env:VITE_SUPABASE_URL, Env:VITE_SUPABASE_ANON_KEY, Env:VITE_ENTORNO_PRUEBAS, Env:VITE_PROPUESTAS_ACTIVAS -ErrorAction SilentlyContinue
}

$cmd = "vercel deploy --yes --build-env VITE_SUPABASE_URL=<LIMPIA> --build-env VITE_SUPABASE_ANON_KEY=<anon LIMPIA> --build-env VITE_ENTORNO_PRUEBAS=si --build-env VITE_PROPUESTAS_ACTIVAS=1"
if (-not $Publicar) {
  Write-Host ''
  Write-Host 'SIMULACRO: no se publicó nada. Para publicar la vista previa:'
  Write-Host "  $cmd"
  Write-Host "  vercel alias set <url-nueva> $Alias"
  exit 0
}

$PSNativeCommandUseErrorActionPreference = $false
$salida = vercel deploy --yes --build-env "VITE_SUPABASE_URL=$url" --build-env "VITE_SUPABASE_ANON_KEY=$anon" --build-env 'VITE_ENTORNO_PRUEBAS=si' --build-env 'VITE_PROPUESTAS_ACTIVAS=1' 2>&1 | Out-String
if ($LASTEXITCODE) { throw "vercel deploy falló (código $LASTEXITCODE). Salida: $salida" }
$nueva = ([regex]::Matches($salida, 'https://[a-z0-9-]+.vercel.app') | Select-Object -Last 1).Value
if (-not $nueva) { throw 'No pude leer la URL del despliegue.' }
vercel alias set $nueva $Alias
Write-Host "Listo: https://$Alias  ->  $nueva"
Write-Host 'En el iPhone: abre el enlace en Safari. Si ya tenías la app agregada, quítala y vuelve a agregarla para ver el nombre y el ícono nuevos.'
