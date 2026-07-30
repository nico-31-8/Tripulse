/* ============================================================
   TRIPULSE — Datos de demostración para Deportista 1 (id 14)
   Ejecutar en: Supabase Dashboard > SQL Editor

   QUÉ HACE
     1. Wellness diario del 7 al 30 de julio (24 días).
     2. Nueve sesiones realizadas con sus tareas y su feedback post-sesión
        completo (RPE reportado, FC media, sensación técnica, dolor).

   QUÉ NO HACE
     No crea ni modifica NINGÚN macrociclo, mesociclo ni microciclo. Las
     sesiones se enganchan al microciclo que ya exista en esa fecha; si no
     hay ninguno, quedan como sesión libre (id_microciclo null), que la app
     ya contempla en carga, volumen y SICAT.

   POR QUÉ ESTOS DATOS
     Las sesiones llevan fc_media y sensacion_tecnica porque sin esos dos
     campos el módulo de Índices sale vacío y el SICAT no puede calcular F1
     ni F4. El wellness lleva hrv porque es lo que alimenta el corrector.

   PARA DESHACERLO
     Todas las sesiones creadas aquí llevan la marca [demo] en
     notas_entrenador. Al final del fichero tienes el borrado.
   ============================================================ */

/* ------------------------------------------------------------
   0. HRV basal: sin ella el corrector del SICAT se queda neutro.
      Solo se rellena si está vacía; si ya tienes un valor, no se toca.
   ------------------------------------------------------------ */
update deportista
   set hrv_basal = 65
 where id = 14
   and hrv_basal is null;

/* ------------------------------------------------------------
   1. WELLNESS — 24 días
      Escalas 1-7. En sueño, fatiga, estrés y dolor MÁS ES PEOR; en ánimo y
      motivación más es mejor (por eso van invertidos en el score).
      score_wellness guarda MALESTAR: la app lo muestra invertido como
      bienestar (100 - score). Se calcula aquí con la misma fórmula que
      app/wellness/[id]/page.tsx para que no puedan divergir.

      El patrón deja lunes y jueves como días duros (los que siguen a las
      sesiones grandes) y el resto en buen estado.
   ------------------------------------------------------------ */
insert into wellness (
  id_deportista, fecha, calidad_sueno, horas_sueno, fatiga, estres,
  dolor_muscular, animo, motivacion, hrv, fc_reposo, malestar_general, score_wellness
)
select
  14, v.fecha, v.cs, v.hs, v.fa, v.es, v.dm, v.an, v.mo, v.hrv, v.fcr, v.mg,
  round(((v.cs + v.fa + v.es + v.dm + (8 - v.an) + (8 - v.mo) - 6)::numeric / 36) * 100)
from (
  select
    d::date as fecha,
    case when extract(dow from d) in (1, 4) then 3 else 2 end as cs,
    case when extract(dow from d) in (1, 4) then 7 else 8 end as hs,
    case when extract(dow from d) in (1, 4) then 5
         when extract(dow from d) = 0 then 2 else 3 end as fa,
    2 as es,
    case when extract(dow from d) in (1, 4) then 5
         when extract(dow from d) = 0 then 2 else 3 end as dm,
    case when extract(dow from d) in (1, 4) then 4 else 6 end as an,
    case when extract(dow from d) in (1, 4) then 4 else 6 end as mo,
    case when extract(dow from d) in (1, 4) then 58 else 68 end as hrv,
    case when extract(dow from d) in (1, 4) then 52 else 47 end as fcr,
    1 as mg
  from generate_series('2026-07-07'::date, '2026-07-30'::date, interval '1 day') d
) v
on conflict do nothing;

/* ------------------------------------------------------------
   2. SESIONES CON TAREAS
      Cada fila de la lista es una sesión. Se crea la sesión, luego sus
      tareas con el feedback post-sesión, y la medición de cada tarea.
   ------------------------------------------------------------ */
do $$
declare
  v_dep constant int := 14;
  s record;
  v_micro int;
  v_ses int;
  v_tar int;
begin
  for s in
    select * from (values
      /* fecha         disciplina   min  rpe_est rpe_real zona_cal zona_pri fc   sens dolor  cal_val    pri_val   unidad */
      ('2026-07-08'::date, 'Ciclismo',  90,  5, 5, 'AER', 'AEL', 128, 4, 2,  900,  4200, 'segundos'),
      ('2026-07-10'::date, 'Carrera',   50,  6, 6, 'AER', 'AEM', 152, 4, 3,  600,  2100, 'segundos'),
      ('2026-07-11'::date, 'Natacion',  60,  5, 5, 'AER', 'AEM', 141, 3, 3,  400,  2200, 'metros'),
      ('2026-07-14'::date, 'Ciclismo', 120,  6, 7, 'AEL', 'AEM', 145, 4, 4, 1200,  5400, 'segundos'),
      ('2026-07-17'::date, 'Carrera',   45,  7, 8, 'AER', 'PAE', 168, 3, 4,  600,  1500, 'segundos'),
      ('2026-07-20'::date, 'Natacion',  55,  5, 5, 'AER', 'AEM', 138, 4, 2,  400,  2000, 'metros'),
      ('2026-07-24'::date, 'Ciclismo',  75,  6, 6, 'AEL', 'AEM', 143, 4, 3,  900,  3600, 'segundos'),
      ('2026-07-27'::date, 'Carrera',   40,  5, 5, 'AER', 'AEL', 134, 5, 2,  600,  1800, 'segundos'),
      ('2026-07-29'::date, 'Natacion',  65,  6, 7, 'AER', 'AEI', 156, 3, 4,  400,  2400, 'metros')
    ) as t(fecha, disc, mins, rpe_est, rpe_real, z_cal, z_pri, fc, sens, dolor, v_cal, v_pri, unidad)
  loop

    /* Microciclo que ya exista para esa fecha. Nunca se crea ninguno:
       si no hay, v_micro queda null y la sesión nace libre. */
    v_micro := null;
    select mi.id into v_micro
      from microciclo mi
      join mesociclo me on me.id = mi.id_mesociclo
      join macrociclo ma on ma.id = me.id_macrociclo
     where ma.id_deportista = v_dep
       and mi.fecha_inicio <= s.fecha
       and mi.fecha_inicio > s.fecha - 7
     order by mi.fecha_inicio desc
     limit 1;

    insert into sesion (
      id_microciclo, id_deportista, fecha_sesion, disciplina, estado,
      rpe_estimado, rpe_reportado, duracion_minutos, duracion_real,
      modo_resistencia, notas_entrenador
    ) values (
      v_micro,
      case when v_micro is null then v_dep else null end,
      s.fecha, s.disc, 'Realizada',
      s.rpe_est, s.rpe_real, s.mins, s.mins,
      'compleja',
      '[demo] Sesión de ejemplo para la presentación.'
    ) returning id into v_ses;

    /* Tarea 1 — calentamiento */
    insert into tarea (
      id_sesion, orden, disciplina, zona_entrenamiento, series,
      rpe_reportado, fc_media, sensacion_tecnica, dolor_muscular
    ) values (
      v_ses, 1, s.disc, s.z_cal, 1,
      greatest(1, s.rpe_real - 2), round(s.fc * 0.82), s.sens, s.dolor
    ) returning id into v_tar;

    if s.unidad = 'metros' then
      insert into p_distancia (id_tarea, metros_planeados, metros_reales) values (v_tar, s.v_cal, s.v_cal);
    else
      insert into p_duracion (id_tarea, tiempo_planeado, tiempo_real) values (v_tar, s.v_cal, s.v_cal);
    end if;

    /* Tarea 2 — bloque principal. Lleva el feedback bueno: es de donde
       salen F1 y F4 del SICAT y los índices de percepción. */
    insert into tarea (
      id_sesion, orden, disciplina, zona_entrenamiento, series, descanso_segundos,
      rpe_reportado, fc_media, sensacion_tecnica, dolor_muscular, comentario
    ) values (
      v_ses, 2, s.disc, s.z_pri, 1, 60,
      s.rpe_real, s.fc, s.sens, s.dolor,
      'Bloque principal'
    ) returning id into v_tar;

    if s.unidad = 'metros' then
      insert into p_distancia (id_tarea, metros_planeados, metros_reales) values (v_tar, s.v_pri, s.v_pri);
    else
      insert into p_duracion (id_tarea, tiempo_planeado, tiempo_real) values (v_tar, s.v_pri, s.v_pri);
    end if;

    /* Tarea 3 — vuelta a la calma */
    insert into tarea (
      id_sesion, orden, disciplina, zona_entrenamiento, series,
      rpe_reportado, fc_media, sensacion_tecnica, dolor_muscular
    ) values (
      v_ses, 3, s.disc, 'AER', 1,
      greatest(1, s.rpe_real - 3), round(s.fc * 0.75), s.sens, s.dolor
    ) returning id into v_tar;

    if s.unidad = 'metros' then
      insert into p_distancia (id_tarea, metros_planeados, metros_reales) values (v_tar, 200, 200);
    else
      insert into p_duracion (id_tarea, tiempo_planeado, tiempo_real) values (v_tar, 480, 480);
    end if;

  end loop;
end $$;

/* ------------------------------------------------------------
   3. VERIFICACIÓN
   ------------------------------------------------------------ */
select 'wellness' as tabla, count(*) as filas
  from wellness where id_deportista = 14 and fecha >= '2026-07-07'
union all
select 'sesiones demo', count(*)
  from sesion where notas_entrenador like '[demo]%'
union all
select 'tareas de esas sesiones', count(*)
  from tarea t join sesion se on se.id = t.id_sesion
 where se.notas_entrenador like '[demo]%';

/* ------------------------------------------------------------
   4. DESHACER (ejecutar solo si quieres quitarlo todo)
   ------------------------------------------------------------

delete from p_distancia where id_tarea in (
  select t.id from tarea t join sesion s on s.id = t.id_sesion
   where s.notas_entrenador like '[demo]%');

delete from p_duracion where id_tarea in (
  select t.id from tarea t join sesion s on s.id = t.id_sesion
   where s.notas_entrenador like '[demo]%');

delete from tarea where id_sesion in (
  select id from sesion where notas_entrenador like '[demo]%');

delete from sesion where notas_entrenador like '[demo]%';

delete from wellness where id_deportista = 14
   and fecha between '2026-07-07' and '2026-07-30';

   ------------------------------------------------------------ */
