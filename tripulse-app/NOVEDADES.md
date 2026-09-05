# Novedades de TRIPULSE

Qué ha cambiado en la aplicación, por días, contado para quien la usa.

**Para qué es esto.** Para poder decir «esto es nuevo desde la última vez que la
viste» cuando presentas la aplicación, sin tener que acordarte. Está escrito
para un entrenador, no para un programador: aquí no hay nombres de ficheros ni
de funciones. Lo técnico vive en el historial de git.

**Cómo se mantiene.** Se añade una entrada CADA VEZ que se despliega algo, el
mismo día, antes de que se olvide. Lo nuevo va arriba.

---

## 5 de septiembre de 2026

### La intensidad que prescribes ya se ve

Escribías «140-150 ppm» en un bloque, lo guardabas, y **desaparecía de la
pantalla**. La columna se llama «Referencia / Intensidad» pero solo enseñaba la
referencia de la zona, así que para comprobar lo que habías mandado había que
volver a abrir la tarea para editarla.

Pasaba en las dos vistas del editor, en la de Tabla y en la de Formulario. Ahora
lo prescrito va arriba y destacado —es la orden— y la referencia de la zona
queda debajo, apagada, que es el contexto. El mismo reparto que ve el atleta.

Si no prescribiste nada, no cambia nada: sigue saliendo solo la referencia.

### Fijar con qué nace cada tarea

Montar una sesión de seis bloques de carrera en metros era elegir **seis veces**
la misma unidad, el mismo descanso y la misma intensidad. Y la unidad nacía
siempre en «und.»: sin ponerla, el volumen del bloque no se guarda.

Encima de las tareas hay ahora una franja, **«Por defecto en esta sesión»**,
donde lo fijas una vez.

- **En resistencia:** unidad, series, descanso e intensidad. Y la disciplina, en
  los bricks —que es donde hace falta, porque ahí cada bloque lleva su deporte.
- **En fuerza:** grupo muscular, tipo de serie, reps o tiempo, el control
  (RIR, RPE, %1RM…) y su número, series y descanso.

Cuatro reglas, y las cuatro importan:

1. **Viven en esa sesión.** Se guardan con ella; mañana los reencuentras, y otra
   sesión empieza con los suyos.
2. **Solo hacia adelante.** Cambiar un valor no toca ninguna fila que ya esté
   puesta. Pisarte lo escrito para «ponerlo al día» sería peor que no tenerlo.
3. **No es un candado.** Cada fila se sigue cambiando a mano; el bloque que se
   sale de la norma se edita como siempre.
4. **Lo que no fijes sale como hasta ahora.** La franja no quita ni un control de
   la fila: adelanta trabajo, no obliga a nada.

El ejercicio de fuerza no se predetermina —repetirlo en toda la sesión no tiene
sentido—, pero sí su grupo muscular, que ya deja el buscador acotado.

La zona tampoco está en la franja cuando la sesión ya tiene la suya: esa zona no
es un valor por defecto, es un dato de la sesión que leen el mesociclo, el
calendario y la vista de semana. En las sesiones «complejas», que no tienen zona
propia, sí puedes fijar con cuál nacen las filas.

### Guardar todas las tareas de una vez

Montar una sesión de fuerza era añadir una fila, guardarla, esperar a que la
pantalla se recargara entera, añadir la siguiente. Cinco ejercicios, cinco veces.

Ahora, a partir de la segunda fila, aparece encima un botón que **las guarda
todas de golpe**. El botón de cada fila se queda donde estaba: si solo quieres
meter una, la metes y ya.

El número que lleva escrito es el de las filas **listas**, no el de filas. Con
cinco puestas y dos a medias dice «Guardar las 3», y al lado te avisa de que
las otras dos se quedan. Si alguna no entra, se queda en su sitio con lo que
habías escrito y se te dice cuál y por qué — nada de dar cinco por guardadas
cuando entraron tres.

### La intensidad dejó de titularse mal

Cuando prescribes por **pulsaciones**, al atleta le salía:

> **Ritmo objetivo** — 140-150 ppm

y al lado una casilla «Ritmo real» pidiéndole un ritmo. El número era correcto;
el título, no. El rótulo lo elegía el deporte, así que en carrera siempre ponía
«ritmo» y en bici siempre «potencia», dijera lo que dijera dentro.

Ahora el título sale de **lo que has escrito**: Pulso, Potencia, Ritmo, Esfuerzo.
Y la casilla donde el atleta apunta lo que hizo se titula igual, que antes ponía
«Ritmo / Potencia» y se dejaba fuera el pulso — con el que se prescribe media
base aeróbica.

### Prescribir intensidad en bloques por tiempo

En la vista de **Formulario** la casilla de intensidad solo salía en bloques por
metros o kilómetros. Si prescribías por minutos —que es lo normal en bici y muy
común en carrera— no tenías dónde escribirla: solo veías la referencia de la
zona en un recuadro que no se podía tocar. Y aunque la hubieras escrito, no se
guardaba.

Ya sale en cualquier bloque que se pueda medir, se llama **«Intensidad
objetivo»** porque no siempre es un ritmo, y se guarda.

De paso, esa vista **guardaba la sugerencia de la app** cuando dejabas la casilla
en blanco, como si la hubieras escrito tú. Era el fallo que se corrigió en la
vista de Tabla el 30 de agosto y que aquí se había quedado sin corregir. Ahora
se guarda solo lo que escribes; lo que calcula la app se calcula al enseñarlo.

### Siempre hay una referencia, aunque no tenga tests

Si el atleta **no tiene hecho el test** de esa disciplina, no se le podía traducir
la zona a un ritmo — y entonces no veía **nada**: abría un rodaje de 40 minutos
sin ninguna referencia de a cuánto ir.

Ahora, si no hay ritmo, se le dan sus **pulsaciones** de esa zona (calculadas
desde su FC máxima); y si tampoco se sabe, el **RPE**, que no necesita ningún
test. Se le dice de dónde sale cada uno, para que sepa que le falta el test.

Esto importa más de lo que parece: las sesiones que crea el **planificador** y las
que salen de **plantillas** no llevan intensidad escrita, así que hasta ahora
dependían por completo de que el atleta tuviera el test.

### Dos avisos donde antes había silencio

- **En «Mis análisis» faltaban los bloques por tiempo.** Enseñaba el objetivo de
  los bloques por distancia y de los otros no, cuando en las demás pantallas sí
  aparecían.
- **La intensidad en un bloque de repeticiones se perdía.** La casilla la
  aceptaba, la tarea se guardaba y la intensidad no llegaba a ninguna parte:
  ahí no hay dónde guardarla. Ahora te lo dice antes de guardar y te propone qué
  hacer, en vez de tragárselo.

---

## 3 de septiembre de 2026

### El calendario abre por el mes

Antes entrabas y lo primero que veías eran **seis meses de golpe**. Eso sirve
para mirar la temporada, pero no es a lo que se entra: se entra a ver qué toca,
y eso se ve en un mes con sus días.

Ahora abre en el mes actual. Las otras vistas —Meso, Semanas y Lista— siguen a
un toque en la barra de arriba.

### Retocar la semana antes de volcarla

El planificador generaba una semana y solo daba dos salidas: **te vale entera, o
vuelves a generarla** con otros mandos a ver si sale mejor. Y casi nunca es eso:
es «está bien, pero el jueves no puedo» o «hora y media de rodillo es demasiado
esta semana».

Ahora cada sesión tiene un **Cambiar**: moverla de día, cambiarle los minutos o
quitarla de la semana. Lo que tocas queda marcado, y antes de volcar te dice qué
cambiaste respecto a lo que propuso el generador y cuánto tiempo queda en total.

Y también puedes **cambiar la sesión por otra**: donde el generador puso
intervalos al FTP puedes poner FTP continuo, o cambiar un continuo medio por un
interválico largo. Se ofrecen las del catálogo que son de su misma disciplina y
su misma zona, que es donde está la diferencia entre continua y por series.

No se ofrecen las de otra zona: eso no cambiaría la forma de la sesión sino lo
que entrena, y el reparto de intensidades de la semana lo decidió el generador
contando zonas.

### Elegir la semana en el planificador

Antes había una casilla de fecha y por defecto el lunes que viene. Para
planificar otra semana tenías que saber que el valor debía ser un **lunes** —un
miércoles dejaba la semana torcida— y buscarla en un calendario. Y una vez
elegida no sabías nada de ella.

Ahora el planificador te ofrece **las seis semanas siguientes**, empezando por
la actual, y cada una te dice lo que es: si es de carga o de descarga, cuántas
UA le dibujaste, a qué bloque pertenece, **si hay competición dentro** y si ya
tiene sesiones puestas.

Viene marcada la primera que esté libre. Si la semana en curso ya va por el
viernes, salta a la siguiente; y si una ya tiene sesiones, también, porque
planificar encima duplicaría.

### Esta pantalla

Hay una página de **Novedades** dentro de la aplicación, en el enlace de arriba
del panel. Enseña esto mismo que estás leyendo.

De momento solo la ven las cuentas de plataforma. Cuando quieras abrirla a los
entrenadores es quitar una condición.

### La batería de tests, entera

La aplicación pasa de 7 tests a **24**. Están los de siempre —Montreal, CSS,
rampa, los sprints y el 1RM— más los diecisiete de la batería: test de 6
minutos, milla, T30, 180 m repetidos, RAST, T400, SWOLF, FTP de 20 y de 60
minutos, saltos SJ y CMJ, drop jump, escalera, brick y deriva cardiaca.

Y tres fichas de técnica nuevas: **carrera, natación y bike fit**. Cadencia,
tiempo de contacto, oscilación vertical, ángulo de rodilla, float de la cala.
Cada casilla lleva debajo su valor de referencia y **se pone verde o ámbar
sola** según lo que escribas.

### Dirigir un test a pie de pista

Doce de los tests se pueden **dirigir en vivo desde el móvil**, y el número cae
solo en su casilla: cronómetro, cuenta atrás, contador de brazadas, y un botón
por repetición que rellena de golpe cuántas hizo, la mejor y la última.

Lo que más cambia es el **Montreal y la rampa**: la aplicación lleva el
protocolo por ti. Va cantando el escalón y la velocidad o los vatios que tocan,
y cuando el atleta se baja, un botón captura dónde iba.

Todo eso vale también **para un grupo entero**: un reloj común y un botón por
atleta, que se pulsa según van llegando sin parar el cronómetro de los demás.

### Las zonas pueden salir de más de un test

Antes cada disciplina tenía un solo test que fijaba sus zonas. Ahora cualquiera
que mida lo mismo puede hacerlo: el de 6 minutos y la milla dan VAM, el T400 da
CSS, y los dos FTP dan FTP. Hay que pulsar un botón —guardar un test no mueve
las zonas solo— y queda apuntado de qué test salió el número.

### El FTP estaba inflado un tercio

**Esto afecta a todos los ciclistas y conviene decírselo.** El test de rampa
guardaba la potencia del último escalón como si fuera el FTP, sin aplicarle el
0,75 que le corresponde. De ese número salen las zonas, así que a quien se le
mandaba «Z3» se le estaba mandando bastante por encima de Z3.

Corregido, y recalculado hacia atrás. **Las zonas de ciclismo bajan sobre un
25 %.** Es lo correcto, pero de un día para otro van a ver otros vatios.

### La gráfica de carga del dibujo dejó de mentir

Cinco cosas, todas de la misma familia: el número no fallaba, mentía.

- **Un atleta sin tests hechos veía semanas enteras de carrera como una barra
  vacía.** Sin VAM no se podían pasar los metros a minutos y la sesión se caía
  de la cuenta en silencio. Ahora se estima con un ritmo de referencia y se
  marca como aproximado.
- **La barra «Programado» medía lo que costó, no lo que se mandó.** Usaba la
  duración cronometrada, así que una semana pasada y una futura no eran
  comparables aunque se dibujaran igual.
- **Una semana a cero podía ser tres cosas y las tres se veían igual**: sin
  sesiones, con sesiones vacías, o sin poder medirlas. Ahora lo dice.
- **El dibujo y el calendario no se hablaban.** Una sesión creada en la vista
  semana no aparecía como unidad, y una borrada dejaba su unidad para siempre.
  Ahora se ponen al día solos.
- **Borrar no borraba**: la equis devolvía la unidad arriba, igual que
  arrastrarla. Ahora arrastrar arriba deshace y la equis borra.

### Datos imposibles, limpiados

Cuatro sesiones tenían duraciones que no podían ser —una natación de 3.600 m en
18 minutos, una sesión de fuerza de 1 minuto, dos carreras a más de 15 min/km—
casi seguro de dejarse la pantalla abierta. Estaban ensuciando la carga real y
la curva de forma de tres atletas.

---

## 1 de septiembre de 2026

- **Modo entrenador**: apuntar tiempos, repeticiones y notas a pie de pista
  mientras la sesión pasa, para un atleta o para un grupo.
- **El wellness cruzado con el entrenamiento**: al ver un pico o una caída,
  saber qué sesiones lo rodearon. Y desde una sesión, cómo amaneció después.
- **La tira de hoy** en el panel: qué toca hoy y con quién, sin buscarlo.

## 31 de agosto de 2026

- **El deportista ve sus competiciones** en su calendario.
- **Prescribir la intensidad en otras unidades**: ritmo, % de VAM, vatios, y que
  le llegue al atleta tal cual.
- **Saltar de sesión a sesión** desde el editor, sin volver al calendario.

## 30 de agosto de 2026

- **Planificar la semana**: elegir varias zonas de una vez y poder deshacerlo.

## 29 de agosto de 2026

- **Ver la contraseña al escribirla**, y tener que repetirla al crearla.
- El botón de guardar de *Apuntar*, más grande y a la vista.

## 24 al 28 de agosto de 2026

- **Seguridad**: políticas que faltaban, tope a la API, cabeceras, y el
  generador de códigos de invitación, que era predecible.
- **Página 404, buzón de fallos y aviso de mantenimiento.**
- **El atleta apunta su propia fuerza**, con la última vez delante para poder
  superarla, y puede corregir y borrar lo suyo.
- **Vídeos de ejercicio** en el briefing, resueltos en vivo.
- **Reparto de series por grupo muscular**, con objetivos que el entrenador fija.
- La aplicación **va bastante más rápida**: muchas pantallas pedían los datos de
  uno en uno y ahora los piden a la vez. El calendario pasó de catorce viajes a
  tres; la ficha de sesión, de ocho a dos.

## 17 al 23 de agosto de 2026

- **El entrenador de IA del deportista**: se dibuja su temporada sola hacia
  atrás desde su carrera, genera sus semanas, le programa tests, reacciona a lo
  que hace de verdad, y tiene chat.
- **Encadenar bloques**: la temporada entera enlazada, no semanas sueltas.
- **Mover y redimensionar cualquier ciclo** del lienzo, con sus sesiones.
- **Las competiciones tienen importancia**: A, B y C.
- **Comunidad y mesociclos.**
- **Papelera**: lo borrado deja de contar, y se ve lo que borró el atleta.

## Antes del 17 de agosto

El historial completo está en git (276 commits desde el 22 de abril de 2026).
Los bloques grandes de esa etapa fueron el módulo de bricks y transiciones, las
plantillas de sesión, los grupos de entrenamiento, el sistema de zonas y sus
correcciones, el asistente de IA del entrenador, el acceso por invitación con el
panel de administración, y la analítica de wellness y carga.

Si hace falta detallar alguno para una presentación concreta, se puede
reconstruir del historial.
