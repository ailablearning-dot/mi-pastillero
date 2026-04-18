import { useState, useEffect, useCallback } from "react";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://kbsxjdtdleauzvbtbrqi.supabase.co";
const SUPABASE_KEY = "sb_publishable_ZHVGmy4GXkkRslA6WINLfQ_Rrz1GMeJ";
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

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
const FRECUENCIAS = ["Una vez al día","Dos veces al día","Tres veces al día","Cada 8 horas","Cada 12 horas","Semanal","Solo cuando necesite"];

const DAYS_ES = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }
function fmtDate(y, m, d) { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function fmtTime(iso) { return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }); }
function getColor(colorId) { return COLORS.find(c => c.id === colorId) || COLORS[0]; }

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
      options: { redirectTo: "https://mi-pastillero.vercel.app" }
    });
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif" }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 flex items-center justify-center px-4">
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

function PillForm({ pill, onSave, onCancel }) {
  const [nombre, setNombre] = useState(pill?.nombre || "");
  const [dosis, setDosis] = useState(pill?.dosis || "");
  const [frecuencia, setFrecuencia] = useState(pill?.frecuencia || FRECUENCIAS[0]);
  const [emoji, setEmoji] = useState(pill?.emoji || "💊");
  const [color, setColor] = useState(pill?.color || "violet");
  const [hora, setHora] = useState(pill?.hora_toma || "08:00");

  return (
    <div className="space-y-4">
      <div>
        <label className="text-xs font-bold text-gray-500 mb-1 block">Nombre del medicamento</label>
        <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Metformina" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500 mb-1 block">Dosis</label>
        <input value={dosis} onChange={e => setDosis(e.target.value)} placeholder="Ej: 500mg" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500 mb-1 block">Frecuencia</label>
        <select value={frecuencia} onChange={e => setFrecuencia(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300">
          {FRECUENCIAS.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500 mb-1 block">Hora de toma</label>
        <input value={hora} onChange={e => setHora(e.target.value)} type="time" className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-violet-300" />
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500 mb-2 block">Emoji</label>
        <div className="flex flex-wrap gap-2">
          {EMOJIS.map(e => (
            <button key={e} onClick={() => setEmoji(e)} className={`w-10 h-10 rounded-xl text-xl flex items-center justify-center transition-all ${emoji === e ? "ring-2 ring-violet-400 bg-violet-50 scale-110" : "bg-gray-100 hover:bg-gray-200"}`}>{e}</button>
          ))}
        </div>
      </div>
      <div>
        <label className="text-xs font-bold text-gray-500 mb-2 block">Color</label>
        <div className="flex flex-wrap gap-2">
          {COLORS.map(c => (
            <button key={c.id} onClick={() => setColor(c.id)} className={`w-8 h-8 rounded-full ${c.accent} transition-all ${color === c.id ? "ring-2 ring-offset-2 ring-gray-400 scale-110" : ""}`} />
          ))}
        </div>
      </div>
      <div className="flex gap-2 pt-2">
        <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 text-sm font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
        <button onClick={() => nombre && onSave({ nombre, dosis, frecuencia, emoji, color, hora_toma: hora })} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200">Guardar</button>
      </div>
    </div>
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

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif" }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 px-4 py-8">
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

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif" }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 px-4 py-6">
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

  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  useEffect(() => {    
    if ("Notification" in window) Notification.requestPermission();
    supabase.auth.getSession().then(({ data: { session } }) => setSession(session));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => setSession(session));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    supabase.from("pastillas").select("*").eq("user_id", session.user.id).order("orden").then(({ data }) => setPills(data || []));
  }, [session]);

  const loadRecords = useCallback(async () => {
    if (!session || !pills?.length) return;
    setLoading(true);
    const firstDay = `${year}-${String(month+1).padStart(2,"0")}-01`;
    const lastDay = `${year}-${String(month+1).padStart(2,"0")}-${String(getDaysInMonth(year, month)).padStart(2,"0")}`;
    const { data } = await supabase.from("medicamentos").select("*").eq("user_id", session.user.id).gte("fecha", firstDay).lte("fecha", lastDay);
    const built = {};
    (data || []).forEach(row => {
      if (!built[row.fecha]) built[row.fecha] = {};
      if (row.tomado) built[row.fecha][row.nombre] = { time: row.created_at, dbId: row.id };
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
        if (pill.hora_toma && pill.hora_toma.slice(0,5) === hhmm) {
          const todayKey = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
          const taken = records[todayKey]?.[pill.id];
          if (!taken && Notification.permission === "granted") {
            new Notification("💊 Mi Pastillero", {
              body: `Es hora de tomar ${pill.emoji} ${pill.nombre}${pill.dosis ? ` (${pill.dosis})` : ""}`,
              icon: "/icon-192.png"
            });
          }
        }
      });
    };
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [pills, records]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const togglePill = async (dayStr, pillId) => {
    if (new Date(dayStr) > today) { showToast("No puedes marcar días futuros"); return; }
    const dayData = records[dayStr] || {};
    if (dayData[pillId]) {
      await supabase.from("medicamentos").delete().eq("id", dayData[pillId].dbId);
      const updated = { ...records };
      const { [pillId]: _, ...rest } = dayData;
      if (Object.keys(rest).length === 0) delete updated[dayStr];
      else updated[dayStr] = rest;
      setRecords(updated);
      showToast("Registro eliminado");
    } else {
      const { data } = await supabase.from("medicamentos").insert({ nombre: pillId, fecha: dayStr, tomado: true, hora: new Date().toLocaleTimeString("es-ES"), user_id: session.user.id }).select().single();
      if (data) {
        const updated = { ...records };
        updated[dayStr] = { ...dayData, [pillId]: { time: data.created_at, dbId: data.id } };
        setRecords(updated);
        const pill = pills.find(p => p.id === pillId);
        showToast(`${pill.emoji} ${pill.nombre} registrada`);
      }
    }
  };

  const markAllToday = async () => {
    const dayData = records[todayStr] || {};
    const allTaken = pills.every(p => dayData[p.id]);
    if (allTaken) { showToast("Ya tomaste todas hoy"); return; }
    const toInsert = pills.filter(p => !dayData[p.id]).map(p => ({ nombre: p.id, fecha: todayStr, tomado: true, hora: new Date().toLocaleTimeString("es-ES"), user_id: session.user.id }));
    const { data } = await supabase.from("medicamentos").insert(toInsert).select();
    if (data) {
      const updated = { ...records };
      const newDayData = { ...dayData };
      data.forEach(row => { newDayData[row.nombre] = { time: row.created_at, dbId: row.id }; });
      updated[todayStr] = newDayData;
      setRecords(updated);
      showToast("🎉 Todas registradas");
    }
  };

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(todayStr); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDay(year, month);
  const days = [...Array(firstDay).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => i + 1)];
  const getPillCount = (dayStr) => { const d = records[dayStr]; return d ? Object.keys(d).length : 0; };
  const getDayStatus = (dayStr) => { const c = getPillCount(dayStr); if (c === (pills?.length || 0)) return "complete"; if (c > 0) return "partial"; return "none"; };

  const todayData = records[todayStr] || {};
  const todayTaken = pills?.filter(p => todayData[p.id]).length || 0;
  const todayTotal = pills?.length || 0;
  const monthComplete = Object.keys(records).filter(k => getDayStatus(k) === "complete").length;

  if (session === undefined) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (!session) return <LoginScreen />;
  if (pills === null) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (pills.length === 0 && screen !== "settings") return <SetupScreen session={session} onDone={(p) => { setPills(p); setScreen("main"); }} />;
  if (screen === "settings") return <SettingsScreen session={session} pills={pills} onUpdate={setPills} onBack={() => setScreen("main")} />;

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif" }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      {toast && <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-xl" style={{ animation: "slideDown 0.3s ease" }}>{toast}</div>}

      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-violet-200">💊</div>
            <div>
              <h1 className="text-lg text-gray-800 leading-tight" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
              <p className="text-xs text-gray-400 font-medium">{session.user.email}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex bg-gray-100 rounded-xl p-1">
              <button onClick={() => { setView("today"); goToday(); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${view === "today" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Hoy</button>
              <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${view === "calendar" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Mes</button>
            </div>
            <button onClick={() => setScreen("settings")} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 text-sm cursor-pointer">⚙️</button>
            <button onClick={() => supabase.auth.signOut()} className="w-8 h-8 rounded-xl bg-gray-100 flex items-center justify-center text-gray-400 hover:bg-gray-200 text-xs font-bold cursor-pointer">↩</button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Progreso de hoy</span>
            <span className="text-xs text-gray-800" style={{ fontWeight: 900 }}>{todayTaken}/{todayTotal}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
            {pills.map(pill => { const c = getColor(pill.color); return <div key={pill.id} className={`flex-1 rounded-full transition-all duration-500 ${todayData[pill.id] ? c.accent : "bg-gray-100"}`} />; })}
          </div>
          <div className="flex justify-between mt-2">
            {pills.map(p => (
              <div key={p.id} className={`flex items-center gap-1 text-xs ${todayData[p.id] ? "opacity-100" : "opacity-30"}`}>
                <span>{p.emoji}</span>
                <span className="hidden sm:inline font-medium text-gray-500">{p.nombre.slice(0, 4)}</span>
              </div>
            ))}
          </div>
        </div>

        {view === "today" ? (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="space-y-3 mb-5">
              {pills.map(pill => {
                const taken = todayData[pill.id];
                const c = getColor(pill.color);
                return (
                  <button key={pill.id} onClick={() => togglePill(todayStr, pill.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all cursor-pointer active:scale-[0.98] ${taken ? `${c.bg} ring-2 ${c.ring}` : "bg-white hover:bg-gray-50 shadow-sm"}`}>
                    <span className="text-3xl">{pill.emoji}</span>
                    <div className="flex-1 text-left">
                      <p className={`font-bold ${taken ? c.text : "text-gray-800"}`}>{pill.nombre}</p>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {taken ? `Tomada a las ${fmtTime(taken.time)}` : `${pill.dosis ? pill.dosis + " · " : ""}${pill.hora_toma || ""} ${pill.frecuencia || ""}`}
                      </p>
                    </div>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${taken ? `${c.accent} text-white` : "bg-gray-100 text-gray-300"}`}>
                      {taken ? "✓" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
            {todayTaken < todayTotal && (
              <button onClick={markAllToday} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-4 rounded-2xl shadow-lg shadow-violet-200 transition-all cursor-pointer active:scale-[0.98]" style={{ fontWeight: 800 }}>
                💊 Marcar todas como tomadas
              </button>
            )}
            {todayTaken === todayTotal && (
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
                  {pills.map(pill => {
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
