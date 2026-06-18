path = "/workspaces/Tripulse/tripulse-app/app/sesion/[id]/page.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = """      await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        nombre: ejercicioSel.nombre,
        tipo_serie: tipoSerie,
        ejercicio_encadenado_nombre: ejBib2?.nombre || null,
        ejercicio_encadenado_id: ejBib2?.id || null,
        escalones_drop: escalonDrop || null,
        grupo_muscular: ejercicioSel.grupo_muscular,
        series: seriesFuerza ? Number(seriesFuerza) : null,
        repeticiones: repsFuerza ? Number(repsFuerza) : null,
        descanso: descansoFuerza ? Number(descansoFuerza) : null,
        notas_ejecucion: (rir ? 'RIR: ' + rir : '') + (configSerie ? ' · ' + configSerie : ''),
        url_video: ejercicioSel.url_video || null,
        ejercicio_biblioteca_id: ejercicioSel.id || null
      })
    }"""

new = """      const { error: errorEjercicio } = await supabase.from('ejercicios').insert({
        id_tarea: tarea.id,
        nombre: ejercicioSel.nombre,
        tipo_serie: tipoSerie,
        ejercicio_encadenado_nombre: ejBib2?.nombre || null,
        ejercicio_encadenado_id: ejBib2?.id || null,
        escalones_drop: escalonDrop || null,
        grupo_muscular: ejercicioSel.grupo_muscular,
        series: seriesFuerza ? Number(seriesFuerza) : null,
        repeticiones: repsFuerza ? Number(repsFuerza) : null,
        descanso: descansoFuerza ? Number(descansoFuerza) : null,
        notas_ejecucion: (rir ? 'RIR: ' + rir : '') + (configSerie ? ' · ' + configSerie : ''),
        url_video: ejercicioSel.url_video || null
      })
      if (errorEjercicio) { setError('Error al guardar ejercicio: ' + errorEjercicio.message); setLoading(false); return }
    }"""

if old not in content:
    print("⚠️ NOT FOUND")
else:
    content = content.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ replaced")
