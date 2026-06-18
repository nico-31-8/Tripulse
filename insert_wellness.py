from datetime import date, timedelta
import urllib.request, urllib.error, json

URL = "https://wjgyuueptlhuuhujfbla.supabase.co/rest/v1/wellness"
KEY = "sb_publishable_pW7kdl8V-r0FYAAnJYtwMQ_7FIffRDd"

hoy = date.today()

semana1 = [
    {"calidad_sueno": 6, "horas_sueno": 4.5, "fatiga": 7, "estres": 7, "dolor_muscular": 6, "animo": 2, "motivacion": 2, "malestar_general": 6, "hrv": 28, "fc_reposo": 72},
    {"calidad_sueno": 7, "horas_sueno": 4.0, "fatiga": 7, "estres": 6, "dolor_muscular": 7, "animo": 1, "motivacion": 2, "malestar_general": 7, "hrv": 25, "fc_reposo": 75},
    {"calidad_sueno": 6, "horas_sueno": 5.0, "fatiga": 6, "estres": 7, "dolor_muscular": 6, "animo": 2, "motivacion": 1, "malestar_general": 6, "hrv": 27, "fc_reposo": 73},
    {"calidad_sueno": 5, "horas_sueno": 5.5, "fatiga": 6, "estres": 6, "dolor_muscular": 5, "animo": 2, "motivacion": 2, "malestar_general": 5, "hrv": 31, "fc_reposo": 70},
    {"calidad_sueno": 5, "horas_sueno": 6.0, "fatiga": 6, "estres": 5, "dolor_muscular": 5, "animo": 3, "motivacion": 3, "malestar_general": 5, "hrv": 33, "fc_reposo": 68},
    {"calidad_sueno": 4, "horas_sueno": 6.5, "fatiga": 5, "estres": 5, "dolor_muscular": 4, "animo": 3, "motivacion": 3, "malestar_general": 4, "hrv": 36, "fc_reposo": 66},
    {"calidad_sueno": 4, "horas_sueno": 7.0, "fatiga": 5, "estres": 4, "dolor_muscular": 4, "animo": 4, "motivacion": 4, "malestar_general": 3, "hrv": 39, "fc_reposo": 64},
]
semana2 = [
    {"calidad_sueno": 3, "horas_sueno": 7.5, "fatiga": 4, "estres": 3, "dolor_muscular": 3, "animo": 5, "motivacion": 5, "malestar_general": 3, "hrv": 44, "fc_reposo": 61},
    {"calidad_sueno": 2, "horas_sueno": 8.0, "fatiga": 3, "estres": 3, "dolor_muscular": 2, "animo": 5, "motivacion": 5, "malestar_general": 2, "hrv": 48, "fc_reposo": 59},
    {"calidad_sueno": 2, "horas_sueno": 8.0, "fatiga": 3, "estres": 2, "dolor_muscular": 2, "animo": 6, "motivacion": 6, "malestar_general": 2, "hrv": 51, "fc_reposo": 57},
    {"calidad_sueno": 1, "horas_sueno": 8.5, "fatiga": 2, "estres": 2, "dolor_muscular": 1, "animo": 6, "motivacion": 6, "malestar_general": 1, "hrv": 55, "fc_reposo": 55},
    {"calidad_sueno": 1, "horas_sueno": 8.5, "fatiga": 2, "estres": 1, "dolor_muscular": 1, "animo": 7, "motivacion": 7, "malestar_general": 1, "hrv": 58, "fc_reposo": 53},
    {"calidad_sueno": 1, "horas_sueno": 9.0, "fatiga": 1, "estres": 1, "dolor_muscular": 1, "animo": 7, "motivacion": 7, "malestar_general": 1, "hrv": 61, "fc_reposo": 51},
    {"calidad_sueno": 1, "horas_sueno": 9.0, "fatiga": 1, "estres": 1, "dolor_muscular": 1, "animo": 7, "motivacion": 7, "malestar_general": 1, "hrv": 63, "fc_reposo": 50},
]

todos = semana1 + semana2
for i, d in enumerate(todos):
    fecha = hoy - timedelta(days=13-i)
    animo_inv = 8 - d['animo']
    motiv_inv = 8 - d['motivacion']
    suma = d['calidad_sueno'] + d['fatiga'] + d['estres'] + d['dolor_muscular'] + animo_inv + motiv_inv
    score = round(((suma - 6) / 36) * 100)
    d['fecha'] = fecha.isoformat()
    d['score_wellness'] = score
    d['id_deportista'] = 14

    body = json.dumps(d).encode()
    req = urllib.request.Request(URL, data=body, method='POST')
    req.add_header('apikey', KEY)
    req.add_header('Authorization', 'Bearer ' + KEY)
    req.add_header('Content-Type', 'application/json')
    req.add_header('Prefer', 'return=minimal')
    try:
        urllib.request.urlopen(req)
        print(f"OK {fecha} score={score}")
    except urllib.error.HTTPError as e:
        print(f"ERROR {fecha}: {e.code} {e.read()}")
