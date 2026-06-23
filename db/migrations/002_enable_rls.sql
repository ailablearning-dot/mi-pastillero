-- ============================================================
-- Migración: Activar RLS en pastillas y medicamentos
-- ============================================================
-- Estas tablas existían ANTES del soporte multipaciente y nunca tuvieron
-- Row Level Security habilitado, lo que significa que cualquier persona con
-- la `anon_key` (que es pública porque va en el bundle JS) podía leer/modificar
-- los datos de TODOS los usuarios vía REST API directa.
--
-- Esta migración:
-- 1. Habilita RLS en `pastillas` y `medicamentos`.
-- 2. Crea policies para que cada usuario sólo vea y modifique sus propias filas
--    (filtrado por user_id = auth.uid()).
--
-- Las queries existentes del cliente ya filtran por user_id en el código, así
-- que NO deberían fallar. La service_role key bypasea RLS, por lo que las
-- consultas de diagnóstico desde Claude/scripts siguen funcionando.
--
-- Es idempotente: usar DROP POLICY IF EXISTS antes de cada CREATE POLICY.
-- ============================================================

BEGIN;

-- ─── 1. Habilitar RLS ──────────────────────────────────────
ALTER TABLE pastillas ENABLE ROW LEVEL SECURITY;
ALTER TABLE medicamentos ENABLE ROW LEVEL SECURITY;

-- ─── 2. Policies de pastillas ──────────────────────────────
DROP POLICY IF EXISTS "pastillas_select_own" ON pastillas;
CREATE POLICY "pastillas_select_own"
  ON pastillas FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pastillas_insert_own" ON pastillas;
CREATE POLICY "pastillas_insert_own"
  ON pastillas FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pastillas_update_own" ON pastillas;
CREATE POLICY "pastillas_update_own"
  ON pastillas FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pastillas_delete_own" ON pastillas;
CREATE POLICY "pastillas_delete_own"
  ON pastillas FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 3. Policies de medicamentos ───────────────────────────
DROP POLICY IF EXISTS "medicamentos_select_own" ON medicamentos;
CREATE POLICY "medicamentos_select_own"
  ON medicamentos FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "medicamentos_insert_own" ON medicamentos;
CREATE POLICY "medicamentos_insert_own"
  ON medicamentos FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "medicamentos_update_own" ON medicamentos;
CREATE POLICY "medicamentos_update_own"
  ON medicamentos FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "medicamentos_delete_own" ON medicamentos;
CREATE POLICY "medicamentos_delete_own"
  ON medicamentos FOR DELETE
  USING (auth.uid() = user_id);

COMMIT;

-- ─── Verificación (correr aparte si quieres confirmar) ─────
-- SELECT tablename, rowsecurity FROM pg_tables WHERE tablename IN ('pastillas', 'medicamentos', 'pacientes');
-- SELECT tablename, policyname, cmd FROM pg_policies WHERE tablename IN ('pastillas', 'medicamentos') ORDER BY tablename, cmd;
