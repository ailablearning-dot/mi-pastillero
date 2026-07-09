-- 003_fecha_inicio.sql
-- Agrega la fecha de inicio del tratamiento a `pastillas`.
--
-- Se usa como:
--   1) Ancla de las frecuencias por intervalo (ej. "Cada 3 días" cuenta desde aquí).
--   2) Inicio de la ventana del tratamiento (la pastilla no aparece antes de esta fecha).
--   3) Base para calcular la fecha final: fecha_inicio + duracion_tipo/duracion_valor.
--
-- Nullable: en filas existentes se usa `created_at` como fallback (ver isPillDueOnDay en App.jsx).

alter table public.pastillas
  add column if not exists fecha_inicio date;

comment on column public.pastillas.fecha_inicio is
  'Fecha de inicio del tratamiento (YYYY-MM-DD). Ancla de intervalos y ventana de tratamiento. Si es null, se usa created_at.';
