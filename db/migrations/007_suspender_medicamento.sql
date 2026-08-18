-- 007_suspender_medicamento.sql
-- Permite SUSPENDER un medicamento sin borrarlo.
--
-- Motivo: hoy la única salida es eliminarlo, y eso tira información que el paciente necesita.
-- El caso real es el que reportó una usuaria: "muchas veces un médico pregunta ¿qué medicamento
-- tomabas antes? y el paciente ya no se acuerda". Un medicamento suspendido deja de recordarse y
-- de contar para el día, pero SIGUE en la lista y en el historial.
--
-- Se guarda la FECHA, no un booleano: además de decir "está suspendido" dice DESDE CUÁNDO, que es
-- justo lo que se le enseña al médico ("Enalapril — suspendido en marzo 2026").
--
-- Y por eso mismo el corte es por fecha y no un simple "no aparece": si un medicamento suspendido
-- desapareciera de todos los días, el calendario recalcularía los días PASADOS como si nunca
-- hubiera existido y se perdería el historial de cumplimiento ya registrado. Se trata igual que el
-- fin de un tratamiento: deja de tocar a partir de `suspendido_en`, y antes de esa fecha no cambia.
--
-- Aditivo, nullable e idempotente: null = activo, que es como quedan todas las filas existentes.

alter table public.pastillas
  add column if not exists suspendido_en date;

comment on column public.pastillas.suspendido_en is
  'Fecha en que se suspendió el medicamento (YYYY-MM-DD). NULL = activo. A partir de esta fecha deja de generar dosis y recordatorios, pero se conserva en la lista y el historial anterior permanece intacto. Ver isPillDueOnDay en src/domain/schedule.js.';

-- Los listados separan activos de suspendidos, así que conviene el índice parcial.
create index if not exists pastillas_suspendidos_idx
  on public.pastillas (paciente_id, suspendido_en)
  where suspendido_en is not null;
