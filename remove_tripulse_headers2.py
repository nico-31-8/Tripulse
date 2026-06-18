import re

base = "/workspaces/Tripulse/tripulse-app"

archivos = [
    "app/eco/page.tsx",
    "app/microciclo/[id]/page.tsx",
    "app/carga/page.tsx",
    "app/volumen/page.tsx",
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

# Línea que termina en >TRIPULSE</button> o >TRIPULSE</h1>, sin importar lo que haya antes
pattern = re.compile(r'^\s*<(button|h1)\b.*>TRIPULSE</\1>\s*$')

total_removed = 0
for rel in archivos:
    path = f"{base}/{rel}"
    try:
        with open(path, "r", encoding="utf-8") as f:
            lines = f.readlines()
    except FileNotFoundError:
        print(f"⚠️  No encontrado: {rel}")
        continue

    new_lines = []
    removed = 0
    for line in lines:
        if pattern.match(line):
            removed += 1
            continue
        new_lines.append(line)

    if removed == 0:
        print(f"⚠️  Sin coincidencias (revisar manualmente): {rel}")
        continue

    with open(path, "w", encoding="utf-8") as f:
        f.writelines(new_lines)

    total_removed += removed
    print(f"✅ {rel}: {removed} línea(s) eliminada(s)")

print(f"\nTotal líneas eliminadas: {total_removed}")
