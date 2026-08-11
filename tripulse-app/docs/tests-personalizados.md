# Tests propios y zonas derivadas del hito fisiológico

**Estado:** diseño cerrado, sin implementar. 2026-08-11.
Revisión 3 — contrastado con el repo y con la base de conocimiento de `deporte/`.

---

## 1. Qué se quiere

Que un entrenador **cree sus propios tests dentro de la app y funcionen igual que
los nuestros**: elige qué datos se rellenan, escribe la fórmula, y queda un test
nuevo que puede pasar a sus atletas y que **gobierna sus zonas**.

### ¿Se puede? Sí, y casi nada de esto es nuevo

Los tres tests actuales **ya tienen esa forma**, solo que escrita a mano:

```
test1_carrera
  campos:   velocidad_ultimo_escalon, duracion_total_escalon,
            tiempo_aguantado_ultimo, incremento_velocidad
  fórmula:  calcularVAM()        <- dentro del componente
  produce:  vam, mss
```

Un formulario de campos + una fórmula + un resultado. **No hay que inventar el
mecanismo: hay que sacar a datos el que ya existe.**

Un test built-in hace hoy cuatro cosas. Tres salen gratis al generalizarlo:

| Lo que hace hoy | Con tests propios |
|---|---|
| Presentar un formulario | Los campos los define el entrenador |
| Calcular un número | La fórmula la escribe él |
| Guardarse con fecha e historial | Misma tabla, mismo comportamiento |
| **Gobernar las zonas del atleta** | Necesita saber **qué hito representa** ⚠️ |

La cuarta es la única que necesita algo más. Para eso está el **ancla**.

**Los built-in siguen viniendo de serie.** Que un entrenador *pueda* construirse
su test es distinto de que *tenga* que hacerlo para usar la app.

---

## 2. El ancla: lo que hace que funcione

Si un entrenador mide **vVT2**, ¿quién dice que su AEM es el 88–94 % de ese
número? Si la respuesta es «lo pone él», le pedimos justo lo que no tiene por qué
saber.

**Lo que importa de una medición no es de qué prueba salió, sino qué punto de la
fisiología representa.** Una métrica no declara «soy VAM»: declara «soy el
umbral» o «soy el VO₂máx». Y el ancla reparte las zonas.

### Anclas de intensidad

| Ancla | Se mide como |
|---|---|
| `umbral_aerobico` | VT1, LT1 |
| `umbral_anaerobico` | VT2, LT2, MLSS, OBLA, **FTP**, **CSS**, **CP / Critical Speed**, RCP |
| `vo2max` | **VAM**, **PAM**, MAP, vVO₂máx |
| `fc_maxima` | — |
| `fc_reposo` | — |
| `velocidad_maxima` | MSS, MPP |
| *`vift`* (candidata) | test 30-15 IFT — va 15–25 % por encima de vVO₂máx |
| *`fatmax`* (candidata) | — |

CP y Critical Speed son de la familia del umbral: **CSS *es* critical speed**.
Aparecen 376 veces en `deporte/`, no son marginales.

FTP y CSS no son cosas distintas: son el umbral, en vatios y en segundos por
100 m. VAM y vVO₂máx tampoco: son el VO₂máx, en km/h.

### Ya está medio pensado en el repo

El catálogo de las 9 zonas anota los hitos, con símbolo de ancla incluido:

```
AEM → 'CSS +4–8s (⚓MLSS)'
AEI → 'CSS ±3s (⚓CSS)'
PAE → 'CSS −4 a −8s (⚓vVO₂máx)'
```

Como texto dentro de una columna. Esto lo saca a datos.

---

## 3. ⚠️ Las reservas: dos anclas, no una

Dos de las prescripciones más usadas **no son «% de un ancla»** sino **% del
hueco entre dos**:

**ASR = MSS − vVO₂máx.** De `deporte/`:

> *«Dos atletas con el mismo vVO₂máx pero distinta MSS trabajan a distinto % de su
> ASR en el mismo intervalo → distinta carga. Programar el trabajo supramáximo
> como % de ASR individualiza de verdad.»*

Ya está marcada ahí como «nueva variable a capturar» para TRIPULSE.

**Karvonen (FCR).** `FC objetivo = [(FCmáx − FCreposo) × %] + FCreposo`. Es el
estándar para zonas de pulso.

**Consecuencia para el modelo:** un esquema puede colgar de **dos** anclas, y hace
falta un tercer modo — `porcentaje`, `offset` y **`reserva`**. Con una sola ancla
ni el trabajo supramáximo ni las zonas de FC salen bien.

**Hoy la app no lo hace:** la FC cuelga de `fc_maxima × 0.85` (un umbral
estimado), no de la reserva. Y **la FC de reposo ya está guardada** —la recoge la
anamnesis en `fc_reposo`— sin usarse para esto.

*Decisión pendiente:* la FC de reposo de la anamnesis es un dato de alta, no una
medición repetible. Para Karvonen interesa la actual. Habría que decidir si se
convierte en métrica de un test, si se lee del wellness, o si se deja como está.

---

## 4. Modelo de datos

```sql
/* ---------- Lo que el entrenador define ---------- */

test_definicion (
  id, id_entrenador uuid null,      /* null = built-in, solo lectura para todos */
  nombre, disciplina,               /* Natacion | Ciclismo | Carrera | otro */
  descripcion, protocolo,
  archivado bool
)

test_campo (
  id, id_definicion, clave, etiqueta,
  tipo,        /* number | tiempo | select | texto */
  unidad,      /* m | km | s | mmss | km/h | m/s | W | bpm */
  orden, requerido bool, opciones jsonb
)

test_metrica (
  id, id_definicion, clave, etiqueta,
  unidad,
  tipo_ref,    /* velocidad | potencia | ritmo | fc | fisiologico */
  ancla,       /* umbral_aerobico | umbral_anaerobico | vo2max |
                  fc_maxima | fc_reposo | velocidad_maxima | null */
  formula text,
  orden
)

/* ---------- Lo que se mide ---------- */

test_ejecucion        (id, id_definicion, id_deportista, fecha, notas)
test_ejecucion_valor  (id_ejecucion, clave_campo, valor numeric)
test_ejecucion_metrica(id_ejecucion, clave_metrica, valor numeric)   /* cache */

/* ---------- Cómo se reparten las zonas ---------- */

esquema_zonas (
  id, id_entrenador uuid null,
  nombre,
  ancla,           /* de qué hito cuelga la escalera */
  ancla_2,         /* solo si modo='reserva': el otro extremo */
  tipo_ref,        /* velocidad | potencia | ritmo | fc */
  sistema,         /* 'siglas' (las 9) | 'clasico' (Z1..Z7) */
  modo,            /* 'porcentaje' | 'offset' | 'reserva' */
  predeterminado bool
)
esquema_zona_item (
  id_esquema, zona_clave,          /* 'AEM' o 'Z3' */
  min numeric, max numeric,        /* % | segundos | % de la reserva */
  orden
)

/* ---------- Qué gobierna a cada atleta ---------- */

deportista_referencia (
  id_deportista, disciplina,
  id_metrica,          /* qué medición manda */
  id_metrica_2,        /* el segundo extremo, si el esquema es de reserva */
  id_esquema,          /* lo propone el ancla; editable */
  valor_actual numeric, valor_2 numeric,
  id_ejecucion, fecha
)
```

### Los cuatro campos que no estaban en la versión inicial

**`ancla`** — el eje del diseño. Sin él, cada test nuevo obliga a inventar
porcentajes.

**`modo = offset`** — porque natación **no va en porcentajes**. Lo dice el código:

> *«Se calcula desde el desfase real en segundos sobre el CSS, no con un % sobre la
> velocidad: un "CSS +15s" no es un 85 % del CSS, y tratarlo como % daba ritmos
> absurdos.»*

Alguien ya se estrelló ahí. Un esquema de solo `pct_min/pct_max` volvería al mismo
sitio.

**`modo = reserva` + `ancla_2`** — por ASR y Karvonen (§3).

**`sistema`** — hay **dos** sistemas de zonas vivos (las 9 siglas y Z1–Z7) y cada
deportista usa uno. Un esquema pertenece a uno; mezclarlos daría zonas que para ese
atleta no existen.

### Métricas que no pueden gobernar zonas

Un VO₂máx en ml/kg/min tiene ancla `vo2max` pero `tipo_ref = fisiologico`: es
seguimiento, no genera ritmos. La app debe decirlo y pedir una métrica entrenable
del mismo test. Un test puede producir varias, así que es un aviso, no un problema.

Otras de seguimiento que conviene poder guardar: **W′/D′** (capacidad anaeróbica
finita, va con CP), **tlim**, **economía de carrera**.

---

## 5. Ejemplo completo: el test de Cooper

Lo que un entrenador haría, de principio a fin:

| | |
|---|---|
| **Campo** | `distancia_m` — metros en 12 minutos |
| **Métrica 1** | `VAM = distancia_m / 200` → km/h · ancla `vo2max` |
| **Métrica 2** | `VO2max = (distancia_m - 504.9) / 44.73` → ml/kg/min · informativa |

Guarda, y ese test aparece en la ficha de sus atletas. La VAM que salga **gobierna
las zonas igual que la del test de escalones**. La app no sabe qué es Cooper y no
le hace falta.

---

## 6. Lo que ya existe y hay que aprovechar

### Los tres tests ya producen varias métricas

| Tabla | Campos | Métricas y su ancla |
|---|---|---|
| `test1_carrera` | velocidad_ultimo_escalon, duracion_total_escalon, tiempo_aguantado_ultimo, incremento_velocidad | **vam** ⚓vo2max · **mss** ⚓velocidad_maxima |
| `test2_natacion` | distancia_grande, distancia_pequena, tiempo_distancia_grande, tiempo_distancia_pequena | **css** ⚓umbral_anaerobico · **v25**, **v50** |
| `test3_ciclismo` | potencia_pico, tiempo_escalon_completado, tiempo_escalon_no_completado, duracion_escalones, incremento_potencia | **ftp** ⚓umbral_anaerobico · **mpp** ⚓velocidad_maxima |

### Los porcentajes ya están calibrados

No hay que inventar ninguno: `ZONAS_RESISTENCIA` (`vamMin/vamMax`,
`ftpMin/ftpMax`, `fcMin/fcMax`), `CSS_OFFSET` (los segundos de natación), y los %
de Z1–Z7 una vez unificados.

### Correcciones al planteamiento inicial

| Decía | Es |
|---|---|
| VAM/FTP/CSS están en `tests_valoracion` | Están en tres tablas separadas. `tests_valoracion` es el catálogo de tests **clínicos** de la Biblioteca; ni siquiera tiene `id_deportista` |
| Hay un RPC que calcula zonas | No existe. El cálculo es cliente, en `lib/zonas.ts` |
| — | Ya existe `tests_libres` (nombre, resultado, unidad). Hay que **absorberla**, no dejar dos sitios donde crear «un test que no es de los tres» |

---

## 7. ⚠️ Antes de nada: los % de VAM no coinciden entre pantallas

Están escritos dos veces, y **la VAM difiere en todas las zonas**:

| Zona | `tareas-tabla.tsx` | `ejecutar/page.tsx` | `deporte/` (B1-00b) |
|---|---|---|---|
| Z2 | 65–75 % | 60–70 % | **60–70 %** |
| Z3 | 76–85 % | 70–80 % | **70–80 %** |
| Z4 | 86–95 % | 80–90 % | **80–90 %** |
| Z5 | 96–105 % | 90–100 % | **90–100 %** |
| Z6 | 106–120 % | 100–115 % | **100–115 %** |

**Resuelto: manda `ejecutar/page.tsx`**, que es el que coincide con la doctrina
del propio vault. El de `tareas-tabla.tsx` no sale de ningún sitio conocido.

El mismo Z3 le enseña hoy un ritmo al entrenador montando la sesión y otro al
deportista al ejecutarla. Nada falla.

Dos matices: el vault usa **8 zonas** (Z1–Z8) y la app 7; y en Z7 el vault dice
115–150 % mientras el código pone 115–130 %.

---

## 8. Plan por fases

**Fase 0 — Un solo juego de porcentajes.**
Unificar los % de Z1–Z7 en `lib/zonas.ts` con los valores de `ejecutar` (= los del
vault), con tests, y que las dos pantallas los usen. Sin base de datos ni UI.
Independiente del resto y **hoy está roto en producción**.

**Fase 1 — Modelo + siembra (invisible).**
Las tablas; los tres tests como built-in con campos, fórmulas y **anclas**; los
esquemas built-in con los % que ya existen. Migrar los atletas a
`deportista_referencia`. Verificar métrica a métrica que la fórmula en texto da
**el mismo número** que la de hoy: si no, cambian las zonas de todos sin avisar.

**Fase 2 — Las zonas salen de los datos.**
`lib/zonas.ts` deja de tener los % dentro y los lee del esquema del atleta. Mismo
comportamiento, otra fuente. Aquí se comprueba que no cambia ningún número.

**Fase 3 — El motor de fórmulas y el builder.**
`lib/formula.ts` con evaluador de lista blanca (`expr-eval` o `mathjs` con scope
restringido) — **nunca `eval`**: evaluar texto del usuario como JavaScript deja que
quien escriba una fórmula ejecute código en el navegador de otro. Un solo módulo
para la vista previa y el cálculo real, para que no puedan discrepar. UI de crear
test con preview en vivo.

**Fase 4 — Elegir la referencia por atleta.**
Qué medición gobierna a cada uno, por disciplina. El esquema lo propone el ancla.

**Fase 5 — Reservas (ASR, Karvonen), historial y tendencia, esquemas editables,
absorber `tests_libres`.**

El orden es a propósito: **primero se sanea y se mueve a datos sin cambiar
comportamiento**, y solo después se abre la mano. Si algo se tuerce, se sabe si es
del modelo o de lo nuevo.

---

## 9. Decisiones pendientes

- **La FC de reposo** vive en la anamnesis, que es un dato de alta. Para Karvonen
  interesa la actual: ¿métrica de un test, del wellness, o se deja?
- **¿Se añade Z8?** El vault usa ocho zonas en el sistema clásico y la app siete.
- **Unidades**: conviven km/h (VAM), m/s (CSS) y W (FTP). El motor debe normalizar
  antes de aplicar nada; sin eso, la primera fórmula que mezcle unidades da un
  número plausible y equivocado.
- **Atleta cuya referencia se queda sin medición**: propuesta, conservar
  `valor_actual` y marcarlo como huérfano en vez de dejarlo sin zonas de golpe.
- **RLS**: lo propio por `id_entrenador`; lo built-in (`id_entrenador is null`) de
  solo lectura para todos. Cuidado con los ciclos de políticas — ver lo que pasó en
  el módulo de grupos.
