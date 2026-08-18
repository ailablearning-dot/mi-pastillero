// Colas de sincronización offline: dosis marcadas y altas de medicamentos.
import { safeStorage } from "./storage";
import { supabase } from "./supabase";

// Cola de dosis pendientes de sincronizar cuando se marcan SIN conexión. Se persiste en
// Preferences (sobrevive cierres de la app) y se drena al reconectar. Cada entrada está keyed
// por la IDENTIDAD de la dosis en la BD (paciente + medicamento + fecha + hora programada), así
// re-marcar la misma dosis offline SOBREESCRIBE la operación anterior (la última intención gana).
export const OFFLINE_QUEUE_KEY = "offline_dose_queue";

// Lee la cola de dosis desde el storage, sin pasar por React. La necesita el cargador del historial
// para no pisar las marcas que aún no han subido, y leerla de aquí evita una dependencia circular
// (el cargador se define antes que el hook que gestiona la cola).
export const readDoseQueue = async () => {
  try { return JSON.parse(await safeStorage.get(OFFLINE_QUEUE_KEY)) || {}; } catch (_) { return {}; }
};
export const doseQK = (pacienteId, nombre, dayStr, hora) => `${pacienteId}|${nombre}|${dayStr}|${hora}`;

// ── Alta de medicamentos: guardado optimista + cola ──────────────────────────────────
// El id lo genera el TELÉFONO (no Postgres). Así el medicamento existe localmente al instante y
// no hay que esperar a que la BD devuelva el registro: la pantalla ya no espera a la red. Medido
// en device: el insert tarda ~0,9 s con red buena, pero en una red móvil degradada llegó a 10 s y
// alguna vez superó el tope de 15 s → se perdía TODO lo que el usuario había escrito.
// Si el insert falla, el medicamento queda en esta cola (persistida en Preferences, sobrevive al
// cierre de la app) y se reintenta al reconectar. Como el id ya viene fijado, reintentar es
// idempotente: un segundo intento del mismo medicamento choca con la PK y no duplica.
export const PILLS_QUEUE_KEY = "offline_pills_queue";
export const newPillId = () => {
  try { if (crypto?.randomUUID) return crypto.randomUUID(); } catch (_) { /* iOS < 15.4 */ }
  // Fallback UUID v4 (el mínimo soportado es iOS 15.0 y randomUUID llegó en 15.4).
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
};
export const readPillQueue = async () => {
  try { return JSON.parse(await safeStorage.get(PILLS_QUEUE_KEY)) || []; } catch (_) { return []; }
};
export const writePillQueue = (arr) => safeStorage.set(PILLS_QUEUE_KEY, JSON.stringify(arr));
// Inserta una pastilla YA construida (con id). Nunca lanza: el llamador ya la pintó en pantalla.
// Devuelve "ok" (guardada), "encolada" (falló la red, se reintentará) o "rechazada" (el servidor
// respondió que esos datos no son válidos → reintentar no lo arreglaría, así que NO se encola).
// Solo estos errores significan "estos datos NO son válidos y nunca lo serán": violación de tipo o
// de restricción de la tabla. TODO lo demás (red, timeout, 5xx, token caducado, RLS transitorio)
// se reintenta: ante la duda NO se tira un dato que el usuario escribió. Antes bastaba con que el
// error trajera código para descartarlo, y con poca señal eso hacía DESAPARECER el medicamento.
const ERRORES_DE_DATOS = /^(22|23)/; // 22xxx = dato inválido, 23xxx = restricción (menos 23505)
export const esRechazoDefinitivo = (error) => !!error?.code && ERRORES_DE_DATOS.test(error.code) && error.code !== "23505";
export const insertPill = async (pill) => {
  try {
    const { error } = await supabase.from("pastillas").insert(pill);
    if (!error) return "ok";
    if (error.code === "23505") return "ok"; // ya existía (reintento de la cola): éxito
    if (esRechazoDefinitivo(error)) { console.error("Insert de pastilla rechazado:", error); return "rechazada"; }
  } catch (_) { /* red: cae a la cola */ }
  const q = await readPillQueue();
  if (!q.some(p => p.id === pill.id)) { q.push(pill); await writePillQueue(q); }
  return "encolada";
};
// Al borrar hay que sacarlo también de la cola: si no, un medicamento borrado antes de haber
// llegado a subir volvería a aparecer en cuanto la cola se drenara.
export const removeFromPillQueue = async (id) => {
  const q = await readPillQueue();
  if (q.some(p => p.id === id)) await writePillQueue(q.filter(p => p.id !== id));
};

// Corre una promesa con timeout: si tarda más de `ms`, resuelve con `fallback` (en vez de
// colgarse). Clave sin conexión: iOS a veces reporta navigator.onLine=true un rato tras perder
// la señal → la consulta de red se quedaría esperando el timeout largo del sistema (30-60s).
// IMPORTANTE: si la promesa RECHAZA (p.ej. RevenueCat lanza un error), también caemos al `fallback`
// en vez de propagar el error — así una llamada que falla nunca corta el efecto que la await (era la
// causa de que la app se quedara en "Cargando" para siempre si RevenueCat fallaba).
export const withTimeout = (promise, ms, fallback) =>
  Promise.race([
    Promise.resolve(promise).catch(() => fallback),
    new Promise((res) => setTimeout(() => res(fallback), ms)),
  ]);

// ── Cola de BORRADOS de medicamentos ────────────────────────────────────────────────────
// Faltaba: marcar dosis y dar de alta funcionaban sin conexión, pero borrar no — se quedaba 15 s
// esperando a la red y luego fallaba. El usuario veía un botón muerto.
//
// Guarda solo ids. Y tiene una consecuencia que NO es opcional: el cargador de pastillas debe
// filtrar estos ids de lo que devuelve la BD, o un medicamento borrado sin conexión REAPARECE en
// la siguiente carga (sigue existiendo en el servidor hasta que la cola se drene).
const PILL_DELETES_KEY = "offline_pill_deletes";

export const readPillDeletes = async () => {
  try { return JSON.parse(await safeStorage.get(PILL_DELETES_KEY)) || []; } catch (_) { return []; }
};
const writePillDeletes = (arr) => safeStorage.set(PILL_DELETES_KEY, JSON.stringify(arr));

export const removeFromPillDeletes = async (id) => {
  const q = await readPillDeletes();
  if (q.includes(id)) await writePillDeletes(q.filter(x => x !== id));
};

// Borra un medicamento. Nunca lanza y nunca hace esperar: el llamador ya lo quitó de la pantalla.
// Devuelve "ok" (borrado) o "encolada" (se reintentará al reconectar).
export const deletePill = async (id) => {
  // Si aún no había subido, basta con sacarlo de la cola de altas: en la BD no existe.
  await removeFromPillQueue(id);
  try {
    const { error } = await supabase.from("pastillas").delete().eq("id", id);
    if (!error) { await removeFromPillDeletes(id); return "ok"; }
  } catch (_) { /* red: cae a la cola */ }
  const q = await readPillDeletes();
  if (!q.includes(id)) { q.push(id); await writePillDeletes(q); }
  return "encolada";
};

// Drena la cola de borrados. Un id que ya no existe en la BD no es un error: el delete devuelve
// éxito igual, así que se saca de la cola sin más.
export const flushPillDeletes = async () => {
  const q = await readPillDeletes();
  if (!q.length) return;
  const quedan = [];
  for (const id of q) {
    try {
      const { error } = await supabase.from("pastillas").delete().eq("id", id);
      if (error) quedan.push(id);
    } catch (_) { quedan.push(id); }
  }
  await writePillDeletes(quedan);
};
