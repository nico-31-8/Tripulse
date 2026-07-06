-- ============================================================
-- TRIPULSE — Row Level Security
-- Ejecutar en: Supabase Dashboard > SQL Editor
-- ============================================================
-- Modelo de acceso:
--   Entrenador (perfiles.rol = 'entrenador'):
--     CRUD completo sobre los deportistas que le pertenecen
--     y toda la jerarquía debajo de ellos.
--   Deportista (perfiles.rol = 'deportista'):
--     Acceso (lectura + actualización limitada) solo a sus
--     propios datos. Vinculado via deportista.id_usuario = auth.uid()
-- ============================================================


-- ------------------------------------------------------------
-- 1. PERFILES
-- ------------------------------------------------------------
ALTER TABLE perfiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "perfiles_own"
  ON perfiles FOR ALL
  USING (id = auth.uid());


-- ------------------------------------------------------------
-- 2. DEPORTISTA
-- ------------------------------------------------------------
ALTER TABLE deportista ENABLE ROW LEVEL SECURITY;

-- Entrenador: gestiona sus propios deportistas
CREATE POLICY "deportista_entrenador"
  ON deportista FOR ALL
  USING (id_entrenador = auth.uid());

-- Deportista: lee su propio registro
CREATE POLICY "deportista_self"
  ON deportista FOR SELECT
  USING (id_usuario = auth.uid());


-- ------------------------------------------------------------
-- 3. MACROCICLO
-- ------------------------------------------------------------
ALTER TABLE macrociclo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "macrociclo_entrenador"
  ON macrociclo FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM deportista d
      WHERE d.id = macrociclo.id_deportista
        AND d.id_entrenador = auth.uid()
    )
  );

CREATE POLICY "macrociclo_deportista"
  ON macrociclo FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deportista d
      WHERE d.id = macrociclo.id_deportista
        AND d.id_usuario = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 4. MESOCICLO
-- ------------------------------------------------------------
ALTER TABLE mesociclo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mesociclo_entrenador"
  ON mesociclo FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM macrociclo ma
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE ma.id = mesociclo.id_macrociclo
        AND d.id_entrenador = auth.uid()
    )
  );

CREATE POLICY "mesociclo_deportista"
  ON mesociclo FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM macrociclo ma
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE ma.id = mesociclo.id_macrociclo
        AND d.id_usuario = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 5. MICROCICLO
-- ------------------------------------------------------------
ALTER TABLE microciclo ENABLE ROW LEVEL SECURITY;

CREATE POLICY "microciclo_entrenador"
  ON microciclo FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM mesociclo me
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE me.id = microciclo.id_mesociclo
        AND d.id_entrenador = auth.uid()
    )
  );

CREATE POLICY "microciclo_deportista"
  ON microciclo FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM mesociclo me
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE me.id = microciclo.id_mesociclo
        AND d.id_usuario = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 6. SESION
-- Deportista tiene ALL: necesita UPDATE para marcar como Realizada
-- ------------------------------------------------------------
ALTER TABLE sesion ENABLE ROW LEVEL SECURITY;

CREATE POLICY "sesion_entrenador"
  ON sesion FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM microciclo mi
      JOIN mesociclo me ON me.id = mi.id_mesociclo
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE mi.id = sesion.id_microciclo
        AND d.id_entrenador = auth.uid()
    )
  );

CREATE POLICY "sesion_deportista"
  ON sesion FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM microciclo mi
      JOIN mesociclo me ON me.id = mi.id_mesociclo
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE mi.id = sesion.id_microciclo
        AND d.id_usuario = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 7. TAREA
-- Deportista tiene ALL: necesita UPDATE para guardar RPE post-sesión
-- ------------------------------------------------------------
ALTER TABLE tarea ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tarea_entrenador"
  ON tarea FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sesion s
      JOIN microciclo mi ON mi.id = s.id_microciclo
      JOIN mesociclo me ON me.id = mi.id_mesociclo
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE s.id = tarea.id_sesion
        AND d.id_entrenador = auth.uid()
    )
  );

CREATE POLICY "tarea_deportista"
  ON tarea FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM sesion s
      JOIN microciclo mi ON mi.id = s.id_microciclo
      JOIN mesociclo me ON me.id = mi.id_mesociclo
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE s.id = tarea.id_sesion
        AND d.id_usuario = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 8. P_DISTANCIA, P_DURACION, P_REPETICIONES, EJERCICIOS
-- Misma lógica: accesible si puedes acceder a la tarea padre
-- ------------------------------------------------------------
ALTER TABLE p_distancia ENABLE ROW LEVEL SECURITY;
CREATE POLICY "p_distancia_access"
  ON p_distancia FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tarea t
      JOIN sesion s ON s.id = t.id_sesion
      JOIN microciclo mi ON mi.id = s.id_microciclo
      JOIN mesociclo me ON me.id = mi.id_mesociclo
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE t.id = p_distancia.id_tarea
        AND (d.id_entrenador = auth.uid() OR d.id_usuario = auth.uid())
    )
  );

ALTER TABLE p_duracion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "p_duracion_access"
  ON p_duracion FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tarea t
      JOIN sesion s ON s.id = t.id_sesion
      JOIN microciclo mi ON mi.id = s.id_microciclo
      JOIN mesociclo me ON me.id = mi.id_mesociclo
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE t.id = p_duracion.id_tarea
        AND (d.id_entrenador = auth.uid() OR d.id_usuario = auth.uid())
    )
  );

ALTER TABLE p_repeticiones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "p_repeticiones_access"
  ON p_repeticiones FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tarea t
      JOIN sesion s ON s.id = t.id_sesion
      JOIN microciclo mi ON mi.id = s.id_microciclo
      JOIN mesociclo me ON me.id = mi.id_mesociclo
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE t.id = p_repeticiones.id_tarea
        AND (d.id_entrenador = auth.uid() OR d.id_usuario = auth.uid())
    )
  );

ALTER TABLE ejercicios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ejercicios_access"
  ON ejercicios FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM tarea t
      JOIN sesion s ON s.id = t.id_sesion
      JOIN microciclo mi ON mi.id = s.id_microciclo
      JOIN mesociclo me ON me.id = mi.id_mesociclo
      JOIN macrociclo ma ON ma.id = me.id_macrociclo
      JOIN deportista d ON d.id = ma.id_deportista
      WHERE t.id = ejercicios.id_tarea
        AND (d.id_entrenador = auth.uid() OR d.id_usuario = auth.uid())
    )
  );


-- ------------------------------------------------------------
-- 9. WELLNESS
-- ------------------------------------------------------------
ALTER TABLE wellness ENABLE ROW LEVEL SECURITY;

CREATE POLICY "wellness_entrenador"
  ON wellness FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM deportista d
      WHERE d.id = wellness.id_deportista
        AND d.id_entrenador = auth.uid()
    )
  );

CREATE POLICY "wellness_deportista"
  ON wellness FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM deportista d
      WHERE d.id = wellness.id_deportista
        AND d.id_usuario = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 10. TESTS (carrera, natacion, ciclismo)
-- ------------------------------------------------------------
ALTER TABLE test1_carrera ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test1_entrenador" ON test1_carrera FOR ALL
  USING (EXISTS (SELECT 1 FROM deportista d WHERE d.id = test1_carrera.id_deportista AND d.id_entrenador = auth.uid()));
CREATE POLICY "test1_deportista" ON test1_carrera FOR SELECT
  USING (EXISTS (SELECT 1 FROM deportista d WHERE d.id = test1_carrera.id_deportista AND d.id_usuario = auth.uid()));

ALTER TABLE test2_natacion ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test2_entrenador" ON test2_natacion FOR ALL
  USING (EXISTS (SELECT 1 FROM deportista d WHERE d.id = test2_natacion.id_deportista AND d.id_entrenador = auth.uid()));
CREATE POLICY "test2_deportista" ON test2_natacion FOR SELECT
  USING (EXISTS (SELECT 1 FROM deportista d WHERE d.id = test2_natacion.id_deportista AND d.id_usuario = auth.uid()));

ALTER TABLE test3_ciclismo ENABLE ROW LEVEL SECURITY;
CREATE POLICY "test3_entrenador" ON test3_ciclismo FOR ALL
  USING (EXISTS (SELECT 1 FROM deportista d WHERE d.id = test3_ciclismo.id_deportista AND d.id_entrenador = auth.uid()));
CREATE POLICY "test3_deportista" ON test3_ciclismo FOR SELECT
  USING (EXISTS (SELECT 1 FROM deportista d WHERE d.id = test3_ciclismo.id_deportista AND d.id_usuario = auth.uid()));


-- ------------------------------------------------------------
-- 11. MENSAJES (chat)
-- Ambos participantes ven e insertan en su conversación
-- ------------------------------------------------------------
ALTER TABLE mensajes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "mensajes_entrenador"
  ON mensajes FOR ALL
  USING (id_entrenador = auth.uid());

CREATE POLICY "mensajes_deportista"
  ON mensajes FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM deportista d
      WHERE d.id = mensajes.id_deportista
        AND d.id_usuario = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- 12. EJERCICIOS_BIBLIOTECA
-- Catálogo global: todos los autenticados leen, nadie escribe
-- (las altas las hace el entrenador desde el dashboard de Supabase)
-- ------------------------------------------------------------
ALTER TABLE ejercicios_biblioteca ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ejercicios_biblioteca_read"
  ON ejercicios_biblioteca FOR SELECT
  USING (auth.role() = 'authenticated');


-- ------------------------------------------------------------
-- 13. DISPONIBILIDAD
-- ------------------------------------------------------------
ALTER TABLE disponibilidad ENABLE ROW LEVEL SECURITY;

CREATE POLICY "disponibilidad_entrenador"
  ON disponibilidad FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM deportista d
      WHERE d.id = disponibilidad.id_deportista
        AND d.id_entrenador = auth.uid()
    )
  );

CREATE POLICY "disponibilidad_deportista"
  ON disponibilidad FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM deportista d
      WHERE d.id = disponibilidad.id_deportista
        AND d.id_usuario = auth.uid()
    )
  );


-- ------------------------------------------------------------
-- VERIFICACIÓN (ejecutar aparte para confirmar)
-- ------------------------------------------------------------
-- SELECT tablename, rowsecurity
-- FROM pg_tables
-- WHERE schemaname = 'public'
-- ORDER BY tablename;
