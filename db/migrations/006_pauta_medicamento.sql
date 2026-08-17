-- 006_pauta_medicamento.sql
-- Permite expresar la pauta REAL de una receta en `pastillas`.
--
-- Motivo: una usuaria reportó cuatro casos que la app no sabía representar:
--   1) "de lunes a jueves una dosis y de viernes a domingo otra"   → dias_semana
--   2) "una pastilla en la mañana y 2 por la noche"                → cantidad_por_hora
--   3) "en la mañana mitad, a medio día un cuarto, de noche completa" → cantidad (fraccionaria)
--   4) "2 pomadas en distintos horarios y partes del cuerpo"       → tipo + nota
--
-- Todo es ADITIVO y nullable: las filas existentes no se tocan y el código las trata igual que
-- antes (sin `tipo` se comportan como pastilla, sin `cantidad` no se muestra ninguna).
-- Idempotente: `if not exists` en todo, correrla dos veces no rompe nada.

alter table public.pastillas
  add column if not exists tipo              text,
  add column if not exists cantidad          numeric(6,2),
  add column if not exists cantidad_por_hora jsonb,
  add column if not exists dias_semana       text[],
  add column if not exists nota              text;

comment on column public.pastillas.tipo is
  'Tipo de medicamento: pastilla | capsula | jarabe | gotas | inyeccion | pomada | inhalador | parche | supositorio | sobre | ampolleta | otro. Null = pastilla (lo que la app asumía antes). Manda en el formulario (si se pide cantidad y en qué unidad) y en los textos (tomar / aplicar / inyectar). Ver src/domain/medTypes.js.';

comment on column public.pastillas.cantidad is
  'Cuántas unidades por toma. DECIMAL a propósito: las pastillas se parten en mitades y cuartos (0.25, 0.5, 0.75, 1, 1.5). Nunca se muestra como número crudo: se formatea a "media pastilla" / "un cuarto de pastilla". Null = no especificada. Ver src/domain/dosage.js.';

comment on column public.pastillas.cantidad_por_hora is
  'Cantidad distinta por hora del día: {"08:00": 0.5, "14:00": 0.25, "21:00": 1}. Las claves son las horas que DERIVA getHoras (las horas no se guardan), en formato HH:MM. Lo que no tenga override usa `cantidad`. Se purga al cambiar hora base o frecuencia (limpiarCantidadPorHora) para que no queden horas fantasma.';

comment on column public.pastillas.dias_semana is
  'Días de la semana en que toca, para frecuencia "Días específicos": {Lunes,Martes,...}. Sustituye al `dia_semana` singular, que solo permitía UN día por semana y obligaba a crear 7 medicamentos para una pauta de lunes a jueves. `dia_semana` se conserva por compatibilidad con las filas antiguas.';

comment on column public.pastillas.nota is
  'Texto libre de cómo/dónde aplicarlo. Nace de las pomadas, donde no hay cantidad que contar pero sí importa el "rodilla derecha, capa delgada". Se muestra en el detalle y en el modal de confirmación.';

-- Índice para el filtro por días. GIN porque dias_semana es un array y la consulta natural es
-- "¿contiene este día?". Solo indexa las filas que lo usan, que serán una minoría.
create index if not exists pastillas_dias_semana_idx
  on public.pastillas using gin (dias_semana)
  where dias_semana is not null;

-- Barrera de datos: que la BD rechace lo que el formulario no debería dejar pasar. Es la última
-- red — el guardado optimista escribe desde el teléfono y conviene que un dato imposible falle
-- aquí en vez de quedarse dando vueltas en la cola de sincronización.
do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'pastillas_cantidad_positiva'
                   and conrelid = 'public.pastillas'::regclass) then
    alter table public.pastillas
      add constraint pastillas_cantidad_positiva
      check (cantidad is null or (cantidad > 0 and cantidad <= 99));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'pastillas_tipo_valido'
                   and conrelid = 'public.pastillas'::regclass) then
    alter table public.pastillas
      add constraint pastillas_tipo_valido
      check (tipo is null or tipo in (
        'pastilla','capsula','jarabe','gotas','inyeccion','pomada',
        'inhalador','parche','supositorio','sobre','ampolleta','otro'
      ));
  end if;
end $$;

-- NOTA sobre RLS: no hace falta tocar nada. Las políticas de 002_enable_rls.sql son por fila
-- (user_id), no por columna, así que las columnas nuevas quedan protegidas igual que el resto.
