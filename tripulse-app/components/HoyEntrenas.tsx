'use client'
// ============================================================
// La tira de hoy, en el panel del entrenador
// ============================================================
// El panel preguntaba «¿con quién trabajamos hoy?» y no sabía contestarlo: no
// hacía ni una consulta a `sesion`. Para saber qué tocaba había que elegir
// atleta, ir a planificación, al calendario, buscar el día y entrar — seis
// toques, y encima acordándote de la fecha.
//
// Eso convertía el modo de dirigir en algo que existía y no se usaba: de pie en
// el borde del vaso con el grupo esperando, nadie da seis toques.
//
// AQUÍ NO SE FILTRA POR EL ATLETA ACTIVO, a propósito. El resto del panel gira
// alrededor de uno; esto es lo contrario: a las siete de la mañana no sabes con
// quién trabajas, la app te lo dice a ti.
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { hoyISO } from '@/lib/fechas'
import { vivas } from '@/lib/papelera'
import { filasDeHoy, resumenDeHoy, type FilaHoy, type GrupoDeEmision, type SesionHoy } from '@/lib/hoy-entrenador'

const EMOJI: Record<string, string> = {
  Natacion: '🏊', 'Natación': '🏊', Ciclismo: '🚴', Carrera: '🏃', Fuerza: '🏋️', Brick: '🔀',
}

interface Props {
  /** Los atletas del entrenador. Vienen ya cargados por el panel. */
  deportistas: { id: number; nombre: string }[]
}

export default function HoyEntrenas({ deportistas }: Props) {
  const router = useRouter()
  const [filas, setFilas] = useState<FilaHoy[] | null>(null)

  useEffect(() => { if (deportistas.length) cargar() }, [deportistas])

  const cargar = async () => {
    const ids = deportistas.map(d => d.id)
    const { data: ses } = await vivas(supabase.from('sesion')
      .select('id, id_deportista, id_emision, disciplina, estado, hora_inicio')
      .in('id_deportista', ids).eq('fecha_sesion', hoyISO()))

    const lista = (ses || []) as any[]

    /* Los grupos de las emisiones que salgan, en DOS consultas y no una por
       emisión. Con cinco grupos entrenando hoy serían diez viajes para pintar
       cinco títulos. */
    const emisiones = [...new Set(lista.map(s => s.id_emision).filter(Boolean))] as string[]
    const grupos: Record<string, GrupoDeEmision> = {}
    if (emisiones.length) {
      const { data: ems } = await supabase.from('grupo_entreno_emision')
        .select('id, id_grupo').in('id', emisiones)
      const idsG = [...new Set((ems || []).map((e: any) => e.id_grupo).filter(Boolean))]
      const { data: gs } = idsG.length
        ? await supabase.from('grupo_entreno').select('id, nombre').in('id', idsG)
        : { data: [] as any[] }
      const nombreDe = new Map((gs || []).map((g: any) => [String(g.id), g.nombre as string]))
      for (const e of ems || []) {
        grupos[String(e.id)] = { idGrupo: String(e.id_grupo), nombre: nombreDe.get(String(e.id_grupo)) || 'Grupo' }
      }
    }

    const nombres: Record<number, string> = {}
    for (const d of deportistas) nombres[d.id] = d.nombre

    setFilas(filasDeHoy(
      lista.map((s): SesionHoy => ({ ...s, hora: s.hora_inicio })),
      nombres, grupos,
    ))
  }

  // Mientras carga no se pinta nada: un esqueleto parpadeando arriba del panel
  // molesta más de lo que informa, y esto tarda menos que el resto de la página.
  if (filas === null) return null

  /* Sin nada hoy tampoco se pinta. Un «hoy no entrena nadie» permanente en la
     cabecera del panel es una tarjeta que solo dice que no hay tarjeta. */
  if (filas.length === 0) return null

  return (
    <div className="tp-card p-[14px_16px] flex flex-col gap-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-[13px] font-semibold m-0">Hoy</p>
        <span className="text-[11.5px] text-gray-500">{resumenDeHoy(filas)}</span>
      </div>

      <div className="flex flex-col gap-1.5">
        {filas.map(f => (
          <div key={f.clave}
            className={'flex items-center gap-3 rounded-xl border px-3 py-2.5 transition '
              + (f.hecha ? 'border-white/[0.06] bg-white/[0.015] opacity-60'
                : 'border-white/[0.08] bg-white/[0.025]')}>
            <span className="text-xl leading-none flex-none">{EMOJI[f.disciplina] || '🏃'}</span>

            <span className="flex-1 min-w-0">
              <span className="block text-[14px] font-semibold tracking-tight truncate">
                {f.titulo}
                {f.esGrupo && (
                  <span className="ml-1.5 text-[10px] font-bold uppercase tracking-wider text-orange-300 bg-orange-500/15 px-1.5 py-0.5 rounded">
                    {f.cuantos}
                  </span>
                )}
              </span>
              <span className="block text-[11.5px] text-gray-500">
                {[f.hora, f.disciplina, f.hecha ? 'hecha' : null].filter(Boolean).join(' · ')}
              </span>
            </span>

            {/* Un toque desde que abres la app. Esa es toda la idea. */}
            <button onClick={() => router.push(f.destino)}
              title={f.esGrupo ? 'Cronometrar al grupo a pie de pista' : 'Apuntar tiempos y notas mientras entrena'}
              className={'text-[12.5px] font-semibold px-3 py-2 rounded-lg border flex-none transition '
                + (f.hecha
                  ? 'border-gray-700 bg-white/[0.03] text-gray-500 hover:text-white'
                  : 'border-orange-500/45 bg-orange-500/12 text-orange-300 hover:bg-orange-500/20')}>
              ⏱ {f.hecha ? 'Revisar' : 'Dirigir'}
            </button>
          </div>
        ))}
      </div>
    </div>
  )
}
