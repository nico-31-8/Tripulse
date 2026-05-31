path = '/workspaces/Tripulse/tripulse-app/app/planificacion-visual/[id]/dibujo/page.tsx'
content = open(path).read()

old = '''      if (movingBlockRef.current && movePreview) {
        const { tipo, id } = movingBlockRef.current
        if (tipo === 'macro') {
          setMacros(p => p.map(m => m.id === id ? { ...m, si: movePreview.si, sf: movePreview.sf } : m))
          // Ajustar mesos que salgan del nuevo rango del macro
          setMesos(p => p.map(me => {
            if (me.macroId !== id) return me
            const dur = me.sf - me.si
            const offset = me.si - mesosRef.current.find(m => m.id === me.id)!.si + (movePreview.si - macrosRef.current.find(m => m.id === id)!.si)
            const newSi = Math.max(movePreview.si, me.si + (movePreview.si - macrosRef.current.find(m => m.id === id)!.si))
            const newSf = Math.min(movePreview.sf, newSi + dur)
            return { ...me, si: newSi, sf: newSf }
          }))
        } else {
          setMesos(p => p.map(m => m.id === id ? { ...m, si: movePreview.si, sf: movePreview.sf } : m))
        }
        movingBlockRef.current = null
        setMovePreview(null)
        return
      }'''

new = '''      if (movingBlockRef.current) {
        const { tipo, id } = movingBlockRef.current
        const preview = movePreviewRef.current
        if (preview) {
          if (tipo === 'macro') {
            const oldMac = macrosRef.current.find(m => m.id === id)
            if (oldMac) {
              const delta = preview.si - oldMac.si
              setMacros(p => p.map(m => m.id === id ? { ...m, si: preview.si, sf: preview.sf } : m))
              setMesos(p => p.map(me => {
                if (me.macroId !== id) return me
                const dur = me.sf - me.si
                const newSi = Math.max(preview.si, Math.min(preview.sf - dur, me.si + delta))
                const newSf = newSi + dur
                return { ...me, si: newSi, sf: newSf }
              }))
            }
          } else {
            setMesos(p => p.map(m => m.id === id ? { ...m, si: preview.si, sf: preview.sf } : m))
          }
        }
        movingBlockRef.current = null
        movePreviewRef.current = null
        setMovePreview(null)
        return
      }'''

if old in content:
    content = content.replace(old, new)
    open(path, 'w').write(content)
    print('OK paso 1 - onUp corregido')
else:
    print('ERROR - bloque onUp no encontrado')

# Paso 2: añadir movePreviewRef junto a los otros refs
path = '/workspaces/Tripulse/tripulse-app/app/planificacion-visual/[id]/dibujo/page.tsx'
content = open(path).read()

old2 = '''  const macrosRef = useRef<MacroD[]>([])
  const mesosRef = useRef<MesoD[]>([])'''

new2 = '''  const macrosRef = useRef<MacroD[]>([])
  const mesosRef = useRef<MesoD[]>([])
  const movePreviewRef = useRef<{tipo: string, si: number, sf: number, id: string} | null>(null)'''

if old2 in content:
    content = content.replace(old2, new2)
    open(path, 'w').write(content)
    print('OK paso 2 - movePreviewRef añadido')
else:
    print('ERROR paso 2 - bloque refs no encontrado')

# Paso 3: sincronizar movePreviewRef cuando cambia movePreview
path = '/workspaces/Tripulse/tripulse-app/app/planificacion-visual/[id]/dibujo/page.tsx'
content = open(path).read()

old3 = '''        setMovePreview({ tipo: 'macro', si: newSi, sf: newSf, id })'''
new3 = '''        movePreviewRef.current = { tipo: 'macro', si: newSi, sf: newSf, id }
        setMovePreview({ tipo: 'macro', si: newSi, sf: newSf, id })'''

old4 = '''        setMovePreview({ tipo: 'meso', si: safeSi, sf: safeSf, id })'''
new4 = '''        movePreviewRef.current = { tipo: 'meso', si: safeSi, sf: safeSf, id }
        setMovePreview({ tipo: 'meso', si: safeSi, sf: safeSf, id })'''

if old3 in content and old4 in content:
    content = content.replace(old3, new3)
    content = content.replace(old4, new4)
    open(path, 'w').write(content)
    print('OK paso 3 - refs sincronizados')
else:
    print('ERROR paso 3 - bloques setMovePreview no encontrados')
