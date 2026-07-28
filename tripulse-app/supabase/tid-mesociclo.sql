/* ============================================================
   TRIPULSE — Distribución de intensidad (TID) objetivo del mesociclo
   Ejecutar en: Supabase Dashboard > SQL Editor

   Qué reparto de intensidad se busca en ESE bloque:
     'polarizado' -> 75-80% suave · <10% media · 15-20% alta
     'piramidal'  -> 75-80% suave · 10-20% media · 5-10% alta
     'umbral'     -> 40-55% suave · 35-50% media · 5-15% alta

   Va en el mesociclo y no en el macrociclo porque el modelo cambia por fase:
   piramidal en preparación general, polarizado en específica y tapering
   (ver B1-06 del vault). Nulo = sin declarar; entonces Volumen describe
   la distribución pero no la juzga.
   ============================================================ */

alter table mesociclo add column if not exists tid_objetivo text;

/* Verificación */
select tid_objetivo, count(*) from mesociclo group by tid_objetivo;
