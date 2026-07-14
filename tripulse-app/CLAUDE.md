# TRIPULSE — Instrucciones para agentes

## Qué es

Plataforma web de gestión de entrenamiento para triatlón y fuerza. Dos roles: **entrenador** y **deportista**. El entrenador planifica; el deportista ejecuta y registra.

## Stack

- Next.js 16 (App Router) · React 19 · TypeScript
- Tailwind CSS v4 (sin `tailwind.config`, configurado vía PostCSS)
- Supabase (PostgreSQL + Auth) — cliente en `lib/supabase.ts`
- Recharts para gráficas
- Sin Redux ni context global; estado local con `useState` en cada página

## Comandos

```bash
npm run dev      # servidor de desarrollo
npm run build    # build de producción
npm run lint     # ESLint
```

## Estructura de carpetas

```
app/             # páginas Next.js (App Router, todo 'use client')
  login/         # auth: login, registro, reset-password, nueva-password
  deportistas/   # lista y perfil por id
  macrociclo/[id]/
  mesociclo/[id]/
  microciclo/[id]/
  sesion/[id]/   # vista + ejecutar/ (modo entreno en vivo)
  planificacion-visual/[id]/  # calendario, dibujo, semana
  carga/ volumen/ fuerza/ eco/ indices/ zonas/[id]/
  tests/ mis-tests/ mis-sesiones/ mis-analisis/
  wellness/ wellness-entrenador/ disponibilidad/
  comunicacion/ chat/[deportistaId]/
components/      # componentes reutilizables
lib/supabase.ts  # cliente Supabase (único punto de acceso a DB)
```

## Jerarquía de planificación y tablas Supabase

```
deportista         → tabla: perfiles (rol = 'deportista')
  └── macrociclo   → tabla: macrociclo       (id_deportista)
        └── mesociclo  → tabla: mesociclo    (id_macrociclo)
              └── microciclo → tabla: microciclo (id_mesociclo)
                    └── sesion → tabla: sesion   (id_microciclo)
                          └── tarea → tabla: tarea (id_sesion)
                                └── medición (una de tres, excluyentes):
                                      p_distancia   (id_tarea) → metros_planeados, ritmo_objetivo
                                      p_duracion    (id_tarea) → tiempo_planeado (segundos)
                                      p_repeticiones (id_tarea) → repeticiones_planteadas
```

Tablas auxiliares relevantes:
- `perfiles` — usuarios con campo `rol` ('entrenador' | 'deportista')
- `ejercicios_biblioteca` — catálogo de ejercicios de fuerza (grupo_muscular, nombre, url_video)
- `ejercicios` — ejercicios de fuerza asignados a una tarea (id_tarea)
- `test1_carrera`, `test2_natacion`, `test3_ciclismo` — tests físicos por deportista (VAM, CSS, FTP)
- `invitaciones` — tokens para registrar deportistas vinculados al entrenador

## Convenciones de nombres

- **Tablas Supabase**: singular en español, snake_case (`macrociclo`, `sesion`, `p_duracion`)
- **FK**: prefijo `id_` + nombre tabla referenciada (`id_macrociclo`, `id_deportista`)
- **Páginas Next.js**: `PaginaXxx` como nombre de componente exportado (`PaginaMacrociclo`)
- **Componentes**: PascalCase en inglés o español (`Sidebar`, `GraficaCarga`, `SessionLoadChart`)
- **Funciones/handlers**: camelCase en español (`cargarDatos`, `crearSesion`, `guardarPostSesion`)
- **Variables de estado**: español (`mostrarForm`, `sesionIniciada`, `tareaEditando`)
- **Rutas**: español kebab-case (`/planificacion-visual`, `/mis-sesiones`, `/wellness-entrenador`)

## Sistema SICAT

SICAT es el módulo de análisis de economía de movimiento (`/eco`). La ruta aparece en el Sidebar con el ícono 🔬. Tiene un backup en `app/eco/page.tsx.bak` — **no borrar**. No tocar la lógica de cálculo sin entender la fórmula completa; los índices derivan de tests (VAM, CSS, FTP) y carga acumulada.

## Reglas importantes

1. **No hay API routes** — todo va directo a Supabase desde el cliente. No crear `/api/` salvo necesidad justificada.
2. **Siempre `'use client'`** en páginas que usen hooks o Supabase; no mezclar con Server Components.
3. **Borrar una tarea** requiere limpiar primero sus tablas hijas (`p_distancia`, `p_duracion`, `p_repeticiones`, `ejercicios`) antes de borrar `tarea`. El orden importa por FK.
4. **Zonas de entrenamiento**: Z1–Z7. Los porcentajes de VAM/FTP/CSS están hardcodeados en `app/sesion/[id]/page.tsx` — cualquier cambio ahí afecta los ritmos sugeridos en toda la app.
5. **Roles**: el rol viene de `perfiles.rol` (no de Supabase Auth metadata). Siempre consultar `perfiles` para saber si es entrenador o deportista.
6. **Estados de sesión**: `'Planificada'` | `'Realizada'` | `'Cancelada'`. Solo el deportista puede marcarla como Realizada desde el flujo post-sesión.
7. **Disciplinas válidas**: `Natacion`, `Ciclismo`, `Carrera`, `Fuerza`, `Brick` — sin tildes en los valores de BD.
8. **Soft-delete en sesiones**: usar `.or('eliminada.is.null,eliminada.eq.false')` — `.eq('eliminada', false)` no captura los null.
9. **Supabase selects anidados**: evitar joins muy profundos; cargar tablas relacionadas por separado y unirlas en JS.
10. **Closures en event handlers**: usar refs para el estado actual, no depender del closure directo.

## Hoja de ruta (orden de prioridad)

1. **Canvas de periodización** — ✅ zoom, exportación imagen/PDF, conexión bidireccional con sesiones reales (chips de zona arrastrables → sesión real) y mejoras UX de arrastre (alineación de filas, margen de etiquetas) ya implementados. Pendiente: nuevas capas de datos, plantillas reutilizables.
2. **Elementos fundacionales pendientes** — piezas base sin cerrar antes de IA e integraciones.
3. **IA Nivel 1** — alertas en lenguaje natural usando Claude Haiku + contexto SICAT/ATL/CTL/wellness, guardadas en tabla `insights_ia` via cron por deportista/día.
4. **Integración Garmin Connect** — OAuth2/PKCE, lectura primero (Health API + Activity API), escritura después. ⚠️ Solicitar acceso al programa de desarrolladores Garmin cuanto antes — la aprobación es externa y tarda.
5. **Zonas 2** — ✅ completo: sistema de 9 zonas (AER, AEL, AEM, AEI, PAE, CLA, PLA, CALA, PALA) controlado por `deportista.sistema_zonas` (1=clásico 7 zonas, 2=nuevo), incluyendo tests ASR/APR (sprint) para PLA/CALA/PALA.
6. **Análisis post-sesión con IA**
7. **Envío de entrenamientos al dispositivo Garmin**
8. **IA Nivel 2** (generación de planificación) e **IA Nivel 3** (chat conversacional sobre datos propios)

## Funcionalidades diferidas (sin fecha)

Notificaciones opt-in, tests máximos por distancia, dashboards de equipo, modo pacing, historial lesiones cruzado con carga, onboarding deportistas autoentrenados, PWA/offline.

Tlim por zona: marcado como "listo" por el usuario, pero no hay ninguna referencia en el código ni en el esquema de Supabase — pendiente confirmar si es un concepto ya cerrado a nivel de diseño/papel o si falta implementarlo en la app.

## Contexto del proyecto

- TFG ya entregado. SICAT es la aportación metodológica original — el foco ahora es TRIPULSE como producto comercializable.
- Despliegue en Vercel (`tripulse-eight.vercel.app`) diferido hasta mayor madurez.
- Repositorio: `github.com/nico-31-8/Tripulse`
- SICAT: los coeficientes de ponderación por zona, umbrales ±15%, Factor 4, normalización wellness y corrector HRV son propuestas originales no validadas por literatura — presentar siempre como tales.
- Fuerza excluida de la Línea 2 de SICAT hasta que tenga sistema de zonas propio.
