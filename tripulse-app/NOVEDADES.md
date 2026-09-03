# Novedades de TRIPULSE

Qué ha cambiado en la aplicación, por días, contado para quien la usa.

**Para qué es esto.** Para poder decir «esto es nuevo desde la última vez que la
viste» cuando presentas la aplicación, sin tener que acordarte. Está escrito
para un entrenador, no para un programador: aquí no hay nombres de ficheros ni
de funciones. Lo técnico vive en el historial de git.

**Cómo se mantiene.** Se añade una entrada CADA VEZ que se despliega algo, el
mismo día, antes de que se olvide. Lo nuevo va arriba.

---

## 3 de septiembre de 2026

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
