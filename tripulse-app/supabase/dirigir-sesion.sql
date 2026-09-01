/* ============================================================
   MODO ENTRENADOR: apuntar una sesión a pie de pista

   Añade lo que hace falta para que el entrenador registre en vivo lo que hace
   su atleta. Son cinco columnas y un permiso, y cada una arregla algo que hoy
   no se puede guardar.

   TODO ES «add column if not exists»: correrlo dos veces no rompe nada, y si
   alguna columna ya existiera se la salta.
   ============================================================ */


/* ============================================================
   1. LAS SERIES DE RESISTENCIA, EN UNA TABLA Y NO EN UN TEXTO

   Hoy un 4×1000 se guarda así, en la pantalla de ejecución:

       tarea.sensacion_general = 'S1[T:3:52 1000m] | S2[T:3:55 1000m] | ...'

   Un texto, dentro de una columna que se llama «sensación general». Y de las
   cuatro series solo la PRIMERA llega a p_distancia/p_duracion como número.

   Eso significa que hoy no se puede contestar «¿se le cayó el ritmo en la
   última?», que es la pregunta entera de una sesión de series. Y de nada sirve
   que el entrenador cronometre bien si el dato acaba en una cadena.

   `series_realizadas` ya guarda serie a serie las de FUERZA, colgando de
   `id_ejercicio`. Se le añade `id_tarea` para que pueda colgar también de una
   tarea de resistencia. Las dos son opcionales: cada fila usa la suya.
   ============================================================ */

alter table series_realizadas add column if not exists id_tarea bigint references tarea(id) on delete cascade;

/* Y `id_ejercicio` tiene que poder ser nulo, porque una serie de resistencia no
   cuelga de ningún ejercicio. Si ya era nulable, esto no hace nada. */
alter table series_realizadas alter column id_ejercicio drop not null;

create index if not exists idx_series_realizadas_tarea on series_realizadas(id_tarea);

comment on column series_realizadas.id_tarea is
  'La tarea de resistencia a la que pertenece esta serie. Nula en las de fuerza, que cuelgan de id_ejercicio.';


/* ============================================================
   2. LOS METROS DE CADA SERIE

   `tiempo_real` ya existe (lo usan las series de fuerza medidas en tiempo) y se
   reaprovecha. Los metros no tenían columna: en resistencia hacen falta para
   una serie que se corta antes o se alarga.
   ============================================================ */

alter table series_realizadas add column if not exists metros_reales integer;

comment on column series_realizadas.metros_reales is
  'Metros de esta serie concreta. Para cuando lo que se hizo no es lo que se prescribio.';


/* ============================================================
   3. EL DESCANSO REAL

   Se prescribe («90 s rec») pero nadie apunta cuánto se descansó de verdad, ni
   el atleta ni el entrenador. Y en series es la mitad del estímulo: 4×1000 con
   90 segundos y 4×1000 con tres minutos no son el mismo entrenamiento.

   Con el cronómetro por serie del modo entrenador esto sale gratis: el descanso
   arranca solo al parar una serie y se cierra al empezar la siguiente.
   ============================================================ */

alter table series_realizadas add column if not exists descanso_real integer;

comment on column series_realizadas.descanso_real is
  'Segundos de descanso DESPUES de esta serie, medidos de verdad. El prescrito esta en tarea.descanso_segundos.';


/* ============================================================
   4. QUIÉN LO APUNTÓ

   Lo mismo anotado por el atleta o por el entrenador no vale igual, y hasta
   ahora quedaban idénticos en la base.

   Importa sobre todo con el RPE: el esfuerzo percibido es del atleta POR
   DEFINICION. Si el entrenador lo pone a ojo deja de ser lo que el atleta
   sintió y pasa a ser una estimación de fuera — y el SICAT calcula la carga con
   ese número. Sin esta columna, dentro de seis meses nadie sabría si aquel 9 lo
   dijo él o lo puso el entrenador.
   ============================================================ */

alter table series_realizadas add column if not exists anotado_por text;

alter table sesion add column if not exists rpe_origen text;

comment on column series_realizadas.anotado_por is
  'deportista | entrenador. Quien escribio esta fila.';
comment on column sesion.rpe_origen is
  'atleta | entrenador. De donde sale rpe_reportado: lo dijo el, o lo estimo el entrenador mirando.';


/* ============================================================
   5. QUE EL ENTRENADOR PUEDA ESCRIBIR

   `series_realizadas` no tiene politica propia: hereda de quien la consulta.
   Se comprueba abajo y, si no hay ninguna, se crea una que use el mismo
   predicado que el resto de la app —auth_dep_ids()— llegando por el camino
   que corresponda: la tarea, o el ejercicio.
   ============================================================ */

do $$
begin
  if not exists (
    select 1 from pg_policies
     where schemaname = 'public' and tablename = 'series_realizadas'
  ) then
    execute $p$
      create policy series_realizadas_dep on series_realizadas for all
      using (
        exists (
          select 1 from tarea t join sesion s on s.id = t.id_sesion
           where t.id = series_realizadas.id_tarea
             and s.id_deportista in (select auth_dep_ids())
        )
        or exists (
          select 1 from ejercicios e join tarea t on t.id = e.id_tarea
            join sesion s on s.id = t.id_sesion
           where e.id = series_realizadas.id_ejercicio
             and s.id_deportista in (select auth_dep_ids())
        )
      )
      with check (
        exists (
          select 1 from tarea t join sesion s on s.id = t.id_sesion
           where t.id = series_realizadas.id_tarea
             and s.id_deportista in (select auth_dep_ids())
        )
        or exists (
          select 1 from ejercicios e join tarea t on t.id = e.id_tarea
            join sesion s on s.id = t.id_sesion
           where e.id = series_realizadas.id_ejercicio
             and s.id_deportista in (select auth_dep_ids())
        )
      )
    $p$;
  end if;
end $$;

notify pgrst, 'reload schema';


/* ============================================================
   COMPROBACIÓN

   Fila 1: deben salir las cinco columnas nuevas.
   Fila 2: id_ejercicio tiene que decir YES en nulable.
   Fila 3: cuantas politicas tiene la tabla. Si sale 0, algo fue mal arriba.
   ============================================================ */
select 1 as n, 'columnas nuevas' as que,
       string_agg(table_name || '.' || column_name || ' (' || data_type || ')', ', ' order by table_name, column_name) as valor
  from information_schema.columns
 where (table_name = 'series_realizadas' and column_name in ('id_tarea','metros_reales','descanso_real','anotado_por'))
    or (table_name = 'sesion' and column_name = 'rpe_origen')
union all
select 2, 'id_ejercicio admite nulo',
       coalesce((select is_nullable from information_schema.columns
                  where table_name = 'series_realizadas' and column_name = 'id_ejercicio'), 'NO EXISTE')
union all
select 3, 'politicas de series_realizadas',
       (select count(*)::text from pg_policies
         where schemaname = 'public' and tablename = 'series_realizadas')
order by n;
