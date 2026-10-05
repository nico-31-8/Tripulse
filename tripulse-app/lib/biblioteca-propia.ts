// ============================================================
// La biblioteca que ve CADA entrenador
// ============================================================
//
// Hay tres clases de ejercicio en la misma tabla:
//
//   - EL COMÚN: los 256 que trae la app. No son de nadie y nadie los toca.
//   - EL MÍO: los que se ha creado este entrenador.
//   - EL DEL ATLETA: los que se apuntó él (una máquina rara de su gimnasio).
//
// Y dos cosas que cada entrenador decide por su cuenta: de cuáles del común
// tiene SU VERSIÓN, y cuáles no quiere ver.
//
// POR QUÉ ESTO VIVE AQUÍ Y NO EN LA PANTALLA. La lista la pintan dos sitios
// —la biblioteca de /fuerza y el buscador de al prescribir— y tienen que
// enseñar exactamente lo mismo. Con la cuenta hecha en cada uno, el día que una
// aprenda a esconder y la otra no, el entrenador escondería un ejercicio y
// seguiría saliéndole justo donde iba a usarlo.

export interface EjercicioBib {
  id: number
  nombre: string
  id_entrenador?: string | null
  id_deportista?: number | null
  /** De cuál del común es copia, si lo es. */
  origen_id?: number | null
}

/**
 * De quién va a ser un ejercicio nuevo.
 *
 * Son los dos únicos dueños que existen, y la diferencia importa: un ejercicio
 * del ENTRENADOR lo ve él en todos sus atletas; uno del DEPORTISTA es de ese
 * atleta y nada más. Antes solo existía el segundo —lo creó la pantalla del
 * atleta— y el formulario escribía `id_deportista` a pelo: por eso, al abrirlo
 * desde el entrenador, lo que creara habría acabado colgando de un atleta
 * suelto en vez de ser suyo.
 */
export type Dueno = { deportista: number } | { entrenador: string }

/** Si este ejercicio es de ese dueño. */
export function esDe(
  ej: { id_entrenador?: string | null; id_deportista?: number | null } | null | undefined,
  dueno: Dueno | null | undefined,
): boolean {
  if (!ej || !dueno) return false
  return 'entrenador' in dueno
    ? !!dueno.entrenador && ej.id_entrenador === dueno.entrenador
    : ej.id_deportista != null && Number(ej.id_deportista) === Number(dueno.deportista)
}

/** Los 256 que trae la app: no son de ningún entrenador ni de ningún atleta. */
export const esComun = (e: EjercicioBib): boolean =>
  !e.id_entrenador && !e.id_deportista

/** Mío = del entrenador que mira. Es el caso de `esDe` que usa la biblioteca. */
export const esMio = (e: EjercicioBib, uid: string | null | undefined): boolean =>
  !!uid && esDe(e, { entrenador: uid })

/**
 * La lista que le toca ver a este entrenador, ya ordenada.
 *
 * LA COPIA SUSTITUYE AL ORIGINAL, no se suma. Si no, al cambiarle el nombre a
 * «Sentadilla» acabaría con dos sentadillas en el desplegable y eligiendo la
 * que no es la mitad de las veces — que es exactamente el problema que venía a
 * resolver tener la suya.
 *
 * LO ESCONDIDO SE VA SIEMPRE, sea del común o suyo. Esconder no borra nada: la
 * fila sigue ahí para todos los demás, solo deja de salirle a quien la escondió.
 */
export function miBiblioteca<T extends EjercicioBib>(
  filas: T[] | null | undefined,
  uid: string | null | undefined,
  ocultos: Iterable<number> | null | undefined,
): T[] {
  const todas = Array.isArray(filas) ? filas : []
  const tapados = new Set(ocultos || [])

  /* De qué originales tengo versión propia. Solo cuentan las MÍAS: en la lista
     pueden llegar copias de otro entrenador si algún día se comparten, y la
     copia de otro no tiene por qué taparme el común. */
  const sustituidos = new Set<number>()
  for (const e of todas) {
    if (esMio(e, uid) && e.origen_id != null) sustituidos.add(e.origen_id)
  }

  /* SE RESPETA EL ORDEN EN QUE VIENEN, no se reordena. Cada pantalla le pide a
     la base el suyo —la biblioteca por nombre, el buscador de al prescribir por
     grupo muscular y luego nombre, porque los agrupa por cabeceras— y
     reordenar aquí le desharía el agrupado a una de las dos sin que se note
     hasta abrirla. Esta función decide QUÉ se ve, no en qué orden. */
  return todas.filter(e => {
    if (tapados.has(e.id)) return false
    if (esMio(e, uid)) return true
    if (e.id_deportista != null) return true
    if (!esComun(e)) return false            // de otro entrenador: no es mío
    return !sustituidos.has(e.id)            // común, salvo que tenga el mío
  })
}

/**
 * La fila que hay que insertar para quedarse con SU versión de uno del común.
 *
 * Se copia entero y después se marca: así la copia nace idéntica y el
 * entrenador solo cambia lo que quería cambiar. El `id` se quita a propósito
 * —lo pone la base— y `id_deportista` también: una copia del entrenador no es
 * de ningún atleta aunque se copie desde uno suyo.
 */
export function comoCopia(e: EjercicioBib, uid: string): Record<string, unknown> {
  /* Se copia TODO lo que traiga la fila, no los campos que esta interfaz
     conoce: la biblioteca tiene etiquetas, ejecución y descripción que aquí no
     se nombran, y copiando solo lo declarado la versión del entrenador nacería
     a medias — sin vídeo y sin etiquetas— sin que nada lo dijera. */
  const o: Record<string, unknown> = { ...(e as unknown as Record<string, unknown>) }
  delete o.id
  delete o.created_at
  o.id_entrenador = uid
  o.id_deportista = null
  /* Copiar la copia de alguien apuntaría a un original que no es el suyo: lo
     que sustituye es SIEMPRE el del común del que vino. */
  o.origen_id = e.origen_id ?? e.id
  return o
}

/** Si al tocar este ejercicio hay que hacer una copia en vez de editarlo. */
export const hayQueCopiar = (e: EjercicioBib, uid: string | null | undefined): boolean =>
  !esMio(e, uid) && e.id_deportista == null

/**
 * La biblioteca ya filtrada, de un viaje, para quien solo quiere la lista.
 *
 * LA USAN LAS TRES PANTALLAS QUE OFRECEN EJERCICIOS: la biblioteca de /fuerza,
 * la ficha de la sesión y la tabla de tareas. Cada una se cargaba la suya y
 * aplicaba —o no— sus reglas; con eso, esconder un ejercicio lo quitaba de la
 * biblioteca y te lo seguías encontrando justo al prescribir, que es donde
 * molesta.
 *
 * El ORDEN lo pide cada una: `nombre` para la lista, `grupo` para los
 * buscadores que agrupan por cabeceras.
 */
export async function cargarBiblioteca(
  orden: 'nombre' | 'grupo' = 'nombre',
  sb?: unknown,
): Promise<EjercicioBib[]> {
  const cliente = (sb as { from: (t: string) => any }) || (await import('./supabase')).supabase
  const consulta = cliente.from('ejercicios_biblioteca').select('*')
  const pedida = orden === 'grupo'
    ? consulta.order('grupo_muscular').order('nombre')
    : consulta.order('nombre')

  const [ej, oc, user] = await Promise.all([
    pedida,
    /* La regla de la base ya solo devuelve los escondidos de quien pregunta. */
    cliente.from('ejercicio_oculto').select('id_ejercicio'),
    (await import('./sesion')).usuarioActual(),
  ])

  return miBiblioteca(
    (ej?.data || []) as EjercicioBib[],
    user?.id || null,
    ((oc?.data || []) as { id_ejercicio: number }[]).map(o => o.id_ejercicio),
  )
}
