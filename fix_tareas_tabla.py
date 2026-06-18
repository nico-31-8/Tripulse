path = "/workspaces/Tripulse/tripulse-app/app/sesion/[id]/tareas-tabla.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = """      await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        nombre: ejBib.nombre,
        grupo_muscular: ejBib.grupo_muscular,
        series: f.series ? Number(f.series) : null,
        repeticiones: f.repsFuerza ? Number(f.repsFuerza) : null,
        intensidad: f.kgFuerza ? Number(f.kgFuerza) : null,
        descanso_segundos: f.descanso ? mmssASeg(f.descanso) : null,
        notas_ejecucion: [f.rir ? 'RIR: ' + f.rir : '', f.comentario || ''].filter(Boolean).join(' · ') + notasEj2,
        tipo_serie: f.tipoSerie || 'Normal',
        ejercicio_encadenado_nombre: ejBib2?.nombre || null,
        ejercicio_encadenado_id: ejBib2?.id || null,
        escalones_drop: f.escalonDrop || null,
      })"""

new = """      await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        nombre: ejBib.nombre,
        grupo_muscular: ejBib.grupo_muscular,
        series: f.series ? Number(f.series) : null,
        repeticiones: f.repsFuerza ? Number(f.repsFuerza) : null,
        intensidad: f.kgFuerza ? Number(f.kgFuerza) : null,
        descanso_segundos: f.descanso ? mmssASeg(f.descanso) : null,
        notas_ejecucion: [f.rir ? 'RIR: ' + f.rir : '', f.comentario || ''].filter(Boolean).join(' · ') + notasEj2,
        tipo_serie: f.tipoSerie || 'Normal',
        ejercicio_encadenado_nombre: ejBib2?.nombre || null,
        ejercicio_encadenado_id: ejBib2?.id || null,
        escalones_drop: f.escalonDrop || null,
        url_video: ejBib.url_video || null,
      })"""

if old not in content:
    print("⚠️ NOT FOUND")
else:
    content = content.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ replaced")
