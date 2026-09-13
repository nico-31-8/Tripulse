/* ============================================================
   TRIPULSE: la nota del entrenador al cerrar una sesión dirigida (2026-09-11)
   ============================================================
   El modo entrenador (/sesion/[id]/dirigir) tiene una casilla «Nota de la
   sesión» y la guardaba en sesion.notas_post, que NO EXISTÍA. PostgREST rechaza
   la escritura entera cuando le llega una columna desconocida: la sesión no se
   marcaba como hecha y el RPE no se guardaba, sin ningún aviso. Solo cuando se
   escribía la nota. Comprobado antes de aplicar: ninguna sesión se había
   cerrado todavía con el modo entrenador, así que no se perdió nada.

   Va en la sesión y no en las tareas a propósito: tarea.notas_post son los
   comentarios del ATLETA (salen en Comunicación y cuentan en el aviso de «sin
   revisar»). La nota del entrenador en su propio modo no es un mensaje que
   tenga que revisar él mismo.

   Solo añade una columna vacía. Deshacer: drop column. */

alter table public.sesion add column if not exists notas_post text;

comment on column public.sesion.notas_post is
  'Nota del entrenador al cerrar una sesión en modo dirigir. Los comentarios del atleta van en tarea.notas_post.';
