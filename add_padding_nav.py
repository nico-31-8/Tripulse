base = "/workspaces/Tripulse/tripulse-app"

archivos = [
    "app/eco/page.tsx",
    "app/mis-sesiones/page.tsx",
    "app/dashboard-deportista/page.tsx",
    "app/microciclo/[id]/page.tsx",
    "app/carga/page.tsx",
    "app/mis-analisis/page.tsx",
    "app/volumen/page.tsx",
    "app/dashboard/page.tsx",
    "app/macrociclo/[id]/page.tsx",
    "app/planificacion-visual/page.tsx",
    "app/planificacion-visual/[id]/dibujo/page.tsx",
    "app/planificacion-visual/[id]/calendario/page.tsx",
    "app/planificacion-visual/[id]/page.tsx",
    "app/planificacion-visual/[id]/semana/[fecha]/page.tsx",
    "app/fuerza/page.tsx",
    "app/indices/page.tsx",
    "app/papelera/page.tsx",
    "app/disponibilidad/page.tsx",
    "app/mis-tests/page.tsx",
    "app/tests/page.tsx",
    "app/tests/[id]/page.tsx",
    "app/zonas/[id]/page.tsx",
    "app/perfil/page.tsx",
    "app/sesion/[id]/page.tsx",
    "app/mesociclo/[id]/page.tsx",
    "app/comunicacion/page.tsx",
    "app/deportistas/page.tsx",
    "app/deportistas/[id]/page.tsx",
    "app/periodizacion/page.tsx",
    "app/wellness-entrenador/page.tsx",
    "app/wellness/[id]/page.tsx",
]

old1 = '<nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800 flex-shrink-0">'
new1 = '<nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800 flex-shrink-0">'

old2 = '<nav className="bg-gray-900 px-6 py-4 flex justify-between items-center border-b border-gray-800">'
new2 = '<nav className="bg-gray-900 pl-16 pr-6 py-4 flex justify-between items-center border-b border-gray-800">'

total = 0
for rel in archivos:
    path = f"{base}/{rel}"
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    if old1 in content:
        content = content.replace(old1, new1, 1)
        replaced = True
    elif old2 in content:
        content = content.replace(old2, new2, 1)
        replaced = True
    else:
        print(f"⚠️  No match: {rel}")
        replaced = False

    if replaced:
        with open(path, "w", encoding="utf-8") as f:
            f.write(content)
        total += 1
        print(f"✅ {rel}")

print(f"\nTotal: {total}")
