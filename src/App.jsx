import { useState, useEffect, useLayoutEffect, useCallback, useRef } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);


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

const DOW_MAP = { Lunes: 1, Martes: 2, "Miércoles": 3, Jueves: 4, Viernes: 5, "Sábado": 6, Domingo: 0 };

function isPillDueOnDay(pill, dateStr) {
  const freq = pill.frecuencia;
  if (!freq) return true;

  // Frecuencias diarias: siempre aparecen
  if (["Una vez al día","Dos veces al día","Tres veces al día",
       "Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas",
       "Solo cuando necesite"].includes(freq)) return true;
  if (/^Cada \d+ horas?$/.test(freq)) return true;

  const date = new Date(dateStr + "T12:00:00");
  const dom = date.getDate();

  if (freq === "Semanal") {
    return date.getDay() === (DOW_MAP[pill.dia_semana] ?? 1);
  }

  if (freq === "Cada mes") {
    return dom === (pill.dia_del_mes || 1);
  }

  if (freq === "Cada 3 meses") {
    if (dom !== (pill.dia_del_mes || 1)) return false;
    if (!pill.created_at) return true;
    const ref = new Date(pill.created_at);
    const monthDiff = (date.getFullYear() - ref.getFullYear()) * 12 + (date.getMonth() - ref.getMonth());
    return monthDiff % 3 === 0;
  }

  // Para frecuencias por intervalo de días, usamos created_at como ancla
  if (!pill.created_at) return true;
  const c = new Date(pill.created_at);
  const anchorDay = pill.dia_del_mes || c.getDate();
  const ref = new Date(c.getFullYear(), c.getMonth(), anchorDay);
  const target = new Date(date.getFullYear(), date.getMonth(), dom);
  const diffDays = Math.round((target - ref) / 86400000);
  if (diffDays < 0) return false;

  if (freq === "Cada 15 días") return diffDays % 15 === 0;
  if (freq === "Cada tercer día") return diffDays % 3 === 0;

  const mDias = freq.match(/^Cada (\d+) días?$/);
  if (mDias) return diffDays % parseInt(mDias[1]) === 0;

  return true;
}

// --- Biometric (WebAuthn) helpers ---
const biometricSupported = () =>
  typeof window !== "undefined" &&
  window.PublicKeyCredential !== undefined &&
  navigator.credentials !== undefined;

const registerBiometric = async (userId, email) => {
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
  localStorage.setItem("bio_enabled", "true");
};

const authenticateBiometric = async () => {
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
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 flex flex-col items-center justify-center px-4">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-violet-200 mx-auto mb-4">💊</div>
        <h1 className="text-2xl text-gray-800 mb-1" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
        <p className="text-sm text-gray-400">Verifica tu identidad para continuar</p>
      </div>
      <button onClick={tryAuth} disabled={trying}
        className="w-full max-w-xs flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-base font-bold shadow-lg shadow-violet-200 mb-4 disabled:opacity-60 transition-all"
        style={{ fontWeight: 800 }}>
        <span className="text-2xl">🔐</span>
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
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleEmail = async () => {
    setLoading(true);
    setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ type: "error", text: error.message });
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setMsg({ type: "error", text: error.message });
      else setMsg({ type: "ok", text: "¡Revisa tu email para confirmar tu cuenta!" });
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: window.location.origin}
    });
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 flex items-center justify-center px-4">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-violet-200 mx-auto mb-4">💊</div>
          <h1 className="text-2xl text-gray-800 mb-1" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
          <p className="text-sm text-gray-400">Tu control de medicamentos diario</p>
        </div>
        <div className="bg-white rounded-3xl shadow-sm p-6">
          <div className="flex bg-gray-100 rounded-xl p-1 mb-5">
            <button onClick={() => setMode("login")} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "login" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Entrar</button>
            <button onClick={() => setMode("register")} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "register" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Registrarse</button>
          </div>
          <div className="space-y-3 mb-4">
            <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
            <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="Contraseña" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
          </div>
          {msg && (
            <div className={`text-xs font-medium px-3 py-2 rounded-xl mb-3 ${msg.type === "error" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}`}>
              {msg.text}
            </div>
          )}
          <button onClick={handleEmail} disabled={loading} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-violet-200 transition-all mb-3" style={{ fontWeight: 800 }}>
            {loading ? "..." : mode === "login" ? "Entrar" : "Crear cuenta"}
          </button>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <button onClick={handleGoogle} className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-50 transition-all text-sm">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.6 39.6 16.3 44 24 44z" /><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.2 5.2C40.8 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z" /></svg>
            Continuar con Google
          </button>
        </div>
      </div>
    </div>
  );
}

function PillForm({ pill, title = "Nuevo medicamento", showBackButton = true, onSave, onCancel }) {
  const [nombre, setNombre] = useState(pill?.nombre || "");
  const [dosis, setDosis] = useState(pill?.dosis || "");
  const [emoji, setEmoji] = useState(pill?.emoji || "💊");
  const [color, setColor] = useState(pill?.color || "violet");
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

  const frecuencia = freqSel === "__dias__" ? `Cada ${customDias} días`
    : freqSel === "__horas__" ? `Cada ${customHoras} horas`
    : freqSel;

  const showDiaSemana = freqSel === "Semanal";
  const showDiaDelMes = ["Cada 15 días", "Cada mes", "Cada 3 meses"].includes(freqSel);

  const handleSave = () => {
    if (!nombre) return;
    onSave({
      nombre, dosis, frecuencia, emoji, color,
      hora_toma: hora,
      dia_semana: showDiaSemana ? diaSemana : null,
      dia_del_mes: showDiaDelMes ? Number(diaDelMes) : null,
      duracion_tipo: durTipo !== "indefinido" ? durTipo : null,
      duracion_valor: durTipo !== "indefinido" ? Number(durValor) : null,
    });
  };

  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const log = () => console.log('[PillForm]', 'scrollLeft:', el.scrollLeft, 'scrollWidth:', el.scrollWidth, 'clientWidth:', el.clientWidth, 'window.scrollX:', window.scrollX, 'left:', el.getBoundingClientRect().left);
    log();
    el.scrollLeft = 0;
    window.scrollTo(0, 0);
    const fix = () => {
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      if (window.scrollX !== 0) window.scrollTo(0, 0);
    };
    el.addEventListener('scroll', fix, { passive: true });
    window.addEventListener('scroll', fix, { passive: true });
    const t1 = setTimeout(() => { log(); el.scrollLeft = 0; window.scrollTo(0, 0); }, 300);
    const t2 = setTimeout(() => { log(); el.scrollLeft = 0; window.scrollTo(0, 0); }, 1000);
    return () => { el.removeEventListener('scroll', fix); window.removeEventListener('scroll', fix); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const cls = "w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300";
  const lbl = "text-xs font-bold text-gray-500 mb-1 block";

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div
        className="w-full flex flex-col bg-white overflow-hidden"
        style={{ fontFamily: "'Nunito', sans-serif", touchAction: 'pan-y', height: '100%' }}
      >
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5 bg-white border-b border-gray-100"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px' }}
        >
          {showBackButton && (
            <button onClick={onCancel} className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 font-bold">←</button>
          )}
          <h2 className="text-base font-bold text-gray-800">{title}</h2>
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
                  <input type="number" min="1" max="23" value={customHoras} onChange={e => setCustomHoras(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">horas</span>
                </div>
              </div>
            )}

            {freqSel === "__dias__" && (
              <div>
                <label className={lbl}>Cada cuántos días</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="2" max="365" value={customDias} onChange={e => setCustomDias(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
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
              <label className={lbl}>Duración del tratamiento</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[["indefinido","Indefinido"],["dias","Días"],["semanas","Semanas"],["meses","Meses"]].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setDurTipo(val)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${durTipo === val ? "bg-violet-500 text-white shadow-sm" : "bg-gray-100 text-gray-500 hover:bg-gray-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {durTipo !== "indefinido" && (
                <div className="flex items-center gap-3">
                  <input type="number" min="1" value={durValor} onChange={e => setDurValor(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">{durTipo}</span>
                </div>
              )}
            </div>

            <div>
              <label className={lbl}>Emoji</label>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                {EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => setEmoji(e)} className={`aspect-square rounded-xl text-xl flex items-center justify-center transition-all ${emoji === e ? "border-2 border-violet-400 bg-violet-50" : "bg-gray-100 hover:bg-gray-200"}`}>{e}</button>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>Color</label>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(8, 1fr)' }}>
                {COLORS.map(c => (
                  <button key={c.id} type="button" onClick={() => setColor(c.id)} className={`aspect-square rounded-full ${c.accent} transition-all ${color === c.id ? "border-2 border-white/70" : ""}`} />
                ))}
              </div>
            </div>
          </div>
        </div>
        <div
          className="flex-shrink-0 flex gap-2 px-5 pt-3 bg-white border-t border-gray-100"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
          <button onClick={handleSave} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200">Guardar</button>
        </div>
      </div>
    </>
  );
}

function SetupScreen({ session, onDone }) {
  const [pills, setPills] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const addPill = async (data) => {
    const newPill = { ...data, user_id: session.user.id, orden: pills.length };
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
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 px-4 pb-8">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto">
        <div className="text-center mb-6">
          <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-2xl shadow-lg shadow-violet-200 mx-auto mb-3">💊</div>
          <h1 className="text-xl text-gray-800 mb-1" style={{ fontWeight: 900 }}>Configura tus medicamentos</h1>
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
                    <button onClick={() => removePill(pill.id)} className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center text-gray-400 hover:text-red-400 text-xs">✕</button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setShowForm(true)} className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-400 hover:border-violet-300 hover:text-violet-400 transition-all mb-4">
              + Agregar medicamento
            </button>
            {pills.length > 0 && (
              <button onClick={finish} disabled={saving} className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold shadow-lg shadow-violet-200" style={{ fontWeight: 800 }}>
                {saving ? "..." : "¡Listo, empezar! →"}
              </button>
            )}
          </>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-800 mb-4">Nuevo medicamento</h2>
            <PillForm onSave={addPill} onCancel={() => setShowForm(false)} />
          </div>
        )}
      </div>
    </div>
  );
}

function SettingsScreen({ session, pills, onUpdate, onBack }) {
  const [list, setList] = useState(pills);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);

  const addPill = async (data) => {
    const { data: saved } = await supabase.from("pastillas").insert({ ...data, user_id: session.user.id, orden: list.length }).select().single();
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
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 px-4 pb-6">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white shadow-sm flex items-center justify-center text-gray-400 font-bold">←</button>
          <h1 className="text-lg text-gray-800" style={{ fontWeight: 900 }}>Mis medicamentos</h1>
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
                    <button onClick={() => setEditing(pill)} className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center text-gray-400 hover:text-violet-400 text-xs mr-1">✎</button>
                    <button onClick={() => removePill(pill.id)} className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center text-gray-400 hover:text-red-400 text-xs">✕</button>
                  </div>
                );
              })}
            </div>
            <button onClick={() => setShowForm(true)} className="w-full py-3 rounded-2xl border-2 border-dashed border-gray-200 text-sm font-bold text-gray-400 hover:border-violet-300 hover:text-violet-400 transition-all">
              + Agregar medicamento
            </button>
          </>
        ) : (
          <div className="bg-white rounded-3xl shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-800 mb-4">{editing ? "Editar medicamento" : "Nuevo medicamento"}</h2>
            <PillForm pill={editing} onSave={editing ? editPill : addPill} onCancel={() => { setShowForm(false); setEditing(null); }} />
          </div>
        )}
      </div>
    </div>
  );
}

export default function App() {
  const [session, setSession] = useState(undefined);
  const [locked, setLocked] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(localStorage.getItem("bio_enabled") === "true");
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
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      if (session && localStorage.getItem("bio_enabled") === "true") setLocked(true);
    });
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

    return () => {
      subscription.unsubscribe();
      window.Capacitor?.Plugins?.Keyboard?.removeAllListeners();
    };
  }, []);

  const requestNotifPermission = async () => {
    if (typeof Notification === "undefined") return;
    const result = await Notification.requestPermission();
    setNotifPermission(result);
  };

  useEffect(() => {
    if (!session) return;
    supabase.from("pastillas").select("*").eq("user_id", session.user.id).order("orden").then(({ data }) => setPills(data || []));
  }, [session]);

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

  const loadRecords = useCallback(async () => {
    if (!session || !pills?.length) { setLoading(false); return; }
    setLoading(true);
    const firstDay = `${year}-${String(month+1).padStart(2,"0")}-01`;
    const lastDay = `${year}-${String(month+1).padStart(2,"0")}-${String(getDaysInMonth(year, month)).padStart(2,"0")}`;
    const { data, error } = await supabase.from("medicamentos").select("*").eq("user_id", session.user.id).gte("fecha", firstDay).lte("fecha", lastDay);
    if (error) { console.error("Error cargando registros:", error); setLoading(false); return; }
    const built = {};
    (data || []).forEach(row => {
      const fecha = String(row.fecha).slice(0, 10);
      if (!built[fecha]) built[fecha] = {};
      if (row.tomado) {
        const pill = pills.find(p => p.nombre === row.nombre) || pills.find(p => p.id === row.nombre);
        if (pill) {
          const scheduled = row.hora_programada || pill.hora_toma?.slice(0,5) || "00:00";
          built[fecha][`${pill.id}_${scheduled}`] = { time: row.hora, dbId: row.id };
        }
      }
    });
    setRecords(built);
    setLoading(false);
  }, [year, month, session, pills]);

 useEffect(() => { if (session && pills?.length) loadRecords(); }, [loadRecords, session, pills]);
 useEffect(() => {
    if (!pills?.length) return;
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

  const toggleDose = async (dayStr, pill, scheduledTime) => {
    if (new Date(dayStr) > today) { showToast("No puedes marcar días futuros"); return; }
    const key = `${pill.id}_${scheduledTime}`;
    const dayData = records[dayStr] || {};
    if (dayData[key]) {
      await supabase.from("medicamentos").delete().eq("id", dayData[key].dbId);
      const updated = { ...records };
      const { [key]: _, ...rest } = dayData;
      if (Object.keys(rest).length === 0) delete updated[dayStr];
      else updated[dayStr] = rest;
      setRecords(updated);
      showToast("Registro eliminado");
    } else {
      const now = new Date();
      const { data } = await supabase.from("medicamentos").insert({ nombre: pill.nombre, fecha: dayStr, tomado: true, hora: now.toLocaleTimeString("es-ES"), hora_programada: scheduledTime, user_id: session.user.id }).select().single();
      if (data) {
        const updated = { ...records };
        updated[dayStr] = { ...dayData, [key]: { time: data.hora, dbId: data.id } };
        setRecords(updated);
        showToast(`${pill.emoji} ${pill.nombre} (${scheduledTime}) registrada`);
      }
    }
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
    const toInsert = pending.map(d => ({ nombre: d.pill.nombre, fecha: currentStr, tomado: true, hora, hora_programada: d.scheduledTime, user_id: session.user.id }));
    const { data } = await supabase.from("medicamentos").insert(toInsert).select();
    if (data) {
      const updated = { ...records };
      const newDayData = { ...dayData };
      data.forEach(row => {
        const pill = pills.find(p => p.nombre === row.nombre);
        if (pill && row.hora_programada) newDayData[`${pill.id}_${row.hora_programada}`] = { time: row.hora, dbId: row.id };
      });
      updated[currentStr] = newDayData;
      setRecords(updated);
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
    const { data } = await supabase.from("medicamentos").insert(pending.map(d => ({ nombre: d.pill.nombre, fecha: dayStr, tomado: true, hora, hora_programada: scheduledTime, user_id: session.user.id }))).select();
    if (data) {
      const newDayData = { ...dayData };
      data.forEach(row => {
        const pill = pills.find(p => p.nombre === row.nombre);
        if (pill) newDayData[`${pill.id}_${scheduledTime}`] = { time: row.hora, dbId: row.id };
      });
      setRecords({ ...records, [dayStr]: newDayData });
      showToast(`💊 ${scheduledTime} — todas registradas`);
    }
  };

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(todayStr); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDay(year, month);
  const days = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const getPillCount = (dayStr) => { const d = records[dayStr]; return d ? Object.keys(d).length : 0; };
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
  const todayTaken = todayDoses.filter(d => todayData[d.key]).length;
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
  if (pills === null) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (pills.length === 0 && screen !== "settings") return <SetupScreen session={session} onDone={(p) => { setPills(p); setScreen("main"); }} />;
  if (screen === "settings") return <SettingsScreen session={session} pills={pills} onUpdate={setPills} onBack={() => setScreen("main")} />;

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-xl" style={{ animation: "slideDown 0.3s ease" }}>{toast}</div>}

      <div className="max-w-md mx-auto px-4 pb-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-violet-200">💊</div>
            <div>
              <h1 className="text-lg text-gray-800 leading-tight" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
              <p className="text-xs text-gray-400 font-medium hidden sm:block">{session.user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-xl p-1">
              <button onClick={() => { setView("today"); goToday(); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${view === "today" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Hoy</button>
              <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${view === "calendar" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Mes</button>
            </div>
            {bioEnabled && (
              <button onClick={() => { localStorage.removeItem("bio_cred_id"); localStorage.removeItem("bio_enabled"); setBioEnabled(false); showToast("Face ID desactivado"); }} title="Desactivar Face ID" className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-red-50 hover:text-red-400 cursor-pointer transition-all text-sm">🔐</button>
            )}
            <button onClick={() => setScreen("settings")} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 text-sm cursor-pointer">⚙️</button>
            <button onClick={() => supabase.auth.signOut()} title="Cerrar sesión" className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center hover:bg-red-50 hover:text-red-400 text-gray-400 cursor-pointer transition-all text-sm">
              🚪
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
          }} className="w-full flex items-center gap-3 bg-indigo-50 border border-indigo-200 rounded-2xl px-4 py-3 mb-4 text-left cursor-pointer">
            <span className="text-xl">🔐</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-indigo-700">Activar Face ID / huella</p>
              <p className="text-xs text-indigo-400">Desbloquea la app con biometría al abrirla</p>
            </div>
            <span className="text-indigo-400 text-xs font-bold">Activar →</span>
          </button>
        )}

        {notifPermission !== "granted" && (
          <button
            onClick={requestNotifPermission}
            className="w-full flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-2xl px-4 py-3 mb-4 text-left"
          >
            <span className="text-xl">🔔</span>
            <div className="flex-1">
              <p className="text-sm font-bold text-violet-700">Activar recordatorios</p>
              <p className="text-xs text-violet-400">Toca aquí para recibir avisos a la hora de tomar tus pastillas</p>
            </div>
            <span className="text-violet-400 text-xs font-bold">Activar →</span>
          </button>
        )}

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Progreso de hoy</span>
            <span className="text-xs text-gray-800" style={{ fontWeight: 900 }}>{todayTaken}/{todayTotal}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
            {todayDoses.map(d => { const c = getColor(d.pill.color); return <div key={d.key} className={`flex-1 rounded-full transition-all duration-500 ${todayData[d.key] ? c.accent : "bg-gray-100"}`} />; })}
          </div>
          <div className="flex justify-between mt-2">
            {todayDoses.map(d => (
              <div key={d.key} className={`flex items-center gap-1 text-xs ${todayData[d.key] ? "opacity-100" : "opacity-30"}`}>
                <span>{d.pill.emoji}</span>
                <span className="hidden sm:inline font-medium text-gray-500">{d.scheduledTime}</span>
              </div>
            ))}
          </div>
        </div>

        {view === "today" ? (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            {timeSlots.length === 0 && (
              <div className="w-full bg-gray-50 border-2 border-gray-100 text-gray-400 font-bold py-4 rounded-2xl text-center text-sm">
                No hay pastillas para tomar hoy
              </div>
            )}
            {timeSlots.map(timeSlot => {
              const doses = dosesByTime[timeSlot];
              const blockTaken = doses.filter(d => todayData[d.key]).length;
              const allBlockTaken = blockTaken === doses.length;
              const collapsed = !!collapsedBlocks[timeSlot];
              return (
                <div key={timeSlot} className="mb-4">
                  <div className="flex items-center justify-between mb-2 px-1">
                    <button onClick={() => setCollapsedBlocks(prev => ({ ...prev, [timeSlot]: !prev[timeSlot] }))} className="flex items-center gap-2 cursor-pointer">
                      <span className="text-xs text-gray-400">{collapsed ? "▸" : "▾"}</span>
                      <span className="text-sm font-bold text-gray-500">⏰ {fmt12h(timeSlot)}</span>
                    </button>
                    {allBlockTaken
                      ? <span className="text-xs font-bold text-emerald-500">✓ Listo</span>
                      : doses.length > 1
                        ? <button onClick={() => markBlockDoses(timeSlot)} className="text-xs font-bold text-violet-600 bg-violet-50 px-3 py-1 rounded-lg cursor-pointer active:scale-95 transition-all">Marcar todas</button>
                        : null
                    }
                  </div>
                  {!collapsed && (
                    <div className="space-y-2">
                      {doses.map(dose => {
                        const taken = todayData[dose.key];
                        const c = getColor(dose.pill.color);
                        return (
                          <button key={dose.key} onClick={() => { const d = new Date(); toggleDose(fmtDate(d.getFullYear(), d.getMonth(), d.getDate()), dose.pill, dose.scheduledTime); }}
                            className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all cursor-pointer active:scale-[0.98] ${taken ? `${c.bg} ring-2 ${c.ring}` : "bg-white hover:bg-gray-50 shadow-sm"}`}>
                            <span className="text-3xl">{dose.pill.emoji}</span>
                            <div className="flex-1 text-left">
                              <p className={`font-bold ${taken ? c.text : "text-gray-800"}`}>{dose.pill.nombre}</p>
                              <p className="text-xs text-gray-400 mt-0.5">
                                {taken ? `Tomada a las ${fmtTime(taken.time)}` : `${dose.pill.dosis ? dose.pill.dosis + " · " : ""}${dose.scheduledTime}`}
                              </p>
                            </div>
                            <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${taken ? `${c.accent} text-white` : "bg-gray-100 text-gray-300"}`}>
                              {taken ? "✓" : ""}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {todayTotal > 0 && todayTaken < todayTotal && (
              <button onClick={markAllToday} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-violet-200 transition-all cursor-pointer active:scale-[0.98]" style={{ fontWeight: 800, paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}>
                💊 Marcar todas como tomadas
              </button>
            )}
            {todayTotal > 0 && todayTaken === todayTotal && (
              <div className="w-full bg-emerald-50 border-2 border-emerald-200 text-emerald-700 font-bold py-4 rounded-2xl text-center text-sm">
                🎉 ¡Todas las pastillas de hoy tomadas!
              </div>
            )}
          </div>
        ) : (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="flex items-center justify-between mb-4 bg-white rounded-2xl shadow-sm px-4 py-2.5">
              <button onClick={prevMonth} className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer font-bold">←</button>
              <button onClick={goToday} className="cursor-pointer hover:bg-gray-50 px-3 py-1 rounded-xl transition-all">
                <h2 className="text-base text-gray-800" style={{ fontWeight: 800 }}>{MONTHS_ES[month]} {year}</h2>
              </button>
              <button onClick={nextMonth} className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 cursor-pointer font-bold">→</button>
            </div>
            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <p className="text-2xl text-emerald-500" style={{ fontWeight: 900 }}>{monthComplete}</p>
                <p className="text-xs font-semibold text-gray-400">Días completos</p>
              </div>
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <p className="text-2xl text-violet-500" style={{ fontWeight: 900 }}>{Math.round((monthComplete / Math.min(today.getDate(), daysInMonth)) * 100 || 0)}%</p>
                <p className="text-xs font-semibold text-gray-400">Cumplimiento</p>
              </div>
            </div>
            <div className="bg-white rounded-3xl shadow-sm p-4 mb-4">
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
                          ${status === "complete" ? "bg-emerald-100 text-emerald-700" : status === "partial" ? "bg-amber-50 text-amber-700" : isToday ? "bg-violet-50 text-violet-700" : isPast ? "bg-red-50/50 text-gray-300" : isFuture ? "bg-gray-50 text-gray-300" : "bg-gray-50 text-gray-500"}
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
              <div className="bg-white rounded-2xl shadow-sm p-4" style={{ animation: "fadeIn 0.25s ease" }}>
                <p className="text-sm font-bold text-gray-800 mb-3">
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                <div className="space-y-2">
                  {pills.filter(pill => isPillDueOnDay(pill, selectedDay)).map(pill => {
                    const taken = records[selectedDay]?.[pill.id];
                    const canToggle = new Date(selectedDay) <= today;
                    const c = getColor(pill.color);
                    return (
                      <button key={pill.id} onClick={() => canToggle && togglePill(selectedDay, pill.id)} disabled={!canToggle}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${canToggle ? "cursor-pointer active:scale-[0.98]" : "cursor-default opacity-50"} ${taken ? c.bg : "bg-gray-50"}`}>
                        <span className="text-lg">{pill.emoji}</span>
                        <span className={`text-sm font-bold flex-1 ${taken ? c.text : "text-gray-400"}`}>{pill.nombre}</span>
                        {taken && <span className="text-xs text-gray-400">{fmtTime(taken.time)}</span>}
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs ${taken ? `${c.accent} text-white` : "bg-gray-200"}`}>{taken ? "✓" : ""}</div>
                      </button>
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
    </div>
  );
}
