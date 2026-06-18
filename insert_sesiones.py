import urllib.request, json
from datetime import date

URL = 'https://wjgyuueptlhuuhujfbla.supabase.co/rest/v1/sesion'
KEY = 'sb_publishable_pW7kdl8V-r0FYAAnJYtwMQ_7FIffRDd'

def insertar(sesion):
    body = json.dumps(sesion).encode()
    req = urllib.request.Request(URL, data=body, method='POST')
    req.add_header('apikey', KEY)
    req.add_header('Authorization', 'Bearer ' + KEY)
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'return=minimal')
    try:
        urllib.request.urlopen(req)
        print(f"OK {sesion['fecha_sesion']} {sesion['disciplina']} RPE={sesion['rpe_reportado']} {sesion['duracion_minutos']}min carga={sesion['rpe_reportado']*sesion['duracion_minutos']}")
    except urllib.error.HTTPError as e:
        print(f"ERROR: {e.code} {e.read()}")

# SEMANA DESCANSO — microciclo 15, semana del 11/05
descanso = [
    {'fecha_sesion': '2026-05-11', 'disciplina': 'Natacion', 'duracion_minutos': 30, 'rpe_estimado': 3, 'rpe_reportado': 3, 'estado': 'Realizada', 'id_microciclo': 15},
    {'fecha_sesion': '2026-05-12', 'disciplina': 'Fuerza',   'duracion_minutos': 35, 'rpe_estimado': 3, 'rpe_reportado': 3, 'estado': 'Realizada', 'id_microciclo': 15},
    {'fecha_sesion': '2026-05-13', 'disciplina': 'Ciclismo',  'duracion_minutos': 40, 'rpe_estimado': 3, 'rpe_reportado': 3, 'estado': 'Realizada', 'id_microciclo': 15},
    {'fecha_sesion': '2026-05-14', 'disciplina': 'Carrera',   'duracion_minutos': 30, 'rpe_estimado': 2, 'rpe_reportado': 2, 'estado': 'Realizada', 'id_microciclo': 15},
]

# SEMANA COMPETICION — microciclo 16, semana del 18/05
competicion = [
    {'fecha_sesion': '2026-05-18', 'disciplina': 'Natacion',  'duracion_minutos': 45, 'rpe_estimado': 5, 'rpe_reportado': 6, 'estado': 'Realizada', 'id_microciclo': 16},
    {'fecha_sesion': '2026-05-18', 'disciplina': 'Ciclismo',  'duracion_minutos': 60, 'rpe_estimado': 5, 'rpe_reportado': 6, 'estado': 'Realizada', 'id_microciclo': 16},
    {'fecha_sesion': '2026-05-19', 'disciplina': 'Fuerza',    'duracion_minutos': 40, 'rpe_estimado': 6, 'rpe_reportado': 6, 'estado': 'Realizada', 'id_microciclo': 16},
    {'fecha_sesion': '2026-05-20', 'disciplina': 'Carrera',   'duracion_minutos': 50, 'rpe_estimado': 7, 'rpe_reportado': 8, 'estado': 'Realizada', 'id_microciclo': 16},
    {'fecha_sesion': '2026-05-20', 'disciplina': 'Natacion',  'duracion_minutos': 45, 'rpe_estimado': 6, 'rpe_reportado': 7, 'estado': 'Realizada', 'id_microciclo': 16},
    {'fecha_sesion': '2026-05-21', 'disciplina': 'Ciclismo',  'duracion_minutos': 180,'rpe_estimado': 8, 'rpe_reportado': 8, 'estado': 'Realizada', 'id_microciclo': 16},
    {'fecha_sesion': '2026-05-22', 'disciplina': 'Carrera',   'duracion_minutos': 120,'rpe_estimado': 9, 'rpe_reportado': 9, 'estado': 'Realizada', 'id_microciclo': 16},
    {'fecha_sesion': '2026-05-23', 'disciplina': 'Fuerza',    'duracion_minutos': 45, 'rpe_estimado': 5, 'rpe_reportado': 5, 'estado': 'Realizada', 'id_microciclo': 16},
    {'fecha_sesion': '2026-05-24', 'disciplina': 'Natacion',  'duracion_minutos': 60, 'rpe_estimado': 6, 'rpe_reportado': 6, 'estado': 'Realizada', 'id_microciclo': 16},
]

print('--- SEMANA DESCANSO ---')
for s in descanso:
    insertar(s)

print('--- SEMANA COMPETICION ---')
for s in competicion:
    insertar(s)

print('DONE')
