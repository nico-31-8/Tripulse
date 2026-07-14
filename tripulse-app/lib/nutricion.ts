// Sugerencia de nutrición por sesión, a partir de sus tareas (duración/zona/disciplina)
// y el peso del deportista. Basado en AIS Sports Supplement Framework, ISSN position
// stands (cafeína, proteína) y guías ACSM/ISSN de carbohidrato durante el ejercicio —
// ver ia/deporte/wiki/topics/*.md.
import { cargaZona } from './zonas'
import { calcularDuracionEstimada, TareaDuracion, TestsDeportista } from './duracion'

export interface SugerenciaNutricion {
  carboGh: number | null       // g/h de carbohidrato durante el ejercicio
  aguaMlh: number | null       // ml/h de agua
  sodioMgh: number | null      // mg/h de sodio
  cafeinaAplica: boolean       // si esta sesión se beneficia de cafeína
  cafeinaMg: number | null     // dosis calculada (3 mg/kg); null si aplica pero falta el peso
  cafeinaTiming: string        // cuándo tomarla
  ayunoApto: boolean           // informativo — nunca se auto-activa, lo decide el entrenador
  notas: string                // nota informativa auto-generada
}

// Umbrales de duración (minutos) para carbohidrato durante el ejercicio (ACSM/ISSN):
//   <60min: no hace falta · 60-150min: 30-60g/h · >150min: hasta 90g/h
const CARBO_MIN_1 = 60
const CARBO_MIN_2 = 150
const CARBO_GH_TIER1 = 45   // punto medio de 30-60
const CARBO_GH_TIER2 = 80   // hacia el techo de 60-90

const AGUA_MLH = 600        // punto medio de 400-800
const SODIO_MGH = 450       // punto medio de 300-600
const CAFEINA_MG_KG = 3     // dosis conservadora dentro de 3-6 mg/kg

const AYUNO_MAX_MIN = 90
const AYUNO_MAX_NIVEL = 3   // nivel 1-7 equivalente (AER/AEL/AEM o Z1-Z3)

function maxNivelZona(tareas: TareaDuracion[]): number {
  return tareas.reduce((max, t) => Math.max(max, cargaZona(t.zona_entrenamiento).nivel), 0)
}

export function sugerirNutricion(
  tareas: TareaDuracion[],
  tests: TestsDeportista,
  disciplinaSesion: string,
  pesoKg: number | null,
): SugerenciaNutricion {
  const vacio: SugerenciaNutricion = {
    carboGh: null, aguaMlh: null, sodioMgh: null,
    cafeinaAplica: false, cafeinaMg: null, cafeinaTiming: '',
    ayunoApto: false, notas: '',
  }

  if (disciplinaSesion === 'Fuerza') {
    return {
      ...vacio,
      notas: 'Sesión de fuerza: no requiere fueling específico durante. La creatina (si se usa) es un hábito diario (3-5 g/día), no algo que dosificar por sesión.',
    }
  }

  const dur = calcularDuracionEstimada(tareas, tests)
  if (!dur.estimable) {
    return { ...vacio, notas: 'No se pudo estimar la duración de la sesión — rellena los campos a mano si hace falta.' }
  }

  const minutos = dur.minutos
  const nivel = maxNivelZona(tareas)

  const carboGh = minutos < CARBO_MIN_1 ? null : minutos <= CARBO_MIN_2 ? CARBO_GH_TIER1 : CARBO_GH_TIER2
  const aguaMlh = minutos < CARBO_MIN_1 ? null : AGUA_MLH
  const sodioMgh = minutos < CARBO_MIN_1 ? null : SODIO_MGH

  const cafeinaAplica = nivel >= 5 || minutos >= CARBO_MIN_2
  const cafeinaMg = cafeinaAplica && pesoKg ? Math.round(pesoKg * CAFEINA_MG_KG) : null
  const cafeinaTiming = !cafeinaAplica ? '' : minutos >= CARBO_MIN_2
    ? '45-60 min antes de empezar; al pasar de 2.5h considera una segunda dosis a mitad de sesión (~30-60mg, o chicle de cafeína).'
    : '45-60 min antes de empezar.'

  const ayunoApto = minutos > 0 && minutos <= AYUNO_MAX_MIN && nivel <= AYUNO_MAX_NIVEL

  const notas = ayunoApto
    ? 'Sesión de baja intensidad y duración moderada — apta para entrenar en ayunas si estás en fase de base/preparación general (máx. 1-2 veces/semana).'
    : ''

  return { carboGh, aguaMlh, sodioMgh, cafeinaAplica, cafeinaMg, cafeinaTiming, ayunoApto, notas }
}
