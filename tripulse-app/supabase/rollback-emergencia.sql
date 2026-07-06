-- ============================================================
-- TRIPULSE — ROLLBACK DE EMERGENCIA
-- ============================================================
-- SOLO ejecutar si tras la Fase B2 la app deja de funcionar y necesitas
-- volver al estado anterior (funcional) YA. Restaura acceso abierto a
-- usuarios autenticados en todas las tablas (como estaba antes).
-- NO es seguro — es un parche temporal para no quedarte bloqueado mientras
-- diagnosticamos. Después reintentamos la Fase B2 corregida.
-- ============================================================

do $$
declare
  t text;
  tablas text[] := array[
    'perfiles','deportista',
    'macrociclo','mesociclo','microciclo','sesion','tarea',
    'p_distancia','p_duracion','p_repeticiones','ejercicios','series_realizadas',
    'wellness','test1_carrera','test2_natacion','test3_ciclismo','test_fuerza','tests_libres',
    'anamnesis','disponibilidad','competicion','registro_peso','semana_bloqueada','dibujo_borrador',
    'mensajes','invitacion_deportista','ejercicios_biblioteca'
  ];
  r record;
begin
  foreach t in array tablas loop
    -- borrar todas las políticas de la tabla
    for r in select policyname from pg_policies where schemaname='public' and tablename=t loop
      execute format('drop policy if exists %I on %I', r.policyname, t);
    end loop;
    -- crear una política permisiva temporal (acceso abierto autenticado)
    execute format('create policy emergencia_open on %I for all using (auth.role() = ''authenticated'') with check (auth.role() = ''authenticated'')', t);
  end loop;
end $$;

select 'Rollback aplicado — acceso abierto restaurado (temporal)' as estado;
