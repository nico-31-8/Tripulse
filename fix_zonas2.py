path = '/workspaces/Tripulse/tripulse-app/app/planificacion-visual/[id]/dibujo/page.tsx'
content = open(path).read()

# 1. Restaurar sesiones_zonas al cargar borrador
old1 = '''  const cargarBorrador = async () => {
    const { data } = await supabase.from('dibujo_borrador').select('*').eq('id_deportista', Number(id)).single()
    if (!data) return null
    return data
  }'''
new1 = '''  const cargarBorrador = async () => {
    const { data } = await supabase.from('dibujo_borrador').select('*').eq('id_deportista', Number(id)).single()
    if (!data) return null
    if (data.sesiones_zonas) setSesZonas(data.sesiones_zonas)
    return data
  }'''
if old1 in content:
    content = content.replace(old1, new1)
    print('OK paso 1 - restaurar zonas del borrador')
else:
    print('ERROR paso 1')

# 2. Disparar guardado cuando cambian las zonas
old2 = '''  useEffect(() => {
    if (macros.length > 0 && fechaInicio) dispararGuardado(macros, mesos, sems, fechaInicio, totalSem)
  }, [sems])'''
new2 = '''  useEffect(() => {
    if (macros.length > 0 && fechaInicio) dispararGuardado(macros, mesos, sems, fechaInicio, totalSem)
  }, [sems])
  useEffect(() => {
    if (macros.length > 0 && fechaInicio) dispararGuardado(macros, mesos, sems, fechaInicio, totalSem)
  }, [sesZonas])'''
if old2 in content:
    content = content.replace(old2, new2)
    print('OK paso 2 - guardar al cambiar zonas')
else:
    print('ERROR paso 2')

# 3. Clic derecho para borrar cuadradito
old3 = '''                          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPopupZona({ semana: s.i, x: r.left, y: r.top }); setZonaSelDisc('Natacion'); setZonaSelZona('Z1') }}>
                          {sesEsta.map(sz => (
                            <div key={sz.id}
                              className="flex-shrink-0 flex items-center justify-center rounded text-white font-bold border"
                              style={{ width: SEMANA_W - 6, height: 22, backgroundColor: (C_DISC[sz.disciplina] || '#888') + '30', borderColor: C_DISC[sz.disciplina] || '#888', fontSize: 9 }}>
                              {sz.zona}
                            </div>
                          ))}'''
new3 = '''                          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPopupZona({ semana: s.i, x: r.left, y: r.top }); setZonaSelDisc('Natacion'); setZonaSelZona('Z1') }}>
                          {sesEsta.map(sz => (
                            <div key={sz.id}
                              className="flex-shrink-0 flex items-center justify-center rounded text-white font-bold border relative group/sq"
                              style={{ width: SEMANA_W - 6, height: 22, backgroundColor: (C_DISC[sz.disciplina] || '#888') + '30', borderColor: C_DISC[sz.disciplina] || '#888', fontSize: 9 }}
                              onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setSesZonas(prev => prev.filter(x => x.id !== sz.id)) }}>
                              {sz.zona}
                              <span className="absolute inset-0 bg-red-500/0 group-hover/sq:bg-red-500/10 rounded transition pointer-events-none" />
                            </div>
                          ))}'''
if old3 in content:
    content = content.replace(old3, new3)
    print('OK paso 3 - clic derecho para borrar')
else:
    print('ERROR paso 3')

# 4. Total sesiones por semana debajo de cada columna
old4 = '''                  {/* Leyenda disciplinas */}'''
new4 = '''                  {/* Totales por semana */}
                  <div className="flex border-t border-gray-800/50">
                    <div className="flex-shrink-0 w-14 bg-gray-950" />
                    {sems.map(s => {
                      const n = sesZonas.filter(sz => sz.semana === s.i).length
                      return (
                        <div key={s.i} className="flex-shrink-0 flex items-center justify-center" style={{ width: SEMANA_W, height: 18 }}>
                          {n > 0 && <span className="text-gray-500 font-medium" style={{ fontSize: 9 }}>{n}</span>}
                        </div>
                      )
                    })}
                  </div>
                  {/* Leyenda disciplinas */}'''
if old4 in content:
    content = content.replace(old4, new4)
    print('OK paso 4 - totales por semana')
else:
    print('ERROR paso 4')

# 5. Filtro por disciplina — añadir estado
old5 = '''  const [sesZonas, setSesZonas] = useState<{id:string;semana:number;disciplina:string;zona:string}[]>([])
  const [popupZona, setPopupZona] = useState<{semana:number;x:number;y:number}|null>(null)
  const [zonaSelDisc, setZonaSelDisc] = useState('Natacion')
  const [zonaSelZona, setZonaSelZona] = useState('Z1')'''
new5 = '''  const [sesZonas, setSesZonas] = useState<{id:string;semana:number;disciplina:string;zona:string}[]>([])
  const [popupZona, setPopupZona] = useState<{semana:number;x:number;y:number}|null>(null)
  const [zonaSelDisc, setZonaSelDisc] = useState('Natacion')
  const [zonaSelZona, setZonaSelZona] = useState('Z1')
  const [filtroDisc, setFiltroDisc] = useState<string[]>(['Natacion','Ciclismo','Carrera','Fuerza'])'''
if old5 in content:
    content = content.replace(old5, new5)
    print('OK paso 5 - estado filtro disciplina')
else:
    print('ERROR paso 5')

# 6. Aplicar filtro y añadir toggles en leyenda
old6 = '''                  {/* Leyenda disciplinas */}
                  <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-800/50">
                    <span className="text-gray-600 text-xs">Disciplina:</span>
                    {[{l:'Natación',c:'#3B82F6'},{l:'Ciclismo',c:'#EAB308'},{l:'Carrera',c:'#22C55E'},{l:'Fuerza',c:'#EF4444'}].map(d => (
                      <span key={d.l} className="flex items-center gap-1 text-xs text-gray-400">
                        <span className="w-3 h-3 rounded-sm inline-block border" style={{backgroundColor:d.c+'30',borderColor:d.c}}/>
                        {d.l}
                      </span>
                    ))}
                  </div>'''
new6 = '''                  {/* Leyenda disciplinas con filtro */}
                  <div className="flex items-center gap-2 px-4 py-2 border-t border-gray-800/50 flex-wrap">
                    <span className="text-gray-600 text-xs mr-1">Filtro:</span>
                    {[{l:'Natación',k:'Natacion',c:'#3B82F6'},{l:'Ciclismo',k:'Ciclismo',c:'#EAB308'},{l:'Carrera',k:'Carrera',c:'#22C55E'},{l:'Fuerza',k:'Fuerza',c:'#EF4444'}].map(d => {
                      const act = filtroDisc.includes(d.k)
                      return (
                        <button key={d.k} onClick={() => setFiltroDisc(prev => prev.includes(d.k) ? prev.filter(x => x !== d.k) : [...prev, d.k])}
                          className="flex items-center gap-1 text-xs px-2 py-1 rounded-lg border transition"
                          style={act ? {backgroundColor:d.c+'30',borderColor:d.c,color:'white'} : {backgroundColor:'#1f2937',borderColor:'#374151',color:'#4b5563'}}>
                          <span className="w-2.5 h-2.5 rounded-sm inline-block border" style={{backgroundColor:act?d.c+'50':'transparent',borderColor:act?d.c:'#374151'}}/>
                          {d.l}
                        </button>
                      )
                    })}
                    <span className="text-gray-700 text-xs ml-auto">{sesZonas.length} sesiones total</span>
                  </div>'''
if old6 in content:
    content = content.replace(old6, new6)
    print('OK paso 6 - filtro disciplinas en leyenda')
else:
    print('ERROR paso 6')

# 7. Aplicar filtro al renderizar cuadraditos
old7 = '''                      const sesEsta = sesZonas.filter(sz => sz.semana === s.i)'''
new7 = '''                      const sesEsta = sesZonas.filter(sz => sz.semana === s.i && filtroDisc.includes(sz.disciplina))'''
if old7 in content:
    content = content.replace(old7, new7)
    print('OK paso 7 - filtro aplicado al render')
else:
    print('ERROR paso 7')

open(path, 'w').write(content)
print('--- DONE ---')
