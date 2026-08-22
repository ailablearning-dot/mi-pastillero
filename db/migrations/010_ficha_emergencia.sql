-- 010_ficha_emergencia.sql
-- La ficha de emergencia: alergias, condiciones y contacto.
--
-- Del prototipo aprobado (docs/prototipos/prototipo-sin-muros.html, pantalla b2). Es la joya del
-- plan gratis y va gratis A PROPÓSITO: poner información médica de emergencia detrás de un pago es
-- feo, es una bomba de reseñas de una estrella, y ocupa casi nada.
--
-- Cuelga de `pacientes` y no del usuario porque las alergias de tu mamá no son las tuyas. Así la
-- ficha vive junto a sus medicamentos y su historial, y hereda las políticas RLS que esa tabla ya
-- tiene: no hay que escribir ninguna nueva ni tocar la seguridad.
--
-- JSONB y no tablas nuevas para alergias y condiciones. La razón no es pereza: nada en la app
-- necesita buscar, filtrar ni agrupar por alergia — se leen todas juntas para pintar una tarjeta y
-- se guardan todas juntas al editarla. Dos tablas más traerían dos juegos de políticas RLS, dos
-- rutas de guardado y dos sitios donde quedarse a medias sin comprar nada.
--
-- Forma esperada:
--   alergias:    [{ "nombre": "Penicilina", "reaccion": "dificultad para respirar",
--                   "gravedad": "grave" }]     -- gravedad: "leve" | "moderada" | "grave" | null
--   condiciones: ["Hipertensión arterial", "Diabetes tipo 2"]
--
-- El contacto va en columnas planas y no en JSON: es UNO, con tres campos fijos, y así el teléfono
-- se puede indexar o validar el día que haga falta.
--
-- Los medicamentos activos de la ficha NO se guardan aquí: se componen de `pastillas` al pintar.
-- Duplicarlos sería garantizar que un día la ficha muestre un medicamento que ya se suspendió —y
-- en una ficha de emergencia, un dato viejo es peor que ninguno.
--
-- Aditivo, nullable e idempotente: quien no la llene no nota ningún cambio.

alter table public.pacientes
  add column if not exists alergias jsonb,
  add column if not exists condiciones jsonb,
  add column if not exists contacto_nombre text,
  add column if not exists contacto_relacion text,
  add column if not exists contacto_telefono text;

comment on column public.pacientes.alergias is
  'Ficha de emergencia. Array de objetos {nombre, reaccion, gravedad}. gravedad: leve|moderada|grave|null. null = sin capturar.';
comment on column public.pacientes.condiciones is
  'Ficha de emergencia. Array de textos ("Hipertensión arterial"). null = sin capturar.';
comment on column public.pacientes.contacto_nombre is
  'Ficha de emergencia: a quién llamar. El contacto es UNO solo, a propósito: en una urgencia se llama al primero.';
comment on column public.pacientes.contacto_relacion is
  'Parentesco o relación del contacto de emergencia ("esposa", "hijo"). Texto libre: la variedad real no cabe en una lista.';
comment on column public.pacientes.contacto_telefono is
  'Teléfono del contacto de emergencia. Texto, no número: admite prefijos, espacios y formatos de cualquier país.';
