import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { LocalNotifications } from '@capacitor/local-notifications';
import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { SocialLogin } from '@capgo/capacitor-social-login';
import { Preferences } from '@capacitor/preferences';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as XLSX from 'xlsx';
import {
  Lock, Settings, LogOut, Pencil, Trash2, X, Plus, Check,
  ChevronDown, ChevronLeft, ChevronRight, ArrowLeft, ArrowRight,
  Share2, Users, BarChart3, Bell, Pill, Fingerprint, AlertTriangle,
  HelpCircle, Shield, Sparkles, MessageSquare, WifiOff,
} from 'lucide-react';
import { createClient } from "@supabase/supabase-js";
import { initPurchases, identifyUser, logoutPurchases, getPackages, buyPackage, restore, getSubscriptionInfo, manageSubscriptions, addPremiumListener } from "./purchases";

// Interruptor maestro de las suscripciones. Mientras está en false, el paywall NO
// bloquea a nadie (las testers siguen usando la app libre). Se pone en true cuando
// RevenueCat + los productos estén configurados y probados en Sandbox.
const SUBSCRIPTIONS_ENABLED = true;

// URLs legales (GitHub Pages). Se enlazan desde el registro y el paywall
// (Apple 3.1.2 exige enlazar Términos y Privacidad en el paywall).
const TERMS_URL = "https://ailablearning-dot.github.io/mi-pastillero/terminos.html";
const PRIVACY_URL = "https://ailablearning-dot.github.io/mi-pastillero/privacidad.html";

// Correo de contacto y versión visible (se muestran en Ajustes). Subir APP_VERSION
// a mano cuando cambie MARKETING_VERSION en Xcode.
const CONTACT_EMAIL = "ailab.learning@gmail.com";
const APP_VERSION = "1.1.0";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Client IDs de Google OAuth (públicos, no secretos). Se configuran en .env cuando
// se creen las credenciales en Google Cloud Console. Solo se usan en iOS nativo.
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;
let googleInitialized = false; // SocialLogin.initialize se hace una sola vez
let appleInitialized = false;  // idem para Apple

// En Capacitor nativo, el localStorage del WKWebView a veces no persiste entre relanzamientos.
// Usamos Preferences (UserDefaults en iOS) como storage del auth de Supabase para que la sesión
// sobreviva al cerrar la app. En web seguimos usando localStorage (default).
const nativeStorage = {
  async getItem(key) { const { value } = await Preferences.get({ key }); return value; },
  async setItem(key, value) { await Preferences.set({ key, value }); },
  async removeItem(key) { await Preferences.remove({ key }); },
};

// Helper general para storage que funciona en nativo y web.
// Útil para flags propios de la app (paciente activo, etc.).
const safeStorage = {
  async get(key) {
    if (window.Capacitor?.isNativePlatform()) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    return localStorage.getItem(key);
  },
  async set(key, value) {
    if (window.Capacitor?.isNativePlatform()) await Preferences.set({ key, value });
    else localStorage.setItem(key, value);
  },
  async remove(key) {
    if (window.Capacitor?.isNativePlatform()) await Preferences.remove({ key });
    else localStorage.removeItem(key);
  },
};

// Espejo del estado premium. La fuente de verdad es Preferences (async), pero además lo
// escribimos en localStorage (SÍNCRONO) para poder leerlo en el PRIMER render y así arrancar
// ya como premium, sin el parpadeo del paywall mientras RevenueCat/Preferences responden.
const cachePremium = (isPrem) => {
  const v = isPrem ? "1" : "0";
  safeStorage.set("premium_cache", v);
  try { localStorage.setItem("premium_cache", v); } catch (_) { /* noop */ }
};

// Cola de dosis pendientes de sincronizar cuando se marcan SIN conexión. Se persiste en
// Preferences (sobrevive cierres de la app) y se drena al reconectar. Cada entrada está keyed
// por la IDENTIDAD de la dosis en la BD (paciente + medicamento + fecha + hora programada), así
// re-marcar la misma dosis offline SOBREESCRIBE la operación anterior (la última intención gana).
const OFFLINE_QUEUE_KEY = "offline_dose_queue";
const doseQK = (pacienteId, nombre, dayStr, hora) => `${pacienteId}|${nombre}|${dayStr}|${hora}`;

// Corre una promesa con timeout: si tarda más de `ms`, resuelve con `fallback` (en vez de
// colgarse). Clave sin conexión: iOS a veces reporta navigator.onLine=true un rato tras perder
// la señal → la consulta de red se quedaría esperando el timeout largo del sistema (30-60s).
const withTimeout = (promise, ms, fallback) =>
  Promise.race([Promise.resolve(promise), new Promise((res) => setTimeout(() => res(fallback), ms))]);

// Emojis para avatares de pacientes
const PACIENTE_EMOJIS = ["👤","👨","👩","👴","👵","👦","👧","👶","🧑","👨‍🦰","👩‍🦰","👨‍🦱","👩‍🦱","👨‍🦳","👩‍🦳","🐶","🐱"];

// fetch con TOPE de tiempo para TODAS las llamadas de Supabase (auth, queries). Sin esto, sin
// conexión cada llamada espera el timeout por defecto de iOS (~60s). Tope ÚNICO y amplio (15s):
// NO usamos navigator.onLine para abortar antes, porque en iOS el WebView a veces reporta
// onLine=false en DATOS MÓVILES aunque SÍ haya red → un tope corto (1.5s) abortaba ESCRITURAS
// reales (guardar medicamento, marcar dosis) de forma intermitente en 5G. 15s tolera red lenta y
// sigue evitando el cuelgue de ~60s cuando de verdad no hay conexión. Ya no bloquea el arranque:
// la UI es caché-primero (sesión/pacientes/pastillas) y revalida en segundo plano.
const timeoutFetch = (url, options = {}) => {
  if (options.signal) return fetch(url, options); // respeta un signal propio si lo hubiera
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
};

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !window.Capacitor?.isNativePlatform(),
    storage: window.Capacitor?.isNativePlatform() ? nativeStorage : undefined,
  },
  global: { fetch: timeoutFetch },
});

// Clave donde Supabase persiste la sesión (default: sb-<ref>-auth-token, ref = subdominio de la URL).
const SUPABASE_AUTH_KEY = `sb-${(() => { try { return new URL(SUPABASE_URL).hostname.split(".")[0]; } catch (_) { return ""; } })()}-auth-token`;

// Lee la sesión persistida DIRECTO del storage nativo, sin tocar la red. Fallback para el arranque
// en frío sin conexión: si el access token expiró, getSession() intenta refrescarlo por red y GoTrue
// reintenta con backoff → offline eso se cuelga y la app se queda en "Cargando…" hasta el próximo
// resume. Con esto entramos a modo offline/grace de inmediato (onAuthStateChange corrige al reconectar).
const readStoredSession = async () => {
  try {
    const raw = await nativeStorage.getItem(SUPABASE_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const s = parsed?.currentSession || parsed; // v2 guarda la sesión directa; toleramos el wrap v1
    return (s && s.access_token && s.user) ? s : null;
  } catch (_) { return null; }
};


const getHoras = (hora_base, frecuencia) => {
  if (!hora_base) return [];
  const [h, m] = hora_base.slice(0,5).split(":").map(Number);
  const base = h * 60 + m;
  const fmt = (mins) => `${String(Math.floor((mins % 1440) / 60)).padStart(2,"0")}:${String(mins % 60).padStart(2,"0")}`;
  if (frecuencia === "Dos veces al día" || frecuencia === "Cada 12 horas") return [fmt(base), fmt(base + 720)];
  if (frecuencia === "Tres veces al día" || frecuencia === "Cada 8 horas") return [fmt(base), fmt(base + 480), fmt(base + 960)];
  if (frecuencia === "Cada 6 horas") return [fmt(base), fmt(base + 360), fmt(base + 720), fmt(base + 1080)];
  if (frecuencia === "Cada 4 horas") { const t = []; for (let i = 0; i < 6; i++) t.push(fmt(base + i * 240)); return t; }
  const mh = frecuencia?.match(/^Cada (\d+) horas?$/);
  if (mh) { const iv = parseInt(mh[1]) * 60; const t = []; for (let i = base; i < 1440; i += iv) t.push(fmt(i)); return t; }
  return [hora_base.slice(0,5)];
};

const fmt12h = t => {
  const [h, m] = t.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

const SONIDOS = [
  { id: 'ding',        label: 'Ding' },
  { id: 'campana',     label: 'Campana' },
  { id: 'alarma',      label: 'Alarma' },
  { id: 'magico',      label: 'Mágico' },
  { id: 'minimalista', label: 'Minimalista' },
  { id: 'pastillero',  label: 'Pastillero' },
  { id: 'tono',        label: 'Tono' },
  { id: 'ninguno',     label: 'Sin sonido' },
];

// Nivel de interrupción de los recordatorios.
// 'critical' = Alertas Críticas: suenan SIEMPRE, ignoran Focus / silencio / throttle de iOS
// (requiere el entitlement com.apple.developer.usernotifications.critical-alerts + permiso del
// usuario). El usuario puede apagarlas en Ajustes; entonces cae a 'timeSensitive'.
// `_criticalAlerts` se carga desde Preferences al arrancar (default ON).
let _criticalAlerts = true;
const notifLevel = () => (_criticalAlerts ? 'critical' : 'timeSensitive');

// Campos de sonido/nivel de una notificación según el sonido elegido de la pastilla.
// 'ninguno' = silenciosa: sin campo `sound` (solo banner) y nivel timeSensitive (no crítico,
// porque crítico es justamente para GARANTIZAR sonido). Se esparce con ...soundFields(sonido).
const soundFields = (sonido) => sonido === 'ninguno'
  ? { interruptionLevel: 'timeSensitive' }
  : { sound: `${sonido || 'ding'}.caf`, interruptionLevel: notifLevel() };

const notifId = (pillId, dateStr, hora) => {
  const str = `${pillId}_${dateStr}_${hora}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
  return h || 1;
};

// Cancela la notificación local de una dosis específica (idempotente)
const cancelDoseNotif = async (pill, dayStr, hora) => {
  if (!window.Capacitor?.isNativePlatform()) return;
  try {
    // Cancela la notif de la dosis Y su posible "posponer" pendiente (id estable por dosis),
    // para que al marcarla tomada/omitida no vuelva a sonar el recordatorio pospuesto.
    await LocalNotifications.cancel({ notifications: [{ id: notifId(pill.id, dayStr, hora) }, { id: notifId(pill.id, 'snooze', hora) }] });
  } catch (_) { /* noop */ }
};

// Reprograma la notificación local de una dosis específica si su hora aún no ha pasado.
const scheduleDoseNotif = async (pill, dayStr, hora) => {
  if (!window.Capacitor?.isNativePlatform()) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    const [hh, mm] = hora.split(':').map(Number);
    const [Y, M, D] = dayStr.split('-').map(Number);
    const at = new Date(Y, M - 1, D, hh, mm, 0, 0);
    if (at <= new Date()) return; // ya pasó, no tiene sentido reprogramar
    await LocalNotifications.schedule({
      notifications: [{
        id: notifId(pill.id, dayStr, hora),
        title: '💊 Mi Pastillero',
        body: `Hora de tomar ${pill.emoji} ${pill.nombre}${pill.dosis ? ` (${pill.dosis})` : ''}`,
        schedule: { at },
        ...soundFields(pill.sonido),
        actionTypeId: 'PILL_ACTIONS',
        extra: { pillId: pill.id, scheduledTime: hora, dateStr: dayStr, doseKey: `${pill.id}_${hora}`, pacienteId: pill.paciente_id },
      }],
    });
  } catch (_) { /* noop */ }
};

// `takenDoseKeys` es un Set con strings "pillId_YYYY-MM-DD_HH:MM" — dosis ya marcadas
// como tomadas que NO deben sonar aunque su hora esté en el futuro.
// Serializa las llamadas a la programación: cancelar+reprogramar nunca se interpone
// con otra corrida. Antes, al cambiar de paciente podían dispararse dos reagendados a
// la vez (efecto + permiso) y pisarse → notifs sin sonido o desfasadas.
let _schedChain = Promise.resolve();
const scheduleLocalNotifs = (pillsList, takenDoseKeys = new Set(), pacientesById = {}) => {
  _schedChain = _schedChain
    .then(() => _doScheduleLocalNotifs(pillsList, takenDoseKeys, pacientesById))
    .catch(() => {});
  return _schedChain;
};

// iOS solo mantiene ~64 notificaciones locales pendientes por app y descarta el resto
// EN SILENCIO. Con varias pastillas/pacientes, las dosis de varios días superan ese tope.
// Para que no se caiga nadie injustamente el reparto es en dos fases:
//   1) se RESERVA primero la próxima dosis de CADA pastilla (así una pastilla de `orden`
//      alto, de otro paciente, o un tratamiento que inicia a futuro nunca se queda sin su
//      siguiente recordatorio), y
//   2) se rellena el resto de espacios con las dosis más CERCANAS en el tiempo.
const NOTIF_CAP = 62;             // margen de seguridad bajo el límite duro de iOS (~64)
const SCHED_HORIZON_DAYS = 120;   // suficiente para hallar la próxima dosis aun de "Cada 3 meses"

const _doScheduleLocalNotifs = async (pillsList, takenDoseKeys = new Set(), pacientesById = {}) => {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    const now = new Date();
    // Reprogramar = cancelar lo pendiente + reconstruir agrupado. Se conservan SOLO las notifs
    // de "posponer" (extra.snooze): una vez que el usuario pospone, ese one-off no debe borrarse
    // hasta que suene. Todo lo demás se cancela y se reconstruye.
    // OJO: NO se conservan las "inminentes". Con la agrupación por minuto no hay desfase +1min
    // que perder; y conservar una notif INDIVIDUAL que a los segundos se agrupó causaba un
    // DUPLICADO (sonaba la individual vieja + la del grupo).
    const pending = await LocalNotifications.getPending();
    const preservedIds = new Set();
    const toCancel = [];
    for (const n of (pending.notifications || [])) {
      if (n.extra?.snooze === true) preservedIds.add(n.id);
      else toCancel.push({ id: n.id });
    }
    if (toCancel.length) await LocalNotifications.cancel({ notifications: toCancel });
    // Si hay varias personas, mostramos el nombre del paciente en la notif para saber de quién es.
    const multiPatient = new Set(pillsList.map(p => p.paciente_id)).size > 1;

    // 1) Genera todas las dosis candidatas (futuras y no tomadas) dentro del horizonte.
    const candidates = [];
    for (let day = 0; day < SCHED_HORIZON_DAYS; day++) {
      const d = new Date(now); d.setDate(d.getDate() + day);
      const dateStr = fmtDate(d.getFullYear(), d.getMonth(), d.getDate());
      for (const pill of pillsList) {
        if (!isPillDueOnDay(pill, dateStr)) continue;
        for (const hora of getHoras(pill.hora_toma, pill.frecuencia)) {
          const [hh, mm] = hora.split(':').map(Number);
          const at = new Date(d); at.setHours(hh, mm, 0, 0);
          if (at <= now) continue;
          if (takenDoseKeys.has(`${pill.id}_${dateStr}_${hora}`)) continue; // ya tomada
          candidates.push({ pill, dateStr, hora, at });
        }
      }
    }
    candidates.sort((a, b) => a.at - b.at);

    // 2) Selección con presupuesto: primero la próxima dosis de cada pastilla (equidad),
    //    luego rellena por cercanía sin duplicar la ya reservada.
    const keyOf = c => `${c.pill.id}_${c.dateStr}_${c.hora}`;
    const chosen = new Set();
    const selected = [];
    const firstByPill = new Map();
    for (const c of candidates) if (!firstByPill.has(c.pill.id)) firstByPill.set(c.pill.id, c);
    for (const c of firstByPill.values()) {
      if (selected.length >= NOTIF_CAP) break;
      selected.push(c); chosen.add(keyOf(c));
    }
    for (const c of candidates) {
      if (selected.length >= NOTIF_CAP) break;
      if (chosen.has(keyOf(c))) continue;
      selected.push(c); chosen.add(keyOf(c));
    }
    selected.sort((a, b) => a.at - b.at); // orden determinista (más cercanas primero) antes de agrupar

    // 3) Agrupa las dosis por minuto exacto (fecha + hora). En un minuto dado:
    //    - 1 sola dosis  → notificación normal con sus acciones Tomar/Posponer (como siempre).
    //    - 2+ dosis (mismo o distintos pacientes) → UNA sola notificación que, al tocarse,
    //      abre la lista in-app para decidir por pastilla (extra.group). Una sola notificación
    //      por minuto = entrega y sonido garantizados (evita el fallo de iOS con dos notifs
    //      casi simultáneas). El id de las individuales se deriva de (pill, fecha, hora) para
    //      que cancelDoseNotif (al marcar tomada) la siga encontrando.
    const groups = new Map();
    for (const c of selected) {
      const k = `${c.dateStr}_${c.hora}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const notifications = [];
    for (const members of groups.values()) {
      const at = new Date(members[0].at);
      if (members.length === 1) {
        const c = members[0];
        const id = notifId(c.pill.id, c.dateStr, c.hora);
        if (preservedIds.has(id)) continue; // ya está programada y por sonar; no la re-tocamos
        const pacNombre = pacientesById[c.pill.paciente_id]?.nombre;
        const suffix = (multiPatient && pacNombre) ? ` · ${pacNombre}` : '';
        notifications.push({
          id,
          title: '💊 Mi Pastillero',
          body: `Hora de tomar ${c.pill.emoji} ${c.pill.nombre}${c.pill.dosis ? ` (${c.pill.dosis})` : ''}${suffix}`,
          schedule: { at },
          ...soundFields(c.pill.sonido),
          actionTypeId: 'PILL_ACTIONS',
          extra: { pillId: c.pill.id, scheduledTime: c.hora, dateStr: c.dateStr, doseKey: `${c.pill.id}_${c.hora}`, pacienteId: c.pill.paciente_id },
        });
      } else {
        const first = members[0];
        const id = notifId('grupo', first.dateStr, first.hora);
        if (preservedIds.has(id)) continue;
        const lista = members.map(m => {
          const pn = pacientesById[m.pill.paciente_id]?.nombre;
          return `${m.pill.emoji} ${m.pill.nombre}${(multiPatient && pn) ? ` (${pn})` : ''}`;
        }).join(', ');
        // Un solo sonido para todo el grupo: el del primer medicamento que NO esté en
        // "Sin sonido". Si todas son silenciosas, el grupo es silencioso.
        const grpSonido = members.find(m => m.pill.sonido !== 'ninguno')?.pill.sonido || 'ninguno';
        notifications.push({
          id,
          title: '💊 Mi Pastillero',
          body: `Hora de tomar ${members.length} medicamentos: ${lista}`,
          schedule: { at },
          ...soundFields(grpSonido),
          extra: { group: true, dateStr: first.dateStr, hora: first.hora },
        });
      }
    }
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch (e) { console.warn('[LocalNotifications]', e); }
};

const getNearestBlock = (slots) => {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const toMins = t => { const [h, m] = t.split(":").map(Number); return h < 6 ? (h + 24) * 60 + m : h * 60 + m; };
  return [...slots].sort((a, b) => Math.abs(toMins(a) - nowMins) - Math.abs(toMins(b) - nowMins))[0];
};

const COLORS = [
  { id: "violet", bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-300", accent: "bg-violet-500" },
  { id: "rose", bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-300", accent: "bg-rose-500" },
  { id: "amber", bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-300", accent: "bg-amber-500" },
  { id: "blue", bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-300", accent: "bg-blue-500" },
  { id: "emerald", bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-300", accent: "bg-emerald-500" },
  { id: "purple", bg: "bg-purple-100", text: "text-purple-700", ring: "ring-purple-300", accent: "bg-purple-500" },
  { id: "pink", bg: "bg-pink-100", text: "text-pink-700", ring: "ring-pink-300", accent: "bg-pink-500" },
  { id: "orange", bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-300", accent: "bg-orange-500" },
];

const EMOJIS = ["💊","🔴","🟡","🔵","🟢","🟣","🟠","⚪","🫀","🧬","💉","🩺"];

// El color de una pastilla se deriva automáticamente de su emoji.
// Los emojis "círculo de color" mapean a su color obvio; los símbolos temáticos
// a un color coherente (corazón→rose, ADN→purple, jeringa→blue, estetoscopio→emerald).
const EMOJI_TO_COLOR = {
  "💊": "violet",
  "🔴": "rose",
  "🟡": "amber",
  "🔵": "blue",
  "🟢": "emerald",
  "🟣": "purple",
  "🟠": "orange",
  "⚪": "violet",
  "🫀": "rose",
  "🧬": "purple",
  "💉": "blue",
  "🩺": "emerald",
};
const emojiToColor = (emoji) => EMOJI_TO_COLOR[emoji] || "violet";
const FRECUENCIAS = [
  "Una vez al día","Dos veces al día","Tres veces al día",
  "Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas",
  "Cada tercer día","Semanal","Cada 15 días","Cada mes","Cada 3 meses",
  "Solo cuando necesite",
];

const DAYS_ES = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }
function fmtDate(y, m, d) { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function fmtTime(iso) { return iso?.slice(0,5) || ""; }
function getColor(colorId) { return COLORS.find(c => c.id === colorId) || COLORS[0]; }

// Formatea un delta en minutos como "8 min", "1h", "1h 5m", "7h 34m", etc.
// Pensado para etiquetas tipo "X tarde" / "X antes" — más legible que "454 min".
function formatTimingDiff(diffMin) {
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Compara hora programada (HH:MM) vs hora real (string libre, ej "10:34:22" o "10:34").
// Devuelve { kind: 'on-time' | 'late' | 'early', diffMin } o null si no parseable.
// Tolerancia: ±5 min se considera "a tiempo". Maneja wrap de medianoche.
function getTimingInfo(scheduledHHMM, actualTimeStr) {
  if (!scheduledHHMM || !actualTimeStr) return null;
  const ms = scheduledHHMM.match(/(\d{1,2}):(\d{2})/);
  const ma = actualTimeStr.match(/(\d{1,2}):(\d{2})/);
  if (!ms || !ma) return null;
  const scheduled = (+ms[1]) * 60 + (+ms[2]);
  const actual = (+ma[1]) * 60 + (+ma[2]);
  let diff = actual - scheduled;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  if (Math.abs(diff) <= 5) return { kind: 'on-time', diffMin: Math.abs(diff) };
  if (diff > 0) return { kind: 'late', diffMin: diff };
  return { kind: 'early', diffMin: -diff };
}

const DOW_MAP = { Lunes: 1, Martes: 2, "Miércoles": 3, Jueves: 4, Viernes: 5, "Sábado": 6, Domingo: 0 };

// Devuelve la fecha de inicio del tratamiento (ancla) como Date al mediodía local,
// o null si no hay dato. Usa fecha_inicio; si falta, created_at (compatibilidad).
function pillAnchor(pill) {
  if (pill.fecha_inicio) return new Date(pill.fecha_inicio + "T12:00:00");
  if (pill.created_at) {
    const c = new Date(pill.created_at);
    return new Date(c.getFullYear(), c.getMonth(), c.getDate(), 12, 0, 0, 0);
  }
  return null;
}

// Fecha final (exclusiva) del tratamiento según duración, o null si es indefinido.
function pillEnd(pill, anchor) {
  if (!anchor || !pill.duracion_tipo || !pill.duracion_valor) return null;
  const end = new Date(anchor);
  const n = Number(pill.duracion_valor);
  if (pill.duracion_tipo === "dias") end.setDate(end.getDate() + n);
  else if (pill.duracion_tipo === "semanas") end.setDate(end.getDate() + n * 7);
  else if (pill.duracion_tipo === "meses") end.setMonth(end.getMonth() + n);
  else return null;
  return end; // el día `end` ya NO pertenece al tratamiento
}

function isPillDueOnDay(pill, dateStr) {
  const freq = pill.frecuencia;
  if (!freq) return true;

  const date = new Date(dateStr + "T12:00:00");
  const anchor = pillAnchor(pill);

  // Ventana del tratamiento: no aparece antes del inicio ni después del fin.
  if (anchor) {
    if (date < anchor) return false;                 // aún no empieza
    const end = pillEnd(pill, anchor);
    if (end && date >= end) return false;            // tratamiento terminado
  }

  // Frecuencias diarias: aparecen todos los días (dentro de la ventana)
  if (["Una vez al día","Dos veces al día","Tres veces al día",
       "Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas",
       "Solo cuando necesite"].includes(freq)) return true;
  if (/^Cada \d+ horas?$/.test(freq)) return true;

  const dom = date.getDate();

  if (freq === "Semanal") {
    return date.getDay() === (DOW_MAP[pill.dia_semana] ?? 1);
  }

  if (freq === "Cada mes") {
    return dom === (pill.dia_del_mes || 1);
  }

  if (freq === "Cada 3 meses") {
    if (dom !== (pill.dia_del_mes || 1)) return false;
    if (!anchor) return true;
    const monthDiff = (date.getFullYear() - anchor.getFullYear()) * 12 + (date.getMonth() - anchor.getMonth());
    return monthDiff % 3 === 0;
  }

  // Frecuencias por intervalo de días: se cuentan desde el inicio del tratamiento.
  if (!anchor) return true;
  const ref = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), dom);
  const diffDays = Math.round((target - ref) / 86400000);
  if (diffDays < 0) return false;

  if (freq === "Cada 15 días") return diffDays % 15 === 0;
  if (freq === "Cada tercer día") return diffDays % 3 === 0;

  const mDias = freq.match(/^Cada (\d+) días?$/);
  if (mDias) return diffDays % parseInt(mDias[1]) === 0;

  return true;
}

// --- Biometric helpers ---
// En Capacitor nativo (iOS/Android) usa el plugin NativeBiometric (LAContext / BiometricPrompt).
// En web (PWA, navegador) usa WebAuthn como fallback.
const isNative = () => !!window.Capacitor?.isNativePlatform();

const biometricSupported = () => {
  if (isNative()) return true; // El plugin nativo determinará disponibilidad real en runtime
  return typeof window !== "undefined" &&
    window.PublicKeyCredential !== undefined &&
    navigator.credentials !== undefined;
};

const registerBiometric = async (userId, email) => {
  if (isNative()) {
    const avail = await NativeBiometric.isAvailable();
    if (!avail.isAvailable) {
      const err = new Error("Biometría no disponible en este dispositivo");
      err.name = "BiometricNotAvailable";
      throw err;
    }
    // Forzamos un verifyIdentity como confirmación al activar. Si el usuario cancela,
    // el plugin lanza un error con name="NotAllowedError" (lo mapeamos para mantener compatibilidad).
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Activa Face ID / huella para Mi Pastillero",
        title: "Activar Face ID / huella",
        subtitle: "Confirma tu identidad",
      });
    } catch (e) {
      const err = new Error("Cancelado");
      err.name = "NotAllowedError";
      throw err;
    }
    await safeStorage.set("bio_enabled", "true");
    return;
  }
  // Web: WebAuthn
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Mi Pastillero", id: window.location.hostname },
      user: { id: new TextEncoder().encode(userId), name: email, displayName: "Mi Pastillero" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
    },
  });
  localStorage.setItem("bio_cred_id", btoa(String.fromCharCode(...new Uint8Array(cred.rawId))));
  await safeStorage.set("bio_enabled", "true");
};

const authenticateBiometric = async () => {
  if (isNative()) {
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Desbloquea Mi Pastillero",
        title: "Mi Pastillero",
        subtitle: "Verifica tu identidad para continuar",
      });
    } catch (e) {
      const err = new Error("Cancelado");
      err.name = "NotAllowedError";
      throw err;
    }
    return;
  }
  // Web: WebAuthn
  const idStr = localStorage.getItem("bio_cred_id");
  if (!idStr) throw new Error("no-credential");
  const credId = Uint8Array.from(atob(idStr), c => c.charCodeAt(0));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [{ type: "public-key", id: credId }],
      userVerification: "required",
      timeout: 60000,
    },
  });
};

function BiometricLockScreen({ onUnlock, onUsePassword }) {
  const [error, setError] = useState(null);
  const [trying, setTrying] = useState(false);

  const tryAuth = async () => {
    setTrying(true);
    setError(null);
    try {
      await authenticateBiometric();
      onUnlock();
    } catch (e) {
      if (e.name !== "NotAllowedError") setError("No se pudo verificar. Intenta de nuevo.");
    } finally {
      setTrying(false);
    }
  };

  useEffect(() => { tryAuth(); }, []);

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center px-4">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-violet-200 dark:shadow-none mx-auto mb-4">💊</div>
        <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
        <p className="text-sm text-gray-400">Verifica tu identidad para continuar</p>
      </div>
      <button onClick={tryAuth} disabled={trying}
        className="w-full max-w-xs flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-base font-bold shadow-lg shadow-violet-200 dark:shadow-none mb-4 disabled:opacity-60 transition-all"
        style={{ fontWeight: 800 }}>
        <Fingerprint size={24} />
        {trying ? "Verificando..." : "Desbloquear"}
      </button>
      {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
      <button onClick={onUsePassword} className="text-xs text-gray-400 underline underline-offset-2 cursor-pointer">
        Usar contraseña
      </button>
    </div>
  );
}

// Traduce los mensajes de error de Supabase Auth (vienen en inglés) a español.
function authErrorES(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Aún no confirmas tu cuenta. Revisa el código que te enviamos por correo.";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Este email ya está registrado. Intenta iniciar sesión.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 8 caracteres.";
  if (m.includes("unable to validate email") || m.includes("invalid format")) return "El correo no tiene un formato válido.";
  if (m.includes("for security purposes") || m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  return msg || "Ocurrió un error. Inténtalo de nuevo.";
}

function LoginScreen() {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot" | "reset" | "confirm"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false); // consentimiento en el registro

  const switchMode = (m) => {
    setMode(m);
    setMsg(null);
    setPasswordConfirm("");
    setPassword("");
    setAcceptedTerms(false);
    if (m !== "reset") setCode("");
  };

  // Paso 1 del reset: envía el email con el código de 6 dígitos (OTP de recovery).
  const handleForgotPassword = async () => {
    if (!email) {
      setMsg({ type: "error", text: "Ingresa tu email primero." });
      return;
    }
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      setMsg({ type: "error", text: authErrorES(error.message) });
      return;
    }
    setMode("reset");
    setPassword("");
    setPasswordConfirm("");
    setCode("");
    setMsg({ type: "ok", text: "Te enviamos un código de 6 dígitos a tu email." });
  };

  // Paso 2 del reset: verifica el código y establece la nueva contraseña.
  // verifyOtp crea la sesión; updateUser la cambia; onAuthStateChange entra a la app.
  const handleReset = async () => {
    const token = code.trim();
    if (token.length < 6) {
      setMsg({ type: "error", text: "Ingresa el código que te enviamos por email." });
      return;
    }
    if (password.length < 8) {
      setMsg({ type: "error", text: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (password !== passwordConfirm) {
      setMsg({ type: "error", text: "Las contraseñas no coinciden." });
      return;
    }
    setLoading(true);
    setMsg(null);
    const { error: vErr } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
    if (vErr) {
      setLoading(false);
      setMsg({ type: "error", text: "Código inválido o expirado. Solicita uno nuevo." });
      return;
    }
    const { error: uErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (uErr) {
      setMsg({ type: "error", text: uErr.message });
      return;
    }
    // Aviso de seguridad "tu contraseña fue actualizada" (Edge Function + Resend).
    // Fire-and-forget: si el correo falla, no debe afectar el ingreso a la app.
    supabase.functions.invoke("notify-password-changed").catch(() => {});
    // La sesión ya quedó activa: la app entra sola vía onAuthStateChange.
  };

  // Confirmación de cuenta nueva por OTP (reemplaza el enlace web del email).
  // verifyOtp con type "signup" confirma el email y crea la sesión → entra a la app.
  const handleConfirm = async () => {
    const token = code.trim();
    if (token.length < 6) {
      setMsg({ type: "error", text: "Ingresa el código que te enviamos por email." });
      return;
    }
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    setLoading(false);
    if (error) {
      setMsg({ type: "error", text: "Código inválido o expirado. Solicita uno nuevo." });
      return;
    }
    // La sesión ya quedó activa: la app entra sola vía onAuthStateChange.
  };

  const handleResendSignup = async () => {
    if (!email) { setMsg({ type: "error", text: "Ingresa tu email primero." }); return; }
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setLoading(false);
    setMsg(error ? { type: "error", text: error.message } : { type: "ok", text: "Te reenviamos el código." });
  };

  const handleEmail = async () => {
    if (mode === "forgot") { await handleForgotPassword(); return; }
    if (mode === "reset") { await handleReset(); return; }
    if (mode === "confirm") { await handleConfirm(); return; }
    setLoading(true);
    setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ type: "error", text: authErrorES(error.message) });
    } else {
      // Validaciones de registro
      if (password.length < 8) {
        setMsg({ type: "error", text: "La contraseña debe tener al menos 8 caracteres." });
        setLoading(false);
        return;
      }
      if (password !== passwordConfirm) {
        setMsg({ type: "error", text: "Las contraseñas no coinciden." });
        setLoading(false);
        return;
      }
      if (!acceptedTerms) {
        setMsg({ type: "error", text: "Debes aceptar la Política de Privacidad y los Términos de Uso." });
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMsg({ type: "error", text: authErrorES(error.message) });
      } else if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
        // Supabase no devuelve error en email duplicado por anti-enumeración:
        // detectamos el caso por identities vacío.
        setMsg({ type: "error", text: "Este email ya está registrado. Intenta iniciar sesión." });
      } else {
        // Confirmación por OTP dentro de la app (antes el email llevaba un enlace web
        // a la PWA vieja de Vercel, que en iOS abría Safari en vez de la app).
        setMode("confirm");
        setPassword("");
        setPasswordConfirm("");
        setCode("");
        setMsg({ type: "ok", text: "Te enviamos un código de 6 dígitos a tu email." });
      }
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    // Web / dev: flujo OAuth por navegador (fallback).
    if (!window.Capacitor?.isNativePlatform()) {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      return;
    }
    // iOS nativo: login nativo de Google → idToken → Supabase (sin abrir navegador
    // ni mostrar la URL de Supabase).
    try {
      if (!GOOGLE_IOS_CLIENT_ID) {
        setMsg({ type: "error", text: "Falta configurar Google (VITE_GOOGLE_IOS_CLIENT_ID)." });
        return;
      }
      if (!googleInitialized) {
        await SocialLogin.initialize({
          google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID },
        });
        googleInitialized = true;
      }
      const res = await SocialLogin.login({
        provider: "google",
        options: { scopes: ["email", "profile"] },
      });
      const idToken = res?.result?.idToken;
      if (!idToken) {
        setMsg({ type: "error", text: "No se pudo obtener el token de Google." });
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
      if (error) setMsg({ type: "error", text: error.message });
      // Si todo OK, onAuthStateChange entra a la app.
    } catch (e) {
      // Si el usuario cancela el diálogo nativo, no mostramos error.
      const m = e?.message || "";
      if (m && !/cancel/i.test(m)) setMsg({ type: "error", text: m });
    }
  };

  const handleApple = async () => {
    // Web / dev: flujo OAuth por navegador (requiere config OAuth de Apple; en dev normalmente no se usa).
    if (!window.Capacitor?.isNativePlatform()) {
      await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: window.location.origin },
      });
      return;
    }
    // iOS nativo: Sign in with Apple → identityToken → Supabase (sin navegador).
    try {
      if (!appleInitialized) {
        await SocialLogin.initialize({ apple: {} });
        appleInitialized = true;
      }
      const res = await SocialLogin.login({
        provider: "apple",
        options: { scopes: ["name", "email"] },
      });
      const idToken = res?.result?.idToken;
      if (!idToken) {
        setMsg({ type: "error", text: "No se pudo obtener el token de Apple." });
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: idToken });
      if (error) setMsg({ type: "error", text: error.message });
      // Si todo OK, onAuthStateChange entra a la app.
    } catch (e) {
      // Si el usuario cierra/cancela la hoja nativa, no mostramos error.
      // Apple reporta la cancelación como "AuthorizationError error 1001" (sin la palabra "cancel").
      const m = e?.message || "";
      const code = String(e?.code ?? "");
      const cancelado = /cancel/i.test(m) || /\b1001\b/.test(m) || code === "1001";
      if (m && !cancelado) setMsg({ type: "error", text: m });
    }
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center px-4">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-violet-200 dark:shadow-none mx-auto mb-4">💊</div>
          <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
          <p className="text-sm text-gray-400">Tu control de medicamentos diario</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6">
          {(mode === "login" || mode === "register") && (
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-5">
              <button onClick={() => switchMode("login")} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "login" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Entrar</button>
              <button onClick={() => switchMode("register")} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "register" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Registrarse</button>
            </div>
          )}
          {mode === "forgot" && (
            <div className="mb-5">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Recuperar contraseña</h2>
              <p className="text-xs text-gray-500">Ingresa tu email y te enviaremos un código para restablecerla.</p>
            </div>
          )}
          {mode === "reset" && (
            <div className="mb-5">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Nueva contraseña</h2>
              <p className="text-xs text-gray-500">Escribe el código que enviamos a <span className="font-bold text-gray-700 dark:text-gray-300">{email}</span> y tu nueva contraseña.</p>
            </div>
          )}
          {mode === "confirm" && (
            <div className="mb-5">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Confirma tu cuenta</h2>
              <p className="text-xs text-gray-500">Escribe el código de 6 dígitos que enviamos a <span className="font-bold text-gray-700 dark:text-gray-300">{email}</span>.</p>
            </div>
          )}
          <div className="space-y-3 mb-4">
            {mode !== "reset" && mode !== "confirm" && (
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
            )}
            {(mode === "reset" || mode === "confirm") && (
              <input
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Código"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-lg font-bold tracking-[0.4em] placeholder:tracking-normal placeholder:font-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300"
              />
            )}
            {(mode === "login" || mode === "register" || mode === "reset") && (
              <div className="relative">
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "reset" ? "Nueva contraseña" : "Contraseña"}
                  className="w-full pr-11 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            )}
            {(mode === "register" || mode === "reset") && (
              <input
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Confirmar contraseña"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300"
              />
            )}
            {mode === "register" && (
              <label className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-violet-500 flex-shrink-0"
                />
                <span>
                  Acepto la{" "}
                  <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="font-bold text-violet-600 hover:text-violet-700 underline">Política de Privacidad</a>
                  {" "}y los{" "}
                  <a href={TERMS_URL} target="_blank" rel="noreferrer" className="font-bold text-violet-600 hover:text-violet-700 underline">Términos de Uso</a>.
                </span>
              </label>
            )}
            {mode === "login" && (
              <button type="button" onClick={() => switchMode("forgot")} className="block text-xs font-bold text-violet-600 hover:text-violet-700 text-right w-full">
                ¿Olvidaste tu contraseña?
              </button>
            )}
            {mode === "reset" && (
              <button type="button" onClick={handleForgotPassword} disabled={loading} className="block text-xs font-bold text-violet-600 hover:text-violet-700 text-right w-full">
                Reenviar código
              </button>
            )}
            {mode === "confirm" && (
              <button type="button" onClick={handleResendSignup} disabled={loading} className="block text-xs font-bold text-violet-600 hover:text-violet-700 text-right w-full">
                Reenviar código
              </button>
            )}
          </div>
          {msg && (
            <div className={`text-xs font-medium px-3 py-2 rounded-xl mb-3 ${msg.type === "error" ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300" : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300"}`}>
              {msg.text}
            </div>
          )}
          <button onClick={handleEmail} disabled={loading} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-violet-200 dark:shadow-none transition-all mb-3" style={{ fontWeight: 800 }}>
            {loading ? "..." : mode === "login" ? "Entrar" : mode === "register" ? "Crear cuenta" : mode === "forgot" ? "Enviar código" : mode === "confirm" ? "Confirmar cuenta" : "Cambiar contraseña"}
          </button>
          {(mode === "forgot" || mode === "reset" || mode === "confirm") && (
            <button type="button" onClick={() => switchMode("login")} className="w-full text-xs font-bold text-gray-500 hover:text-gray-700 dark:text-gray-200 mb-3">
              ← Volver al inicio de sesión
            </button>
          )}
          {(mode === "login" || mode === "register") && (
            <>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <button onClick={handleApple} className="w-full flex items-center justify-center gap-2 bg-black text-white font-bold py-3 rounded-xl hover:bg-gray-900 transition-all text-sm mb-2">
            <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" /></svg>
            Continuar con Apple
          </button>
          <button onClick={handleGoogle} className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-50 transition-all text-sm">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.6 39.6 16.3 44 24 44z" /><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.2 5.2C40.8 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z" /></svg>
            Continuar con Google
          </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function PillForm({ pill, title = "Nuevo medicamento", showBackButton = true, onSave, onCancel }) {
  const [nombre, setNombre] = useState(pill?.nombre || "");
  const [dosis, setDosis] = useState(pill?.dosis || "");
  const [emoji, setEmoji] = useState(pill?.emoji || "💊");
  // El color se deriva automáticamente del emoji (ver EMOJI_TO_COLOR).
  const [hora, setHora] = useState(pill?.hora_toma || "08:00");

  const existFreq = pill?.frecuencia || FRECUENCIAS[0];
  const mDias = existFreq.match(/^Cada (\d+) días?$/);
  const mHoras = existFreq.match(/^Cada (\d+) horas?$/);
  const [freqSel, setFreqSel] = useState(mDias ? "__dias__" : mHoras ? "__horas__" : existFreq);
  const [customDias, setCustomDias] = useState(mDias ? parseInt(mDias[1]) : 2);
  const [customHoras, setCustomHoras] = useState(mHoras ? parseInt(mHoras[1]) : 2);

  const [diaSemana, setDiaSemana] = useState(pill?.dia_semana || "Lunes");
  const [diaDelMes, setDiaDelMes] = useState(pill?.dia_del_mes || 1);

  const [durTipo, setDurTipo] = useState(pill?.duracion_tipo || "indefinido");
  const [durValor, setDurValor] = useState(pill?.duracion_valor || 30);
  const [sonido, setSonido] = useState(pill?.sonido || 'ding');
  const hoyStr = (() => { const d = new Date(); return fmtDate(d.getFullYear(), d.getMonth(), d.getDate()); })();
  const [fechaInicio, setFechaInicio] = useState((pill?.fecha_inicio || "").slice(0, 10) || hoyStr);
  const [error, setError] = useState(null);
  const savingRef = useRef(false); // guardia síncrona anti doble-submit (el estado no basta: dos taps en el mismo tick lo ven en false)
  const [saving, setSaving] = useState(false);

  const frecuencia = freqSel === "__dias__" ? `Cada ${customDias} días`
    : freqSel === "__horas__" ? `Cada ${customHoras} horas`
    : freqSel;

  const showDiaSemana = freqSel === "Semanal";
  const showDiaDelMes = ["Cada mes", "Cada 3 meses"].includes(freqSel);

  const handleSave = async () => {
    if (savingRef.current) return; // ya se está guardando: ignora el doble tap
    if (!nombre.trim()) { setError("Escribe el nombre del medicamento."); return; }
    if (!fechaInicio) { setError("Selecciona la fecha de inicio del tratamiento."); return; }
    setError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave({
        nombre, dosis, frecuencia, emoji, color: emojiToColor(emoji), sonido,
        hora_toma: hora,
        dia_semana: showDiaSemana ? diaSemana : null,
        dia_del_mes: showDiaDelMes ? Number(diaDelMes) : null,
        fecha_inicio: fechaInicio,
        duracion_tipo: durTipo !== "indefinido" ? durTipo : null,
        duracion_valor: durTipo !== "indefinido" ? Number(durValor) : null,
      });
    } finally {
      // Si onSave falló (p.ej. sin red) el form sigue abierto → permite reintentar.
      savingRef.current = false;
      setSaving(false);
    }
  };

  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    window.scrollTo(0, 0);
    const fix = () => {
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      if (window.scrollX !== 0) window.scrollTo(0, 0);
    };
    el.addEventListener('scroll', fix, { passive: true });
    window.addEventListener('scroll', fix, { passive: true });
    const t1 = setTimeout(() => { el.scrollLeft = 0; window.scrollTo(0, 0); }, 300);
    const t2 = setTimeout(() => { el.scrollLeft = 0; window.scrollTo(0, 0); }, 1000);
    return () => { el.removeEventListener('scroll', fix); window.removeEventListener('scroll', fix); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const previewAudioRef = useRef(null);
  useEffect(() => () => {
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
  }, []);

  const playPreview = (nombre) => {
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    if (nombre === 'ninguno') return; // "Sin sonido": nada que reproducir
    const audio = new Audio(`/sounds/${nombre}.mp3`);
    previewAudioRef.current = audio;
    audio.play().catch(() => {});
  };

  const cls = "w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300";
  const lbl = "text-xs font-bold text-gray-500 mb-1 block";

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div
        className="w-full flex flex-col bg-white dark:bg-gray-900 overflow-hidden"
        style={{ fontFamily: "'Nunito', sans-serif", touchAction: 'pan-y', height: '100%' }}
      >
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px' }}
        >
          {showBackButton && (
            <button onClick={onCancel} className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300"><ArrowLeft size={18} /></button>
          )}
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-5"
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-y', overflowX: 'hidden' }}
        >
          <div className="py-4 space-y-4 overflow-x-hidden">
            <div>
              <label className={lbl}>Nombre del medicamento</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Metformina" className={cls} />
            </div>
            <div>
              <label className={lbl}>Dosis</label>
              <input value={dosis} onChange={e => setDosis(e.target.value)} placeholder="Ej: 500mg" className={cls} />
            </div>
            <div>
              <label className={lbl}>Frecuencia</label>
              <select value={freqSel} onChange={e => setFreqSel(e.target.value)} className={cls}>
                <optgroup label="Varias veces al día">
                  <option value="Una vez al día">Una vez al día</option>
                  <option value="Dos veces al día">Dos veces al día</option>
                  <option value="Tres veces al día">Tres veces al día</option>
                  <option value="Cada 4 horas">Cada 4 horas</option>
                  <option value="Cada 6 horas">Cada 6 horas</option>
                  <option value="Cada 8 horas">Cada 8 horas</option>
                  <option value="Cada 12 horas">Cada 12 horas</option>
                  <option value="__horas__">Personalizar intervalo de horas…</option>
                </optgroup>
                <optgroup label="Por días">
                  <option value="Cada tercer día">Cada tercer día</option>
                  <option value="Semanal">Semanal</option>
                  <option value="Cada 15 días">Cada 15 días</option>
                  <option value="Cada mes">Cada mes</option>
                  <option value="Cada 3 meses">Cada 3 meses</option>
                  <option value="__dias__">Personalizar intervalo de días…</option>
                </optgroup>
                <option value="Solo cuando necesite">Solo cuando necesite</option>
              </select>
            </div>

            {freqSel === "__horas__" && (
              <div>
                <label className={lbl}>Cada cuántas horas</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="1" max="23" value={customHoras} onChange={e => setCustomHoras(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">horas</span>
                </div>
              </div>
            )}

            {freqSel === "__dias__" && (
              <div>
                <label className={lbl}>Cada cuántos días</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="2" max="365" value={customDias} onChange={e => setCustomDias(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">días</span>
                </div>
              </div>
            )}

            {showDiaSemana && (
              <div>
                <label className={lbl}>Día de la semana</label>
                <select value={diaSemana} onChange={e => setDiaSemana(e.target.value)} className={cls}>
                  {["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}

            {showDiaDelMes && (
              <div>
                <label className={lbl}>
                  Día del mes
                  {freqSel === "Cada 15 días" && <span className="font-normal text-gray-400 ml-1">(la segunda toma será 15 días después)</span>}
                </label>
                <select value={diaDelMes} onChange={e => setDiaDelMes(Number(e.target.value))} className={cls}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Día {d}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className={lbl}>{["Dos veces al día","Tres veces al día","Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas","__horas__"].includes(freqSel) ? "Hora de toma inicial" : "Hora de toma"}</label>
              <input value={hora} onChange={e => setHora(e.target.value)} type="time" className={cls} />
            </div>

            <div>
              <label className={lbl}>Fecha de inicio del tratamiento <span className="text-red-500">*</span></label>
              <input value={fechaInicio} onChange={e => { setFechaInicio(e.target.value); setError(null); }} type="date" required className={`${cls} ${!fechaInicio ? "border-red-300 dark:border-red-500" : ""}`} />
            </div>

            <div>
              <label className={lbl}>Duración del tratamiento</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[["indefinido","Indefinido"],["dias","Días"],["semanas","Semanas"],["meses","Meses"]].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setDurTipo(val)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${durTipo === val ? "bg-violet-500 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {durTipo !== "indefinido" && (
                <div className="flex items-center gap-3">
                  <input type="number" min="1" value={durValor} onChange={e => setDurValor(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">{durTipo}</span>
                </div>
              )}
            </div>

            <div>
              <label className={lbl}>Sonido de alerta</label>
              <div className="flex flex-wrap gap-2">
                {SONIDOS.map(s => (
                  <button key={s.id} type="button" onClick={() => { setSonido(s.id); playPreview(s.id); }}
                    className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-all ${sonido === s.id ? "bg-violet-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>Emoji</label>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                {EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setEmoji(e)} className={`aspect-square rounded-xl text-xl flex items-center justify-center transition-all ${emoji === e ? "border-2 border-violet-400 bg-violet-50" : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"}`}>{e}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div
          className="flex-shrink-0 px-5 pt-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {error && (
            <div className="text-xs font-medium text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-xl mb-2">{error}</div>
          )}
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200 dark:shadow-none disabled:opacity-60">{saving ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </div>
    </>
  );
}

function SetupScreen({ session, pacienteId, pacientes, onDone, onCancel }) {
  const [pills, setPills] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const addPill = async (data) => {
    const newPill = { ...data, user_id: session.user.id, paciente_id: pacienteId, orden: pills.length };
    const { data: saved, error } = await supabase.from("pastillas").insert(newPill).select().single();
    if (error || !saved) {
      // Antes fallaba en silencio: el usuario "guardaba" pero nada persistía ni se mostraba.
      alert("No se pudo guardar el medicamento. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    setPills([...pills, saved]);
    setShowForm(false);
  };

  const removePill = async (id) => {
    await supabase.from("pastillas").delete().eq("id", id);
    setPills(pills.filter(p => p.id !== id));
  };

  const finish = async () => {
    if (pills.length === 0) return;
    setSaving(true);
    onDone(pills);
  };

  if (showForm) {
    return (
      <PillForm title="Nuevo medicamento" showBackButton={false} onSave={addPill} onCancel={() => setShowForm(false)} />
    );
  }

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 px-4 pb-8">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-2xl shadow-lg shadow-violet-200 dark:shadow-none mx-auto mb-3">💊</div>
          <h1 className="text-xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>Configura tus medicamentos</h1>
          <p className="text-sm text-gray-400">Agrega los medicamentos que tomas</p>
        </div>
        {!showForm ? (
          <>
            <div className="space-y-3 mb-4">
              {pills.map(pill => {
                const c = getColor(pill.color);
                return (
                  <div key={pill.id} className={`flex items-center gap-3 p-4 rounded-2xl ${c.bg}`}>
                    <span className="text-2xl">{pill.emoji}</span>
                    <div className="flex-1">
                      <p className={`font-bold text-sm ${c.text}`}>{pill.nombre}</p>
                      <p className="text-xs text-gray-400">{pill.dosis && `${pill.dosis} · `}{pill.frecuencia}{pill.hora_toma && ` · ${pill.hora_toma}`}</p>
                    </div>
                    <button onClick={() => removePill(pill.id)} className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center text-gray-400 hover:text-red-400"><X size={14} /></button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setShowForm(true)} className="w-full py-3 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 text-sm font-bold text-violet-600 dark:text-violet-300 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all mb-4 flex items-center justify-center gap-1">
              <Plus size={16} /> Agregar medicamento
            </button>
            {pills.length > 0 && (
              <button onClick={finish} disabled={saving} className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold shadow-lg shadow-violet-200 dark:shadow-none" style={{ fontWeight: 800 }}>
                {saving ? "..." : <>¡Listo, empezar! <ArrowRight size={16} className="inline ml-1" /></>}
              </button>
            )}
            {/* Escape del setup: si es un paciente extra (no el único), puede volver sin agregar nada aún. */}
            {onCancel && pacientes && pacientes.length > 1 && (
              <button onClick={onCancel} className="w-full py-3 mt-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-gray-300">
                ← Volver
              </button>
            )}
          </>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">Nuevo medicamento</h2>
            <PillForm onSave={addPill} onCancel={() => setShowForm(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ session, pacienteId, pills, onUpdate, onBack, onManagePacientes, onReportes, criticalAlerts, onToggleCriticalAlerts, bioEnabled, onDisableBio }) {
  const [list, setList] = useState(pills);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState(null);
  const [subInfo, setSubInfo] = useState(null); // detalles de la suscripción (null si no hay / web)
  const [subOpen, setSubOpen] = useState(false); // acordeón "Tu suscripción"
  const [medsOpen, setMedsOpen] = useState(false); // acordeón "Mis medicamentos" (colapsado de inicio)

  // Carga los datos de la suscripción activa para la tarjeta "Tu suscripción".
  useEffect(() => {
    if (!SUBSCRIPTIONS_ENABLED) return;
    (async () => { setSubInfo(await getSubscriptionInfo()); })();
  }, []);

  const fmtFecha = (iso) => {
    if (!iso) return null;
    try { return new Date(iso).toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" }); }
    catch (e) { return null; }
  };
  const planNombre = (pid) =>
    pid?.includes(".annual") ? "Plan Anual" :
    pid?.includes(".monthly") ? "Plan Mensual" :
    pid?.includes(".weekly") ? "Plan Semanal" : "Premium";

  // Elimina la cuenta y todos los datos (requisito App Store 5.1.1(v)).
  // La Edge Function delete-account borra pastillas/medicamentos/pacientes + el usuario de Auth.
  const handleDeleteAccount = async () => {
    setDeleting(true); setDelError(null);
    const { error } = await supabase.functions.invoke("delete-account");
    if (error) {
      setDelError("No se pudo eliminar la cuenta. Revisa tu conexión e inténtalo de nuevo.");
      setDeleting(false);
      return;
    }
    await supabase.auth.signOut(); // sesión ya invalidada server-side; limpia local y va al login
  };

  const addPill = async (data) => {
    const { data: saved, error } = await supabase.from("pastillas").insert({ ...data, user_id: session.user.id, paciente_id: pacienteId, orden: list.length }).select().single();
    if (error || !saved) {
      alert("No se pudo guardar el medicamento. Revisa tu conexión e inténtalo de nuevo.");
      return;
    }
    const nl = [...list, saved]; setList(nl); onUpdate(nl);
    setShowForm(false);
  };

  const editPill = async (data) => {
    const { data: saved } = await supabase.from("pastillas").update(data).eq("id", editing.id).select().single();
    if (saved) { const nl = list.map(p => p.id === editing.id ? saved : p); setList(nl); onUpdate(nl); }
    setEditing(null);
  };

  const removePill = async (id) => {
    await supabase.from("pastillas").delete().eq("id", id);
    const nl = list.filter(p => p.id !== id);
    setList(nl);
    onUpdate(nl);
  };

  if (showForm || editing) {
    return (
      <PillForm
        title={editing ? "Editar medicamento" : "Nuevo medicamento"}
        pill={editing}
        onSave={editing ? editPill : addPill}
        onCancel={() => { setShowForm(false); setEditing(null); }}
      />
    );
  }

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 px-4 pb-6">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-gray-400"><ArrowLeft size={18} /></button>
          <h1 className="text-lg text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>Ajustes</h1>
        </div>
        {!showForm && !editing ? (
          <>
            <button onClick={() => setMedsOpen(o => !o)} className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2 mb-2">
              <Pill size={16} /> Mis medicamentos ({list.length})
              <ChevronDown size={16} className={`ml-auto transition-transform ${medsOpen ? "rotate-180" : ""}`} />
            </button>
            {medsOpen && (<>
              <div className="space-y-3 mb-3">
                {list.map(pill => {
                  const c = getColor(pill.color);
                  return (
                    <div key={pill.id} className={`flex items-center gap-3 p-4 rounded-2xl ${c.bg}`}>
                      <span className="text-2xl">{pill.emoji}</span>
                      <div className="flex-1">
                        <p className={`font-bold text-sm ${c.text}`}>{pill.nombre}</p>
                        <p className="text-xs text-gray-400">{pill.dosis && `${pill.dosis} · `}{pill.frecuencia}{pill.hora_toma && ` · ${pill.hora_toma}`}</p>
                      </div>
                      <button onClick={() => setEditing(pill)} className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center text-gray-400 hover:text-violet-400 mr-1"><Pencil size={14} /></button>
                      <button onClick={() => removePill(pill.id)} className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center text-gray-400 hover:text-red-400"><X size={14} /></button>
                    </div>
                  );
                })}
              </div>
              <button onClick={() => setShowForm(true)} className="w-full py-3 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 text-sm font-bold text-violet-600 dark:text-violet-300 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all mb-3 flex items-center justify-center gap-1">
                <Plus size={16} /> Agregar medicamento
              </button>
            </>)}
            {onManagePacientes && (
              <button onClick={onManagePacientes} className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2 mb-2">
                <Users size={16} /> Gestionar pacientes
              </button>
            )}
            {onReportes && (
              <button onClick={onReportes} className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2">
                <BarChart3 size={16} /> Ver reportes
              </button>
            )}
            {SUBSCRIPTIONS_ENABLED && subInfo && (() => {
              const fecha = fmtFecha(subInfo.expirationDate);
              const esPrueba = subInfo.periodType === "TRIAL";
              let estado;
              if (!fecha) estado = subInfo.willRenew ? "Se renueva automáticamente." : "Activa.";
              else if (esPrueba) estado = subInfo.willRenew ? `Termina el ${fecha}. Después se cobra automáticamente.` : `Termina el ${fecha}. No se renovará.`;
              else estado = subInfo.willRenew ? `Se renueva el ${fecha}.` : `Activa hasta el ${fecha}. No se renovará.`;
              return (
                <>
                  <button onClick={() => setSubOpen(o => !o)} className="w-full mt-2 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2">
                    <Sparkles size={16} /> Tu suscripción
                    <ChevronDown size={16} className={`ml-auto transition-transform ${subOpen ? "rotate-180" : ""}`} />
                  </button>
                  {subOpen && (
                    <div className="mt-2 rounded-2xl bg-white dark:bg-gray-800 shadow-sm p-4">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{planNombre(subInfo.productId)}</span>
                        {esPrueba && <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full">Prueba gratis</span>}
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-400">{estado}</p>
                      <button onClick={() => manageSubscriptions()} className="w-full mt-3 py-2.5 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-sm font-bold text-violet-600 dark:text-violet-300 flex items-center justify-center gap-2">
                        <Settings size={15} /> Administrar suscripción
                      </button>
                    </div>
                  )}
                </>
              );
            })()}
            {onToggleCriticalAlerts && (
              <div className="w-full mt-2 py-3 px-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm flex items-center gap-3">
                <AlertTriangle size={18} className="text-violet-600 shrink-0" />
                <div className="flex-1 text-left">
                  <p className="text-sm font-bold text-violet-600">Alertas críticas</p>
                  <p className="text-xs text-gray-400 dark:text-gray-500">Los recordatorios suenan aunque el teléfono esté en silencio o en Concentración</p>
                </div>
                <button
                  onClick={() => onToggleCriticalAlerts(!criticalAlerts)}
                  aria-label="Activar o desactivar alertas críticas"
                  className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${criticalAlerts ? "bg-violet-500" : "bg-gray-300 dark:bg-gray-600"}`}
                >
                  <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${criticalAlerts ? "translate-x-5" : ""}`} />
                </button>
              </div>
            )}
            <button onClick={() => window.open("https://ailablearning-dot.github.io/mi-pastillero/soporte.html", "_system")} className="w-full mt-2 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2">
              <HelpCircle size={16} /> Ayuda y soporte
            </button>
            <button onClick={() => window.open(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Sugerencia — Mi Pastillero")}`, "_system")} className="w-full mt-2 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2">
              <MessageSquare size={16} /> Enviar una sugerencia
            </button>
            <button onClick={() => window.open("https://ailablearning-dot.github.io/mi-pastillero/privacidad.html", "_system")} className="w-full mt-2 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2">
              <Shield size={16} /> Política de privacidad
            </button>
            {bioEnabled && (
              <button onClick={onDisableBio} className="w-full mt-2 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
                <Lock size={16} /> Desactivar Face ID / huella
              </button>
            )}
            <button onClick={() => { setDelError(null); setConfirmDelete(true); }} className="w-full mt-6 px-4 py-3 rounded-2xl text-sm font-bold text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 flex items-center gap-2 transition-all">
              <Trash2 size={16} /> Eliminar cuenta
            </button>
            <p className="text-center text-xs text-gray-400 mt-6">Versión {APP_VERSION}</p>
          </>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">{editing ? "Editar medicamento" : "Nuevo medicamento"}</h2>
            <PillForm pill={editing} onSave={editing ? editPill : addPill} onCancel={() => { setShowForm(false); setEditing(null); }} />
          </div>
        )}
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => !deleting && setConfirmDelete(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl p-6 max-w-sm w-full shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-red-100 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-500" size={24} />
            </div>
            <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 text-center mb-2">¿Eliminar tu cuenta?</h2>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-1">Se borrarán <strong>permanentemente</strong> todos tus pacientes, medicamentos e historial de dosis.</p>
            <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-3">Esta acción <strong>no se puede deshacer.</strong></p>
            <p className="text-xs text-gray-400 dark:text-gray-500 text-center mb-4">¿Solo quieres quitar un paciente? Usa <strong>Gestionar pacientes</strong>. Esto elimina tu cuenta completa.</p>
            {delError && <p className="text-xs text-red-500 text-center mb-3">{delError}</p>}
            <div className="flex flex-col gap-2">
              <button disabled={deleting} onClick={handleDeleteAccount} className="w-full py-3 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 disabled:opacity-60 flex items-center justify-center gap-2">
                {deleting ? "Eliminando…" : <><Trash2 size={16} /> Sí, eliminar mi cuenta</>}
              </button>
              <button disabled={deleting} onClick={() => setConfirmDelete(false)} className="w-full py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-500 disabled:opacity-60">Cancelar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PacienteForm({ paciente, onSave, onCancel }) {
  const [nombre, setNombre] = useState(paciente?.nombre || "");
  const [emoji, setEmoji] = useState(paciente?.emoji || "👤");

  const handleSave = () => {
    const n = nombre.trim();
    if (!n) return;
    onSave({ nombre: n, emoji });
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5">
      <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">{paciente ? "Editar paciente" : "Nuevo paciente"}</h2>
      <div className="space-y-4">
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Nombre</label>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Mamá, Juan, Yo" maxLength={40}
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
        </div>
        <div>
          <label className="text-xs font-bold text-gray-500 mb-1 block">Avatar</label>
          <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
            {PACIENTE_EMOJIS.map(e => (
              <button key={e} type="button" onClick={() => setEmoji(e)}
                className={`aspect-square rounded-xl text-xl flex items-center justify-center transition-all ${emoji === e ? "border-2 border-violet-400 bg-violet-50" : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"}`}>
                {e}
              </button>
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-500">Cancelar</button>
          <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200 dark:shadow-none">Guardar</button>
        </div>
      </div>
    </div>
  );
}

function PacientesScreen({ session, pacientes, pacienteActivoId, onChange, onBack }) {
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [list, setList] = useState(pacientes);

  useEffect(() => { setList(pacientes); }, [pacientes]);

  const addPaciente = async (data) => {
    const { data: saved } = await supabase.from("pacientes").insert({
      ...data, user_id: session.user.id, orden: list.length
    }).select().single();
    if (saved) { const nl = [...list, saved]; setList(nl); onChange(nl); }
    setShowForm(false);
  };

  const editPaciente = async (data) => {
    const { data: saved } = await supabase.from("pacientes").update(data).eq("id", editing.id).select().single();
    if (saved) { const nl = list.map(p => p.id === editing.id ? saved : p); setList(nl); onChange(nl); }
    setEditing(null);
  };

  const removePaciente = async (p) => {
    if (list.length <= 1) {
      alert("No puedes eliminar el último paciente. Crea otro primero.");
      return;
    }
    const ok = confirm(`¿Eliminar "${p.nombre}"?\n\nSe borrarán también todos sus medicamentos e historial.`);
    if (!ok) return;
    await supabase.from("pacientes").delete().eq("id", p.id);
    const nl = list.filter(x => x.id !== p.id);
    setList(nl);
    onChange(nl);
  };

  if (showForm || editing) {
    return (
      <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
        <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
        <div className="max-w-md mx-auto px-4 pb-6">
          <div className="flex items-center gap-3 mb-5">
            <button onClick={() => { setShowForm(false); setEditing(null); }} className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300"><ArrowLeft size={18} /></button>
            <h1 className="text-lg text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>{editing ? "Editar paciente" : "Nuevo paciente"}</h1>
          </div>
          <PacienteForm paciente={editing} onSave={editing ? editPaciente : addPaciente} onCancel={() => { setShowForm(false); setEditing(null); }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto px-4 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300"><ArrowLeft size={18} /></button>
          <h1 className="text-lg text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>Pacientes</h1>
        </div>
        <p className="text-xs text-gray-500 mb-4">Cada paciente tiene sus propias pastillas e historial independiente. Útil si manejas medicamentos de varias personas (tú, un familiar, etc.).</p>
        <div className="space-y-2 mb-4">
          {list.map(p => (
            <div key={p.id} className={`flex items-center gap-3 p-3 rounded-2xl ${p.id === pacienteActivoId ? "bg-violet-50 dark:bg-violet-950/40 border-2 border-violet-300 dark:border-violet-700" : "bg-white dark:bg-gray-800 shadow-sm"}`}>
              <span className="text-2xl">{p.emoji}</span>
              <div className="flex-1">
                <p className="font-bold text-gray-800 dark:text-gray-100 text-sm">{p.nombre}</p>
                {p.id === pacienteActivoId && <p className="text-xs font-bold text-violet-500">Paciente activo</p>}
              </div>
              <button onClick={() => setEditing(p)} className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-300 flex items-center justify-center hover:text-violet-400"><Pencil size={14} /></button>
              <button onClick={() => removePaciente(p)} className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-400 text-gray-400 dark:text-gray-300 flex items-center justify-center"><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
        <button onClick={() => setShowForm(true)} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-violet-200 dark:shadow-none flex items-center justify-center gap-2"><Plus size={18} /> Agregar paciente</button>
      </div>
    </div>
  );
}

function ReportesScreen({ session, paciente, pills, onBack }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // Cargar historial del mes seleccionado
  useEffect(() => {
    if (!session || !paciente) return;
    (async () => {
      setLoading(true);
      const firstDay = `${year}-${String(month+1).padStart(2,"0")}-01`;
      const lastDay = `${year}-${String(month+1).padStart(2,"0")}-${String(getDaysInMonth(year, month)).padStart(2,"0")}`;
      const { data } = await supabase
        .from("medicamentos")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("paciente_id", paciente.id)
        .eq("tomado", true)
        .gte("fecha", firstDay)
        .lte("fecha", lastDay)
        .order("fecha", { ascending: false })
        .order("hora", { ascending: false });
      setHistorial(data || []);
      setLoading(false);
    })();
  }, [session, paciente, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  // Resolver nombre y dosis de cada registro buscando la pastilla actual
  const enrichRow = (row) => {
    const pill = pills.find(p => p.nombre === row.nombre) || pills.find(p => p.id === row.nombre);
    const timing = getTimingInfo(row.hora_programada, row.hora);
    return {
      fecha: row.fecha,
      hora_programada: row.hora_programada || "—",
      hora_tomada: fmtTime(row.hora) || "—",
      nombre: pill?.nombre || row.nombre,
      emoji: pill?.emoji || "💊",
      dosis: pill?.dosis || "—",
      retraso: !timing ? "—"
        : timing.kind === 'on-time' ? "A tiempo"
        : timing.kind === 'late' ? `+${formatTimingDiff(timing.diffMin)}`
        : `-${formatTimingDiff(timing.diffMin)}`,
    };
  };

  const exportarExcel = async () => {
    setExporting(true);
    try {
      // Hoja 1: Medicamentos (ficha del paciente)
      const hojaMedicamentos = [
        ["Paciente", paciente.nombre],
        ["Reporte generado", new Date().toLocaleString("es-ES")],
        [],
        ["Medicamento", "Dosis", "Frecuencia", "Horarios"],
        ...pills.map(p => {
          const horas = getHoras(p.hora_toma, p.frecuencia);
          return [
            `${p.emoji} ${p.nombre}`,
            p.dosis || "—",
            p.frecuencia || "—",
            horas.length ? horas.join(", ") : "—",
          ];
        }),
      ];

      // Hoja 2: Historial
      const enriched = historial.map(enrichRow);
      const hojaHistorial = [
        ["Paciente", paciente.nombre],
        ["Período", `${MONTHS_ES[month]} ${year}`],
        ["Total dosis tomadas", enriched.length],
        [],
        ["Fecha", "Hora programada", "Hora tomada", "Medicamento", "Dosis", "Cumplimiento"],
        ...enriched.map(r => [
          r.fecha,
          r.hora_programada,
          r.hora_tomada,
          `${r.emoji} ${r.nombre}`,
          r.dosis,
          r.retraso,
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet(hojaMedicamentos);
      ws1['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Medicamentos");

      const ws2 = XLSX.utils.aoa_to_sheet(hojaHistorial);
      ws2['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Historial");

      const safeNombre = paciente.nombre.replace(/[^a-zA-Z0-9_-]/g, "_");
      const fname = `mi-pastillero_${safeNombre}_${year}-${String(month+1).padStart(2,"0")}.xlsx`;

      if (window.Capacitor?.isNativePlatform()) {
        // Generar como base64 y guardar en filesystem, luego compartir
        const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const result = await Filesystem.writeFile({
          path: fname,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({
          title: `Reporte ${paciente.nombre} — ${MONTHS_ES[month]} ${year}`,
          url: result.uri,
          dialogTitle: 'Compartir reporte',
        });
      } else {
        // Web: descarga directa
        XLSX.writeFile(wb, fname);
      }
      showToast("Reporte generado ✓");
    } catch (e) {
      console.error("[exportarExcel]", e);
      showToast("Error: " + (e?.message || "no se pudo exportar"));
    } finally {
      setExporting(false);
    }
  };

  if (!paciente) return null;

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      {toast && <div className="fixed left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-700 text-white dark:text-gray-100 px-5 py-3 rounded-2xl text-sm font-bold shadow-xl" style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>{toast}</div>}
      <div className="max-w-md mx-auto px-4 pb-6">
        <div className="flex items-center gap-3 mb-5">
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-gray-400"><ArrowLeft size={18} /></button>
          <div className="flex-1">
            <h1 className="text-lg text-gray-800 dark:text-gray-100 leading-tight" style={{ fontWeight: 900 }}>Reportes</h1>
            <p className="text-xs text-violet-600 font-bold">{paciente.emoji} {paciente.nombre}</p>
          </div>
          <button
            onClick={exportarExcel}
            disabled={exporting || (pills.length === 0 && historial.length === 0)}
            title="Exportar a Excel"
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg shadow-violet-200 dark:shadow-none flex items-center justify-center text-white disabled:opacity-50 active:scale-95 transition-all"
          >
            <Share2 size={18} />
          </button>
        </div>

        {/* Sección 1: Ficha de medicamentos */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-4">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-3">💊 Medicamentos actuales</h2>
          {pills.length === 0 ? (
            <p className="text-sm text-gray-400">Este paciente no tiene medicamentos registrados.</p>
          ) : (
            <div className="space-y-2">
              {pills.map(p => {
                const horas = getHoras(p.hora_toma, p.frecuencia);
                return (
                  <div key={p.id} className="border border-gray-100 dark:border-gray-700 rounded-2xl p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{p.emoji}</span>
                      <p className="flex-1 font-bold text-sm text-gray-800 dark:text-gray-100">{p.nombre}</p>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                      {p.dosis && <p><span className="font-bold text-gray-600 dark:text-gray-300">Dosis:</span> {p.dosis}</p>}
                      <p><span className="font-bold text-gray-600 dark:text-gray-300">Frecuencia:</span> {p.frecuencia || "—"}</p>
                      <p><span className="font-bold text-gray-600 dark:text-gray-300">Horarios:</span> {horas.length ? horas.join(", ") : "—"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sección 2: Historial */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">📋 Historial de dosis</h2>
          </div>
          <div className="flex items-center justify-between mb-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-white text-gray-500 flex items-center justify-center"><ChevronLeft size={16} /></button>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{MONTHS_ES[month]} {year}</p>
            <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-white text-gray-500 flex items-center justify-center"><ChevronRight size={16} /></button>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Cargando...</p>
          ) : historial.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin registros en este mes.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-2">{historial.length} dosis registradas</p>
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {historial.map(row => {
                  const r = enrichRow(row);
                  const timing = getTimingInfo(row.hora_programada, row.hora);
                  return (
                    <div key={row.id} className="text-xs border border-gray-100 dark:border-gray-700 rounded-xl p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-bold text-gray-800 dark:text-gray-100">{r.fecha}</span>
                        {timing && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            timing.kind === 'on-time' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                            : timing.kind === 'late' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                            : 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                          }`}>{r.retraso}</span>
                        )}
                      </div>
                      <p className="text-gray-600 dark:text-gray-300">
                        <span className="text-base">{r.emoji}</span> {r.nombre}
                        {r.dosis !== "—" && <span className="text-gray-400"> · {r.dosis}</span>}
                      </p>
                      <p className="text-gray-400 mt-0.5">Programada {r.hora_programada} · Tomada {r.hora_tomada}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// Modal de confirmación de una dosis puntual (al tocar la notificación o una
// pastilla en la lista): Tomado / Aplazar / No tomado, con hora editable.
function DoseConfirmModal({ dose, record, onTaken, onSkip, onSnooze, onClear, onClose }) {
  const { pill, scheduledTime, dateStr } = dose;
  const c = getColor(pill.color);
  const [showSnooze, setShowSnooze] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [customTime, setCustomTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  });
  const alreadyTaken = record?.tomado === true;
  const alreadySkipped = record?.tomado === false;
  const dateLabel = new Date(dateStr + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  // El backdrop NO cierra el modal a propósito: es una decisión de medicación (a menudo abierta
  // desde la notificación) → solo se cierra con la X o eligiendo una opción, para que un toque
  // accidental fuera de la tarjeta no lo descarte y deje la dosis sin registrar.
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-6" style={{ animation: "fadeIn .2s ease" }}>
      <div className="w-full max-w-xs bg-white dark:bg-gray-800 rounded-3xl p-6 relative">
        <button onClick={onClose} aria-label="Cerrar" className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg active:scale-95"><X size={18} /></button>
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{pill.nombre}</h3>
          <p className="text-sm text-gray-400 mt-0.5">{pill.dosis ? `${pill.dosis} · ` : ""}{dateLabel}, {fmt12h(scheduledTime)}</p>
          <div className={`w-20 h-20 rounded-full ${c.accent} flex items-center justify-center text-4xl mx-auto my-5 shadow-lg`}>{pill.emoji}</div>
          <p className="font-bold text-gray-700 dark:text-gray-200 mb-3">¿Ha tomado su medicamento?</p>
          <div className="text-sm text-gray-500 mb-5 flex items-center justify-center gap-2">
            <span>Hora:</span>
            {editingTime
              ? <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)} className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm dark:bg-gray-700 dark:text-gray-100" />
              : <button onClick={() => setEditingTime(true)} className="font-bold text-violet-600 inline-flex items-center gap-1">Ahora <Pencil size={12} /></button>}
          </div>

          {!showSnooze ? (
            <div className="space-y-2">
              <button onClick={() => onTaken(editingTime ? customTime : null)} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-violet-200 dark:shadow-none active:scale-[0.98]">Tomada</button>
              <button onClick={() => setShowSnooze(true)} className="w-full bg-violet-50 dark:bg-gray-700 text-violet-600 dark:text-violet-300 font-bold py-3 rounded-2xl active:scale-[0.98]">Posponer</button>
              <button onClick={onSkip} className="w-full text-red-500 font-bold py-2 active:scale-[0.98]">No tomada</button>
              {(alreadyTaken || alreadySkipped) && (
                <button onClick={onClear} className="w-full text-gray-400 text-xs font-bold pt-1">Deshacer registro</button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400 mb-2">Recordar en:</p>
              <div className="flex gap-2">
                {[10, 30, 60].map(min => (
                  <button key={min} onClick={() => onSnooze(min)} className="flex-1 bg-violet-50 dark:bg-gray-700 text-violet-600 dark:text-violet-300 font-bold py-3 rounded-2xl active:scale-[0.98]">{min} min</button>
                ))}
              </div>
              <button onClick={() => setShowSnooze(false)} className="w-full text-gray-400 text-xs font-bold pt-3">Cancelar</button>
            </div>
          )}
          {alreadyTaken && <p className="text-xs text-emerald-500 font-bold mt-3">Ya registrado como tomado</p>}
          {alreadySkipped && <p className="text-xs text-red-500 font-bold mt-3">Marcado como no tomado</p>}
        </div>
      </div>
    </div>
  );
}

// Etiqueta en español para cada tipo de paquete de RevenueCat.
function packageLabel(pkg) {
  const t = pkg?.packageType || "";
  if (t === "WEEKLY") return { nombre: "Semanal", periodo: "por semana" };
  if (t === "MONTHLY") return { nombre: "Mensual", periodo: "por mes" };
  if (t === "ANNUAL") return { nombre: "Anual", periodo: "por año" };
  return { nombre: pkg?.identifier || "Plan", periodo: "" };
}

// % de ahorro de un plan frente a pagar el mismo tiempo al precio semanal.
// Se calcula en vivo con los precios reales de RevenueCat (funciona en cualquier
// moneda/país). Devuelve null si no aplica: sin plan semanal, es el propio semanal,
// faltan precios, o no hay ahorro real.
function savingsPct(pkgs, pkg) {
  const weekly = pkgs.find(p => p.packageType === "WEEKLY")?.product?.price;
  const price = pkg?.product?.price;
  if (!weekly || !price || pkg?.packageType === "WEEKLY") return null;
  const perWeek =
    pkg.packageType === "MONTHLY" ? (price * 12) / 52 :
    pkg.packageType === "ANNUAL" ? price / 52 : null;
  if (!perWeek) return null;
  const pct = Math.round((1 - perWeek / weekly) * 100);
  return pct > 0 ? pct : null;
}

// Pantalla de paywall: 3 planes + prueba de 7 días + restaurar + Términos/Privacidad.
// Recibe onPurchased() (cuando queda con suscripción activa). El texto de renovación
// automática y precio es requisito de Apple (guía 3.1.2).
function Paywall({ onPurchased }) {
  const [pkgs, setPkgs] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const list = await getPackages();
      // Orden fijo: semanal → mensual → anual (RevenueCat los devuelve en otro orden).
      const ORDEN = { WEEKLY: 0, MONTHLY: 1, ANNUAL: 2 };
      list.sort((a, b) => (ORDEN[a.packageType] ?? 99) - (ORDEN[b.packageType] ?? 99));
      setPkgs(list);
      // Preselecciona el anual (mejor valor) si existe.
      const annual = list.find(p => p.packageType === "ANNUAL");
      setSelected(annual || list[0] || null);
    })();
  }, []);

  const comprar = async () => {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      const ok = await buyPackage(selected);
      if (ok) onPurchased();
    } catch (e) {
      if (!e?.userCancelled && e?.code !== "1") setError("No se pudo completar la compra. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const restaurar = async () => {
    setBusy(true); setError(null);
    try {
      const ok = await restore();
      if (ok) onPurchased();
      else setError("No encontramos una suscripción activa para restaurar.");
    } catch (e) {
      setError("No se pudo restaurar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 px-4 pb-8">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6 mt-2">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-violet-200 dark:shadow-none mx-auto mb-3">💊</div>
          <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>Prueba 7 días gratis</h1>
          <p className="text-sm text-gray-400">Cuida tu salud y la de tu familia sin límites</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-4">
          {["Recordatorios que suenan a tiempo","Pacientes ilimitados para toda la familia","Reportes en Excel para tu médico","Historial completo y respaldo en la nube"].map(b => (
            <div key={b} className="flex items-center gap-2 py-1.5">
              <div className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0"><Check size={13} className="text-violet-600 dark:text-violet-300" /></div>
              <span className="text-sm text-gray-700 dark:text-gray-200">{b}</span>
            </div>
          ))}
        </div>

        {pkgs === null ? (
          <p className="text-center text-sm text-gray-400 py-6">Cargando planes…</p>
        ) : pkgs.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6">Los planes no están disponibles en este momento.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {pkgs.map(pkg => {
              const { nombre, periodo } = packageLabel(pkg);
              const isSel = selected?.identifier === pkg.identifier;
              const best = pkg.packageType === "ANNUAL";
              const ahorro = savingsPct(pkgs, pkg);
              return (
                <button key={pkg.identifier} onClick={() => setSelected(pkg)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all ${isSel ? "border-violet-400 bg-violet-50 dark:bg-violet-950/30" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"}`}>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{nombre}</span>
                      {best && <span className="text-[10px] font-black text-white bg-gradient-to-r from-violet-500 to-indigo-500 px-2 py-0.5 rounded-full">MEJOR VALOR</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{periodo}</span>
                      {ahorro && <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full">Ahorra {ahorro}%</span>}
                    </div>
                  </div>
                  <span className="text-base font-black text-gray-800 dark:text-gray-100">{pkg.product?.priceString}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-red-500 text-center mb-3">{error}</p>}

        <button onClick={comprar} disabled={busy || !selected} className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold shadow-lg shadow-violet-200 dark:shadow-none disabled:opacity-60 flex items-center justify-center gap-2" style={{ fontWeight: 800 }}>
          <Sparkles size={18} /> {busy ? "Un momento…" : "Empezar 7 días gratis"}
        </button>

        <button onClick={restaurar} disabled={busy} className="w-full py-3 mt-2 text-sm text-gray-400 hover:opacity-80">
          ¿Ya eres suscriptor? <span className="font-bold text-violet-600">Restaurar compras</span>
        </button>

        <p className="text-[11px] text-gray-400 text-center leading-relaxed mt-3">
          Prueba de 7 días gratis. Después se cobra el plan elegido a tu Apple ID y se renueva automáticamente. Cancélala cuando quieras en Ajustes de tu iPhone → Suscripciones, al menos 24&nbsp;h antes de que termine el periodo.
        </p>
        <p className="text-[11px] text-center mt-2">
          <a href={TERMS_URL} target="_blank" rel="noreferrer" className="text-violet-500 font-bold underline">Términos</a>
          <span className="text-gray-400"> · </span>
          <a href={PRIVACY_URL} target="_blank" rel="noreferrer" className="text-violet-500 font-bold underline">Privacidad</a>
        </p>
      </div>
    </div>
  );
}

// Modal para cuando 2+ dosis coinciden en el mismo minuto (mismo o distintos pacientes).
// Se abre al tocar la notificación agrupada. Lista TODAS las dosis de ese horario (cross-
// paciente) y permite decidir por cada una: Tomar / Posponer / No tomar. Es auto-contenido:
// escribe en `medicamentos` con el paciente_id de CADA dosis (no depende del paciente activo).
function GroupDoseModal({ session, dateStr, hora, pacientes, onClose }) {
  const [doses, setDoses] = useState(null);         // [{ key, pill, pacienteNombre }]
  const [status, setStatus] = useState({});         // key -> true | false | 'snoozed'
  const [snoozeFor, setSnoozeFor] = useState(null); // key en modo "posponer"
  const pacById = Object.fromEntries((pacientes || []).map(p => [p.id, p]));

  useEffect(() => {
    (async () => {
      // Las dos consultas EN PARALELO (antes eran en serie → ~1-2s de "Cargando…" feo).
      const [pillsRes, recsRes] = await Promise.all([
        supabase.from("pastillas").select("*").eq("user_id", session.user.id).order("orden"),
        supabase.from("medicamentos").select("id,nombre,tomado,paciente_id,hora_programada").eq("user_id", session.user.id).eq("fecha", dateStr),
      ]);
      const allPills = pillsRes.data;
      const recs = recsRes.data;
      const due = (allPills || []).filter(p => isPillDueOnDay(p, dateStr) && getHoras(p.hora_toma, p.frecuencia).includes(hora));
      const st = {};
      const list = due.map(p => {
        const key = `${p.id}_${hora}`;
        const rec = (recs || []).find(r => r.paciente_id === p.paciente_id && r.nombre === p.nombre && String(r.hora_programada).slice(0, 5) === hora);
        if (rec) st[key] = rec.tomado;
        return { key, pill: p, pacienteNombre: pacById[p.paciente_id]?.nombre || "" };
      });
      setDoses(list);
      setStatus(st);
    })();
  }, []);

  const marcar = async (dose, tomado) => {
    const horaReal = new Date().toLocaleTimeString("es-ES");
    const { data: recs } = await supabase.from("medicamentos").select("id")
      .eq("user_id", session.user.id).eq("fecha", dateStr)
      .eq("paciente_id", dose.pill.paciente_id).eq("nombre", dose.pill.nombre).eq("hora_programada", hora);
    const existing = recs?.[0];
    if (existing?.id) {
      await supabase.from("medicamentos").update({ tomado, hora: horaReal }).eq("id", existing.id);
    } else {
      await supabase.from("medicamentos").insert({ nombre: dose.pill.nombre, fecha: dateStr, tomado, hora: horaReal, hora_programada: hora, user_id: session.user.id, paciente_id: dose.pill.paciente_id });
    }
    if (window.Capacitor?.isNativePlatform()) {
      try { await LocalNotifications.cancel({ notifications: [{ id: notifId(dose.pill.id, 'snooze', hora) }] }); } catch (_) { /* noop */ }
    }
    setStatus(s => ({ ...s, [dose.key]: tomado }));
  };

  const posponer = async (dose, minutes) => {
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const at = new Date(Date.now() + minutes * 60000);
        await LocalNotifications.schedule({ notifications: [{
          id: notifId(dose.pill.id, 'snooze', hora), // id estable por dosis: re-posponer reemplaza, no acumula
          title: '💊 Mi Pastillero',
          body: `Recordatorio: ${dose.pill.emoji} ${dose.pill.nombre}${dose.pill.dosis ? ` (${dose.pill.dosis})` : ''}`,
          schedule: { at },
          ...soundFields(dose.pill.sonido),
          actionTypeId: 'PILL_ACTIONS',
          extra: { pillId: dose.pill.id, scheduledTime: hora, dateStr: fmtDate(at.getFullYear(), at.getMonth(), at.getDate()), doseKey: `${dose.pill.id}_${hora}`, pacienteId: dose.pill.paciente_id, snooze: true },
        }]});
      } catch (_) { /* noop */ }
    }
    setStatus(s => ({ ...s, [dose.key]: 'snoozed' }));
    setSnoozeFor(null);
  };

  const dateLabel = new Date(dateStr + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  // Igual que DoseConfirmModal: el backdrop NO cierra (decisión de medicación desde notificación);
  // solo la X o resolver las dosis. Evita el descarte accidental por un toque fuera de la tarjeta.
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-5" style={{ animation: "fadeIn .2s ease" }}>
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl p-5 relative max-h-[80vh] flex flex-col">
        <button onClick={onClose} aria-label="Cerrar" className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg active:scale-95"><X size={18} /></button>
        <div className="text-center mb-3">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Medicamentos de las {fmt12h(hora)}</h3>
          <p className="text-sm text-gray-400">{dateLabel}</p>
        </div>
        {doses === null ? (
          <p className="text-center text-sm text-gray-400 py-6">Cargando…</p>
        ) : doses.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6">No hay medicamentos para esta hora.</p>
        ) : (
          <div className="overflow-y-auto space-y-3 pr-1">
            {doses.map(dose => {
              const c = getColor(dose.pill.color);
              const st = status[dose.key];
              return (
                <div key={dose.key} className={`rounded-2xl p-3 ${c.bg}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{dose.pill.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm ${c.text} truncate`}>{dose.pill.nombre}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{dose.pacienteNombre}{dose.pill.dosis ? ` · ${dose.pill.dosis}` : ""}</p>
                    </div>
                  </div>
                  {st === true ? (
                    <p className="text-xs font-bold text-emerald-600 mt-2 text-center">✓ Tomada</p>
                  ) : st === false ? (
                    <p className="text-xs font-bold text-red-500 mt-2 text-center">No tomada</p>
                  ) : st === 'snoozed' ? (
                    <p className="text-xs font-bold text-violet-500 mt-2 text-center">Pospuesta</p>
                  ) : snoozeFor === dose.key ? (
                    <div className="flex gap-2 mt-2 items-center">
                      {[10, 30, 60].map(min => (
                        <button key={min} onClick={() => posponer(dose, min)} className="flex-1 bg-white/70 dark:bg-gray-700 text-violet-600 dark:text-violet-300 font-bold py-2 rounded-xl text-xs active:scale-[0.98]">{min}m</button>
                      ))}
                      <button onClick={() => setSnoozeFor(null)} aria-label="Cancelar" className="px-2 text-gray-400 text-xs">✕</button>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => marcar(dose, true)} className="flex-1 bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-2 rounded-xl text-xs active:scale-[0.98]">Tomada</button>
                      <button onClick={() => setSnoozeFor(dose.key)} className="flex-1 bg-white/70 dark:bg-gray-700 text-violet-600 dark:text-violet-300 font-bold py-2 rounded-xl text-xs active:scale-[0.98]">Posponer</button>
                      <button onClick={() => marcar(dose, false)} className="flex-1 text-red-500 font-bold py-2 rounded-xl text-xs active:scale-[0.98]">No tomada</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button onClick={onClose} className="w-full mt-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm">Cerrar</button>
      </div>
    </div>
  );
}

// Periodo de gracia del bloqueo biométrico: si vuelves del fondo antes de esto,
// no se re-pide Face ID (evita re-verificar al salir de la app un rato).
const LOCK_GRACE_MS = 3 * 60 * 1000; // 3 minutos

export default function App() {
  const [session, setSession] = useState(undefined);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false); // velo de privacidad al ir al fondo (sin pedir Face ID)
  const [criticalAlerts, setCriticalAlerts] = useState(true); // Alertas Críticas ON por defecto
  const [bioEnabled, setBioEnabled] = useState(false); // se carga async desde Preferences al montar
  // Arranca con el último estado premium conocido leído SÍNCRONAMENTE del espejo en localStorage,
  // para que un usuario premium nunca vea un frame del paywall al abrir. Si no hay espejo (primer
  // arranque / reinstalación), cae a false y el gate de "Cargando…" cubre la verificación async.
  const [hasPremium, setHasPremium] = useState(() => {
    try { return localStorage.getItem("premium_cache") === "1"; } catch (_) { return false; }
  }); // suscripción activa (o en prueba)
  const [premiumChecked, setPremiumChecked] = useState(!SUBSCRIPTIONS_ENABLED); // con subs off, no hace falta chequear
  const [netUnverified, setNetUnverified] = useState(false); // offline + sin caché premium → pantalla "Sin conexión" (NO paywall)
  const [netTick, setNetTick] = useState(0); // sube al reconectar → re-verifica premium
  const [pacientes, setPacientes] = useState([]);
  const [pacienteActivoId, setPacienteActivoIdState] = useState(null);
  const [showPacienteSelector, setShowPacienteSelector] = useState(false);
  const [pills, setPills] = useState(null);
  const [screen, setScreen] = useState("main");
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(fmtDate(today.getFullYear(), today.getMonth(), today.getDate()));
  const [toast, setToast] = useState(null);
  const [view, setView] = useState("today");
  const [collapsedBlocks, setCollapsedBlocks] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const [groupModal, setGroupModal] = useState(null); // { dateStr, hora } — lista de dosis que coinciden
  const [confirmDose, setConfirmDose] = useState(null); // { pill, scheduledTime, dateStr } → modal de confirmación
  const [confirmLogout, setConfirmLogout] = useState(false); // confirmación antes de cerrar sesión
  const blocksInitRef = useRef(false);
  const premiumListenerRef = useRef(false); // listener de RevenueCat agregado una sola vez
  const pacientesLoadedRef = useRef(null); // guard: evita cargar/auto-crear "Yo" dos veces por eventos de auth casi simultáneos
  const swRegRef = useRef(null);
  const offlineQueueRef = useRef({});      // dosis marcadas sin conexión, pendientes de sincronizar
  const flushingRef = useRef(false);       // candado: evita que dos disparadores sincronicen a la vez
  const flushRef = useRef(null);           // apunta al último flushOfflineQueue (para llamarlo al cargar la cola)
  const hiddenAtRef = useRef(0); // timestamp del último paso a segundo plano (para el periodo de gracia del bloqueo)
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "prompt"
  );
  const [resumeTick, setResumeTick] = useState(0); // sube al volver del fondo → dispara reprogramación de notifs

  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(reg => { swRegRef.current = reg; });
    }
    (async () => {
      // SESIÓN GUARDADA PRIMERO: la leemos del storage (lectura local, rápida) y entramos SIN
      // esperar a la red. getSession() valida/refresca en segundo plano (onAuthStateChange corrige
      // si el token cambió o la sesión ya no es válida). Antes esperábamos hasta 10s a getSession
      // → "Cargando…" varios segundos en red lenta (p.ej. 5G reconectando tras quitar el cable).
      let session;
      if (window.Capacitor?.isNativePlatform()) {
        const stored = await readStoredSession();
        if (stored) {
          session = stored;
          // Validar/refrescar en segundo plano; solo re-setea si el token cambió (refresh) o si la
          // sesión ya no es válida (→ null → logout). Así no bloquea la UI ni re-dispara de más.
          supabase.auth.getSession().then(({ data }) => {
            const s = data.session;
            if (!s) setSession(null);
            else if (s.access_token !== stored.access_token) setSession(s);
          }).catch(() => { /* offline / red: conservamos la sesión guardada */ });
        } else {
          // Sin sesión guardada: esperamos a getSession (con tope) para decidir login vs app.
          const offline = navigator.onLine === false;
          session = await withTimeout(
            supabase.auth.getSession().then(({ data }) => data.session).catch(() => null),
            offline ? 2000 : 10000,
            null
          );
        }
      } else {
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }
      setSession(session);
      // El flag de Face ID vive en Preferences (localStorage no persiste en iOS al relanzar).
      const bio = (await safeStorage.get("bio_enabled")) === "true";
      setBioEnabled(bio);
      if (session && bio) setLocked(true);
      // Alertas Críticas: default ON (solo se apaga si el usuario lo guardó como "false").
      const crit = await safeStorage.get("critical_alerts");
      _criticalAlerts = (crit == null) ? true : (crit === "true");
      setCriticalAlerts(_criticalAlerts);
    })();
    if (window.Capacitor?.isNativePlatform()) {
      LocalNotifications.registerActionTypes({ types: [{ id: 'PILL_ACTIONS', actions: [
        { id: 'TOMAR', title: 'Tomar 💊', foreground: true },
        { id: 'POSPONER', title: 'Posponer' },
      ]}] }).catch(() => {});
      LocalNotifications.checkPermissions().then(({ display }) => {
        setNotifPermission(display); // 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
      });
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session));

    const kb = window.Capacitor?.Plugins?.Keyboard;
    if (kb) {
      kb.addListener('keyboardWillShow', (info) => {
        document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      });
      kb.addListener('keyboardWillHide', () => {
        document.documentElement.style.setProperty('--keyboard-height', '0px');
      });
    }

    let actionListener;
    if (window.Capacitor?.isNativePlatform()) {
      LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        // Cualquier interacción con la notificación (tap normal o acción "Tomar")
        // abre el modal de confirmación de esa dosis. Navegamos al home porque esos modales
        // solo se renderizan en la pantalla principal: si el usuario dejó la app en Ajustes/
        // Reportes/etc., sin volver al home el modal no aparecería.
        const ex = notification.extra || {};
        if (ex.group) { setScreen("main"); setGroupModal({ dateStr: ex.dateStr, hora: ex.hora }); } // notif agrupada → lista in-app
        else if (ex.pillId) { setScreen("main"); setPendingAction({ pillId: ex.pillId, scheduledTime: ex.scheduledTime, dateStr: ex.dateStr, pacienteId: ex.pacienteId }); }
      }).then(handle => { actionListener = handle; });
    }

    return () => {
      subscription.unsubscribe();
      window.Capacitor?.Plugins?.Keyboard?.removeAllListeners();
      actionListener?.remove();
    };
  }, []);

  const requestNotifPermission = async () => {
    if (window.Capacitor?.isNativePlatform()) {
      await LocalNotifications.registerActionTypes({ types: [{ id: 'PILL_ACTIONS', actions: [
        { id: 'TOMAR', title: 'Tomar 💊', foreground: true },
        { id: 'POSPONER', title: 'Posponer' },
      ]}] }).catch(() => {});
      const { display } = await LocalNotifications.requestPermissions();
      setNotifPermission(display);
      // No agendamos aquí solo el paciente activo: el efecto de scheduling reacciona al
      // cambio de `notifPermission` y reprograma TODOS los pacientes (con su sonido).
    } else {
      if (typeof Notification === "undefined") return;
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    }
  };

  // Enciende/apaga Alertas Críticas. Actualiza la preferencia + el módulo (_criticalAlerts);
  // el efecto de scheduling (que depende de `criticalAlerts`) reprograma con el nuevo nivel.
  const toggleCriticalAlerts = (val) => {
    _criticalAlerts = val;
    setCriticalAlerts(val);
    safeStorage.set("critical_alerts", String(val));
  };

  // Si el usuario ya denegó las notificaciones, iOS no vuelve a preguntar: hay que
  // mandarlo a los Ajustes de la app para reactivarlas.
  const openNotifSettings = () => {
    if (window.Capacitor?.isNativePlatform()) window.open("app-settings:", "_system");
  };

  // Persiste el paciente activo (compartido entre cierres de la app)
  const setPacienteActivoId = useCallback(async (id) => {
    setPacienteActivoIdState(id);
    if (id) await safeStorage.set("paciente_activo_id", id);
  }, []);

  // Privacidad + re-bloqueo con periodo de gracia (visibilitychange del WKWebView).
  // Al IR al fondo: cubrimos la pantalla con un velo (para el snapshot del multitareas)
  // SIN pedir Face ID, y guardamos la hora. Al VOLVER: quitamos el velo y solo re-pedimos
  // Face ID si estuvo en el fondo más de LOCK_GRACE_MS. Así, salir unos segundos y volver
  // ya no re-pide Face ID (antes se bloqueaba en cada paso al fondo = incómodo).
  useEffect(() => {
    if (!session || !bioEnabled) return;
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        setCovered(true);
      } else {
        setCovered(false);
        if (Date.now() - (hiddenAtRef.current || 0) > LOCK_GRACE_MS) setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session, bioEnabled]);

  // RevenueCat: inicializa (no-op sin API key / en web), identifica al usuario y
  // chequea si tiene suscripción activa. Todo detrás de SUBSCRIPTIONS_ENABLED, así
  // que mientras esté apagado no toca nada del flujo actual.
  useEffect(() => {
    if (!SUBSCRIPTIONS_ENABLED) return;
    (async () => {
      // Optimista: arranca con el último estado premium conocido (caché local). Evita que el
      // paywall parpadee al abrir para un usuario premium, y que se quede ATRAPADO sin conexión
      // (si RevenueCat no puede verificar, respetamos el caché en vez de mostrar el paywall).
      const cachedPremium = (await safeStorage.get("premium_cache")) === "1";
      if (cachedPremium) setHasPremium(true);

      await withTimeout(initPurchases(), 4000, undefined); // no bloquear el arranque si RC se cuelga offline
      // Listener reactivo (una sola vez): SOLO DESBLOQUEA (nunca bloquea), para no causar
      // parpadeos por estados transitorios de RevenueCat (p.ej. el usuario anónimo antes de
      // identificarse). El bloqueo real solo ocurre con un chequeo confiable (abajo).
      if (!premiumListenerRef.current) {
        const id = await withTimeout(addPremiumListener((premium) => {
          if (premium) { setHasPremium(true); cachePremium(true); setNetUnverified(false); }
        }), 3000, null);
        if (id !== null && id !== undefined) premiumListenerRef.current = true;
      }
      if (session?.user?.id) {
        // Offline NO llamamos a logIn (colgaría/fallaría): sin red = "no se pudo determinar" (null).
        // Timeout de 4s: si logIn se cuelga (sin señal real aunque onLine diga true), resolvemos null.
        const premiumNow = navigator.onLine ? await withTimeout(identifyUser(session.user.id), 4000, null) : null;
        if (premiumNow === true) { setHasPremium(true); cachePremium(true); setNetUnverified(false); }
        else if (premiumNow === false) {
          // Definitivo: sin premium. Si NO veníamos de premium cacheado, aplicamos el candado ya.
          // Si SÍ veníamos de premium cacheado, NO bajamos en caliente (RevenueCat a veces devuelve
          // un customerInfo transitorio sin el entitlement justo tras configurar → causaría el flash
          // del paywall). Solo corregimos la caché; si de verdad expiró, entra limpio al próximo inicio.
          cachePremium(false); setNetUnverified(false);
          if (!cachedPremium) setHasPremium(false);
        }
        else {
          // premiumNow === null: no se pudo verificar (offline, timeout de red, o error de RC).
          if (cachedPremium || !navigator.onLine) {
            // Ya verificado antes (caché) O sin conexión → MODO GRACIA: entra al home. Sin conexión
            // el paywall no sirve igual (no se pueden cargar ni comprar planes), así que nunca
            // bloqueamos por red caída; NO persistimos premium (no llamamos cachePremium) → al
            // reconectar se re-verifica y, si de verdad no tiene, el candado entra limpio.
            setHasPremium(true); setNetUnverified(false);
          } else {
            // ONLINE pero no se pudo verificar (RC caído / timeout): pantalla "Sin conexión" con reintento.
            setNetUnverified(true);
          }
        }
        setPremiumChecked(true); // sesión ya verificada → recién aquí se puede decidir el candado
      } else {
        // SIN sesión (deslogueado). CLAVE para el parpadeo: NO dejar premiumChecked en true.
        // Si quedara en true, al INICIAR SESIÓN el efecto vuelve a verificar premium de forma
        // async y, mientras tanto, el gate de "Cargando…" (que exige !premiumChecked) NO aplicaría
        // → se colaría un frame del paywall antes de confirmar que el usuario es premium. Con
        // premiumChecked=false, el login muestra "Cargando…" hasta confirmar, jamás el paywall.
        await logoutPurchases();
        setHasPremium(false);
        cachePremium(false); // al cerrar sesión, limpiar el caché premium
        setNetUnverified(false);
        setPremiumChecked(false);
      }
    })();
  }, [session, netTick]);

  // Al RECONECTAR, re-verifica premium para salir solo de la pantalla "Sin conexión".
  useEffect(() => {
    const onOnline = () => setNetTick(t => t + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

  // Reprograma las notificaciones al VOLVER del fondo (además del arranque en frío y de
  // editar un medicamento). Así "hoy" siempre queda como día 0 y la cola pendiente se
  // refresca cada vez que el usuario abre la app. Corre siempre en nativo (no depende de
  // Face ID, a diferencia del efecto de arriba).
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform()) return;
    const onVis = () => { if (!document.hidden) setResumeTick(t => t + 1); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  // Cargar pacientes del usuario actual + auto-crear "Yo" si no tiene ninguno
  useEffect(() => {
    if (!session) { pacientesLoadedRef.current = null; return; }
    // Guard sincrónico: al iniciar sesión Supabase emite varios eventos de auth
    // (INITIAL_SESSION + SIGNED_IN) → este efecto corría dos veces y creaba dos "Yo".
    // Con el ref por usuario solo corre una vez. (Se resetea al hacer signOut arriba.)
    if (pacientesLoadedRef.current === session.user.id) return;
    pacientesLoadedRef.current = session.user.id;
    const cacheKey = `pacientes_cache_${session.user.id}`;
    const applyActive = async (lista) => {
      setPacientes(lista);
      // Restaurar paciente activo o usar el primero
      const saved = await safeStorage.get("paciente_activo_id");
      const valido = lista.find(p => p.id === saved);
      const activo = valido ? valido.id : lista[0]?.id;
      setPacienteActivoIdState(activo);
      if (activo && activo !== saved) await safeStorage.set("paciente_activo_id", activo);
    };
    const fromCache = async () => {
      const raw = await safeStorage.get(cacheKey);
      if (raw) { try { const lista = JSON.parse(raw); if (lista.length) { await applyActive(lista); return true; } } catch (_) { /* noop */ } }
      return false;
    };
    (async () => {
      // CACHÉ-PRIMERO: mostrar los pacientes cacheados YA (online u offline) para no bloquear el
      // arranque esperando la red. En red lenta esto es la diferencia entre "Cargando…" varios
      // segundos y entrar al instante. Luego, si hay conexión, revalidamos contra la BD.
      const cachedShown = await fromCache();
      // Sin conexión: quedarse con la caché; NO consultar ni crear "Yo" (fallaría / duplicaría).
      if (!navigator.onLine) { if (!cachedShown) pacientesLoadedRef.current = null; return; }
      const { data: pacs, error } = await supabase.from("pacientes").select("*").eq("user_id", session.user.id).order("orden").order("created_at");
      if (error) { if (!cachedShown) pacientesLoadedRef.current = null; return; } // red falló → nos quedamos con la caché ya mostrada (o reintentar si no había)
      let lista = pacs || [];
      // Auto-crear "Yo" para usuarios nuevos (sin pacientes después de la migración)
      if (lista.length === 0) {
        // es_default:true + índice único parcial (migración 004) garantizan un solo
        // default por usuario aunque una carrera intente crear el segundo.
        const { data: nuevo } = await supabase.from("pacientes").insert({
          user_id: session.user.id, nombre: "Yo", emoji: "👤", orden: 0, es_default: true
        }).select().single();
        if (nuevo) {
          lista = [nuevo];
        } else {
          // El insert falló (p.ej. violación del índice único por una carrera, o red) →
          // re-leer para quedarnos con el "Yo" que sí exista.
          const { data: again } = await supabase.from("pacientes").select("*").eq("user_id", session.user.id).order("orden").order("created_at");
          lista = again || [];
        }
      }
      await applyActive(lista);
      safeStorage.set(cacheKey, JSON.stringify(lista)); // caché para arranques offline
    })();
  }, [session, netTick]); // netTick: reintenta al reconectar (si la carga offline falló sin caché)

  // Cargar pastillas del paciente activo. Se cachean localmente para que SIN conexión la app
  // muestre los medicamentos reales (no "Configura tus medicamentos") y no se borren al reabrir /
  // reactivar la app offline. Con timeout para no colgarse si la red no responde.
  useEffect(() => {
    if (!session || !pacienteActivoId) return;
    const cacheKey = `pills_cache_${pacienteActivoId}`;
    (async () => {
      // CACHÉ-PRIMERO: mostrar las pastillas cacheadas YA para no bloquear la UI esperando la red
      // (arranque instantáneo en red lenta). Luego revalidamos contra la BD y refrescamos si cambió.
      let hadCache = false;
      const raw = await safeStorage.get(cacheKey);
      if (raw) { try { setPills(JSON.parse(raw)); hadCache = true; } catch (_) { /* noop */ } }
      if (navigator.onLine) {
        const res = await withTimeout(
          supabase.from("pastillas").select("*").eq("user_id", session.user.id).eq("paciente_id", pacienteActivoId).order("orden"),
          6000, { data: null, error: true }
        );
        if (!res.error && res.data) { setPills(res.data); safeStorage.set(cacheKey, JSON.stringify(res.data)); return; }
      }
      // Offline o la consulta falló y NO había caché: no dejar "Cargando…" colgado.
      if (!hadCache) setPills(prev => (prev === null ? [] : prev));
    })();
  }, [session, pacienteActivoId, netTick]); // netTick: refresca/reintenta al reconectar

  useEffect(() => {
    if (blocksInitRef.current || !pills?.length) return;
    blocksInitRef.current = true;
    const slots = [...new Set(
      pills.filter(p => isPillDueOnDay(p, todayStr))
           .flatMap(p => { const hs = getHoras(p.hora_toma, p.frecuencia); return hs.length ? hs : ["00:00"]; })
    )];
    if (!slots.length) return;
    const nearest = getNearestBlock(slots);
    const initial = {};
    slots.forEach(t => { if (t !== nearest) initial[t] = true; });
    setCollapsedBlocks(initial);
  }, [pills]);

  useEffect(() => {
    if (!session || !window.Capacitor?.isNativePlatform()) return;
    if (notifPermission !== 'granted') return;
    // Las notificaciones se programan para TODOS los pacientes (no solo el activo),
    // si no, al cambiar de paciente los demás dejaban de sonar. `pills` se usa solo
    // como señal de cambio (alta/baja/edición de un medicamento reagenda todo).
    (async () => {
      const { data: allPills } = await supabase
        .from("pastillas")
        .select("*")
        .eq("user_id", session.user.id)
        .order("orden");
      if (!allPills?.length) { scheduleLocalNotifs([]); return; }
      // Dosis ya tomadas en los próximos 7 días (de cualquier paciente) para no reprogramarlas.
      const now = new Date();
      const start = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now); end.setDate(end.getDate() + 7);
      const endStr = fmtDate(end.getFullYear(), end.getMonth(), end.getDate());
      const { data } = await supabase
        .from("medicamentos")
        .select("nombre,fecha,hora_programada,tomado,paciente_id")
        .eq("user_id", session.user.id)
        .eq("tomado", true)
        .gte("fecha", start)
        .lte("fecha", endStr);
      const taken = new Set();
      (data || []).forEach(row => {
        // Emparejar por paciente + nombre (dos pacientes pueden tener el mismo medicamento).
        const pill = allPills.find(p => p.paciente_id === row.paciente_id && p.nombre === row.nombre);
        if (!pill || !row.hora_programada) return;
        const fecha = String(row.fecha).slice(0, 10);
        const hora = String(row.hora_programada).slice(0, 5);
        taken.add(`${pill.id}_${fecha}_${hora}`);
      });
      const pacientesById = Object.fromEntries((pacientes || []).map(p => [p.id, p]));
      scheduleLocalNotifs(allPills, taken, pacientesById);
    })();
  }, [pills, notifPermission, session, pacientes, criticalAlerts, resumeTick]);

  // Clave de caché del historial: por paciente + mes visible (el historial en memoria es de un mes).
  const recordsCacheKey = () => `records_cache_${pacienteActivoId}_${year}_${month}`;
  // Mantiene el caché del historial al día tras marcar/desmarcar, para que las marcas (incluidas las
  // hechas SIN conexión) se vean también en un arranque en frío offline y al navegar entre meses.
  const cacheRecords = (recordsObj) => { safeStorage.set(recordsCacheKey(), JSON.stringify(recordsObj)); };

  const loadRecords = useCallback(async () => {
    if (!session || !pills?.length) { setLoading(false); return; }
    const cacheKey = `records_cache_${pacienteActivoId}_${year}_${month}`;
    if (!navigator.onLine) {
      // Offline: mostrar el historial cacheado del mes (las dosis YA tomadas) en vez de dejar todo
      // como "pendiente" — en una app de medicación eso podría llevar a re-tomar una dosis.
      const raw = await safeStorage.get(cacheKey);
      if (raw) { try { setRecords(JSON.parse(raw)); } catch (_) { /* noop */ } }
      setLoading(false);
      return;
    }
    setLoading(true);
    const firstDay = `${year}-${String(month+1).padStart(2,"0")}-01`;
    const lastDay = `${year}-${String(month+1).padStart(2,"0")}-${String(getDaysInMonth(year, month)).padStart(2,"0")}`;
    const { data, error } = await supabase.from("medicamentos").select("*").eq("user_id", session.user.id).eq("paciente_id", pacienteActivoId).gte("fecha", firstDay).lte("fecha", lastDay);
    if (error) { console.error("Error cargando registros:", error); setLoading(false); return; }
    const built = {};
    (data || []).forEach(row => {
      const fecha = String(row.fecha).slice(0, 10);
      const pill = pills.find(p => p.nombre === row.nombre) || pills.find(p => p.id === row.nombre);
      if (!pill) return;
      if (!built[fecha]) built[fecha] = {};
      const scheduled = row.hora_programada || pill.hora_toma?.slice(0,5) || "00:00";
      built[fecha][`${pill.id}_${scheduled}`] = { time: row.hora, dbId: row.id, tomado: row.tomado };
    });
    setRecords(built);
    safeStorage.set(cacheKey, JSON.stringify(built)); // caché para ver el historial sin conexión
    setLoading(false);
  }, [year, month, session, pills, pacienteActivoId]);

  // ── Cola offline de marcado de dosis ────────────────────────────────────────────────
  const persistOfflineQueue = () => { safeStorage.set(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueueRef.current)); };
  // Encola (o reemplaza) la operación de una dosis. entry: {paciente_id, nombre, dayStr, scheduledTime, tomado, hora, deleted}
  const enqueueDose = (entry) => {
    offlineQueueRef.current[doseQK(entry.paciente_id, entry.nombre, entry.dayStr, entry.scheduledTime)] = entry;
    persistOfflineQueue();
  };
  const removeQueuedDose = (pacienteId, nombre, dayStr, hora) => {
    const k = doseQK(pacienteId, nombre, dayStr, hora);
    if (offlineQueueRef.current[k]) { delete offlineQueueRef.current[k]; persistOfflineQueue(); }
  };

  // Sincroniza las dosis encoladas con Supabase. Reconcilia cada una por identidad
  // (user+fecha+paciente+nombre+hora_programada) = MISMO patrón que loadRecords y GroupDoseModal
  // (la tabla `medicamentos` no tiene pill_id). Se corta al primer fallo (sigue sin conexión) y
  // deja el resto en cola. Al terminar, recarga la vista para reconciliar los dbId.
  const flushOfflineQueue = useCallback(async () => {
    if (!session?.user?.id || flushingRef.current) return;
    const q = offlineQueueRef.current;
    const keys = Object.keys(q);
    if (!keys.length) return;
    flushingRef.current = true;
    let changed = false;
    try {
      for (const k of keys) {
        const op = q[k];
        const { data: rows, error: selErr } = await supabase.from("medicamentos").select("id,hora_programada")
          .eq("user_id", session.user.id).eq("fecha", op.dayStr)
          .eq("paciente_id", op.paciente_id).eq("nombre", op.nombre);
        if (selErr) break; // sigue sin conexión → cortar y conservar la cola
        // Emparejar por hora_programada tolerando "HH:MM" vs "HH:MM:SS" (como GroupDoseModal).
        const existing = (rows || []).find(r => String(r.hora_programada).slice(0, 5) === op.scheduledTime);
        if (op.deleted) {
          if (existing?.id) { const { error } = await supabase.from("medicamentos").delete().eq("id", existing.id); if (error) break; }
        } else if (existing?.id) {
          const { error } = await supabase.from("medicamentos").update({ tomado: op.tomado, hora: op.hora }).eq("id", existing.id); if (error) break;
        } else {
          const { error } = await supabase.from("medicamentos").insert({ nombre: op.nombre, fecha: op.dayStr, tomado: op.tomado, hora: op.hora, hora_programada: op.scheduledTime, user_id: session.user.id, paciente_id: op.paciente_id }); if (error) break;
        }
        delete q[k];
        changed = true;
      }
    } finally {
      flushingRef.current = false;
    }
    if (changed) {
      persistOfflineQueue();
      if (Object.keys(offlineQueueRef.current).length === 0) showToast("Cambios sincronizados ✓");
      loadRecords(); // reconciliar dbId de la vista actual con lo recién guardado
    }
  }, [session, loadRecords]);
  useEffect(() => { flushRef.current = flushOfflineQueue; }, [flushOfflineQueue]);

  // Cargar la cola persistida al arrancar e intentar sincronizar de inmediato.
  useEffect(() => {
    (async () => {
      const raw = await safeStorage.get(OFFLINE_QUEUE_KEY);
      if (raw) { try { offlineQueueRef.current = JSON.parse(raw) || {}; } catch (_) { offlineQueueRef.current = {}; } }
      flushRef.current?.(); // si hay pendientes y sesión lista, sincroniza sin esperar otro disparador
    })();
  }, []);

  // Disparadores de sincronización: al reconectar, al volver del fondo, y al tener sesión lista.
  useEffect(() => {
    const onOnline = () => flushOfflineQueue();
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushOfflineQueue]);
  useEffect(() => { flushOfflineQueue(); }, [resumeTick, flushOfflineQueue]);
  useEffect(() => { if (session?.user?.id) flushOfflineQueue(); }, [session, flushOfflineQueue]);

 useEffect(() => { if (session && pills?.length && pacienteActivoId) loadRecords(); }, [loadRecords, session, pills, pacienteActivoId]);

  useEffect(() => {
    if (!pendingAction || !session) return;
    // Si la dosis es de otro paciente, lo activamos primero: así las pastillas se
    // recargan para ese paciente y el registro cae en el paciente correcto.
    if (pendingAction.pacienteId && pendingAction.pacienteId !== pacienteActivoId) {
      setPacienteActivoId(pendingAction.pacienteId);
      return; // esperamos a que recarguen las `pills` del nuevo paciente
    }
    if (!pills?.length) return;
    const pill = pills.find(p => p.id === pendingAction.pillId);
    if (pill) {
      // Al tocar la notificación abrimos el modal de confirmación (no marcamos directo).
      setConfirmDose({ pill, scheduledTime: pendingAction.scheduledTime, dateStr: pendingAction.dateStr });
      setPendingAction(null);
    }
  }, [pendingAction, pills, session, pacienteActivoId, setPacienteActivoId]);
 useEffect(() => {
    if (!pills?.length) return;
    if (window.Capacitor?.isNativePlatform()) return;
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      pills.forEach(pill => {
        const horas = getHoras(pill.hora_toma, pill.frecuencia);
        if (horas.includes(hhmm)) {
          const todayKey = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
          const taken = horas.some(h => records[todayKey]?.[`${pill.id}_${h}`]);
          if (!taken && Notification.permission === "granted") {
            const notifOptions = {
              body: `Es hora de tomar ${pill.emoji} ${pill.nombre}${pill.dosis ? ` (${pill.dosis})` : ""}`,
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: `pill-${pill.id}`
            };
            if (swRegRef.current) {
              swRegRef.current.showNotification("💊 Mi Pastillero", notifOptions);
            } else {
              new Notification("💊 Mi Pastillero", notifOptions);
            }
          }
        }
      });
    };
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [pills, records]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  // Registra una dosis como tomada (tomado=true) o no tomada (tomado=false).
  // customHora: "HH:MM" opcional (hora real de la toma); si falta, usa la hora actual.
  const recordDose = async (dayStr, pill, scheduledTime, tomado, customHora) => {
    if (new Date(dayStr) > today) { showToast("No puedes marcar días futuros"); return; }
    const key = `${pill.id}_${scheduledTime}`;
    const dayData = records[dayStr] || {};
    const existing = dayData[key];
    let hora;
    if (customHora) {
      const [h, m] = customHora.split(":").map(Number);
      const dt = new Date(); dt.setHours(h, m, 0, 0);
      hora = dt.toLocaleTimeString("es-ES");
    } else {
      hora = new Date().toLocaleTimeString("es-ES");
    }
    // OPTIMISTA: pintamos la marca YA, sin esperar la red, para que la confirmación sea
    // instantánea. Antes el camino ONLINE hacía await a Supabase ANTES de pintar → en 4G/5G la
    // tarjeta se veía sin marcar 1-3s (peor al venir de la notificación, con la red reconectando).
    // Conservamos el dbId si ya existía (es un update). La BD reconcilia después (o se encola).
    const optimisticNext = { ...records, [dayStr]: { ...dayData, [key]: { ...(existing || {}), time: hora, tomado } } };
    setRecords(optimisticNext);
    cacheRecords(optimisticNext);
    // Si la dosis es de hoy, deja su bloque expandido para que se vea la confirmación en la tarjeta.
    if (dayStr === todayStr) setCollapsedBlocks(prev => ({ ...prev, [scheduledTime]: false }));
    // Dosis resuelta (tomada u omitida): cancelar la notif local para que no suene.
    await cancelDoseNotif(pill, dayStr, scheduledTime);

    // Sincronizar con la BD (o encolar si no hay red / la escritura falla).
    const online = navigator.onLine;
    let saved = null, failed = !online;
    if (online) {
      if (existing?.dbId) {
        const { error } = await supabase.from("medicamentos").update({ tomado, hora }).eq("id", existing.dbId);
        if (error) failed = true; else saved = { ...existing, time: hora, tomado };
      } else {
        const { data, error } = await supabase.from("medicamentos").insert({ nombre: pill.nombre, fecha: dayStr, tomado, hora, hora_programada: scheduledTime, user_id: session.user.id, paciente_id: pacienteActivoId }).select().single();
        if (error || !data) failed = true; else saved = { time: data.hora, dbId: data.id, tomado };
      }
    }
    // Reconciliar esa dosis: dbId real si guardó; marca "pending" (encolada) si falló/offline.
    if (failed) enqueueDose({ paciente_id: pacienteActivoId, nombre: pill.nombre, dayStr, scheduledTime, tomado, hora, deleted: false });
    else removeQueuedDose(pacienteActivoId, pill.nombre, dayStr, scheduledTime); // por si estaba encolada
    const resolved = failed ? { time: hora, tomado, pending: true } : saved;
    const reconciledNext = { ...optimisticNext, [dayStr]: { ...optimisticNext[dayStr], [key]: resolved } };
    setRecords(reconciledNext);
    cacheRecords(reconciledNext);
    showToast(failed
      ? "Sin conexión: se guardó y se sincronizará al reconectar 📶"
      : (tomado ? `${pill.emoji} ${pill.nombre} registrada` : `${pill.nombre} marcada como no tomada`));
    if (!failed) flushOfflineQueue(); // online → intenta drenar lo que hubiera pendiente
  };

  // Borra el registro de una dosis (deshacer). Reprograma la notif si su hora no ha pasado.
  const clearDose = async (dayStr, pill, scheduledTime) => {
    const key = `${pill.id}_${scheduledTime}`;
    const dayData = records[dayStr] || {};
    const rec = dayData[key];
    if (!rec) return;
    if (rec.dbId) {
      // Ya estaba en la BD: intentar borrar; si no hay red (o falla), encolar el borrado.
      let ok = false;
      if (navigator.onLine) { const { error } = await supabase.from("medicamentos").delete().eq("id", rec.dbId); ok = !error; }
      if (!ok) enqueueDose({ paciente_id: pacienteActivoId, nombre: pill.nombre, dayStr, scheduledTime, deleted: true });
    } else {
      // Nunca se sincronizó (se marcó offline): basta quitar la operación encolada.
      removeQueuedDose(pacienteActivoId, pill.nombre, dayStr, scheduledTime);
    }
    const updated = { ...records };
    const { [key]: _, ...rest } = dayData;
    if (Object.keys(rest).length === 0) delete updated[dayStr];
    else updated[dayStr] = rest;
    setRecords(updated);
    cacheRecords(updated); // mantener el caché al día tras deshacer
    await scheduleDoseNotif(pill, dayStr, scheduledTime);
    showToast("Registro eliminado");
    if (navigator.onLine) flushOfflineQueue();
  };

  // Pospone el recordatorio de una dosis N minutos (solo iOS nativo reprograma notif).
  const snoozeDose = async (pill, scheduledTime, minutes) => {
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const at = new Date(Date.now() + minutes * 60000);
        await LocalNotifications.schedule({ notifications: [{
          id: notifId(pill.id, 'snooze', scheduledTime), // id estable por dosis: re-posponer reemplaza, no acumula
          title: '💊 Mi Pastillero',
          body: `Recordatorio: ${pill.emoji} ${pill.nombre}${pill.dosis ? ` (${pill.dosis})` : ''}`,
          schedule: { at },
          ...soundFields(pill.sonido),
          actionTypeId: 'PILL_ACTIONS',
          extra: { pillId: pill.id, scheduledTime, dateStr: fmtDate(at.getFullYear(), at.getMonth(), at.getDate()), doseKey: `${pill.id}_${scheduledTime}`, pacienteId: pill.paciente_id, snooze: true },
        }]});
      } catch (_) { /* noop */ }
    }
    showToast(`Te recordaremos en ${minutes} min`);
  };

  const markBlockDoses = async (scheduledTime) => {
    const now = new Date();
    const dayStr = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
    if (new Date(dayStr) > today) { showToast("No puedes marcar días futuros"); return; }
    const dayData = records[dayStr] || {};
    const duePills = pills?.filter(p => isPillDueOnDay(p, dayStr)) || [];
    const pending = duePills.flatMap(p => {
      const hs = getHoras(p.hora_toma, p.frecuencia);
      return (hs.length ? hs : ["00:00"]).filter(h => h === scheduledTime).map(h => ({ pill: p, key: `${p.id}_${h}` }));
    }).filter(d => !dayData[d.key]);
    if (pending.length === 0) return;
    const hora = now.toLocaleTimeString("es-ES");

    // OPTIMISTA: marcar TODAS las dosis del bloque YA (sin esperar la red) para confirmación
    // instantánea. La BD reconcilia los dbId después (o se encolan si no hay red / falla).
    const optimisticDay = { ...dayData };
    for (const d of pending) optimisticDay[`${d.pill.id}_${scheduledTime}`] = { time: hora, tomado: true };
    const optimisticNext = { ...records, [dayStr]: optimisticDay };
    setRecords(optimisticNext);
    cacheRecords(optimisticNext);
    // Deja el bloque expandido para que se vean las confirmaciones "Tomada" por pastilla.
    setCollapsedBlocks(prev => ({ ...prev, [scheduledTime]: false }));
    // Cancelar notifs del bloque recién registrado (offline u online la dosis queda guardada).
    for (const d of pending) await cancelDoseNotif(d.pill, dayStr, scheduledTime);

    const online = navigator.onLine;
    let rows = null, failed = !online;
    if (online) {
      const { data, error } = await supabase.from("medicamentos").insert(pending.map(d => ({ nombre: d.pill.nombre, fecha: dayStr, tomado: true, hora, hora_programada: scheduledTime, user_id: session.user.id, paciente_id: pacienteActivoId }))).select();
      if (error || !data) failed = true; else rows = data;
    }
    // Reconciliar: dbId real si guardó; "pending" (encolada) si falló/offline.
    const resolvedDay = { ...optimisticNext[dayStr] };
    if (failed) {
      for (const d of pending) {
        enqueueDose({ paciente_id: pacienteActivoId, nombre: d.pill.nombre, dayStr, scheduledTime, tomado: true, hora, deleted: false });
        resolvedDay[`${d.pill.id}_${scheduledTime}`] = { time: hora, tomado: true, pending: true };
      }
    } else {
      rows.forEach(row => {
        const pill = pills.find(p => p.nombre === row.nombre);
        if (pill) resolvedDay[`${pill.id}_${scheduledTime}`] = { time: row.hora, dbId: row.id, tomado: true };
      });
    }
    const reconciledNext = { ...optimisticNext, [dayStr]: resolvedDay };
    setRecords(reconciledNext);
    cacheRecords(reconciledNext);
    showToast(failed ? "Sin conexión: se guardó y se sincronizará al reconectar 📶" : `💊 ${scheduledTime} — todas registradas`);
    if (!failed) flushOfflineQueue();
  };

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(todayStr); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDay(year, month);
  const days = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const getPillCount = (dayStr) => { const d = records[dayStr]; return d ? Object.values(d).filter(v => v?.tomado).length : 0; };
  const getDayStatus = (dayStr) => {
    const duePills = pills?.filter(p => isPillDueOnDay(p, dayStr)) || [];
    const totalDoses = duePills.reduce((sum, p) => sum + Math.max(1, getHoras(p.hora_toma, p.frecuencia).length), 0);
    if (totalDoses === 0) return "empty"; // no había medicamentos ese día
    const c = getPillCount(dayStr);
    if (c >= totalDoses) return "complete";
    if (c > 0) return "partial";
    return "none";
  };

  const todayData = records[todayStr] || {};
  const todayPills = pills?.filter(p => isPillDueOnDay(p, todayStr)) || [];
  const todayDoses = todayPills.flatMap(pill => {
    const hs = getHoras(pill.hora_toma, pill.frecuencia);
    return (hs.length ? hs : ["00:00"]).map(h => ({ pill, scheduledTime: h, key: `${pill.id}_${h}` }));
  });
  const todayTaken = todayDoses.filter(d => todayData[d.key]?.tomado).length;
  const todayPending = todayDoses.filter(d => !todayData[d.key]).length; // sin registro (ni tomada ni omitida)
  const todayTotal = todayDoses.length;
  const dosesByTime = todayDoses.reduce((acc, d) => {
    (acc[d.scheduledTime] = acc[d.scheduledTime] || []).push(d);
    return acc;
  }, {});
  const sortTime = t => { const [h, m] = t.split(":").map(Number); return h < 6 ? (h + 24) * 60 + m : h * 60 + m; };
  const timeSlots = Object.keys(dosesByTime).sort((a, b) => sortTime(a) - sortTime(b));
  const monthComplete = Object.keys(records).filter(k => getDayStatus(k) === "complete").length;

  if (session === undefined) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (!session) return <LoginScreen />;
  if (locked) return <BiometricLockScreen onUnlock={() => setLocked(false)} onUsePassword={() => { supabase.auth.signOut(); setLocked(false); }} />;
  if (covered) return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-violet-200 dark:shadow-none">💊</div>
    </div>
  );
  // Candado de suscripción (solo si SUBSCRIPTIONS_ENABLED). Mientras esté apagado, nada de esto corre.
  if (SUBSCRIPTIONS_ENABLED && session && !premiumChecked && !hasPremium) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  // Offline y sin poder verificar la suscripción: pantalla honesta de "Sin conexión" en vez del
  // paywall roto ("Los planes no están disponibles"). Se recupera sola al reconectar (netTick).
  if (SUBSCRIPTIONS_ENABLED && session && !hasPremium && netUnverified && window.Capacitor?.isNativePlatform())
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-gray-50 dark:bg-gray-900">
        <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><WifiOff size={28} className="text-gray-400" /></div>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Sin conexión</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">Necesitamos internet para verificar tu suscripción. Conéctate y vuelve a intentarlo.</p>
        <button onClick={() => setNetTick(t => t + 1)} className="mt-2 px-6 py-3 rounded-2xl bg-violet-500 text-white text-sm font-bold active:scale-95 transition-all">Reintentar</button>
      </div>
    );
  if (SUBSCRIPTIONS_ENABLED && session && !hasPremium && window.Capacitor?.isNativePlatform()) return <Paywall onPurchased={() => setHasPremium(true)} />;
  if (pills === null || !pacienteActivoId) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (screen === "pacientes") return <PacientesScreen session={session} pacientes={pacientes} pacienteActivoId={pacienteActivoId} onChange={(lista) => { setPacientes(lista); if (!lista.find(p => p.id === pacienteActivoId)) setPacienteActivoId(lista[0]?.id); }} onBack={() => setScreen("main")} />;
  if (screen === "reportes") return <ReportesScreen session={session} paciente={pacientes.find(p => p.id === pacienteActivoId)} pills={pills} onBack={() => setScreen("main")} />;
  if (pills.length === 0 && screen !== "settings") return <SetupScreen session={session} pacienteId={pacienteActivoId} pacientes={pacientes} onDone={(p) => { setPills(p); setScreen("main"); }} onCancel={() => { const otro = pacientes.find(p => p.id !== pacienteActivoId) || pacientes[0]; if (otro) setPacienteActivoId(otro.id); setScreen("main"); }} />;
  if (screen === "settings") return <SettingsScreen session={session} pacienteId={pacienteActivoId} pills={pills} onUpdate={setPills} onBack={() => setScreen("main")} onManagePacientes={() => setScreen("pacientes")} onReportes={() => setScreen("reportes")} criticalAlerts={criticalAlerts} onToggleCriticalAlerts={toggleCriticalAlerts} bioEnabled={bioEnabled} onDisableBio={async () => { localStorage.removeItem("bio_cred_id"); await safeStorage.remove("bio_enabled"); setBioEnabled(false); showToast("Face ID desactivado"); }} />;

  const pacienteActivo = pacientes.find(p => p.id === pacienteActivoId);

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      {toast && <div className="fixed left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-700 text-white dark:text-gray-100 px-5 py-3 rounded-2xl text-sm font-bold shadow-xl" style={{ animation: "slideDown 0.3s ease", top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>{toast}</div>}

      {confirmLogout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => setConfirmLogout(false)}>
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
            <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-3"><LogOut className="text-red-400" size={22} /></div>
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 text-center mb-1">¿Cerrar sesión?</h2>
            <p className="text-xs text-gray-500 text-center mb-5">Tendrás que volver a iniciar sesión para entrar.</p>
            <div className="flex gap-2">
              <button onClick={() => setConfirmLogout(false)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-500 hover:bg-gray-50 dark:hover:bg-gray-700">Cancelar</button>
              <button onClick={() => { setConfirmLogout(false); supabase.auth.signOut(); }} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600">Cerrar sesión</button>
            </div>
          </div>
        </div>
      )}

      <div className="max-w-md mx-auto px-4 pb-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-violet-200 dark:shadow-none">💊</div>
            <div>
              <h1 className="text-lg text-gray-800 dark:text-gray-100 leading-tight" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
              {pacienteActivo && (
                <button
                  onClick={() => setShowPacienteSelector(true)}
                  className="flex items-center gap-1 text-xs font-bold text-violet-600 hover:text-violet-700 mt-0.5"
                >
                  <span className="text-sm">{pacienteActivo.emoji}</span>
                  <span>{pacienteActivo.nombre}</span>
                  {pacientes.length > 1 && <ChevronDown size={12} className="text-gray-400" />}
                </button>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1">
              <button onClick={() => { setView("today"); goToday(); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${view === "today" ? "bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm" : "text-gray-400"}`}>Hoy</button>
              <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${view === "calendar" ? "bg-white dark:bg-gray-600 text-gray-800 dark:text-gray-100 shadow-sm" : "text-gray-400"}`}>Mes</button>
            </div>
            <button onClick={() => setScreen("settings")} title="Ajustes" className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300 hover:bg-gray-200 cursor-pointer"><Settings size={16} /></button>
            <button onClick={() => setConfirmLogout(true)} title="Cerrar sesión" className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-400 text-gray-400 dark:text-gray-300 cursor-pointer transition-all">
              <LogOut size={16} />
            </button>
          </div>
        </div>

        {biometricSupported() && !bioEnabled && (
          <button onClick={async () => {
            try {
              await registerBiometric(session.user.id, session.user.email);
              setBioEnabled(true);
              showToast("Face ID activado ✓");
            } catch (e) {
              if (e.name !== "NotAllowedError") showToast("No se pudo activar Face ID");
            }
          }} className="w-full flex items-center gap-3 bg-indigo-50 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 rounded-2xl px-4 py-3 mb-4 text-left cursor-pointer">
            <Fingerprint className="text-indigo-500" size={22} />
            <div className="flex-1">
              <p className="text-sm font-bold text-indigo-700">Activar Face ID / huella</p>
              <p className="text-xs text-indigo-400">Desbloquea la app con biometría al abrirla</p>
            </div>
            <ArrowRight className="text-indigo-400" size={16} />
          </button>
        )}

        {notifPermission !== "granted" && (
          notifPermission === "denied" ? (
            <button
              onClick={openNotifSettings}
              className="w-full flex items-center gap-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-2xl px-4 py-3 mb-4 text-left"
            >
              <Bell className="text-amber-500" size={22} />
              <div className="flex-1">
                <p className="text-sm font-bold text-amber-700 dark:text-amber-500">Recordatorios apagados</p>
                <p className="text-xs text-amber-500 dark:text-amber-600">Actívalos en Ajustes de iOS para recibir tus avisos de medicamentos</p>
              </div>
              <ArrowRight className="text-amber-400" size={16} />
            </button>
          ) : (
            <button
              onClick={requestNotifPermission}
              className="w-full flex items-center gap-3 bg-violet-50 dark:bg-violet-950/40 border border-violet-200 dark:border-violet-800 rounded-2xl px-4 py-3 mb-4 text-left"
            >
              <Bell className="text-violet-500" size={22} />
              <div className="flex-1">
                <p className="text-sm font-bold text-violet-700">Activar recordatorios</p>
                <p className="text-xs text-violet-400">Toca aquí para recibir avisos a la hora de tomar tus pastillas</p>
              </div>
              <ArrowRight className="text-violet-400" size={16} />
            </button>
          )
        )}

        <div className="bg-white dark:bg-gray-800 rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Progreso de hoy</span>
            <span className="text-xs text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>{todayTaken}/{todayTotal}</span>
          </div>
          <div className="h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden flex gap-0.5">
            {todayDoses.map(d => { const c = getColor(d.pill.color); const rec = todayData[d.key]; return <div key={d.key} className={`flex-1 rounded-full transition-all duration-500 ${rec?.tomado ? c.accent : rec?.tomado === false ? "bg-red-300 dark:bg-red-500/60" : "bg-gray-200 dark:bg-gray-600"}`} />; })}
          </div>
          <div className="flex justify-between mt-2">
            {todayDoses.map(d => (
              <div key={d.key} className={`flex items-center gap-1 text-xs ${todayData[d.key] ? "opacity-100" : "opacity-30"} ${todayData[d.key]?.tomado === false ? "line-through" : ""}`}>
                <span>{d.pill.emoji}</span>
                <span className="hidden sm:inline font-medium text-gray-500">{d.scheduledTime}</span>
              </div>
            ))}
          </div>
        </div>

        {view === "today" ? (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {timeSlots.length === 0 && (
              <div className="w-full bg-gray-50 border-2 border-gray-100 dark:border-gray-700 text-gray-400 font-bold py-4 rounded-2xl text-center text-sm">
                No hay pastillas para tomar hoy
              </div>
            )}
            {timeSlots.map(timeSlot => {
              const doses = dosesByTime[timeSlot];
              const allTaken = doses.every(d => todayData[d.key]?.tomado);
              const blockPending = doses.filter(d => !todayData[d.key]).length;
              const collapsed = !!collapsedBlocks[timeSlot];
              return (
                <div key={timeSlot} className="mb-4">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <button onClick={() => setCollapsedBlocks(prev => ({ ...prev, [timeSlot]: !prev[timeSlot] }))} className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-gray-400">{collapsed ? "▸" : "▾"}</span>
                      <span className="text-sm font-bold text-gray-500">⏰ {fmt12h(timeSlot)}</span>
                    </button>
                    {allTaken
                      ? <span className="text-xs font-bold text-emerald-500">✓ Listo</span>
                      : blockPending > 1
                        ? <button onClick={() => markBlockDoses(timeSlot)} className="text-xs font-bold text-violet-600 bg-violet-50 px-3 py-1 rounded-lg cursor-pointer active:scale-95 transition-all">Marcar todas</button>
                        : null
                    }
                  </div>
                  {!collapsed && (
                    <div className="space-y-2">
                      {doses.map(dose => {
                        const rec = todayData[dose.key];
                        const taken = rec?.tomado === true;
                        const skipped = rec?.tomado === false;
                        const c = getColor(dose.pill.color);
                        const timing = taken ? getTimingInfo(dose.scheduledTime, rec.time) : null;
                        return (
                          <button key={dose.key} onClick={() => { const d = new Date(); setConfirmDose({ pill: dose.pill, scheduledTime: dose.scheduledTime, dateStr: fmtDate(d.getFullYear(), d.getMonth(), d.getDate()) }); }}
                            className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all cursor-pointer active:scale-[0.98] ${taken ? `${c.bg} ring-2 ${c.ring}` : skipped ? "bg-red-50 dark:bg-red-950/30 ring-2 ring-red-200 dark:ring-red-900/40" : "bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm"}`}>
                            <span className={`text-3xl ${skipped ? "opacity-40" : ""}`}>{dose.pill.emoji}</span>
                            <div className="flex-1 text-left">
                              <p className={`font-bold ${taken ? c.text : skipped ? "text-red-600 dark:text-red-300" : "text-gray-800 dark:text-gray-100"}`}>{dose.pill.nombre}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {taken
                                  ? <>Programada {dose.scheduledTime} · Tomada {fmtTime(rec.time)}</>
                                  : skipped
                                    ? <>No tomada · {dose.scheduledTime}</>
                                    : `${dose.pill.dosis ? dose.pill.dosis + " · " : ""}${dose.scheduledTime}`}
                              </p>
                              {timing && (
                                <span className={`inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full ${
                                  timing.kind === 'on-time' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                  : timing.kind === 'late' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                                  : 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                                }`}>
                                  {timing.kind === 'on-time' ? '✓ A tiempo'
                                    : timing.kind === 'late' ? `⏰ ${formatTimingDiff(timing.diffMin)} tarde`
                                    : `⏱ ${formatTimingDiff(timing.diffMin)} antes`}
                                </span>
                              )}
                            </div>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${taken ? `${c.accent} text-white` : skipped ? "bg-red-400 text-white" : "bg-gray-100 dark:bg-gray-600 dark:ring-1 dark:ring-gray-500 text-gray-300 dark:text-gray-400"}`}>
                              {taken ? "✓" : skipped ? "✕" : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {todayTotal > 0 && todayPending === 0 && todayTaken === todayTotal && (
              <div className="w-full bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-bold py-4 rounded-2xl text-center text-sm">
                🎉 ¡Todas las pastillas de hoy tomadas!
              </div>
            )}
            {todayTotal > 0 && todayPending === 0 && todayTaken < todayTotal && (
              <div className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 font-bold py-4 rounded-2xl text-center text-sm">
                Día registrado ({todayTaken}/{todayTotal} tomadas)
              </div>
            )}
          </div>
        ) : (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="flex items-center justify-between mb-4 bg-white dark:bg-gray-800 rounded-2xl shadow-sm px-4 py-2.5">
              <button onClick={prevMonth} className="w-9 h-9 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300 cursor-pointer"><ChevronLeft size={18} /></button>
              <button onClick={goToday} className="cursor-pointer hover:bg-gray-50 px-3 py-1 rounded-xl transition-all">
                <h2 className="text-base text-gray-800 dark:text-gray-100" style={{ fontWeight: 800 }}>{MONTHS_ES[month]} {year}</h2>
              </button>
              <button onClick={nextMonth} className="w-9 h-9 rounded-xl hover:bg-gray-100 dark:hover:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300 cursor-pointer"><ChevronRight size={18} /></button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 text-center shadow-sm">
                <p className="text-2xl text-emerald-500" style={{ fontWeight: 900 }}>{monthComplete}</p>
                <p className="text-xs font-semibold text-gray-400">Días completos</p>
              </div>
              <div className="bg-white dark:bg-gray-800 rounded-2xl p-3 text-center shadow-sm">
                <p className="text-2xl text-violet-500" style={{ fontWeight: 900 }}>{Math.round((monthComplete / Math.min(today.getDate(), daysInMonth)) * 100 || 0)}%</p>
                <p className="text-xs font-semibold text-gray-400">Cumplimiento</p>
              </div>
            </div>
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-4 mb-4">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS_ES.map(d => <div key={d} className="text-center text-xs font-bold text-gray-300 uppercase tracking-wider py-1">{d}</div>)}
              </div>
              {loading ? <div className="text-center py-12 text-gray-300 text-sm">Cargando...</div> : (
                <div className="grid grid-cols-7 gap-1">
                  {days.map((day, i) => {
                    if (day === null) return <div key={`e-${i}`} />;
                    const dayStr = fmtDate(year, month, day);
                    const status = getDayStatus(dayStr);
                    const isToday = dayStr === todayStr;
                    const isSel = selectedDay === dayStr;
                    const isPast = new Date(year, month, day) < new Date(today.getFullYear(), today.getMonth(), today.getDate());
                    const isFuture = new Date(year, month, day) > today;
                    return (
                      <button key={day} onClick={() => setSelectedDay(isSel ? null : dayStr)}
                        className={`relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all cursor-pointer text-xs font-bold
                          ${status === "complete" ? "bg-emerald-100 dark:bg-emerald-900/50 text-emerald-700 dark:text-emerald-300"
                            : status === "partial" ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300"
                            : status === "none" && isPast ? "bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-300"
                            : "bg-gray-50 dark:bg-gray-800 text-gray-400 dark:text-gray-500"}
                          ${isSel ? "ring-2 ring-violet-500 scale-110 shadow-md z-10" : ""}`}>
                        <span className="text-sm">{day}</span>
                        {isToday && <span className="absolute -top-1 -right-1 w-3 h-3 bg-violet-500 rounded-full border-2 border-white dark:border-gray-900" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center justify-center flex-wrap gap-x-4 gap-y-1 mt-3 mb-1 text-xs text-gray-500 dark:text-gray-400 font-medium">
              <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-100 dark:bg-emerald-900/50" /> Completo</div>
              <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-100 dark:bg-amber-900/50" /> Parcial</div>
              <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-100 dark:bg-red-900/40" /> Sin tomar</div>
            </div>
            {selectedDay && !loading && (
              <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-sm p-4" style={{ animation: "fadeIn 0.25s ease" }}>
                <p className="text-sm font-bold text-gray-800 dark:text-gray-100 mb-3">
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                <div className="space-y-2">
                  {pills.filter(pill => isPillDueOnDay(pill, selectedDay)).map(pill => {
                    const horas = getHoras(pill.hora_toma, pill.frecuencia);
                    const slots = horas.length ? horas : ["00:00"];
                    const takenSlots = slots.filter(h => records[selectedDay]?.[`${pill.id}_${h}`]?.tomado);
                    const allTaken = slots.length > 0 && takenSlots.length === slots.length;
                    const someTaken = takenSlots.length > 0 && !allTaken;
                    const c = getColor(pill.color);
                    const firstTakenTime = records[selectedDay]?.[`${pill.id}_${takenSlots[0]}`]?.time;
                    return (
                      <div key={pill.id}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl ${allTaken ? c.bg : someTaken ? "bg-amber-50 dark:bg-amber-950/30" : "bg-gray-50"}`}>
                        <span className="text-lg">{pill.emoji}</span>
                        <span className={`text-sm font-bold flex-1 ${allTaken ? c.text : someTaken ? "text-amber-700" : "text-gray-400"}`}>{pill.nombre}</span>
                        {slots.length > 1 && (
                          <span className={`text-xs font-bold ${allTaken ? c.text : someTaken ? "text-amber-600" : "text-gray-400"}`}>
                            {takenSlots.length}/{slots.length}
                          </span>
                        )}
                        {allTaken && slots.length === 1 && firstTakenTime && <span className="text-xs text-gray-400">{fmtTime(firstTakenTime)}</span>}
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold ${allTaken ? `${c.accent} text-white` : someTaken ? "bg-amber-400 text-white" : "bg-gray-200"}`}>
                          {allTaken ? "✓" : someTaken ? "~" : ""}
                        </div>
                      </div>
                    );
                  })}
                  {pills.filter(pill => isPillDueOnDay(pill, selectedDay)).length === 0 && (
                    <p className="text-xs text-gray-400 text-center py-2">No hay pastillas para este día</p>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes slideDown { from { opacity: 0; transform: translate(-50%, -20px); } to { opacity: 1; transform: translate(-50%, 0); } }
      `}</style>

      {/* Modal de confirmación de dosis (notificación o tap en la lista) */}
      {confirmDose && (
        <DoseConfirmModal
          dose={confirmDose}
          record={records[confirmDose.dateStr]?.[`${confirmDose.pill.id}_${confirmDose.scheduledTime}`]}
          onClose={() => setConfirmDose(null)}
          onTaken={(customTime) => { recordDose(confirmDose.dateStr, confirmDose.pill, confirmDose.scheduledTime, true, customTime); setConfirmDose(null); }}
          onSkip={() => { recordDose(confirmDose.dateStr, confirmDose.pill, confirmDose.scheduledTime, false); setConfirmDose(null); }}
          onSnooze={(min) => { snoozeDose(confirmDose.pill, confirmDose.scheduledTime, min); setConfirmDose(null); }}
          onClear={() => { clearDose(confirmDose.dateStr, confirmDose.pill, confirmDose.scheduledTime); setConfirmDose(null); }}
        />
      )}

      {/* Lista in-app cuando 2+ dosis coinciden en el mismo minuto (notificación agrupada) */}
      {groupModal && (
        <GroupDoseModal
          session={session}
          dateStr={groupModal.dateStr}
          hora={groupModal.hora}
          pacientes={pacientes}
          onClose={() => { setGroupModal(null); loadRecords(); }}
        />
      )}

      {/* Selector de paciente */}
      {showPacienteSelector && (
        <div
          className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center px-4"
          onClick={() => setShowPacienteSelector(false)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-5 mb-4 sm:mb-0"
            style={{ paddingBottom: 'max(20px, env(safe-area-inset-bottom))' }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-bold text-gray-800 dark:text-gray-100">Seleccionar paciente</h3>
              <button onClick={() => setShowPacienteSelector(false)} className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-300 flex items-center justify-center"><X size={14} /></button>
            </div>
            <div className="space-y-2 mb-3 max-h-80 overflow-y-auto">
              {pacientes.map(p => (
                <button
                  key={p.id}
                  onClick={() => { setPacienteActivoId(p.id); setShowPacienteSelector(false); }}
                  className={`w-full flex items-center gap-3 p-3 rounded-2xl transition-all ${p.id === pacienteActivoId ? "bg-violet-50 dark:bg-violet-950/40 border-2 border-violet-300 dark:border-violet-700" : "bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700"}`}
                >
                  <span className="text-2xl">{p.emoji}</span>
                  <span className="flex-1 text-left font-bold text-gray-800 dark:text-gray-100 text-sm">{p.nombre}</span>
                  {p.id === pacienteActivoId && <span className="text-violet-500 font-bold text-sm">✓</span>}
                </button>
              ))}
            </div>
            <button
              onClick={() => { setShowPacienteSelector(false); setScreen("pacientes"); }}
              className="w-full py-3 rounded-xl border border-violet-200 dark:border-violet-800 bg-violet-50 dark:bg-violet-950/40 text-violet-600 text-sm font-bold"
            >
              <span className="flex items-center justify-center gap-2"><Settings size={16} /> Gestionar pacientes</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
