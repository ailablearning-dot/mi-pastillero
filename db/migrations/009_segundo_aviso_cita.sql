-- 009_segundo_aviso_cita.sql
-- Un SEGUNDO aviso opcional por cita.
--
-- Motivo, detectado probando en device: el aviso es UNO solo, así que hay que elegir entre
-- enterarte con tiempo o que te lo recuerden cuando ya toca. Si eliges "el día antes", el día de
-- la cita no suena nada; si eliges "2 horas antes", no tuviste margen para organizarte. El caso
-- real es querer las dos cosas: "avísame el día antes Y esa mañana".
--
-- Es OPCIONAL y arranca APAGADO (null): quien no lo active no nota ningún cambio, y no se gasta
-- presupuesto de notificaciones de iOS por nadie que no lo haya pedido.
--
-- Columna nueva en vez de convertir `avisar_horas_antes` en un array: son dos avisos como mucho
-- (más multiplicarían el gasto del presupuesto de iOS, que ya se comparte con las dosis), y
-- cambiar la forma de una columna que ya tiene datos es una migración destructiva que no hace
-- falta. Aditivo, nullable e idempotente.

alter table public.citas
  add column if not exists avisar2_horas_antes integer;

comment on column public.citas.avisar2_horas_antes is
  'Segundo aviso, OPCIONAL. Mismas unidades que avisar_horas_antes (horas antes de la cita: 24 = el día antes, 0 = a la hora). NULL = sin segundo aviso, que es el valor por defecto y el de todas las filas existentes. Pensado para "avísame el día antes Y esa mañana". El domino deduplica si coincide con el primero.';

do $$
begin
  if not exists (select 1 from pg_constraint
                 where conname = 'citas_aviso2_valido'
                   and conrelid = 'public.citas'::regclass) then
    -- Mismo rango que `citas_aviso_valido`: si los dos topes se separan, el formulario dejaría
    -- pasar un valor que la BD rechaza y la cita entera no se guardaría.
    alter table public.citas
      add constraint citas_aviso2_valido
      check (avisar2_horas_antes is null
             or (avisar2_horas_antes >= 0 and avisar2_horas_antes <= 168));
  end if;
end $$;

-- ─── Verificación (correr aparte si quieres confirmar) ───
-- select column_name from information_schema.columns where table_name='citas' and column_name='avisar2_horas_antes';
-- select conname from pg_constraint where conrelid='public.citas'::regclass and conname like 'citas_aviso%';
