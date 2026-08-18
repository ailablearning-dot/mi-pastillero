-- 008_medicos_y_citas.sql
-- Base de datos para CITAS médicas, y de paso las dos columnas de medicamentos que faltaban.
--
-- Van juntas en una sola migración porque comparten dependencia: `pastillas.medico_id` y
-- `citas.medico_id` apuntan las dos a `medicos`, así que la tabla tiene que nacer antes que
-- cualquiera de las dos. Partirlo en dos migraciones obligaría a correrlas en orden estricto
-- sin ganar nada.
--
-- POR QUÉ `medicos` ES UNA TABLA Y NO UN TEXTO LIBRE
-- Si el médico se guarda como texto en cada fila, en unos meses conviven "Dr. Juan Pérez",
-- "juan perez" y "Dr Perez" como si fueran tres personas: el filtro por médico deja de servir
-- y arreglarlo después es una migración de normalización, que es justo lo caro. El catálogo
-- **no se captura, se acumula**: cada vez que se nombra un médico se reutiliza el que ya está
-- o se crea uno nuevo, sin pantalla de "alta de médicos" (UI = combobox, escribir libre con
-- sugerencias).
--
-- Y cuelga del USUARIO, no del paciente: el mismo pediatra atiende a los dos hijos, y el mismo
-- cardiólogo puede ver al padre y a la madre. Colgarlo del paciente obligaría a capturarlo dos
-- veces y volvería a partir el catálogo.
--
-- Todo es ADITIVO, nullable e idempotente: las filas existentes no se tocan, el código actual
-- las sigue leyendo igual, y correr esta migración dos veces no rompe nada.

begin;

-- ════════════════════════════════════════════════════════════
-- 1. Catálogo de médicos
-- ════════════════════════════════════════════════════════════

create table if not exists public.medicos (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  nombre       text not null,
  especialidad text,
  -- Los tres de abajo son de la Ola 2 (ficha del médico / "llamar al consultorio"). Se crean
  -- ya para no volver a tocar la tabla; hoy el formulario no los pide y quedan en null.
  telefono     text,
  hospital     text,
  correo       text,
  created_at   timestamptz default now()
);

comment on table public.medicos is
  'Catálogo de médicos del usuario. Se acumula solo: no hay pantalla de alta, cada vez que se nombra un médico en una cita o en un medicamento se reutiliza el existente o se crea. Cuelga del usuario (no del paciente) para poder compartir el mismo médico entre varios pacientes.';

comment on column public.medicos.nombre is
  'Nombre tal como lo escribió el usuario, con su capitalización. La deduplicación NO se hace sobre este valor sino sobre el índice único normalizado de abajo, para que "Dr. Juan Pérez" y "dr. juan pérez" no acaben siendo dos médicos.';

comment on column public.medicos.telefono is
  'Ola 2 (ficha del médico). Hoy el formulario no lo pide.';

create index if not exists idx_medicos_user_id on public.medicos(user_id);

-- Deduplicación en la BD, no solo en el cliente. El combobox busca antes de crear, pero eso es
-- una carrera: dos altas casi simultáneas (o una que sube desde la cola offline) meterían el
-- mismo médico dos veces. Con este índice el segundo insert choca y el cliente puede resolverlo
-- con `on conflict` en vez de duplicar.
--
-- Normaliza minúsculas y espacios sobrantes. NO normaliza acentos a propósito: "Pérez" y "Perez"
-- se quedan como médicos distintos. Quitar acentos necesita la extensión `unaccent` y además
-- fundiría nombres legítimamente distintos; el combobox ya sugiere por coincidencia parcial, que
-- es el sitio correcto para resolver ese caso (lo decide la persona, no un índice).
create unique index if not exists medicos_user_nombre_uniq
  on public.medicos (user_id, lower(btrim(nombre)));

-- ─── RLS de medicos (mismo patrón que 002_enable_rls.sql) ───
alter table public.medicos enable row level security;

drop policy if exists "medicos_select_own" on public.medicos;
create policy "medicos_select_own"
  on public.medicos for select
  using (auth.uid() = user_id);

drop policy if exists "medicos_insert_own" on public.medicos;
create policy "medicos_insert_own"
  on public.medicos for insert
  with check (auth.uid() = user_id);

drop policy if exists "medicos_update_own" on public.medicos;
create policy "medicos_update_own"
  on public.medicos for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "medicos_delete_own" on public.medicos;
create policy "medicos_delete_own"
  on public.medicos for delete
  using (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 2. Citas
-- ════════════════════════════════════════════════════════════

create table if not exists public.citas (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  paciente_id        uuid not null references public.pacientes(id) on delete cascade,
  -- Nullable y ON DELETE SET NULL: se puede agendar "análisis de sangre" sin médico, y borrar
  -- un médico del catálogo no debe llevarse por delante el historial de citas.
  medico_id          uuid references public.medicos(id) on delete set null,
  tipo               text not null default 'consulta',
  motivo             text,
  fecha              date not null,
  hora               time,
  lugar              text,
  notas              text,
  avisar_horas_antes integer default 24,
  created_at         timestamptz default now()
);

comment on column public.citas.tipo is
  'consulta | estudio | laboratorio | vacuna | seguimiento | renovacion | otro. Sin acentos, igual que pastillas.tipo, para que el valor guardado no dependa de la codificación. La etiqueta legible ("Renovación de medicamentos") la pone src/domain/citas.js.';

comment on column public.citas.hora is
  'Hora de la cita, NULLABLE a propósito: hay citas que son "ese día" sin hora fija (un estudio al que se llega en ayunas cuando abren, una vacuna de campaña). Cuando es null la cita se muestra sin hora y el aviso se calcula sobre una hora de referencia que fija src/domain/citas.js, no sobre las 00:00.';

comment on column public.citas.avisar_horas_antes is
  'Cuántas horas antes avisar: 24 = el día antes (por defecto), 2, 1, o 0 = a la hora. NULL = sin aviso. Es UNO solo, no una lista: dos avisos por cita multiplican el gasto del presupuesto de notificaciones de iOS, que ya se comparte con las dosis (ver NOTIF_CAP en src/lib/notifications.js).';

comment on column public.citas.motivo is
  'Para qué es la cita, en palabras del usuario ("revisión de la presión"). Distinto de `notas`, que es lo que hay que recordar llevar o hacer ("llevar estudios previos", "acudir en ayunas").';

-- Barrera de datos: que la BD rechace lo que el formulario no debería dejar pasar. Es la última
-- red — el guardado optimista escribe desde el teléfono y conviene que un dato imposible falle
-- aquí y no se quede dando vueltas en la cola de sincronización.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'citas_tipo_valido'
                   and conrelid = 'public.citas'::regclass) then
    alter table public.citas
      add constraint citas_tipo_valido
      check (tipo in (
        'consulta','estudio','laboratorio','vacuna',
        'seguimiento','renovacion','otro'
      ));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'citas_aviso_valido'
                   and conrelid = 'public.citas'::regclass) then
    -- 168 h = una semana. Tope alto a propósito por si más adelante se ofrece "una semana antes";
    -- lo que corta es que no sea negativo ni un número absurdo.
    alter table public.citas
      add constraint citas_aviso_valido
      check (avisar_horas_antes is null
             or (avisar_horas_antes >= 0 and avisar_horas_antes <= 168));
  end if;
end $$;

-- La consulta natural es "las citas de ESTE paciente ordenadas por fecha" (próximas y pasadas
-- salen las dos de ahí), así que el índice va por paciente + fecha.
create index if not exists idx_citas_paciente_fecha on public.citas(paciente_id, fecha);
create index if not exists idx_citas_user_id        on public.citas(user_id);
-- Para "¿qué citas tengo con este médico?" y para que el borrado de un médico (SET NULL en la FK)
-- no tenga que recorrer la tabla entera.
create index if not exists idx_citas_medico_id      on public.citas(medico_id);

-- ─── RLS de citas ──────────────────────────────────────────
alter table public.citas enable row level security;

drop policy if exists "citas_select_own" on public.citas;
create policy "citas_select_own"
  on public.citas for select
  using (auth.uid() = user_id);

drop policy if exists "citas_insert_own" on public.citas;
create policy "citas_insert_own"
  on public.citas for insert
  with check (auth.uid() = user_id);

drop policy if exists "citas_update_own" on public.citas;
create policy "citas_update_own"
  on public.citas for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "citas_delete_own" on public.citas;
create policy "citas_delete_own"
  on public.citas for delete
  using (auth.uid() = user_id);


-- ════════════════════════════════════════════════════════════
-- 3. Los dos campos que faltaban en `pastillas`
-- ════════════════════════════════════════════════════════════
-- De los cuatro campos acordados en "medicamentos ampliados" se construyeron solo dos
-- (`cantidad` y `nota`, en la 006). Estos dos quedaron fuera porque dependían de que existiera
-- `medicos`, que es justo lo que acaba de nacer arriba.

alter table public.pastillas
  add column if not exists medico_id uuid references public.medicos(id) on delete set null,
  add column if not exists para_que  text;

comment on column public.pastillas.medico_id is
  'Quién indicó este medicamento. Nullable: la mayoría de las filas existentes nunca lo tendrán, y hay medicamentos de mostrador que no los receta nadie. ON DELETE SET NULL para que borrar un médico no borre el medicamento.';

comment on column public.pastillas.para_que is
  'Para QUÉ se toma ("para la presión"). NO confundir con `nota`, que es el CÓMO ("en ayunas", "rodilla derecha, capa delgada"): son dos preguntas distintas y fundirlas pierde información. Este es el campo que alimenta la ficha de emergencia.';

create index if not exists idx_pastillas_medico_id on public.pastillas(medico_id);

commit;

-- ─── Verificaciones (correr aparte si quieres confirmar) ───
-- select table_name from information_schema.tables where table_name in ('medicos','citas');
-- select column_name from information_schema.columns where table_name='pastillas' and column_name in ('medico_id','para_que');
-- select tablename, rowsecurity from pg_tables where tablename in ('medicos','citas');
-- select tablename, policyname, cmd from pg_policies where tablename in ('medicos','citas') order by tablename, cmd;
