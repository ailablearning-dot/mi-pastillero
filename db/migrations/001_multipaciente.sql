-- ============================================================
-- Migración: Soporte multipaciente
-- ============================================================
-- Esta migración:
-- 1. Crea la tabla `pacientes` con RLS por user_id.
-- 2. Agrega columna `paciente_id` a `pastillas` y `medicamentos`.
-- 3. Crea un paciente "Yo" por cada usuario con datos existentes.
-- 4. Asigna `paciente_id` a todas las pastillas y medicamentos previos.
-- 5. Pone `paciente_id` como NOT NULL después del backfill.
--
-- Es idempotente: usa IF NOT EXISTS y filtros para que correrla
-- dos veces no rompa nada (los INSERT/UPDATE son condicionales).
-- ============================================================

BEGIN;

-- ─── 0. Limpiar filas huérfanas ────────────────────────────
-- Borra pastillas/medicamentos cuyo user_id ya no existe en auth.users
-- (datos zombi de cuentas eliminadas que no son recuperables).
DELETE FROM medicamentos
  WHERE user_id IS NOT NULL
    AND user_id NOT IN (SELECT id FROM auth.users);

DELETE FROM pastillas
  WHERE user_id IS NOT NULL
    AND user_id NOT IN (SELECT id FROM auth.users);

-- ─── 1. Tabla pacientes ────────────────────────────────────
CREATE TABLE IF NOT EXISTS pacientes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nombre      text NOT NULL,
  emoji       text DEFAULT '👤',
  orden       integer DEFAULT 0,
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pacientes_user_id ON pacientes(user_id);

-- ─── 2. RLS para pacientes ─────────────────────────────────
ALTER TABLE pacientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pacientes_select_own" ON pacientes;
CREATE POLICY "pacientes_select_own"
  ON pacientes FOR SELECT
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pacientes_insert_own" ON pacientes;
CREATE POLICY "pacientes_insert_own"
  ON pacientes FOR INSERT
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "pacientes_update_own" ON pacientes;
CREATE POLICY "pacientes_update_own"
  ON pacientes FOR UPDATE
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "pacientes_delete_own" ON pacientes;
CREATE POLICY "pacientes_delete_own"
  ON pacientes FOR DELETE
  USING (auth.uid() = user_id);

-- ─── 3. Columna paciente_id en pastillas y medicamentos ────
ALTER TABLE pastillas
  ADD COLUMN IF NOT EXISTS paciente_id uuid
  REFERENCES pacientes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_pastillas_paciente_id ON pastillas(paciente_id);

ALTER TABLE medicamentos
  ADD COLUMN IF NOT EXISTS paciente_id uuid
  REFERENCES pacientes(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_medicamentos_paciente_id ON medicamentos(paciente_id);

-- ─── 4. Crear paciente "Yo" para cada user_id con datos ────
-- Solo inserta si el usuario NO tiene ya un paciente (re-ejecutable).
INSERT INTO pacientes (user_id, nombre, emoji, orden)
SELECT DISTINCT u.user_id, 'Yo', '👤', 0
FROM (
  SELECT user_id FROM pastillas WHERE user_id IS NOT NULL
  UNION
  SELECT user_id FROM medicamentos WHERE user_id IS NOT NULL
) AS u
WHERE NOT EXISTS (
  SELECT 1 FROM pacientes p WHERE p.user_id = u.user_id
);

-- ─── 5. Backfill paciente_id en pastillas y medicamentos ───
-- Asigna el primer paciente (por created_at) del usuario a cada fila.
UPDATE pastillas p
SET paciente_id = (
  SELECT id FROM pacientes pa
  WHERE pa.user_id = p.user_id
  ORDER BY pa.created_at ASC, pa.id ASC
  LIMIT 1
)
WHERE paciente_id IS NULL;

UPDATE medicamentos m
SET paciente_id = (
  SELECT id FROM pacientes pa
  WHERE pa.user_id = m.user_id
  ORDER BY pa.created_at ASC, pa.id ASC
  LIMIT 1
)
WHERE paciente_id IS NULL;

-- ─── 6. Hacer paciente_id NOT NULL ─────────────────────────
-- Solo si todas las filas ya tienen valor (que es el caso post-backfill).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pastillas WHERE paciente_id IS NULL) THEN
    ALTER TABLE pastillas ALTER COLUMN paciente_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM medicamentos WHERE paciente_id IS NULL) THEN
    ALTER TABLE medicamentos ALTER COLUMN paciente_id SET NOT NULL;
  END IF;
END $$;

COMMIT;

-- ─── Verificaciones (correr aparte si quieres confirmar) ───
-- SELECT user_id, COUNT(*) FROM pacientes GROUP BY user_id;
-- SELECT COUNT(*) FROM pastillas WHERE paciente_id IS NULL;
-- SELECT COUNT(*) FROM medicamentos WHERE paciente_id IS NULL;
