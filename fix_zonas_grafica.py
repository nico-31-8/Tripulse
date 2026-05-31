path = '/workspaces/Tripulse/tripulse-app/app/planificacion-visual/[id]/dibujo/page.tsx'
content = open(path).read()

# 1. Añadir estado para sesiones de zona y popup
old_state = "  const [editInt, setEditInt] = useState(7)"
new_state = """  const [editInt, setEditInt] = useState(7)
  const [sesZonas, setSesZonas] = useState<{id:string;semana:number;disciplina:string;zona:string}[]>([])
  const [popupZona, setPopupZona] = useState<{semana:number;x:number;y:number}|null>(null)
  const [zonaSelDisc, setZonaSelDisc] = useState('Natacion')
  const [zonaSelZona, setZonaSelZona] = useState('Z1')"""

if old_state in content:
    content = content.replace(old_state, new_state)
    print('OK paso 1 - estado añadido')
else:
    print('ERROR paso 1')

# 2. Insertar la gráfica justo antes de {/* FECHAS */}
old_grafica = "                {/* FECHAS */}"
new_grafica = """                {/* GRAFICA ZONAS */}
                <div className="border-t border-gray-800">
                  <div className="flex" style={{ minHeight: 180 }}>
                    <div className="flex-shrink-0 w-14 bg-gray-950 flex items-center justify-center">
                      <span className="text-gray-500 text-xs font-bold tracking-widest" style={{writingMode:'vertical-rl',transform:'rotate(180deg)'}}>ZONAS</span>
                    </div>
                    {sems.map(s => {
                      const sesEsta = sesZonas.filter(sz => sz.semana === s.i)
                      const C_DISC: Record<string,string> = { Natacion:'#3B82F6', Natación:'#3B82F6', Ciclismo:'#EAB308', Carrera:'#22C55E', Fuerza:'#EF4444' }
                      return (
                        <div key={s.i} className="flex-shrink-0 border-r border-gray-800/30 flex flex-col-reverse items-center gap-0.5 py-1 cursor-pointer hover:bg-gray-900/50 relative group/zona"
                          style={{ width: SEMANA_W, minHeight: 180 }}
                          onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setPopupZona({ semana: s.i, x: r.left, y: r.top }); setZonaSelDisc('Natacion'); setZonaSelZona('Z1') }}>
                          {sesEsta.map(sz => (
                            <div key={sz.id}
                              className="flex-shrink-0 flex items-center justify-center rounded text-white font-bold border"
                              style={{ width: SEMANA_W - 6, height: 22, backgroundColor: (C_DISC[sz.disciplina] || '#888') + '30', borderColor: C_DISC[sz.disciplina] || '#888', fontSize: 9 }}>
                              {sz.zona}
                            </div>
                          ))}
                          {sesEsta.length === 0 && (
                            <span className="text-gray-800 text-xs group-hover/zona:text-gray-600 transition absolute bottom-2">+</span>
                          )}
                        </div>
                      )
                    })}
                  </div>
                  {/* Leyenda disciplinas */}
                  <div className="flex items-center gap-4 px-4 py-2 border-t border-gray-800/50">
                    <span className="text-gray-600 text-xs">Disciplina:</span>
                    {[{l:'Natación',c:'#3B82F6'},{l:'Ciclismo',c:'#EAB308'},{l:'Carrera',c:'#22C55E'},{l:'Fuerza',c:'#EF4444'}].map(d => (
                      <span key={d.l} className="flex items-center gap-1 text-xs text-gray-400">
                        <span className="w-3 h-3 rounded-sm inline-block border" style={{backgroundColor:d.c+'30',borderColor:d.c}}/>
                        {d.l}
                      </span>
                    ))}
                  </div>
                </div>
                {/* POPUP AÑADIR ZONA */}
                {popupZona && (
                  <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setPopupZona(null)}>
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 shadow-2xl w-72" onClick={e => e.stopPropagation()}>
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-white font-bold text-sm">Añadir sesión — Semana {popupZona.semana + 1}</h3>
                        <button onClick={() => setPopupZona(null)} className="text-gray-500 hover:text-white text-lg leading-none">×</button>
                      </div>
                      <div className="flex flex-col gap-3">
                        <div>
                          <label className="text-gray-400 text-xs mb-1.5 block">Disciplina</label>
                          <div className="grid grid-cols-2 gap-1.5">
                            {['Natacion','Ciclismo','Carrera','Fuerza'].map(d => {
                              const C: Record<string,string> = {Natacion:'#3B82F6',Ciclismo:'#EAB308',Carrera:'#22C55E',Fuerza:'#EF4444'}
                              const sel = zonaSelDisc === d
                              return (
                                <button key={d} onClick={() => setZonaSelDisc(d)}
                                  className="py-2 rounded-lg text-xs font-medium transition border"
                                  style={sel ? {backgroundColor:C[d]+'40',borderColor:C[d],color:'white'} : {backgroundColor:'#1f2937',borderColor:'#374151',color:'#9ca3af'}}>
                                  {d === 'Natacion' ? 'Natación' : d}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div>
                          <label className="text-gray-400 text-xs mb-1.5 block">Zona</label>
                          <div className="grid grid-cols-4 gap-1.5">
                            {['Z1','Z2','Z3','Z4','Z5','Z6','Z7'].map(z => (
                              <button key={z} onClick={() => setZonaSelZona(z)}
                                className={'py-2 rounded-lg text-xs font-bold transition ' + (zonaSelZona === z ? 'bg-orange-500 text-white' : 'bg-gray-800 text-gray-400 hover:bg-gray-700')}>
                                {z}
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2 mt-1">
                          <button onClick={() => {
                            setSesZonas(prev => [...prev, {id: Math.random().toString(36).slice(2), semana: popupZona.semana, disciplina: zonaSelDisc, zona: zonaSelZona}])
                            setPopupZona(null)
                          }} className="flex-1 bg-orange-500 hover:bg-orange-600 py-2.5 rounded-xl text-sm font-bold text-white transition">
                            Añadir
                          </button>
                          <button onClick={() => setPopupZona(null)} className="flex-1 bg-gray-800 hover:bg-gray-700 py-2.5 rounded-xl text-sm text-gray-400 transition">
                            Cancelar
                          </button>
                        </div>
                        {sesZonas.filter(sz => sz.semana === popupZona.semana).length > 0 && (
                          <div className="border-t border-gray-800 pt-3">
                            <p className="text-gray-500 text-xs mb-2">Sesiones esta semana:</p>
                            <div className="flex flex-wrap gap-1.5">
                              {sesZonas.filter(sz => sz.semana === popupZona.semana).map(sz => {
                                const C: Record<string,string> = {Natacion:'#3B82F6',Ciclismo:'#EAB308',Carrera:'#22C55E',Fuerza:'#EF4444'}
                                return (
                                  <div key={sz.id} className="flex items-center gap-1 rounded-lg px-2 py-1 border text-xs"
                                    style={{backgroundColor:(C[sz.disciplina]||'#888')+'20',borderColor:C[sz.disciplina]||'#888'}}>
                                    <span className="text-white font-bold">{sz.zona}</span>
                                    <span className="text-gray-400">{sz.disciplina === 'Natacion' ? 'Nat' : sz.disciplina === 'Ciclismo' ? 'Cic' : sz.disciplina === 'Carrera' ? 'Car' : 'Fue'}</span>
                                    <button onClick={() => setSesZonas(prev => prev.filter(x => x.id !== sz.id))} className="text-gray-600 hover:text-red-400 transition ml-0.5">×</button>
                                  </div>
                                )
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )}
                {/* FECHAS */}"""

if old_grafica in content:
    content = content.replace(old_grafica, new_grafica)
    open(path, 'w').write(content)
    print('OK paso 2 - grafica zonas insertada')
else:
    print('ERROR paso 2 - no encontrado {/* FECHAS */}')
