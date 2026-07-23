/*
  Indices para claves foraneas sin cubrir (auditoria de escalado 2026-07-23).
  Postgres NO indexa las FK automaticamente. Sin indice, cada join por esa
  columna escanea la tabla entera, y borrar/actualizar un padre escanea al hijo.
  Todas son "if not exists": seguras de re-ejecutar. Ordenadas de mas a menos
  importante. En tablas grandes se usaria "create index concurrently" (fuera de
  transaccion); a la escala actual un create index normal es instantaneo.
*/

create index if not exists idx_series_realizadas_ejercicio on series_realizadas(id_ejercicio);
create index if not exists idx_ejercicios_tarea            on ejercicios(id_tarea);
create index if not exists idx_p_distancia_tarea           on p_distancia(id_tarea);
create index if not exists idx_p_duracion_tarea            on p_duracion(id_tarea);
create index if not exists idx_p_repeticiones_tarea        on p_repeticiones(id_tarea);
create index if not exists idx_ejercicios_encadenado       on ejercicios(ejercicio_encadenado_id);
create index if not exists idx_volumen_muscular_micro      on volumen_muscular(id_microciclo);

create index if not exists idx_carga_dep                   on carga(id_deportista);
create index if not exists idx_wellness_dep                on wellness(id_deportista);
create index if not exists idx_registro_peso_dep           on registro_peso(id_deportista);
create index if not exists idx_puntuacion_eco_dep          on puntuacion_eco(id_deportista);
create index if not exists idx_dibujo_borrador_dep         on dibujo_borrador(id_deportista);
create index if not exists idx_zonas_entrenamiento_dep     on zonas_entrenamiento(id_deportista);
create index if not exists idx_anamnesis_dep               on anamnesis(id_deportista);
create index if not exists idx_test_fuerza_dep             on test_fuerza(id_deportista);
create index if not exists idx_test1_carrera_dep           on test1_carrera(id_deportista);
create index if not exists idx_test2_natacion_dep          on test2_natacion(id_deportista);
create index if not exists idx_test3_ciclismo_dep          on test3_ciclismo(id_deportista);
create index if not exists idx_tests_libres_dep            on tests_libres(id_deportista);

create index if not exists idx_club_creado_por             on club(creado_por);
create index if not exists idx_grupo_club                  on grupo(id_club);
create index if not exists idx_grupo_creado_por            on grupo(creado_por);
create index if not exists idx_reto_grupo                  on reto(id_grupo);
create index if not exists idx_reto_creado_por             on reto(creado_por);
create index if not exists idx_reto_club                   on reto(id_club);
create index if not exists idx_evento_creado_por           on evento(creado_por);
create index if not exists idx_invitacion_club_invitado_por on invitacion_club(invitado_por);
create index if not exists idx_invitacion_deportista_dep   on invitacion_deportista(id_deportista);
create index if not exists idx_invitacion_deportista_ent   on invitacion_deportista(id_entrenador);
