/* ============================================================
   Nombres de ejercicio con espacios de sobra (2026-09-25)
   ============================================================
   Tres ejercicios de la biblioteca acababan en espacio:

     [Press Plano con Mancuerna ]      Pectoral        0 usos
     [sentadilla Sumo ]                Cuádriceps      0 usos
     [Curl femoral en maquina tumbado ] Isquiotibiales 4 usos

   Con desplegables daba igual. Con el buscador de ejercicios importa: se busca
   por nombre, y un espacio al final descoloca comparaciones y ordenaciones.

   EL HISTÓRICO SE ARRASTRA, y esto es lo importante. `ejercicios.nombre` es una
   COPIA que se hizo al prescribir, y el «la última vez» de la fuerza casa por
   ESE nombre, no por el id. Cambiar solo la biblioteca partiría la progresión
   del curl femoral en dos: lo de antes bajo el nombre con espacio y lo de ahora
   bajo el nombre limpio, sin que nada lo dijera. Es la misma razón por la que
   `editarEjercicioPropio` (lib/ejercicio-propio) arrastra el renombrado.

   La mayúscula de «sentadilla Sumo» se corrige de paso: el resto de la familia
   son «Sentadilla goblet» y «Sentadilla bulgara». */

UPDATE ejercicios SET nombre = 'Sentadilla sumo' WHERE nombre = 'sentadilla Sumo ';
UPDATE ejercicios_biblioteca SET nombre = 'Sentadilla sumo' WHERE nombre = 'sentadilla Sumo ';

UPDATE ejercicios SET nombre = 'Press Plano con Mancuerna' WHERE nombre = 'Press Plano con Mancuerna ';
UPDATE ejercicios_biblioteca SET nombre = 'Press Plano con Mancuerna' WHERE nombre = 'Press Plano con Mancuerna ';

UPDATE ejercicios SET nombre = 'Curl femoral en maquina tumbado' WHERE nombre = 'Curl femoral en maquina tumbado ';
UPDATE ejercicios_biblioteca SET nombre = 'Curl femoral en maquina tumbado' WHERE nombre = 'Curl femoral en maquina tumbado ';
