import re

base = "/workspaces/Tripulse/tripulse-app"

# (archivo, lista de (old, new))
edits = {
    f"{base}/app/eco/page.tsx": [
        ('<h2 className="text-xl font-bold text-white">¿Cómo funciona el Sistema ECO?</h2>',
         '<h2 className="text-xl font-bold text-white">¿Cómo funciona el SICAT?</h2>'),

        ('<h3 className="text-orange-400 font-bold text-base mb-2">¿Qué es el Sistema ECO?</h3>',
         '<h3 className="text-orange-400 font-bold text-base mb-2">¿Qué es el SICAT?</h3>'),

        ('El Sistema ECO reemplaza los valores poblacionales genéricos de coste energético por datos reales',
         'El SICAT (Sistema de Individualización de la Carga en Triatlón) reemplaza los valores poblacionales genéricos de coste energético por datos reales'),

        ('<h2 className="text-2xl font-bold">Sistema ECO Individual</h2>',
         '<h2 className="text-2xl font-bold">SICAT</h2>'),
    ],

    f"{base}/app/dashboard/page.tsx": [
        ("{ icon: '🔬', titulo: 'Sistema ECO', descripcion: 'Análisis individualizado del coste energético por disciplina. Factores F1-F4 y corrector HRV.', href: '/eco' },",
         "{ icon: '🔬', titulo: 'SICAT', descripcion: 'Análisis individualizado del coste energético por disciplina. Factores F1-F4 y corrector HRV.', href: '/eco' },"),
    ],

    f"{base}/app/page.tsx": [
        ("titulo: 'Sistema ECO Individual',",
         "titulo: 'SICAT',"),

        ('<span className="text-white text-sm font-medium">🔬 Sistema ECO Individual — único en el mercado</span>',
         '<span className="text-white text-sm font-medium">🔬 SICAT — único en el mercado</span>'),

        ("{ num: '4', label: 'Factores ECO individuales' },",
         "{ num: '4', label: 'Factores SICAT individuales' },"),

        ('<h2 className="text-4xl font-bold mt-3 mb-4">El Sistema ECO Individual</h2>',
         '<h2 className="text-4xl font-bold mt-3 mb-4">El SICAT (Sistema de Individualización de la Carga en Triatlón)</h2>'),
    ],

    f"{base}/app/mesociclo/[id]/page.tsx": [
        ('<p className="text-gray-500 text-xs mt-0.5">Una valoración por disciplina al cierre del mesociclo — alimenta el Factor F1 del sistema ECO</p>',
         '<p className="text-gray-500 text-xs mt-0.5">Una valoración por disciplina al cierre del mesociclo — alimenta el Factor F1 del SICAT</p>'),
    ],

    f"{base}/app/deportistas/[id]/page.tsx": [
        ('<h3 className="font-bold mb-4 text-blue-400">🔬 Sistema ECO Individual</h3>',
         '<h3 className="font-bold mb-4 text-blue-400">🔬 SICAT</h3>'),
    ],

    f"{base}/components/Sidebar.tsx": [
        ("{ icon: '🔬', titulo: 'Sistema ECO', href: '/eco' },",
         "{ icon: '🔬', titulo: 'SICAT', href: '/eco' },"),
    ],
}

for path, replacements in edits.items():
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()

    for old, new in replacements:
        if old not in content:
            print(f"⚠️  NOT FOUND in {path}:")
            print(repr(old))
            continue
        content = content.replace(old, new, 1)
        print(f"✅ replaced in {path}")

    with open(path, "w", encoding="utf-8") as f:
        f.write(content)

print("Done.")
