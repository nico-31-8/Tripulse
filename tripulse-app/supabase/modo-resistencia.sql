/* ============================================================
   TRIPULSE — Modo de sesión de resistencia (Zonas 2)
   Ejecutar en: Supabase Dashboard > SQL Editor

   Equivalente a modo-fuerza.sql pero para Natación / Ciclismo / Carrera.
   Solo se usa cuando el deportista tiene sistema_zonas = 2 (Zonas 2).

     modo_resistencia: 'simple'   -> una zona para toda la sesión
                       'compleja' -> cada tarea elige su zona
     zona_resistencia: sigla de la zona cuando la sesión es simple
                       (AER, AEL, AEM, AEI, PAE, CLA, PLA, CALA, PALA)
   ============================================================ */

alter table sesion add column if not exists modo_resistencia text;
alter table sesion add column if not exists zona_resistencia text;

/* Verificación */
select modo_resistencia, count(*) from sesion
where disciplina in ('Natacion', 'Ciclismo', 'Carrera')
group by modo_resistencia;
