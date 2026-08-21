/* ============================================================
   ¿PUEDE UN ATLETA ESCRIBIR SU PROPIO PLAN?

   La pregunta que hay que responder antes de vender un entrenador de IA: hasta
   hoy, todos los planes que se han creado colgaban de una ficha que había hecho
   un ENTRENADOR. Un atleta que se registra solo es dueño de su ficha por otra
   vía (id_usuario en vez de id_entrenador), y nadie había comprobado que
   auth_dep_ids() lo devuelva igual.

   Este guion se mete en la piel de un atleta de verdad, intenta escribir la
   cadena entera —macrociclo, mesociclo, microciclo, sesión— y comprueba además
   que NO ve fichas ajenas.

   NO DEJA NADA ESCRITO: termina en rollback. Se puede correr en producción.

   Se ejecuta ENTERO de una vez en el editor SQL de Supabase. Si se corre por
   trozos, el `begin` de arriba se queda solo y el `set local` no aplica.
   ============================================================ */

begin;

/* ===== A quién vamos a suplantar =====
   Se prefiere un atleta SIN entrenador, que es el caso nuevo y el que no se ha
   probado nunca. Si no hay ninguno, vale cualquiera que sea dueño de su ficha. */
with elegido as (
  select d.id, d.id_usuario, d.nombre, d.id_entrenador
  from deportista d
  where d.id_usuario is not null
  order by (d.id_entrenador is null) desc, d.id desc
  limit 1
)
select
  set_config('tp.dep', id::text, true)      as id_deportista,
  set_config('tp.uid', id_usuario::text, true) as id_usuario,
  nombre,
  case when id_entrenador is null
       then 'sin entrenador (el caso nuevo)'
       else 'con entrenador' end            as tipo
from elegido;

/* ===== Nos ponemos en su piel =====
   `authenticated` es el rol que usa la app desde el navegador. Sin esto todo
   correría como postgres, que salta RLS y haría pasar la prueba siempre. */
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', current_setting('tp.uid'), 'role', 'authenticated')::text,
  true) is not null as suplantando;

/* ===== 1. ¿Se ve a sí mismo? =====
   Si esto sale false, nada de lo de abajo puede funcionar y no hace falta
   seguir mirando: la función que sostiene TODA la seguridad no lo reconoce. */
select
  current_setting('tp.dep')::int = any (array(select auth_dep_ids())) as ve_su_ficha,
  array(select auth_dep_ids())                                       as fichas_que_alcanza;

/* ===== 2. ¿Ve fichas que no son suyas? =====
   Debe salir 0. Si sale cualquier otra cosa en un atleta sin entrenador, hay
   una fuga y esto se para aquí. */
select count(*) as fichas_ajenas_visibles
from deportista
where id <> current_setting('tp.dep')::int;

/* ===== 3. La cadena entera del plan =====
   Es exactamente lo que hace crearTemporada() desde el navegador, con las
   mismas columnas. Si RLS rechazara cualquiera de los cuatro niveles, el insert
   falla aquí con «new row violates row-level security policy». */
insert into macrociclo (id_deportista, objetivo, fecha_inicio, duracion_semanas, tipo_periodizacion)
values (current_setting('tp.dep')::int, 'PRUEBA RLS (se deshace sola)', current_date, 4, 'ATR')
returning id as macrociclo_escrito;

insert into mesociclo (id_macrociclo, id_deportista, objetivo, tipo, fecha_inicio, duracion_semanas, intensidad_relativa)
select m.id, current_setting('tp.dep')::int, 'Bloque de prueba', 'Acumulación', current_date, 4, 5
from macrociclo m
where m.objetivo = 'PRUEBA RLS (se deshace sola)'
returning id as mesociclo_escrito;

insert into microciclo (id_mesociclo, id_deportista, objetivo, tipo, fecha_inicio, duracion_dias)
select me.id, current_setting('tp.dep')::int, 'Semana de prueba', 'Carga', current_date, 7
from mesociclo me
where me.objetivo = 'Bloque de prueba'
returning id as microciclo_escrito;

/* La sesión es la que más importa: es la fila que el atleta crea a mano cada
   vez que genera una semana, y la que falló en su día por no llevar
   id_deportista escrito encima. */
insert into sesion (id_microciclo, id_deportista, disciplina, fecha_sesion, estado)
select mi.id, current_setting('tp.dep')::int, 'Carrera', current_date, 'Planificada'
from microciclo mi
where mi.objetivo = 'Semana de prueba'
returning id as sesion_escrita;

/* ===== 4. ¿Y las lee luego? =====
   Escribir y no poder leer sería igual de inútil. */
select count(*) as sesiones_que_ve
from sesion
where id_deportista = current_setting('tp.dep')::int;

/* ===== Nada de esto se queda ===== */
rollback;

/* ============================================================
   CÓMO SE LEE EL RESULTADO

     ve_su_ficha            debe ser  true
     fichas_ajenas_visibles debe ser  0     (en un atleta sin entrenador)
     los cuatro insert            devuelven un id
     sesiones_que_ve        debe ser  1 o más

   Si algún insert responde «new row violates row-level security policy», el
   nivel que falle es el que hay que mirar: casi siempre es que esa tabla se
   está escribiendo sin id_deportista encima de la propia fila, que es lo que
   comprueba el WITH CHECK.
   ============================================================ */
