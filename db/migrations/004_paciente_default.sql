-- 004_paciente_default.sql
-- Marca al paciente "Yo" por defecto con una bandera y garantiza que solo pueda
-- haber UNO por usuario.
--
-- Contexto: el paciente "Yo" se auto-crea en el primer login de un usuario nuevo
-- (App.jsx, efecto que corre cuando pacientes.length === 0). Ese efecto se dispara
-- dos veces por eventos de auth casi simultáneos (INITIAL_SESSION + SIGNED_IN) →
-- condición de carrera → dos "Yo" duplicados (visto en prod-dev con la usuaria Lid,
-- agravado por lentitud de Supabase). El guard en el cliente reduce el riesgo, pero
-- este índice único parcial es la red de seguridad definitiva: si la carrera intenta
-- crear el segundo default, la BD lo rechaza.
--
-- La UI sigue mostrando el nombre tal cual ("Yo"); es_default es solo para integridad.

alter table public.pacientes
  add column if not exists es_default boolean not null default false;

comment on column public.pacientes.es_default is
  'True para el paciente por defecto auto-creado ("Yo"). Máximo uno por usuario (ver índice uniq_paciente_default_por_usuario).';

-- Backfill: marca el "Yo" existente de cada usuario como default.
-- (Prerrequisito: no debe haber "Yo" duplicados; se limpiaron antes de correr esto.)
update public.pacientes
  set es_default = true
  where nombre = 'Yo';

-- Red de seguridad: a lo sumo un paciente por defecto por usuario.
create unique index if not exists uniq_paciente_default_por_usuario
  on public.pacientes (user_id)
  where es_default;
