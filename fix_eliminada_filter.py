edits = {
    "/workspaces/Tripulse/tripulse-app/app/mis-sesiones/page.tsx": [
        (
            "const { data } = await supabase.from('sesion').select('*').in('id_microciclo', microIds).order('fecha_sesion')",
            "const { data } = await supabase.from('sesion').select('*').in('id_microciclo', microIds).or('eliminada.is.null,eliminada.eq.false').order('fecha_sesion')"
        ),
    ],
    "/workspaces/Tripulse/tripulse-app/app/dashboard-deportista/page.tsx": [
        (
            "const { data: sesHoy } = await supabase.from('sesion').select('*').in('id_microciclo', microIds).eq('fecha_sesion', hoy)",
            "const { data: sesHoy } = await supabase.from('sesion').select('*').in('id_microciclo', microIds).eq('fecha_sesion', hoy).or('eliminada.is.null,eliminada.eq.false')"
        ),
    ],
}

for path, replacements in edits.items():
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    for old, new in replacements:
        if old not in content:
            print(f"⚠️ NOT FOUND in {path}")
            continue
        content = content.replace(old, new, 1)
        print(f"✅ replaced in {path}")
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
