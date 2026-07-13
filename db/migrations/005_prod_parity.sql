-- 005_prod_parity.sql
-- Puesta al día del proyecto de PRODUCCIÓN (mi-pastillero, kbsxjdtdleauzvbtbrqi)
-- para dejarlo idéntico a dev. Aplicado el 2026-07-13.
--
-- Contexto: prod era el proyecto original (abril) y tenía solo `pastillas` y
-- `medicamentos` con políticas RLS VIEJAS E INSEGURAS ("acceso publico" ALL en
-- medicamentos = acceso abierto). Le faltaba toda la funcionalidad multipaciente,
-- fecha_inicio y es_default. Este script consolida el efecto de las migraciones
-- 001+002+003+004 sobre ese estado.
--
-- Antes de correr esto se BORRÓ la data de prueba vieja (13 pastillas, 164
-- medicamentos, 6 usuarios de auth) para arrancar el lanzamiento en limpio.
--
-- Idempotente. En un proyecto nuevo/vacío, correr 001→004 en orden logra lo mismo.

-- 1) Tabla pacientes (001 + 004)
create table if not exists public.pacientes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nombre text not null,
  emoji text default '👤',
  orden integer default 0,
  created_at timestamptz default now(),
  es_default boolean not null default false
);
create index if not exists idx_pacientes_user_id on public.pacientes(user_id);
alter table public.pacientes enable row level security;

drop policy if exists "pacientes_select_own" on public.pacientes;
create policy "pacientes_select_own" on public.pacientes for select using (auth.uid() = user_id);
drop policy if exists "pacientes_insert_own" on public.pacientes;
create policy "pacientes_insert_own" on public.pacientes for insert with check (auth.uid() = user_id);
drop policy if exists "pacientes_update_own" on public.pacientes;
create policy "pacientes_update_own" on public.pacientes for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "pacientes_delete_own" on public.pacientes;
create policy "pacientes_delete_own" on public.pacientes for delete using (auth.uid() = user_id);

create unique index if not exists uniq_paciente_default_por_usuario
  on public.pacientes (user_id) where es_default;

-- 2) paciente_id + fecha_inicio en pastillas (001 + 003)
alter table public.pastillas add column if not exists paciente_id uuid references public.pacientes(id) on delete cascade;
alter table public.pastillas add column if not exists fecha_inicio date;
alter table public.pastillas alter column paciente_id set not null;
create index if not exists idx_pastillas_paciente_id on public.pastillas(paciente_id);

-- 3) paciente_id en medicamentos (001)
alter table public.medicamentos add column if not exists paciente_id uuid references public.pacientes(id) on delete cascade;
alter table public.medicamentos alter column paciente_id set not null;
create index if not exists idx_medicamentos_paciente_id on public.medicamentos(paciente_id);

-- 4) Reemplazar políticas viejas inseguras por las seguras (002)
drop policy if exists "acceso publico" on public.medicamentos;
drop policy if exists "usuario ve sus pastillas" on public.pastillas;

alter table public.pastillas enable row level security;
drop policy if exists "pastillas_select_own" on public.pastillas;
create policy "pastillas_select_own" on public.pastillas for select using (auth.uid() = user_id);
drop policy if exists "pastillas_insert_own" on public.pastillas;
create policy "pastillas_insert_own" on public.pastillas for insert with check (auth.uid() = user_id);
drop policy if exists "pastillas_update_own" on public.pastillas;
create policy "pastillas_update_own" on public.pastillas for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "pastillas_delete_own" on public.pastillas;
create policy "pastillas_delete_own" on public.pastillas for delete using (auth.uid() = user_id);

alter table public.medicamentos enable row level security;
drop policy if exists "medicamentos_select_own" on public.medicamentos;
create policy "medicamentos_select_own" on public.medicamentos for select using (auth.uid() = user_id);
drop policy if exists "medicamentos_insert_own" on public.medicamentos;
create policy "medicamentos_insert_own" on public.medicamentos for insert with check (auth.uid() = user_id);
drop policy if exists "medicamentos_update_own" on public.medicamentos;
create policy "medicamentos_update_own" on public.medicamentos for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
drop policy if exists "medicamentos_delete_own" on public.medicamentos;
create policy "medicamentos_delete_own" on public.medicamentos for delete using (auth.uid() = user_id);
