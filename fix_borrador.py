path = '/workspaces/Tripulse/tripulse-app/app/planificacion-visual/[id]/dibujo/page.tsx'
content = open(path).read()

old = "setModoEdicion(true)\n      setPantalla('canvas')\n    } catch (e: any) { alert('Error al cargar: ' + e.message) }\n    setCargandoDatos(false)\n  }\n\n  const cargarBorrador"

new = "setModoEdicion(true)\n      const { data: bz } = await supabase.from('dibujo_borrador').select('sesiones_zonas').eq('id_deportista', Number(id)).single()\n      if (bz && bz.sesiones_zonas && bz.sesiones_zonas.length) setSesZonas(bz.sesiones_zonas)\n      setPantalla('canvas')\n    } catch (e: any) { alert('Error al cargar: ' + e.message) }\n    setCargandoDatos(false)\n  }\n\n  const cargarBorrador"

if old in content:
    open(path, 'w').write(content.replace(old, new))
    print('OK')
else:
    print('ERROR')
