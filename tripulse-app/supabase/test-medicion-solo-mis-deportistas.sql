/* ============================================================
   Mediciones de los tests propios: solo a deportistas tuyos
   ============================================================

   EL AGUJERO. La regla `test_medicion_suyo` miraba solo el TEST («si la
   definición es tuya, haz lo que quieras con la medición») y no a QUIÉN se
   le apunta. Con un test propio se podían escribir mediciones con el
   id_deportista de cualquier atleta, también de otro entrenador. Las
   pantallas solo ofrecen atletas propios, pero la pantalla no es una
   frontera: la clave anónima es pública y el repositorio también.

   No hace falta ser entrenador: test_definicion_suyo no mira el rol, así que
   una cuenta de deportista se crea un test y se lo apunta a quien quiera
   (visto en el ensayo).

   Y lo inyectado no se queda quieto (visto en el ensayo):
   - el atleta y su entrenador ven la medición (`test_medicion_dep_lee`
     mira auth_dep_ids());
   - y con ella el TEST del intruso se les vuelve legible, porque
     auth_def_ids() saca las definiciones con mediciones de mis deportistas.

   Es el patrón que ya salió dos veces (ejercicios_biblioteca el 2026-10-04,
   tests_valoracion el 2026-10-09): una regla de escritura que no mira la
   fila entera.

   LA REGLA NUEVA: la medición es tuya si el test es tuyo Y el deportista es
   tuyo. «Tuyo» = auth_dep_ids(), la misma lista que decide el acceso en las
   demás tablas del atleta: tus deportistas (también los evaluados,
   solo_test, que siguen siendo tuyos), la ficha de tus grupos, tu propia
   ficha y, si eres director, los deportistas que te hayan abierto.

   EL DIRECTOR, DENTRO A PROPÓSITO (director_1_base aplicada el 2026-10-09).
   En el espacio de un entrenador, /laboratorio y /tests-propios le enseñan
   SUS tests y los deportistas que le hayan abierto (entrenadorEfectivo), y
   le dejan guardar: es lo que pide la figura («el director hace tests»).
   El disparador trg_cambio_director avisa al entrenador y al deportista. Si
   el entrenador le niega o le quita el acceso, deja de poder escribir. Lo
   que no puede es usar los tests DEL entrenador: la regla exige que el test
   sea de quien escribe.
   Un primer borrador usaba auth_dep_ids_sin_director(), como el chat; con
   él, esas dos pantallas habrían fallado al guardar para un director.

   LA LECTURA (USING) SE RESTRINGE IGUAL, no solo la escritura:
   - Un deportista se desvincula o se cambia de entrenador CONSERVANDO su
     ficha (/perfil y el alta cambian deportista.id_entrenador). Con la
     regla vieja, el entrenador anterior seguía leyendo, cambiando y
     borrando las mediciones que le tomó con sus tests. Los términos dicen
     que desvincularse retira la autorización, y en las demás tablas del
     atleta ya la retira.
   - Dejar el USING viejo con el CHECK nuevo crea un estado raro: poder ver
     y borrar esas filas, pero no corregirlas.
   - Al entrenador con sus atletas no le quita nada: esas filas ya las lee
     por `test_medicion_dep_lee`.
   - Hoy no hay ni una medición fuera de su dueño (2026-10-09): nadie pierde
     nada.

   QUEDA PERMITIDO A PROPÓSITO: una cuenta puede apuntarse un test suyo en
   SU PROPIA ficha. Es su dato en su ficha (su entrenador lo verá), no meter
   datos en la ficha de otro.

   ENSAYADO SIN APLICAR el 2026-10-10 contra la base real, con
   director_1_base y director_2_ultima_vez ya aplicadas, con
   test-medicion-solo-mis-deportistas-ensayo.sql: 28 cuentas, mismas
   mediciones y tests vistos y mismo alcance de UPDATE y DELETE antes y
   después (0 diferencias). Con la regla vieja la inyección ENTRA; con la
   nueva da 42501, y siguen entrando el atleta propio, el evaluado, la ficha
   de grupo y el «guardar dos veces el mismo día» de la app. Un director con
   el acceso concedido guarda y deja los 2 avisos; con el acceso negado,
   42501.

   DESHACER: volver a crear la política sin las dos líneas
   «and id_deportista in (select public.auth_dep_ids())». No se borra ni se
   cambia ningún dato.
*/

drop policy if exists test_medicion_suyo on public.test_medicion;

create policy test_medicion_suyo on public.test_medicion
  for all
  to authenticated
  using (
    exists (select 1 from public.test_definicion d
             where d.id = test_medicion.id_definicion
               and d.id_entrenador = (select auth.uid()))
    and id_deportista in (select public.auth_dep_ids())
  )
  with check (
    exists (select 1 from public.test_definicion d
             where d.id = test_medicion.id_definicion
               and d.id_entrenador = (select auth.uid()))
    and id_deportista in (select public.auth_dep_ids())
  );

/* ============================================================
   Comprobar: test_medicion_suyo mira auth_dep_ids() en las dos columnas y
   test_medicion_dep_lee sigue igual.
   ============================================================ */

select policyname, cmd, roles, qual, with_check
from pg_policies
where schemaname = 'public' and tablename = 'test_medicion'
order by policyname;
