# TRIPULSE — Contexto del proyecto

## Qué es esto

TRIPULSE es una plataforma SaaS de gestión de entrenamiento de triatlón. Es el Trabajo de Fin de Grado (TFG) de Nicolás Rioboó Barral (Ciencias del Deporte, UDC, A Coruña) y también un producto real que pretende usar profesionalmente y comercializar. Tutor del TFG: Antonio Rivas Feal.

El propietario del producto (Nico) es entrenador de triatlón y fuerza, no programador. Define producto y metodología; Claude Code escribe el código. Antes de tocar lógica de negocio, asume que las decisiones de producto/metodología ya están tomadas por él — si algo no está claro, pregunta antes de improvisar.

La pieza central es SICAT (Sistema de Individualización de la Carga en Triatlón), antes llamado "Sistema ECO" / "ECO Individual". El nombre en la UI ya se migró a SICAT en todo el código, pero los nombres de campo en Supabase se mantienen como `puntuacion_eco` y similares a propósito — no renombrar columnas de la base de datos al encontrar este término.

## Stack técnico

- Next.js + Tailwind CSS + Supabase (PostgreSQL)
- Repo: github.com/nico-31-8/Tripulse
- App: `/workspaces/Tripulse/tripulse-app`
- Dev: `cd /workspaces/Tripulse/tripulse-app && npm run dev`
- Componentes: `tripulse-app/components/` (ej. `Sidebar.tsx`, `ProtocoloTest.tsx`), se importan como `../components/Sidebar`
- Cliente Supabase: `tripulse-app/lib/supabase.ts`
- tsconfig: `@/*` apunta a `./` (raíz de tripulse-app)
- Gráficas: Recharts
- Deploy: Vercel (tripulse-eight.vercel.app) — deploy ulterior pausado hasta que la app esté más completa
- Entorno de desarrollo: GitHub Codespaces

## Supabase

- URL: https://wjgyuueptlhuuhujfbla.supabase.co
- Project ID: `wjgyuueptlhuuhujfbla`
- Public key (publishable): `sb_publishable_pW7kdl8V-r0FYAAnJYtwMQ_7FIffRDd`

## Datos de prueba

- Entrenador Nico: ID `43c1f4d3-0353-43be-8633-baf29fe89152`, email `academiachanzos@hotmail.es`, código `NICO27`
- Deportista "nico": ID `6` (tiene test de carrera con VAM)
- Deportista "ainhoa": ID `7`, vinculada al entrenador
- Usar FC máxima (fórmula de Tanaka: 208 − 0.7 × edad), no FC umbral, para cálculo de zonas

## Convenciones y errores ya conocidos (no repetir)

- Reescritura completa de archivos antes que parches incrementales en componentes JSX complejos — los parches acumulados rompen el balance del JSX.
- Supabase no soporta de forma fiable selects relacionales anidados en profundidad. Cargar los datos relacionados por separado y combinarlos en JavaScript.
- RLS es la causa más común de que no aparezcan datos. Cada tabla y cada rol necesita políticas explícitas de INSERT y SELECT.
- Soft-delete de sesiones: usar `.or('eliminada.is.null,eliminada.eq.false')`, nunca solo `.eq('eliminada', false)`, porque hay registros con el campo null.
- `.single()` de Supabase devolviendo 406 significa cero filas, no es un error HTTP real.
- Closures de React en event handlers capturan estado obsoleto. Usar refs (ej. `movePreviewRef`, `sesZonasRef`) para acceder siempre al valor actual, o pasar los datos como parámetros explícitos en vez de depender del closure.
- Limpiar del repo cualquier script temporal de migración/fix una vez aplicado.
- Hacer commit después de cada grupo de features confirmado y funcionando.
- Revisar tipos, null safety, lógica, JSX válido y estados no declarados antes de considerar cualquier cambio terminado.

## Metodología SICAT (resumen funcional)

SICAT cuantifica el coste energético individualizado por disciplina (natación, ciclismo, carrera) a partir de 4 factores con score 1–4 cada uno (máx. 16):

1. **Dificultad técnica** — media de sensación técnica del atleta y valoración del entrenador, escala invertida.
2. **Dolor muscular tardío** — media de agujetas reportadas, mapeada de 1–5 a 1–4.
3. **Densidad soportada** — proporción de sesiones con RPE>7 que además tuvieron sensación técnica baja.
4. **Coste energético** — combina FC relativa (FC media sesión / FC umbral) y RPE medio.

**Corrector HRV:** `factor_corrector = 1 + (1 − HRV_ratio) × 0.3`, donde `HRV_ratio = HRV_día / HRV_basal`. Se aplica multiplicando el score total.

**Zonas:** 7 zonas de entrenamiento calculadas desde VAM (carrera), CSS (natación), FTP (ciclismo), 1RM (fuerza). Ponderación FC/RPE varía por zona: Z1–Z5 usan 0.7 FC / 0.3 RPE, Z6 usa 0.4/0.6, Z7 usa 0/1 (RPE puro, porque la FC no responde a esfuerzos menores a 30s).

**Carga:** ATL/CTL/TSB/ACWR, monotonía y strain — modelos estándar de carga de entrenamiento.

Entrenamiento de fuerza queda excluido (por ahora) de la recomendación de carga por disciplina (Línea 2), pendiente de definición de zonas propias de fuerza.

## Jerarquía de planificación

Deportista → Macrociclo → Mesociclo → Microciclo → Sesión → Tarea, con sub-tipos de tarea por distancia/duración/repeticiones (resistencia) o por series/kg/RIR (fuerza, incluyendo superseries, drop sets y complejos).

## Estado actual — páginas construidas

`/`, `/login`, `/registro`, `/dashboard`, `/dashboard-deportista`, `/deportistas`, `/deportistas/[id]`, `/macrociclo/[id]`, `/mesociclo/[id]`, `/microciclo/[id]`, `/sesion/[id]`, `/sesion/[id]/ejecutar`, `/tests`, `/tests/[id]`, `/zonas/[id]`, `/wellness/[id]`, `/wellness-entrenador`, `/perfil`, `/mis-sesiones`, `/planificacion-visual`, `/planificacion-visual/[id]`, `/planificacion-visual/[id]/dibujo`, `/planificacion-visual/[id]/semana/[fecha]`, `/papelera`, `/comunicacion`, `/mis-analisis`, `/mis-tests`, `/volumen`, `/periodizacion`

## Funcionalidades clave ya implementadas

- SICAT completo con corrector HRV
- 7 zonas de entrenamiento por disciplina
- ATL/CTL/TSB/ACWR, monotonía y strain
- Wellness 0–100 con tendencias y peso opcional
- Jerarquía completa de planificación coach-atleta
- Ejecución de sesión con resumen planificado vs. real
- Ejecución de fuerza (series normales, superseries, drop sets, complejos)
- Canvas de periodización: bloques arrastrables, barras UA, capas planificado/programado/realizado, grid de zonas por semana, banderas de competición con sugerencia de tapering, autosave de borrador en tabla `dibujo_borrador`
- Chat bidireccional entrenador-atleta con contexto de mensaje citado
- Invitación de atletas por enlace (tabla `invitacion_deportista`)
- Papelera con soft-delete de sesiones
- Sidebar con toggle, overlay y cierre al hacer click fuera
- Checklist de onboarding del entrenador (cuando `numDeportistas === 0`)
- Reset de contraseña vía `supabase.auth.resetPasswordForEmail()`
- Landing page con explicación de SICAT

## Roadmap próximo (orden de prioridad)

1. **Mejoras del canvas de periodización:** zoom, exportación, UX de arrastre, nuevas capas, conexión bidireccional más profunda con el resto de la app, plantillas de periodización
2. Resto de elementos fundacionales pendientes
3. **Integración de IA** — Nivel 1: capa de interpretación de datos (API de Claude + contexto SICAT/ATL/CTL/TSB/ACWR/wellness → alertas en lenguaje natural guardadas en tabla `insights_ia` vía cron); Nivel 2: generación de planificación/microciclos por IA; Nivel 3: chat conversacional sobre los propios datos del atleta
4. **Integración con Garmin Connect API** (primero lectura vía Health API + Activity API con OAuth2/PKCE; después escritura de workouts estructurados al dispositivo) — solicitud al programa de desarrolladores de Garmin es sensible al tiempo por la espera de aprobación externa
5. **Migración al sistema de 9 zonas ("Zonas 2"):** AER, AEL, AEM, AEI, PAE, CLA, PLA, CALA, PALA — controlado por el campo `sistema_zonas` en deportista (1 = clásico de 7, 2 = nuevo de 9); PLA/CALA/PALA se muestran como "pendiente de test de sprint" hasta construir los tests ASR/APR
6. Análisis post-sesión por IA
7. Envío de workouts al dispositivo Garmin
8. IA Nivel 2 (generador de planificación) y Nivel 3 (chat conversacional)

## Pendientes diferidos

Notificaciones (recordatorios de wellness y alertas de actividad del coach), Tlim por zona, nuevos tipos de test (máximos por distancia, Tlim, técnicos para Factor 1 de SICAT), dashboards agregados de equipo, modo de ritmo de competición, exportación a PDF, historial de molestias/lesiones cruzado con carga, onboarding inteligente para atletas autoentrenados, capacidad offline/PWA.

## Estilo de trabajo esperado

- Antes de dar por terminada una tarea de UI o lógica, revisar tipos, null safety y JSX antes de mostrar el resultado.
- No renombrar campos de Supabase relacionados con "eco" sin preguntar — es una decisión deliberada de no romper la base de datos existente.
- Si una tarea implica decisión de metodología deportiva o de producto (no solo implementación técnica), preguntar antes de asumir.
