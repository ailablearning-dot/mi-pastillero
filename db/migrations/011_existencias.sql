-- 011_existencias.sql
-- Cuántas quedan en la caja, y aviso cuando se está acabando.
--
-- Motivo: lo pidió Karen probando la app — "poder decir cuántas pastillas tiene la caja y cuántas
-- le quedan, y que le avise cuando está por acabarse". Es el segundo hallazgo suyo que se
-- construye, después de la pauta real, y va gratis a propósito: es motor de hábito, como los
-- recordatorios. Cobrar por "se te acaban las pastillas" está en la misma categoría que cobrar por
-- la ficha de emergencia.
--
-- ⚠️ LA DECISIÓN DE FONDO: no se guarda un contador que se va restando. Se guarda un CORTE
-- —"a esta hora de este día había N"— y lo que queda se DERIVA de las tomas registradas después.
--
-- Un contador que se decrementa en cada toma se desincroniza con cada "deshacer registro", cada
-- marca hecha sin conexión que se encola, cada reinstalación y cada dosis marcada desde el modal
-- de grupo. Y la deriva NO SE VE: acabas con una app que dice "te quedan 3" cuando quedan 12, o al
-- revés. En una app de medicación un número que miente es peor que no dar ningún número.
-- Derivado no puede desincronizarse, funciona hacia atrás y se corrige solo al recontar.
--
-- Por qué el corte lleva HORA y no solo fecha: la pregunta que se le hace a la persona es
-- "¿cuántas te quedan AHORA?", y puede contestarla a media tarde con la toma de la mañana ya
-- hecha. Con solo la fecha habría que decidir si las tomas de ese día se restan o no, y cualquiera
-- de las dos opciones se equivoca en un comprimido según cuándo contó. Con la hora, se restan
-- exactamente las tomas posteriores al momento de contar. Se guarda igual que en `medicamentos`:
-- fecha `date` y hora como texto de reloj local, que es la convención de toda la app.
--
-- Aditivo, nullable e idempotente. NULL en `existencias` = este medicamento no lleva control de
-- caja, que es como quedan todas las filas existentes y como se queda quien no rellene el campo.

alter table public.pastillas
  add column if not exists existencias       numeric(7,2),
  add column if not exists existencias_fecha date,
  add column if not exists existencias_hora  text,
  add column if not exists aviso_dias        smallint;

comment on column public.pastillas.existencias is
  'Unidades contadas en el CORTE, no las que quedan hoy. Lo que queda se deriva restando las tomas registradas después del corte — ver src/domain/inventario.js. NULL = sin control de caja. Es numeric porque las dosis pueden ser fraccionarias (media, un cuarto), igual que `cantidad`.';

comment on column public.pastillas.existencias_fecha is
  'Día del corte (YYYY-MM-DD). Junto con existencias_hora marca el momento desde el que se cuentan las tomas.';

comment on column public.pastillas.existencias_hora is
  'Hora local del corte como texto ("15:04:22"), misma convención que medicamentos.hora. Necesaria para no restar de más ni de menos las tomas del propio día del corte.';

comment on column public.pastillas.aviso_dias is
  'Umbral en DÍAS: avisar cuando lo que queda alcance para estos días o menos. NULL = sin aviso.
   En días y no en unidades a propósito: "avísame cuando quede 1" da un día de margen a quien toma
   una al día y ocho horas a quien toma tres —el mismo número, dos avisos, y el segundo llega tarde
   para ir a la farmacia—. Los días son la unidad en la que se actúa. Las unidades que quedan se
   siguen ENSEÑANDO, porque es lo que se ve al abrir la caja; lo que se pregunta es el margen.';
