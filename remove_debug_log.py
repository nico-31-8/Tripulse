path = "/workspaces/Tripulse/tripulse-app/app/sesion/[id]/page.tsx"

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

old = """    if (tarea) {
      const ejBib2 = ejercicioSel2
      console.log('DEBUG ejercicioSel:', JSON.stringify(ejercicioSel))
      const { error: errorEjercicio } = await supabase.from('ejercicios').insert({"""

new = """    if (tarea) {
      const ejBib2 = ejercicioSel2
      const { error: errorEjercicio } = await supabase.from('ejercicios').insert({"""

if old not in content:
    print("⚠️ NOT FOUND")
else:
    content = content.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ debug log removido")
