path = "/workspaces/Tripulse/tripulse-app/app/fuerza/page.tsx"

old = r"""    const match = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\n?#]+)/)"""
new = r"""    const match = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/|embed\/|live\/|v\/)|youtu\.be\/)([^&\n?#/]+)/)"""

with open(path, "r", encoding="utf-8") as f:
    content = f.read()

if old not in content:
    print("⚠️ NOT FOUND")
else:
    content = content.replace(old, new, 1)
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    print("✅ replaced")
