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
  Share2, Users, BarChart3, Bell, Pill, Fingerprint,
} from 'lucide-react';
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Client IDs de Google OAuth (públicos, no secretos). Se configuran en .env cuando
// se creen las credenciales en Google Cloud Console. Solo se usan en iOS nativo.
const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID;
const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;
let googleInitialized = false; // SocialLogin.initialize se hace una sola vez

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

// Emojis para avatares de pacientes
const PACIENTE_EMOJIS = ["👤","👨","👩","👴","👵","👦","👧","👶","🧑","👨‍🦰","👩‍🦰","👨‍🦱","👩‍🦱","👨‍🦳","👩‍🦳","🐶","🐱"];

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !window.Capacitor?.isNativePlatform(),
    storage: window.Capacitor?.isNativePlatform() ? nativeStorage : undefined,
  },
});


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
];

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
    await LocalNotifications.cancel({ notifications: [{ id: notifId(pill.id, dayStr, hora) }] });
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
        sound: `${pill.sonido || 'ding'}.wav`,
        interruptionLevel: 'timeSensitive', // atraviesa Focus / No Molestar (recordatorio de salud)
        actionTypeId: 'PILL_ACTIONS',
        extra: { pillId: pill.id, scheduledTime: hora, dateStr: dayStr, doseKey: `${pill.id}_${hora}` },
      }],
    });
  } catch (_) { /* noop */ }
};

// `takenDoseKeys` es un Set con strings "pillId_YYYY-MM-DD_HH:MM" — dosis ya marcadas
// como tomadas que NO deben sonar aunque su hora esté en el futuro.
const scheduleLocalNotifs = async (pillsList, takenDoseKeys = new Set()) => {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    const pending = await LocalNotifications.getPending();
    if (pending.notifications.length) await LocalNotifications.cancel({ notifications: pending.notifications });
    const now = new Date();
    const notifications = [];
    const usedTimes = new Set(); // minutos ya ocupados (ms), para desfasar colisiones
    for (let day = 0; day < 7 && notifications.length < 60; day++) {
      const d = new Date(now); d.setDate(d.getDate() + day);
      const dateStr = fmtDate(d.getFullYear(), d.getMonth(), d.getDate());
      for (const pill of pillsList) {
        if (!isPillDueOnDay(pill, dateStr)) continue;
        for (const hora of getHoras(pill.hora_toma, pill.frecuencia)) {
          const [hh, mm] = hora.split(':').map(Number);
          const at = new Date(d); at.setHours(hh, mm, 0, 0);
          if (at <= now) continue;
          if (takenDoseKeys.has(`${pill.id}_${dateStr}_${hora}`)) continue; // ya tomada
          // Anti-colisión: iOS solo reproduce un sonido si varias notifs disparan
          // en el mismo instante. Si este minuto ya está ocupado, corre +1 min.
          while (usedTimes.has(at.getTime())) at.setMinutes(at.getMinutes() + 1);
          usedTimes.add(at.getTime());
          notifications.push({
            id: notifId(pill.id, dateStr, hora),
            title: '💊 Mi Pastillero',
            body: `Hora de tomar ${pill.emoji} ${pill.nombre}${pill.dosis ? ` (${pill.dosis})` : ''}`,
            schedule: { at },
            sound: `${pill.sonido || 'ding'}.wav`,
            interruptionLevel: 'timeSensitive', // atraviesa Focus / No Molestar (recordatorio de salud)
            actionTypeId: 'PILL_ACTIONS',
            extra: { pillId: pill.id, scheduledTime: hora, dateStr, doseKey: `${pill.id}_${hora}` },
          });
          if (notifications.length >= 60) break;
        }
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

function LoginScreen() {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot" | "reset"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setMsg(null);
    setPasswordConfirm("");
    setPassword("");
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
      setMsg({ type: "error", text: error.message });
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

  const handleEmail = async () => {
    if (mode === "forgot") { await handleForgotPassword(); return; }
    if (mode === "reset") { await handleReset(); return; }
    setLoading(true);
    setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ type: "error", text: error.message });
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
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMsg({ type: "error", text: error.message });
      } else if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
        // Supabase no devuelve error en email duplicado por anti-enumeración:
        // detectamos el caso por identities vacío.
        setMsg({ type: "error", text: "Este email ya está registrado. Intenta iniciar sesión." });
      } else {
        setMsg({ type: "ok", text: "¡Revisa tu email para confirmar tu cuenta!" });
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
              <button onClick={() => switchMode("login")} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "login" ? "bg-white text-gray-800 dark:text-gray-100 shadow-sm" : "text-gray-400"}`}>Entrar</button>
              <button onClick={() => switchMode("register")} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "register" ? "bg-white text-gray-800 dark:text-gray-100 shadow-sm" : "text-gray-400"}`}>Registrarse</button>
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
          <div className="space-y-3 mb-4">
            {mode !== "reset" && (
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            )}
            {mode === "reset" && (
              <input
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Código"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-center text-lg font-bold tracking-[0.4em] placeholder:tracking-normal placeholder:font-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
            )}
            {(mode === "login" || mode === "register" || mode === "reset") && (
              <div className="relative">
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "reset" ? "Nueva contraseña" : "Contraseña"}
                  className="w-full pr-11 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
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
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300"
              />
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
          </div>
          {msg && (
            <div className={`text-xs font-medium px-3 py-2 rounded-xl mb-3 ${msg.type === "error" ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300" : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300"}`}>
              {msg.text}
            </div>
          )}
          <button onClick={handleEmail} disabled={loading} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-violet-200 dark:shadow-none transition-all mb-3" style={{ fontWeight: 800 }}>
            {loading ? "..." : mode === "login" ? "Entrar" : mode === "register" ? "Crear cuenta" : mode === "forgot" ? "Enviar código" : "Cambiar contraseña"}
          </button>
          {(mode === "forgot" || mode === "reset") && (
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
          <button onClick={handleGoogle} className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-bold py-3 rounded-xl hover:bg-gray-50 transition-all text-sm">
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

  const frecuencia = freqSel === "__dias__" ? `Cada ${customDias} días`
    : freqSel === "__horas__" ? `Cada ${customHoras} horas`
    : freqSel;

  const showDiaSemana = freqSel === "Semanal";
  const showDiaDelMes = ["Cada mes", "Cada 3 meses"].includes(freqSel);

  const handleSave = () => {
    if (!nombre.trim()) { setError("Escribe el nombre del medicamento."); return; }
    if (!fechaInicio) { setError("Selecciona la fecha de inicio del tratamiento."); return; }
    setError(null);
    onSave({
      nombre, dosis, frecuencia, emoji, color: emojiToColor(emoji), sonido,
      hora_toma: hora,
      dia_semana: showDiaSemana ? diaSemana : null,
      dia_del_mes: showDiaDelMes ? Number(diaDelMes) : null,
      fecha_inicio: fechaInicio,
      duracion_tipo: durTipo !== "indefinido" ? durTipo : null,
      duracion_valor: durTipo !== "indefinido" ? Number(durValor) : null,
    });
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
    const audio = new Audio(`/sounds/${nombre}.mp3`);
    previewAudioRef.current = audio;
    audio.play().catch(() => {});
  };

  const cls = "w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300";
  const lbl = "text-xs font-bold text-gray-500 mb-1 block";

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div
        className="w-full flex flex-col bg-white overflow-hidden"
        style={{ fontFamily: "'Nunito', sans-serif", touchAction: 'pan-y', height: '100%' }}
      >
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5 bg-white border-b border-gray-100 dark:border-gray-700"
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
                  <input type="number" min="1" max="23" value={customHoras} onChange={e => setCustomHoras(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">horas</span>
                </div>
              </div>
            )}

            {freqSel === "__dias__" && (
              <div>
                <label className={lbl}>Cada cuántos días</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="2" max="365" value={customDias} onChange={e => setCustomDias(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
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
                  <input type="number" min="1" value={durValor} onChange={e => setDurValor(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
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
          className="flex-shrink-0 px-5 pt-3 bg-white dark:bg-gray-800 border-t border-gray-100 dark:border-gray-700"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {error && (
            <div className="text-xs font-medium text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-xl mb-2">{error}</div>
          )}
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200 dark:shadow-none">Guardar</button>
          </div>
        </div>
      </div>
    </>
  );
}

function SetupScreen({ session, pacienteId, onDone }) {
  const [pills, setPills] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const addPill = async (data) => {
    const newPill = { ...data, user_id: session.user.id, paciente_id: pacienteId, orden: pills.length };
    const { data: saved } = await supabase.from("pastillas").insert(newPill).select().single();
    if (saved) setPills([...pills, saved]);
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
            <button onClick={() => setShowForm(true)} className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-400 hover:border-violet-300 hover:text-violet-400 transition-all mb-4 flex items-center justify-center gap-1">
              <Plus size={16} /> Agregar medicamento
            </button>
            {pills.length > 0 && (
              <button onClick={finish} disabled={saving} className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold shadow-lg shadow-violet-200 dark:shadow-none" style={{ fontWeight: 800 }}>
                {saving ? "..." : <>¡Listo, empezar! <ArrowRight size={16} className="inline ml-1" /></>}
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

function SettingsScreen({ session, pacienteId, pills, onUpdate, onBack, onManagePacientes, onReportes }) {
  const [list, setList] = useState(pills);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const addPill = async (data) => {
    const { data: saved } = await supabase.from("pastillas").insert({ ...data, user_id: session.user.id, paciente_id: pacienteId, orden: list.length }).select().single();
    if (saved) { const nl = [...list, saved]; setList(nl); onUpdate(nl); }
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
          <h1 className="text-lg text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>Mis medicamentos</h1>
        </div>
        {!showForm && !editing ? (
          <>
            <div className="space-y-3 mb-4">
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
            <button onClick={() => setShowForm(true)} className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-400 hover:border-violet-300 hover:text-violet-400 transition-all mb-3 flex items-center justify-center gap-1">
              <Plus size={16} /> Agregar medicamento
            </button>
            {onManagePacientes && (
              <button onClick={onManagePacientes} className="w-full py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center justify-center gap-2 mb-2">
                <Users size={16} /> Gestionar pacientes
              </button>
            )}
            {onReportes && (
              <button onClick={onReportes} className="w-full py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center justify-center gap-2">
                <BarChart3 size={16} /> Ver reportes
              </button>
            )}
          </>
        ) : (
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-4">{editing ? "Editar medicamento" : "Nuevo medicamento"}</h2>
            <PillForm pill={editing} onSave={editing ? editPill : addPill} onCancel={() => { setShowForm(false); setEditing(null); }} />
          </div>
        )}
      </div>
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
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
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
                {p.id === pacienteActivoId && <p className="text-[10px] font-bold text-violet-500">Paciente activo</p>}
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
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-700 text-white dark:text-gray-100 px-5 py-3 rounded-2xl text-sm font-bold shadow-xl">{toast}</div>}
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
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
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

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-6" onClick={onClose} style={{ animation: "fadeIn .2s ease" }}>
      <div className="w-full max-w-xs bg-white dark:bg-gray-800 rounded-3xl p-6 relative" onClick={e => e.stopPropagation()}>
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
              <button onClick={() => onTaken(editingTime ? customTime : null)} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-violet-200 dark:shadow-none active:scale-[0.98]">Tomado</button>
              <button onClick={() => setShowSnooze(true)} className="w-full bg-violet-50 dark:bg-gray-700 text-violet-600 dark:text-violet-300 font-bold py-3 rounded-2xl active:scale-[0.98]">Posponer</button>
              <button onClick={onSkip} className="w-full text-red-500 font-bold py-2 active:scale-[0.98]">No lo he tomado</button>
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
          {alreadyTaken && <p className="text-[11px] text-emerald-500 font-bold mt-3">Ya registrado como tomado</p>}
          {alreadySkipped && <p className="text-[11px] text-red-500 font-bold mt-3">Marcado como no tomado</p>}
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [locked, setLocked] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false); // se carga async desde Preferences al montar
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
  const [confirmDose, setConfirmDose] = useState(null); // { pill, scheduledTime, dateStr } → modal de confirmación
  const blocksInitRef = useRef(false);
  const swRegRef = useRef(null);
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "denied"
  );

  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(reg => { swRegRef.current = reg; });
    }
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setSession(session);
      // El flag de Face ID vive en Preferences (localStorage no persiste en iOS al relanzar).
      const bio = (await safeStorage.get("bio_enabled")) === "true";
      setBioEnabled(bio);
      if (session && bio) setLocked(true);
    });
    if (window.Capacitor?.isNativePlatform()) {
      LocalNotifications.registerActionTypes({ types: [{ id: 'PILL_ACTIONS', actions: [
        { id: 'TOMAR', title: 'Tomar 💊', foreground: true },
        { id: 'POSPONER', title: 'Posponer' },
      ]}] }).catch(() => {});
      LocalNotifications.checkPermissions().then(({ display }) => {
        if (display === 'granted') setNotifPermission('granted');
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
        // abre el modal de confirmación de esa dosis.
        const { pillId, scheduledTime, dateStr } = notification.extra || {};
        if (pillId) setPendingAction({ pillId, scheduledTime, dateStr });
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
      if (display === 'granted' && pills?.length) await scheduleLocalNotifs(pills);
    } else {
      if (typeof Notification === "undefined") return;
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    }
  };

  // Persiste el paciente activo (compartido entre cierres de la app)
  const setPacienteActivoId = useCallback(async (id) => {
    setPacienteActivoIdState(id);
    if (id) await safeStorage.set("paciente_activo_id", id);
  }, []);

  // Cargar pacientes del usuario actual + auto-crear "Yo" si no tiene ninguno
  useEffect(() => {
    if (!session) return;
    (async () => {
      const { data: pacs } = await supabase.from("pacientes").select("*").eq("user_id", session.user.id).order("orden").order("created_at");
      let lista = pacs || [];
      // Auto-crear "Yo" para usuarios nuevos (sin pacientes después de la migración)
      if (lista.length === 0) {
        const { data: nuevo } = await supabase.from("pacientes").insert({
          user_id: session.user.id, nombre: "Yo", emoji: "👤", orden: 0
        }).select().single();
        if (nuevo) lista = [nuevo];
      }
      setPacientes(lista);
      // Restaurar paciente activo o usar el primero
      const saved = await safeStorage.get("paciente_activo_id");
      const valido = lista.find(p => p.id === saved);
      const activo = valido ? valido.id : lista[0]?.id;
      setPacienteActivoIdState(activo);
      if (activo && activo !== saved) await safeStorage.set("paciente_activo_id", activo);
    })();
  }, [session]);

  // Cargar pastillas del paciente activo
  useEffect(() => {
    if (!session || !pacienteActivoId) return;
    supabase.from("pastillas").select("*").eq("user_id", session.user.id).eq("paciente_id", pacienteActivoId).order("orden").then(({ data }) => setPills(data || []));
  }, [session, pacienteActivoId]);

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
    if (!pills?.length || !window.Capacitor?.isNativePlatform()) return;
    if (notifPermission !== 'granted') return;
    // Antes de reagendar, consultamos qué dosis ya fueron tomadas en los próximos 7 días
    // para no programar notifs de pastillas ya tomadas.
    (async () => {
      const now = new Date();
      const start = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now); end.setDate(end.getDate() + 7);
      const endStr = fmtDate(end.getFullYear(), end.getMonth(), end.getDate());
      const { data } = await supabase
        .from("medicamentos")
        .select("nombre,fecha,hora_programada,tomado")
        .eq("user_id", session.user.id)
        .eq("paciente_id", pacienteActivoId)
        .eq("tomado", true)
        .gte("fecha", start)
        .lte("fecha", endStr);
      const taken = new Set();
      (data || []).forEach(row => {
        const pill = pills.find(p => p.nombre === row.nombre) || pills.find(p => p.id === row.nombre);
        if (!pill || !row.hora_programada) return;
        const fecha = String(row.fecha).slice(0, 10);
        const hora = String(row.hora_programada).slice(0, 5);
        taken.add(`${pill.id}_${fecha}_${hora}`);
      });
      scheduleLocalNotifs(pills, taken);
    })();
  }, [pills, notifPermission, session, pacienteActivoId]);

  const loadRecords = useCallback(async () => {
    if (!session || !pills?.length) { setLoading(false); return; }
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
    setLoading(false);
  }, [year, month, session, pills, pacienteActivoId]);

 useEffect(() => { if (session && pills?.length && pacienteActivoId) loadRecords(); }, [loadRecords, session, pills, pacienteActivoId]);

  useEffect(() => {
    if (!pendingAction || !pills?.length || !session) return;
    const pill = pills.find(p => p.id === pendingAction.pillId);
    if (pill) {
      // Al tocar la notificación abrimos el modal de confirmación (no marcamos directo).
      setConfirmDose({ pill, scheduledTime: pendingAction.scheduledTime, dateStr: pendingAction.dateStr });
      setPendingAction(null);
    }
  }, [pendingAction, pills, session]);
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
    if (existing?.dbId) {
      await supabase.from("medicamentos").update({ tomado, hora }).eq("id", existing.dbId);
      setRecords({ ...records, [dayStr]: { ...dayData, [key]: { ...existing, time: hora, tomado } } });
    } else {
      const { data } = await supabase.from("medicamentos").insert({ nombre: pill.nombre, fecha: dayStr, tomado, hora, hora_programada: scheduledTime, user_id: session.user.id, paciente_id: pacienteActivoId }).select().single();
      if (!data) return;
      setRecords({ ...records, [dayStr]: { ...dayData, [key]: { time: data.hora, dbId: data.id, tomado } } });
    }
    // Dosis resuelta (tomada u omitida): cancelar la notif local para que no suene.
    await cancelDoseNotif(pill, dayStr, scheduledTime);
    showToast(tomado ? `${pill.emoji} ${pill.nombre} registrada` : `${pill.nombre} marcada como no tomada`);
  };

  // Borra el registro de una dosis (deshacer). Reprograma la notif si su hora no ha pasado.
  const clearDose = async (dayStr, pill, scheduledTime) => {
    const key = `${pill.id}_${scheduledTime}`;
    const dayData = records[dayStr] || {};
    if (!dayData[key]) return;
    await supabase.from("medicamentos").delete().eq("id", dayData[key].dbId);
    const updated = { ...records };
    const { [key]: _, ...rest } = dayData;
    if (Object.keys(rest).length === 0) delete updated[dayStr];
    else updated[dayStr] = rest;
    setRecords(updated);
    await scheduleDoseNotif(pill, dayStr, scheduledTime);
    showToast("Registro eliminado");
  };

  // Pospone el recordatorio de una dosis N minutos (solo iOS nativo reprograma notif).
  const snoozeDose = async (pill, scheduledTime, minutes) => {
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const at = new Date(Date.now() + minutes * 60000);
        await LocalNotifications.schedule({ notifications: [{
          id: (notifId(pill.id, 'snooze', scheduledTime) + minutes) & 0x7fffffff,
          title: '💊 Mi Pastillero',
          body: `Recordatorio: ${pill.emoji} ${pill.nombre}${pill.dosis ? ` (${pill.dosis})` : ''}`,
          schedule: { at },
          sound: `${pill.sonido || 'ding'}.wav`,
          interruptionLevel: 'timeSensitive', // atraviesa Focus / No Molestar (recordatorio de salud)
          actionTypeId: 'PILL_ACTIONS',
          extra: { pillId: pill.id, scheduledTime, dateStr: fmtDate(at.getFullYear(), at.getMonth(), at.getDate()), doseKey: `${pill.id}_${scheduledTime}` },
        }]});
      } catch (_) { /* noop */ }
    }
    showToast(`Te recordaremos en ${minutes} min`);
  };

  const markAllToday = async () => {
    const now = new Date();
    const currentStr = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
    const dayData = records[currentStr] || {};
    const duePills = pills?.filter(p => isPillDueOnDay(p, currentStr)) || [];
    const allDoses = duePills.flatMap(p => {
      const hs = getHoras(p.hora_toma, p.frecuencia);
      return (hs.length ? hs : ["00:00"]).map(h => ({ pill: p, scheduledTime: h, key: `${p.id}_${h}` }));
    });
    const pending = allDoses.filter(d => !dayData[d.key]);
    if (pending.length === 0) { showToast("Ya tomaste todas hoy"); return; }
    const hora = now.toLocaleTimeString("es-ES");
    const toInsert = pending.map(d => ({ nombre: d.pill.nombre, fecha: currentStr, tomado: true, hora, hora_programada: d.scheduledTime, user_id: session.user.id, paciente_id: pacienteActivoId }));
    const { data } = await supabase.from("medicamentos").insert(toInsert).select();
    if (data) {
      const updated = { ...records };
      const newDayData = { ...dayData };
      data.forEach(row => {
        const pill = pills.find(p => p.nombre === row.nombre);
        if (pill && row.hora_programada) newDayData[`${pill.id}_${row.hora_programada}`] = { time: row.hora, dbId: row.id, tomado: true };
      });
      updated[currentStr] = newDayData;
      setRecords(updated);
      // Cancelar todas las notifs de hoy que acabamos de marcar como tomadas
      for (const d of pending) await cancelDoseNotif(d.pill, currentStr, d.scheduledTime);
      showToast("🎉 Todas registradas");
    }
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
    const { data } = await supabase.from("medicamentos").insert(pending.map(d => ({ nombre: d.pill.nombre, fecha: dayStr, tomado: true, hora, hora_programada: scheduledTime, user_id: session.user.id, paciente_id: pacienteActivoId }))).select();
    if (data) {
      const newDayData = { ...dayData };
      data.forEach(row => {
        const pill = pills.find(p => p.nombre === row.nombre);
        if (pill) newDayData[`${pill.id}_${scheduledTime}`] = { time: row.hora, dbId: row.id, tomado: true };
      });
      setRecords({ ...records, [dayStr]: newDayData });
      // Cancelar notifs del bloque recién registrado
      for (const d of pending) await cancelDoseNotif(d.pill, dayStr, scheduledTime);
      showToast(`💊 ${scheduledTime} — todas registradas`);
    }
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
    if (totalDoses === 0) return "none";
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
  if (pills === null || !pacienteActivoId) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (screen === "pacientes") return <PacientesScreen session={session} pacientes={pacientes} pacienteActivoId={pacienteActivoId} onChange={(lista) => { setPacientes(lista); if (!lista.find(p => p.id === pacienteActivoId)) setPacienteActivoId(lista[0]?.id); }} onBack={() => setScreen("main")} />;
  if (screen === "reportes") return <ReportesScreen session={session} paciente={pacientes.find(p => p.id === pacienteActivoId)} pills={pills} onBack={() => setScreen("main")} />;
  if (pills.length === 0 && screen !== "settings") return <SetupScreen session={session} pacienteId={pacienteActivoId} onDone={(p) => { setPills(p); setScreen("main"); }} />;
  if (screen === "settings") return <SettingsScreen session={session} pacienteId={pacienteActivoId} pills={pills} onUpdate={setPills} onBack={() => setScreen("main")} onManagePacientes={() => setScreen("pacientes")} onReportes={() => setScreen("reportes")} />;

  const pacienteActivo = pacientes.find(p => p.id === pacienteActivoId);

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-700 text-white dark:text-gray-100 px-5 py-3 rounded-2xl text-sm font-bold shadow-xl" style={{ animation: "slideDown 0.3s ease" }}>{toast}</div>}

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
            {bioEnabled && (
              <button onClick={async () => { localStorage.removeItem("bio_cred_id"); await safeStorage.remove("bio_enabled"); setBioEnabled(false); showToast("Face ID desactivado"); }} title="Desactivar Face ID" className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300 hover:bg-red-50 hover:text-red-400 cursor-pointer transition-all"><Lock size={16} /></button>
            )}
            <button onClick={() => setScreen("settings")} title="Ajustes" className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300 hover:bg-gray-200 cursor-pointer"><Settings size={16} /></button>
            <button onClick={() => supabase.auth.signOut()} title="Cerrar sesión" className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-400 text-gray-400 dark:text-gray-300 cursor-pointer transition-all">
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
                                <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${
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
            {todayTotal > 0 && todayPending > 0 && (
              <button onClick={markAllToday} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-violet-200 dark:shadow-none transition-all cursor-pointer active:scale-[0.98]" style={{ fontWeight: 800, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
                💊 Marcar todas como tomadas
              </button>
            )}
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
                {DAYS_ES.map(d => <div key={d} className="text-center text-[10px] font-bold text-gray-300 uppercase tracking-wider py-1">{d}</div>)}
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
                          ${status === "complete" ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300" : status === "partial" ? "bg-amber-50 dark:bg-amber-950/30 text-amber-700" : isToday ? "bg-violet-50 text-violet-700" : isPast ? "bg-red-50/50 text-gray-300" : isFuture ? "bg-gray-50 dark:bg-gray-700/50 text-gray-300 dark:text-gray-500" : "bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400"}
                          ${isSel ? "ring-2 ring-violet-400 scale-110 shadow-md z-10" : ""} ${isToday && status !== "complete" ? "ring-2 ring-violet-300" : ""}`}>
                        <span className="text-sm">{day}</span>
                        {getPillCount(dayStr) > 0 && (
                          <div className="flex gap-px mt-0.5">
                            {pills.map(p => { const c = getColor(p.color); return <div key={p.id} className={`w-1.5 h-1.5 rounded-full ${records[dayStr]?.[p.id] ? c.accent : "bg-gray-200"}`} />; })}
                          </div>
                        )}
                        {isToday && getPillCount(dayStr) === 0 && <span className="absolute -top-1 -right-1 w-3 h-3 bg-violet-400 rounded-full border-2 border-white" />}
                      </button>
                    );
                  })}
                </div>
              )}
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
                          <span className={`text-[10px] font-bold ${allTaken ? c.text : someTaken ? "text-amber-600" : "text-gray-400"}`}>
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
            <div className="flex items-center justify-center gap-4 mt-4 text-[10px] text-gray-400 font-medium">
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-emerald-200" /> Completo</div>
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-amber-100" /> Parcial</div>
              <div className="flex items-center gap-1"><div className="w-2.5 h-2.5 rounded bg-red-50 ring-1 ring-red-100" /> Sin tomar</div>
            </div>
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
