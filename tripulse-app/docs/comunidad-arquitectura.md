# Módulo Comunidad — Arquitectura

> Documento de diseño. Se construye **primero como ficheros** (esquema + lógica) y se revisa
> paso a paso; solo cuando el cimiento está sólido se aplica a Supabase y se cablea a la app.
> Nada de esto toca la app real hasta que se diga explícitamente.

## Objetivo

Unir **B2B** (se cobra a clubes/federaciones) y **B2C** (enganchar a deportistas sueltos) en un
solo módulo con dos caras: **Mi club** (privado, estructurado) y **Comunidad** (descubrir gente,
grupos, retos). El B2C alimenta al B2B: un suelto que engancha es alguien a quien un club puede invitar.

## Cómo encaja con lo que ya existe

- **`perfiles`** (`id` = `auth.users.id`, `rol` = entrenador|deportista, `nombre`, `email`) → es la
  identidad. La persona que aparece en la comunidad ES un perfil.
- **`deportista`** (`id`, `nombre`, `id_entrenador`, `id_usuario`→cuenta) → ficha de entrenamiento.
  La relación entrenador→deportista **NO cambia**: el club es el tejado organizativo por encima.

## Principio de privacidad (innegociable)

> Los datos de entrenamiento son **siempre privados**. En la comunidad solo se comparte un **perfil
> público ligero** que cada uno enciende (opt-in): nombre, ciudad, deportes, foto y, como mucho, las
> estadísticas que uno elija mostrar. Nunca las sesiones. Encaja con el `rgpd.sql` que ya existe.

## Ser social es OPCIONAL (la puerta de entrada)

Nadie entra a la comunidad sin quererlo. `perfiles.social` tiene **tres estados**:

- **pendiente** (default) → nunca decidió. La primera vez que abre el módulo social se le **pregunta**:
  unirse o quedarse ajeno.
- **activo** → se unió. Aparece en la comunidad, ve a otros, grupos, retos.
- **inactivo** → ajeno. El módulo queda apagado para él, con un botón por si cambia de idea.

Reversible siempre. El directorio lee de la vista **`perfil_publico`** (solo columnas públicas, solo
`social='activo'`) — nunca de `perfiles`, que tiene el email. Quien no está `activo`, no aparece.

## Entidades (mapa completo)

```
club ──< club_miembro >── perfiles          (quién pertenece y con qué rol de club)
                              │
perfiles ──< grupo_miembro >── grupo ──< evento (quedadas)
                              │
perfiles ──< reto_participante >── reto     (competiciones / rankings)
```

- **club** — la organización (club / federación / escuela / equipo). A quien se factura.
- **club_miembro** — membresía muchos-a-muchos. `rol_club` = **admin** | **entrenador** | **deportista**.
  Jerarquía: admin ⊃ entrenador ⊃ deportista (un admin puede lo que un entrenador).
- **perfiles (ampliado)** — `visible_comunidad`, `ciudad`, `deportes`, `bio`, `avatar_url`.
- **grupo / grupo_miembro** — grupos del club o abiertos. Un grupo puede tener quedadas.
- **evento** — quedada de entrenamiento (fecha, lugar) + asistencia.
- **reto / reto_participante** — retos con ranking derivado de datos de entrenamiento.

## Las dos caras del módulo

- **Mi club** — la gente de tu club (solo si perteneces a uno). Panel del admin: roster, asignar
  deportistas a entrenadores, altas/bajas.
- **Comunidad** — todos los que encendieron su perfil, entre clubes y sueltos:
  - Descubrir gente (directorio)
  - Grupos y quedadas
  - Retos / competiciones

## Modelo de negocio (la frontera club vs grupo)

La línea entre lo que se paga y lo que engancha es también quién puede CREAR cada cosa:

- **Club** → lo damos de alta **nosotros** (plataforma). Es el producto B2B, lo que se factura. Una
  persona no crea un club: pasa por nosotros. Roster, grupos internos, retos del club, panel de admin.
- **Grupo** → lo crea **cualquiera** (deportista suelto o de club). Es el B2C self-service: junta gente
  para entrenar, quedadas, retos abiertos. Gratis. El gancho y el embudo hacia los clubes.

`plataforma_admin` = las cuentas "nosotros" que pueden crear clubes (`es_admin_plataforma`).

## Roadmap (de cimiento a tejado; cada paso aporta solo)

1. **Club: entidad + membresía + roles + RLS.** ✅ diseñado. Con esto se da de alta una federación.
2. **Ser social opt-in + perfil público.** ✅ diseñado. La pregunta de primera vez, la privacidad.
3. **Descubrir gente.** ✅ diseñado. `club_roster` (compañeros de club) + `perfil_publico` (comunidad).
4. **Grupos y quedadas.** ✅ diseñado. `grupo`/`grupo_miembro`/`evento`/`evento_asistente`. Los crea cualquiera.
5. **Retos / competiciones.** ✅ diseñado. `reto`/`reto_participante`/`reto_marcador`. Ranking por agregado.

## Cómo se calcula el ranking sin romper la privacidad (paso 5)

El ranking de un reto **no lee las sesiones de nadie en abierto**. Unirse a un reto = consentir que se
comparta **un solo número agregado** (km / minutos / sesiones / carga del periodo) entre los
participantes. Ese número lo calcula la **app** con sus fórmulas (`lib/atribucion`, `lib/duracion`) y
lo escribe en `reto_marcador` por vía de confianza (service role). Los usuarios **solo leen** el
marcador de sus retos; no pueden escribir puntuaciones → no se puede falsear.

## Decisiones tomadas (con defaults; corregibles)

- **Membresía muchos-a-muchos**: una persona puede estar en varios clubes (un entrenador que trabaja
  con dos, p.ej.). Un suelto = cero membresías. No fuerza complejidad, pero la permite.
- **`rol_club` único por (club, persona)** con jerarquía admin ⊃ entrenador ⊃ deportista.
- **Crear club**: SOLO la plataforma (`plataforma_admin`). Un usuario no crea clubes — pasa por
  nosotros. Los **grupos** (paso 4) sí los crea cualquiera: esa es la vía self-service B2C.
- **Roles del club**: un **admin** que gestiona el club, y debajo entrenadores y deportistas.

## Estado — módulo entero sobre papel (SIN aplicar, en revisión)

| Paso | Fichero | Contenido |
|---|---|---|
| 1 | `supabase/comunidad-1-club.sql` | `club`, `club_miembro`, `plataforma_admin`, `crear_club`, RLS |
| 2 | `supabase/comunidad-2-perfil-social.sql` | `perfiles.social` (opt-in), campos públicos, vista `perfil_publico` |
| 3 | `supabase/comunidad-3-descubrir.sql` | vista `club_roster` (comunidad usa `perfil_publico`) |
| 4 | `supabase/comunidad-4-grupos.sql` | `grupo`, `grupo_miembro`, `evento`, `evento_asistente`, `crear_grupo`, RLS |
| 5 | `supabase/comunidad-5-retos.sql` | `reto`, `reto_participante`, `reto_marcador`, RLS |

Orden de ejecución cuando se decida aplicar: 1 → 2 → 3 → 4 → 5 (hay dependencias: p.ej. el 4 usa
`es_miembro_club` del 1 y `es_social_activo`; el 5 usa helpers del 1 y del 4).

Siguiente: revisar el conjunto y decidir cuándo se aplica a Supabase + se empiezan las pantallas.
