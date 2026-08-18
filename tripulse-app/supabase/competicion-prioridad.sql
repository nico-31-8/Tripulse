/* ============================================================
   TRIPULSE — Importancia de cada competición (A / B / C)
   ============================================================

   No todas las carreras de una temporada valen lo mismo, y la diferencia no
   es de adorno: cambia el tapering, y con él las dos o tres semanas
   anteriores. B1-02 §Paso 1 las clasifica en tres:

     A  principal        tapering completo, 10-21 dias      1-3 al ano
     B  secundaria       reduccion de 5-7 dias              2-4 al ano
     C  de entrenamiento sin cambio de carga                las que quieras

   POR QUE EL DEFECTO ES 'B'
   Con 'A' cada carrera existente dispararia un tapering completo y el plan se
   llenaria de semanas suaves. Con 'C', ninguna lo haria y el atleta llegaria
   fundido a su objetivo. La intermedia es la unica que se equivoca poco en
   las dos direcciones.

   ADITIVO Y NO DESTRUCTIVO. Las competiciones que ya existen se quedan como
   estan y pasan a ser 'B'; el entrenador cambia las que sean otra cosa.
   Idempotente: se puede reejecutar.
   ============================================================ */

alter table competicion add column if not exists prioridad text default 'B';

comment on column competicion.prioridad is
  'Importancia de la carrera: A principal, B secundaria, C de entrenamiento (B1-02)';

/* Las filas anteriores a esta columna. El default solo aplica a las nuevas
   cuando la columna ya existia de una ejecucion previa. */
update competicion set prioridad = 'B' where prioridad is null;

/* La restriccion admite null a proposito: si algun dia una fila entra sin
   prioridad, es mejor que se guarde y la app la lea como 'B' a que reviente
   el insert de una competicion por un campo de clasificacion. */
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'competicion_prioridad_valida'
  ) then
    alter table competicion add constraint competicion_prioridad_valida
      check (prioridad is null or prioridad in ('A', 'B', 'C'));
  end if;
end $$;

create index if not exists competicion_prioridad_idx on competicion (id_deportista, prioridad);
