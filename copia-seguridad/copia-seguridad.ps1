# ============================================================
# TRIPULSE · copia de seguridad a un pendrive o disco externo
# ============================================================
#
# Se lanza con doble clic en «hacer-copia.bat», con el pendrive puesto.
#
# QUÉ GUARDA, y por qué cada cosa:
#   · el código CON su historial de git  → también está en GitHub, pero si un
#                                           día faltara la cuenta, aquí sigue
#   · las claves (.env.local)            → NO están en GitHub, a propósito.
#                                           Sin ellas la app no arranca
#   · la memoria de Claude               → solo está en este portátil
#   · LA BASE DE DATOS                   → lo más valioso, y lo único que NO
#                                           está en el ordenador: vive en
#                                           Supabase. Wellness, sesiones hechas,
#                                           tests de los atletas
#
# QUÉ NO GUARDA: node_modules y .next (más de 1 GB que se regenera con
# `npm install` y `npm run build`).
#
# VA CIFRADO. Lleva las claves de la app y datos de salud de los atletas, que
# con la protección de datos son de categoría especial: perder un pendrive con
# eso sin cifrar es una brecha. Cifra con 7-Zip AES-256 y TAMBIÉN los nombres de
# los ficheros, con una contraseña que se pide cada vez y no se guarda en
# ningún sitio. SI LA OLVIDAS, LA COPIA NO SIRVE: apúntala en un gestor de
# contraseñas.
#
# LA CONEXIÓN A LA BASE se pide la primera vez y se guarda cifrada con la cuenta
# de Windows (DPAPI): solo tu usuario, en este ordenador, puede descifrarla. No
# está en el repositorio ni en texto plano en ningún sitio.
#
# UNA COPIA QUE NO SE HA PROBADO NO ES UNA COPIA. Al acabar se comprueba que el
# archivo se abre con la contraseña y que la exportación de la base se puede
# leer. Si algo de eso falla, lo dice.

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$REPO      = Split-Path -Parent $PSScriptRoot
$APP       = Join-Path $REPO 'tripulse-app'
$MEMORIA   = Join-Path $env:USERPROFILE '.claude\projects\C--Users-nicol-OneDrive-Escritorio-Obsidian-ia\memory'
$CONF      = Join-Path $env:APPDATA 'tripulse-copia'
$CONEXION  = Join-Path $CONF 'conexion.xml'
$GUARDAR   = 6          # copias que se quedan en el pendrive: unos tres meses
$PREFIJO   = 'TRIPULSE-'

function Titulo($t) { Write-Host ''; Write-Host "== $t ==" -ForegroundColor Cyan }
function Bien($t)   { Write-Host "  [ok] $t" -ForegroundColor Green }
function Aviso($t)  { Write-Host "  [!]  $t" -ForegroundColor Yellow }
function Mal($t)    { Write-Host "  [X]  $t" -ForegroundColor Red }

function Buscar-7z {
  foreach ($p in @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe")) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  $c = Get-Command 7z -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  return $null
}

# pg_dump tiene que ser de la MISMA versión mayor que el servidor o más nueva:
# Supabase va en Postgres 17, y un pg_dump 16 se niega a exportar.
function Buscar-PgDump {
  $c = Get-Command pg_dump -ErrorAction SilentlyContinue
  $candidatos = @()
  if ($c) { $candidatos += $c.Source }
  $candidatos += Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin\pg_dump.exe" -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Directory.Parent.Name -replace '\D','') } -Descending |
    Select-Object -ExpandProperty FullName
  foreach ($p in $candidatos) {
    $v = & $p --version 2>$null
    if ($v -match '(\d+)\.') { if ([int]$Matches[1] -ge 17) { return $p } }
  }
  return $null
}

function Elegir-Destino {
  $discos = Get-CimInstance Win32_LogicalDisk |
    Where-Object { $_.DeviceID -ne 'C:' -and $_.Size -gt 0 -and ($_.DriveType -eq 2 -or $_.DriveType -eq 3) }
  if (-not $discos) { return $null }
  Write-Host ''
  Write-Host '  Unidades conectadas:'
  $i = 1
  foreach ($d in $discos) {
    $tipo = if ($d.DriveType -eq 2) { 'extraible' } else { 'disco' }
    $libre = [math]::Round($d.FreeSpace / 1GB, 1)
    $nombre = if ($d.VolumeName) { $d.VolumeName } else { 'sin nombre' }
    Write-Host ("   {0}) {1}  {2,-14} {3,6} GB libres  ({4})" -f $i, $d.DeviceID, $nombre, $libre, $tipo)
    $i++
  }
  $lista = @($discos)
  if ($lista.Count -eq 1) {
    $r = Read-Host "  ¿Guardo la copia en $($lista[0].DeviceID)? (s/n)"
    if ($r -match '^[sS]') { return $lista[0].DeviceID } else { return $null }
  }
  $n = Read-Host '  Número de la unidad'
  if ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $lista.Count) { return $lista[[int]$n - 1].DeviceID }
  return $null
}

function Pedir-Contrasena {
  while ($true) {
    $a = Read-Host '  Contraseña para cifrar la copia' -AsSecureString
    $b = Read-Host '  Repítela' -AsSecureString
    $pa = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($a))
    $pb = [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($b))
    if ($pa -ne $pb) { Aviso 'No coinciden. Otra vez.'; continue }
    if ($pa.Length -lt 10) { Aviso 'Mínimo 10 caracteres: protege datos de salud.'; continue }
    return $pa
  }
}

function Conexion-Base {
  if (Test-Path $CONEXION) {
    $s = Import-Clixml $CONEXION
    return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
  }
  Write-Host ''
  Write-Host '  Falta la conexión a la base de datos. Solo se pide esta vez.'
  Write-Host '  En Supabase: botón «Connect» → «Session pooler» → copia la cadena'
  Write-Host '  (empieza por postgresql://) y pon tu contraseña de la base donde'
  Write-Host '  dice [YOUR-PASSWORD]. Usa la del POOLER, no la directa: la directa'
  Write-Host '  solo funciona por IPv6 y en muchas redes no conecta.'
  $s = Read-Host '  Cadena de conexión' -AsSecureString
  if (-not (Test-Path $CONF)) { New-Item -ItemType Directory -Path $CONF | Out-Null }
  $s | Export-Clixml $CONEXION
  Bien "Guardada cifrada con tu cuenta de Windows en $CONEXION"
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

# ------------------------------------------------------------
Write-Host ''
Write-Host '  TRIPULSE · copia de seguridad' -ForegroundColor White
Write-Host ('  ' + (Get-Date -Format 'dddd d \de MMMM \de yyyy, HH:mm'))

Titulo 'Herramientas'
$z = Buscar-7z
$pg = Buscar-PgDump
if ($z) { Bien "7-Zip: $z" } else { Mal '7-Zip no está instalado. Sin él no se puede cifrar, y sin cifrar no se copia.'; Read-Host '  Pulsa Intro para salir'; exit 1 }
if ($pg) { Bien "pg_dump: $pg" } else { Aviso 'pg_dump 17 no está instalado: la copia irá SIN la base de datos, que es lo más importante.' }

Titulo 'Dónde se guarda'
$destino = Elegir-Destino
if (-not $destino) { Mal 'No hay pendrive ni disco externo conectado, o no has elegido ninguno.'; Read-Host '  Pulsa Intro para salir'; exit 1 }
$carpetaDestino = Join-Path "$destino\" 'Copias TRIPULSE'
if (-not (Test-Path $carpetaDestino)) { New-Item -ItemType Directory -Path $carpetaDestino | Out-Null }
Bien "Destino: $carpetaDestino"

$fecha = Get-Date -Format 'yyyy-MM-dd_HHmm'
$staging = Join-Path $env:TEMP ("tripulse-copia-" + [guid]::NewGuid().ToString('N'))
$archivo = Join-Path $carpetaDestino ($PREFIJO + $fecha + '.7z')
$resumen = [ordered]@{}

try {
  New-Item -ItemType Directory -Path $staging | Out-Null

  # ---------------- el código, con su historial ----------------
  Titulo 'El código'
  $dCod = Join-Path $staging 'codigo'
  # robocopy: /E todo, /XD fuera estas carpetas. Sus códigos 0-7 son éxito;
  # de 8 en adelante, error.
  & robocopy $REPO $dCod /E /XD node_modules .next .vercel /XF '*.log' /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy falló copiando el código (código $LASTEXITCODE)" }
  $tam = (Get-ChildItem $dCod -Recurse -File | Measure-Object Length -Sum).Sum
  Bien ("Copiado, {0:N1} MB, con el historial de git" -f ($tam / 1MB))
  $resumen['codigo'] = ("{0:N1} MB" -f ($tam / 1MB))
  Push-Location $REPO
  $commit = (& git rev-parse --short HEAD 2>$null)
  $pendiente = (& git status --porcelain 2>$null)
  Pop-Location
  $resumen['commit'] = $commit
  if ($pendiente) { Aviso 'Hay cambios sin commitear: van en la copia, pero no están en GitHub.' }

  # ---------------- las claves ----------------
  Titulo 'Las claves'
  $dCla = Join-Path $staging 'claves'
  New-Item -ItemType Directory -Path $dCla | Out-Null
  $envs = Get-ChildItem $APP -Filter '.env*' -File -Force -ErrorAction SilentlyContinue
  foreach ($e in $envs) { Copy-Item $e.FullName $dCla }
  if ($envs) { Bien ("{0} fichero(s): {1}" -f @($envs).Count, (($envs | ForEach-Object Name) -join ', ')) } else { Aviso 'No hay ningún .env en tripulse-app' }
  $resumen['claves'] = (($envs | ForEach-Object Name) -join ', ')

  # ---------------- la memoria ----------------
  Titulo 'La memoria de Claude'
  if (Test-Path $MEMORIA) {
    & robocopy $MEMORIA (Join-Path $staging 'memoria-claude') /E /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "robocopy falló copiando la memoria (código $LASTEXITCODE)" }
    $n = @(Get-ChildItem (Join-Path $staging 'memoria-claude') -Filter *.md -File).Count
    Bien "$n notas"
    $resumen['memoria'] = "$n notas"
  } else { Aviso "No encuentro la memoria en $MEMORIA" }

  # ---------------- la base de datos ----------------
  Titulo 'La base de datos'
  if ($pg) {
    $url = Conexion-Base
    # La contraseña va en PGPASSWORD y no en la línea de órdenes, que la ven
    # otros procesos del ordenador mientras corre.
    $m = [regex]::Match($url, '^(postgres(?:ql)?://)([^:/@]+):([^@]*)@(.+)$')
    if ($m.Success) {
      $env:PGPASSWORD = [uri]::UnescapeDataString($m.Groups[3].Value)
      $urlSinClave = $m.Groups[1].Value + $m.Groups[2].Value + '@' + $m.Groups[4].Value
    } else { $urlSinClave = $url }
    $dBase = Join-Path $staging 'base-de-datos'
    New-Item -ItemType Directory -Path $dBase | Out-Null

    # Dos exportaciones, y no una, porque se restauran distinto:
    #  · public: las tablas de la app, con su estructura, sus funciones y sus
    #    reglas de seguridad. Es TRIPULSE.
    #  · auth, solo datos: las cuentas. Sin ellas, al restaurar nadie podría
    #    entrar, y los datos de cada atleta quedarían sin dueño.
    $fPub = Join-Path $dBase 'public.dump'
    $fAuth = Join-Path $dBase 'auth-cuentas.dump'
    & $pg --dbname=$urlSinClave --schema=public --format=custom --no-owner --no-privileges --file=$fPub
    if ($LASTEXITCODE -ne 0) { throw 'pg_dump falló exportando las tablas de la app. Revisa la conexión (y que sea la del pooler).' }
    & $pg --dbname=$urlSinClave --schema=auth --data-only --format=custom --no-owner --no-privileges --file=$fAuth
    if ($LASTEXITCODE -ne 0) { Aviso 'No se han podido exportar las cuentas (auth). Las tablas de la app sí.' }

    # Comprobar que la exportación SE PUEDE LEER, no solo que se escribió.
    $pgr = Join-Path (Split-Path $pg) 'pg_restore.exe'
    $tablas = 0
    if (Test-Path $pgr) {
      $toc = & $pgr --list $fPub 2>$null
      $tablas = @($toc | Where-Object { $_ -match ' TABLE DATA public ' }).Count
      if ($tablas -gt 0) { Bien "Exportada y legible: $tablas tablas con datos" } else { throw 'La exportación de la base no se puede leer.' }
    }
    $tamB = (Get-Item $fPub).Length
    Bien ("public.dump {0:N1} MB" -f ($tamB / 1MB))
    $resumen['base de datos'] = ("{0} tablas, {1:N1} MB" -f $tablas, ($tamB / 1MB))
  } else {
    Aviso 'Sin pg_dump: esta copia NO lleva la base de datos.'
    $resumen['base de datos'] = 'NO INCLUIDA (falta pg_dump 17)'
  }

  # ---------------- el léeme ----------------
  $leeme = @"
TRIPULSE · copia de seguridad del $(Get-Date -Format 'dd/MM/yyyy HH:mm')

QUÉ HAY
$( ($resumen.GetEnumerator() | ForEach-Object { '  ' + $_.Key.PadRight(15) + $_.Value }) -join "`r`n" )

CÓMO SE RESTAURA
1. El código: copia la carpeta «codigo» donde quieras. Dentro de tripulse-app:
     npm install
   y pon dentro de tripulse-app los ficheros de «claves».
2. La base de datos, en un proyecto de Supabase NUEVO y vacío, con pg_restore
   17 y la cadena de conexión de ESE proyecto:
     pg_restore --dbname="<cadena>" --no-owner --no-privileges public.dump
     pg_restore --dbname="<cadena>" --data-only auth-cuentas.dump
   Las cuentas van DESPUÉS de las tablas.
3. En Vercel, apunta las variables de entorno al proyecto nuevo.

La memoria de Claude va en «memoria-claude»: se devuelve a
  %USERPROFILE%\.claude\projects\C--Users-nicol-OneDrive-Escritorio-Obsidian-ia\memory
"@
  Set-Content -Path (Join-Path $staging 'LEEME.txt') -Value $leeme -Encoding UTF8

  # ---------------- cifrar y comprimir ----------------
  Titulo 'Cifrar'
  $clave = Pedir-Contrasena
  # -mhe=on cifra también los NOMBRES de los ficheros: sin la contraseña no se
  # ve ni que dentro hay un «.env.local».
  & $z a -t7z -mx=5 -mhe=on "-p$clave" $archivo "$staging\*" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "7-Zip falló creando el archivo (código $LASTEXITCODE)" }

  # Abrirlo con la contraseña de verdad: si no se abre, no hay copia.
  & $z t "-p$clave" $archivo | Out-Null
  if ($LASTEXITCODE -ne 0) { throw 'El archivo se ha creado pero NO se puede abrir con esa contraseña.' }
  $clave = $null
  Bien ("Cifrada y comprobada: {0} ({1:N1} MB)" -f (Split-Path $archivo -Leaf), ((Get-Item $archivo).Length / 1MB))

  # ---------------- quedarse con las últimas ----------------
  $todas = Get-ChildItem $carpetaDestino -Filter "$PREFIJO*.7z" | Sort-Object Name -Descending
  $sobran = $todas | Select-Object -Skip $GUARDAR
  foreach ($s in $sobran) { Remove-Item $s.FullName; Write-Host "  borrada la vieja $($s.Name)" -ForegroundColor DarkGray }
  Bien ("En el pendrive: {0} copia(s)" -f [math]::Min(@($todas).Count, $GUARDAR))

  Titulo 'Hecho'
  if ($resumen['base de datos'] -like 'NO*') {
    Aviso 'Recuerda: sin pg_dump la base de datos NO está en esta copia.'
  }
  Write-Host '  Saca el pendrive con «Quitar hardware de forma segura» y guárdalo FUERA de casa'
  Write-Host '  si puedes: una copia en el mismo sitio que el portátil no sirve si pasa algo en ese sitio.'
}
catch {
  Mal $_.Exception.Message
  if (Test-Path $archivo) { Remove-Item $archivo -ErrorAction SilentlyContinue; Aviso 'El archivo a medias se ha borrado.' }
  $codigoSalida = 1
}
finally {
  # La carpeta de trabajo lleva las claves y los datos SIN cifrar: no se puede
  # quedar en TEMP pase lo que pase.
  $env:PGPASSWORD = $null
  if (Test-Path $staging) { Remove-Item $staging -Recurse -Force -ErrorAction SilentlyContinue }
}

Write-Host ''
Read-Host '  Pulsa Intro para cerrar'
if ($codigoSalida) { exit $codigoSalida }
