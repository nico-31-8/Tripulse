# ============================================================
# TRIPULSE · restaurar una copia en un proyecto de Supabase NUEVO
# ============================================================
#
# Se lanza con doble clic en «restaurar-copia.bat», con el disco de las copias
# puesto. Sirve para PROBAR que una copia se puede restaurar de verdad, y el día
# que haga falta, para restaurarla.
#
# QUÉ HACE
#   1. Abre la copia que elijas con su contraseña y saca SOLO la base de datos a
#      una carpeta temporal, que se borra al acabar pase lo que pase: lleva datos
#      de salud sin cifrar.
#   2. La restaura en el proyecto que le digas: PRIMERO las cuentas y DESPUÉS las
#      tablas. Siete tablas apuntan a las cuentas; al revés, sus claves ajenas no
#      se podrían crear.
#   3. Comprueba lo restaurado (tablas, filas de cada una, funciones, reglas de
#      seguridad y permisos) y lo enseña, para compararlo con producción.
#
# LO QUE NO HACE NUNCA: tocar producción. Si la cadena de conexión es la del
# proyecto de producción, se niega; y solo restaura en un proyecto VACÍO.
#
# LO QUE NO VIENE EN LA COPIA: los tokens de los relojes (viven en el Vault de
# Supabase: habrá que volver a conectar los relojes) y las variables de Vercel.

#Requires -Version 5.1
$ErrorActionPreference = 'Stop'

$PRODUCCION = 'wjgyuueptlhuuhujfbla'   # el id del proyecto de producción
$PREFIJO    = 'TRIPULSE-'

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

# pg_restore y psql de la versión 17 o más nueva: Supabase va en Postgres 17.
function Buscar-BinPg {
  $dirs = Get-ChildItem "$env:ProgramFiles\PostgreSQL\*\bin" -Directory -ErrorAction SilentlyContinue |
    Sort-Object { [int]($_.Parent.Name -replace '\D', '') } -Descending
  foreach ($d in $dirs) {
    $r = Join-Path $d.FullName 'pg_restore.exe'
    if ((Test-Path $r) -and (Test-Path (Join-Path $d.FullName 'psql.exe'))) {
      $v = & $r --version 2>$null
      if ($v -match '(\d+)\.') { if ([int]$Matches[1] -ge 17) { return $d.FullName } }
    }
  }
  return $null
}

function Elegir-Copia {
  $copias = @()
  foreach ($d in (Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -ne 'C:' -and $_.Size -gt 0 })) {
    $dir = Join-Path "$($d.DeviceID)\" 'Copias TRIPULSE'
    if (Test-Path $dir) { $copias += @(Get-ChildItem $dir -Filter "$PREFIJO*.7z" -File) }
  }
  if (-not $copias.Count) { return $null }
  $copias = @($copias | Sort-Object Name -Descending | Select-Object -First 9)
  Write-Host ''
  Write-Host '  Copias encontradas (la 1 es la más reciente):'
  $i = 1
  foreach ($c in $copias) {
    Write-Host ("   {0}) {1}  {2:N1} MB" -f $i, $c.FullName, ($c.Length / 1MB))
    $i++
  }
  $n = Read-Host '  Número de la copia (Intro = la 1)'
  if (-not $n) { return $copias[0].FullName }
  if ($n -match '^\d+$' -and [int]$n -ge 1 -and [int]$n -le $copias.Count) { return $copias[[int]$n - 1].FullName }
  return $null
}

function Leer-Secreto($texto) {
  $s = Read-Host $texto -AsSecureString
  return [Runtime.InteropServices.Marshal]::PtrToStringAuto([Runtime.InteropServices.Marshal]::SecureStringToBSTR($s))
}

# postgresql://usuario:contraseña@servidor:puerto/base → sus partes. La contraseña
# va luego en PGPASSWORD y no en la línea de órdenes, que la ven otros procesos.
function Partir-Url($url) {
  $m = [regex]::Match($url.Trim(), '^(postgres(?:ql)?://)([^:/@]+):([^@]*)@(.+)$')
  if (-not $m.Success) { return $null }
  $servidor = ($m.Groups[4].Value -split '/')[0]
  $puerto = '5432'
  if ($servidor -match ':(\d+)$') { $puerto = $Matches[1] }
  return @{
    usuario  = $m.Groups[2].Value
    clave    = [uri]::UnescapeDataString($m.Groups[3].Value)
    sinClave = $m.Groups[1].Value + $m.Groups[2].Value + '@' + $m.Groups[4].Value
    host     = ($servidor -split ':')[0]
    puerto   = $puerto
  }
}

# Un programa de PostgreSQL con su salida de error recogida. En PowerShell 5.1,
# con ErrorActionPreference en Stop, el stderr de un programa corta el script:
# se baja a Continue solo aquí.
function Ejecutar($exe, $argumentos) {
  $prev = $ErrorActionPreference; $ErrorActionPreference = 'Continue'
  $salida = @(& $exe @argumentos 2>&1 | ForEach-Object { "$_" })
  $codigo = $LASTEXITCODE
  $ErrorActionPreference = $prev
  return @{ salida = $salida; codigo = $codigo }
}

# Los errores que salen SIEMPRE en un proyecto nuevo, y por qué no importan.
# Vistos en la primera prueba de verdad (20-10-2026). Cualquier otro es de verdad.
$ESPERABLES = @(
  @{ patron = 'permission denied for table schema_migrations'; porque = 'ahí guarda Supabase su propia versión de las cuentas' },
  @{ patron = 'schema "public" already exists'; porque = 'el proyecto nuevo ya la trae' },
  @{ patron = 'permission denied to change default privileges'; porque = 'son los permisos por defecto de Supabase, no los de TRIPULSE' }
)

# Restaura y enseña SOLO la primera línea de cada error: las de DETAIL y CONTEXT
# pueden llevar los datos de una fila.
function Restaurar($argumentos, $que) {
  $r = Ejecutar $pgRestore (@("--dbname=$($c.sinClave)") + $argumentos)
  $errores = @($r.salida | Where-Object { $_ -match 'error:' -and $_ -notmatch 'errors ignored' })
  $esperables = @()
  $reales = @()
  foreach ($e in $errores) {
    $conocido = $ESPERABLES | Where-Object { $e -match [regex]::Escape($_.patron) } | Select-Object -First 1
    if ($conocido) { $esperables += $conocido.porque } else { $reales += $e }
  }
  $nota = ''
  if ($esperables.Count) { $nota = ' ({0} aviso(s) esperable(s): {1})' -f $esperables.Count, (($esperables | Select-Object -Unique) -join '; ') }
  if (-not $reales.Count) { Bien "$que, sin errores$nota"; return }
  Aviso ("$que, con {0} error(es) de verdad$nota" -f $reales.Count)
  foreach ($e in ($reales | Select-Object -First 15)) {
    $t = $e -replace '^pg_restore: error: (could not execute query: )?', ''
    if ($t.Length -gt 170) { $t = $t.Substring(0, 170) + '...' }
    Write-Host "       $t" -ForegroundColor DarkGray
  }
  if ($reales.Count -gt 15) { Write-Host ("       ... y {0} más" -f ($reales.Count - 15)) -ForegroundColor DarkGray }
}

# Los permisos por defecto de Supabase: todo lo que el usuario postgres crea en
# public queda abierto a anon, authenticated y service_role. Producción los tiene
# igual, y la app los da por hechos al crear tablas nuevas.
function PermisosPorDefecto($accion) {
  $verbo = if ($accion -eq 'quitar') { 'revoke' } else { 'grant' }
  $prep = if ($accion -eq 'quitar') { 'from' } else { 'to' }
  $sql = (@('tables', 'functions', 'sequences') | ForEach-Object {
    "alter default privileges for role postgres in schema public $verbo all on $_ $prep anon, authenticated, service_role"
  }) -join '; '
  return Ejecutar $psql @("--dbname=$($c.sinClave)", '-v', 'ON_ERROR_STOP=1', '-c', $sql)
}

# ------------------------------------------------------------
Write-Host ''
Write-Host '  TRIPULSE · restaurar una copia en un proyecto NUEVO' -ForegroundColor White
Write-Host ('  ' + (Get-Date -Format 'dddd d \de MMMM \de yyyy, HH:mm'))

Titulo 'Herramientas'
$z = Buscar-7z
$bin = Buscar-BinPg
if (-not $z) { Mal '7-Zip no está instalado: sin él no se puede abrir la copia.'; Read-Host '  Pulsa Intro para salir'; exit 1 }
if (-not $bin) { Mal 'Faltan pg_restore y psql 17 (las herramientas de PostgreSQL 17).'; Read-Host '  Pulsa Intro para salir'; exit 1 }
$pgRestore = Join-Path $bin 'pg_restore.exe'
$psql = Join-Path $bin 'psql.exe'
$isready = Join-Path $bin 'pg_isready.exe'
Bien "7-Zip: $z"
Bien "PostgreSQL: $bin"

Titulo 'La copia'
$archivo = Elegir-Copia
if (-not $archivo) { Mal 'No encuentro ninguna copia («Copias TRIPULSE» en un disco externo), o no has elegido ninguna.'; Read-Host '  Pulsa Intro para salir'; exit 1 }
Bien "Copia: $archivo"

$tmp = Join-Path $env:TEMP ('tripulse-restaurar-' + [guid]::NewGuid().ToString('N'))
$codigoSalida = 0

try {
  # ---------------- el proyecto donde se restaura ----------------
  Titulo 'El proyecto donde se restaura'
  Write-Host '  Tiene que ser un proyecto NUEVO y vacío. Nunca el de producción.'
  Write-Host '  En Supabase, dentro de ESE proyecto: botón «Connect» → «Session pooler» → copia la'
  Write-Host '  cadena y pon la contraseña de la base de ESE proyecto donde dice [YOUR-PASSWORD].'
  $url = Leer-Secreto '  Cadena de conexión del proyecto nuevo'
  if ($url -match $PRODUCCION) {
    $url = $null
    throw 'ESA CADENA ES LA DE PRODUCCIÓN. Aquí nunca se restaura encima de producción: crea un proyecto nuevo y usa la suya.'
  }
  $c = Partir-Url $url
  $url = $null
  if (-not $c) { throw 'Eso no parece una cadena de conexión: empieza por postgresql:// y lleva usuario, contraseña y servidor.' }
  if ($c.clave -match '^\[.*\]$' -or $c.clave -eq 'YOUR-PASSWORD') {
    throw 'En la cadena sigue puesto [YOUR-PASSWORD]: cámbialo, corchetes incluidos, por la contraseña de la base de ese proyecto.'
  }
  Write-Host "  Conectando a $($c.host):$($c.puerto) como $($c.usuario) (contraseña de $($c.clave.Length) caracteres)"
  $env:PGPASSWORD = $c.clave

  # ANTES DE MANDAR LA CONTRASEÑA, ¿contesta? pg_isready no la envía.
  & $isready -h $c.host -p $c.puerto -U $c.usuario -d postgres -t 12 | Out-Null
  if ($LASTEXITCODE -eq 2) {
    throw 'El servidor no contesta desde esta red. NO es la contraseña: ni se ha enviado. En eduroam pasa; hazlo desde casa o con los datos del móvil.'
  }

  # Solo en un proyecto VACÍO: si ya tiene tablas, no es el que toca.
  $r = Ejecutar $psql @("--dbname=$($c.sinClave)", '-At', '-c', "select count(*) from pg_tables where schemaname = 'public'")
  if ($r.codigo -ne 0) {
    if (($r.salida -join ' ') -match 'password authentication failed') {
      throw 'La contraseña de ese proyecto no es correcta. No lo intentes muchas veces seguidas: Supabase bloquea un rato tras varios fallos.'
    }
    throw ('No he podido entrar en ese proyecto: ' + (($r.salida | Select-Object -First 2) -join ' '))
  }
  $tablasYa = [int]($r.salida | Select-Object -Last 1)
  if ($tablasYa -gt 0) { throw "Ese proyecto ya tiene $tablasYa tablas: solo restauro en uno vacío. Crea otro nuevo." }
  Bien 'Proyecto vacío y accesible'

  # ---------------- abrir la copia ----------------
  Titulo 'Abrir la copia'
  $clave = Leer-Secreto '  Contraseña de la copia'
  New-Item -ItemType Directory -Path $tmp | Out-Null
  & $z x "-p$clave" $archivo "-o$tmp" 'base-de-datos\*' -y | Out-Null
  $codigo7z = $LASTEXITCODE
  $clave = $null
  if ($codigo7z -ne 0) { throw 'No se ha podido abrir la copia: ¿es la contraseña de ESTA copia?' }
  $fPub = Join-Path $tmp 'base-de-datos\public.dump'
  $fAuth = Join-Path $tmp 'base-de-datos\auth-cuentas.dump'
  if (-not (Test-Path $fPub)) { throw 'Esta copia no lleva la base de datos.' }
  Bien 'Base de datos sacada de la copia'

  # ¿Lleva los permisos? Las copias de antes del 20-10-2026 se hicieron sin ellos.
  $toc = (Ejecutar $pgRestore @('--list', $fPub)).salida
  $permisos = @($toc | Where-Object { $_ -match '\sACL\s' }).Count
  if ($permisos -gt 0) { Bien "Lleva los permisos de la base ($permisos)" }
  else { Aviso 'Esta copia NO lleva los permisos de la base (es de antes del 20-10-2026): restaurada, sus funciones quedarían abiertas a cualquiera. Para restaurar de verdad, usa una copia más nueva.' }

  # ---------------- restaurar ----------------
  Titulo 'Restaurar'
  if (Test-Path $fAuth) { Restaurar @('--data-only', '--no-owner', $fAuth) 'Las cuentas' }
  else { Aviso 'La copia no lleva las cuentas: nadie podría entrar con su usuario.' }

  # LA PRIMERA PRUEBA (20-10-2026) LO DESTAPÓ: la copia guarda los permisos que
  # se CONCEDEN, no los que se quitaron. Con los permisos por defecto de Supabase
  # puestos, cada función nacía abierta a todos y nada la volvía a cerrar: las
  # 103 que producción cierra al público quedaban abiertas. Se quitan antes de
  # crear nada (así cada objeto queda EXACTAMENTE con los permisos de la copia) y
  # se vuelven a poner al acabar, para lo que se cree después.
  $r = PermisosPorDefecto 'quitar'
  if ($r.codigo -ne 0) { throw ('No he podido quitar los permisos por defecto del proyecto nuevo: ' + (($r.salida | Select-Object -First 2) -join ' ')) }
  Restaurar @('--no-owner', $fPub) 'Las tablas, con sus datos, sus reglas y sus permisos'
  $r = PermisosPorDefecto 'poner'
  if ($r.codigo -ne 0) { Aviso 'No he podido volver a poner los permisos por defecto de Supabase: las tablas que se creen a partir de ahora no se verán desde la app hasta ponerlos.' }

  # ---------------- comprobar ----------------
  Titulo 'Comprobar'
  $resumen = @"
select 'tablas', count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r'
union all select 'tablas con RLS', count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity
union all select 'politicas', count(*) from pg_policies where schemaname = 'public'
union all select 'funciones', count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f'
union all select 'funciones cerradas a anon', count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and not has_function_privilege('anon', p.oid, 'execute')
union all select 'funciones cerradas a authenticated', count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prokind = 'f' and not has_function_privilege('authenticated', p.oid, 'execute')
union all select 'tablas cerradas a anon', count(*) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and not has_table_privilege('anon', c.oid, 'select')
union all select 'claves ajenas a las cuentas', count(*) from pg_constraint k join pg_class t on t.oid = k.conrelid join pg_namespace n on n.oid = t.relnamespace join pg_class f on f.oid = k.confrelid join pg_namespace fn on fn.oid = f.relnamespace where k.contype = 'f' and n.nspname = 'public' and fn.nspname = 'auth'
union all select 'cuentas', count(*) from auth.users
"@
  $r = Ejecutar $psql @("--dbname=$($c.sinClave)", '-At', '-F', ': ', '-c', ($resumen -replace "`r?`n", ' '))
  if ($r.codigo -ne 0) { Aviso ('No he podido comprobarlo: ' + (($r.salida | Select-Object -First 2) -join ' ')) }
  else { $r.salida | ForEach-Object { Write-Host "  $_" } }

  # Las filas de cada tabla: nombres y números, nada de lo que hay dentro.
  $filas = "select table_name, (xpath('/row/c/text()', query_to_xml(format('select count(*) as c from public.%I', table_name), false, true, '')))[1]::text from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name"
  $r = Ejecutar $psql @("--dbname=$($c.sinClave)", '-At', '-F', ' ', '-c', $filas)
  if ($r.codigo -eq 0) {
    Write-Host ''
    Write-Host '  Filas de cada tabla:'
    $r.salida | ForEach-Object { Write-Host "    $_" }
  }

  Titulo 'Hecho'
  Write-Host '  Estas cifras tienen que coincidir con las de producción, salvo lo que se haya'
  Write-Host '  apuntado después de hacer la copia. Claude puede compararlas por ti.'
  Aviso 'Si era una PRUEBA, borra ese proyecto: lleva los datos de salud de tus atletas.'
  Write-Host '  Supabase → ese proyecto → Project Settings → General → Delete project.'
}
catch {
  Mal $_.Exception.Message
  $codigoSalida = 1
}
finally {
  # La carpeta temporal lleva la base SIN cifrar: no se puede quedar, pase lo que pase.
  $env:PGPASSWORD = $null
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
  if (Test-Path $tmp) { Mal "No he podido borrar $tmp : bórrala a mano, lleva datos sin cifrar." }
}

Write-Host ''
Read-Host '  Pulsa Intro para cerrar'
if ($codigoSalida) { exit $codigoSalida }
