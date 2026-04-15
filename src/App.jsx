import { useState, useEffect, useCallback } from "react";

const PILLS = [
  { id: "anticoagulante", label: "Anticoagulante", emoji: "🔴", color: "rose", bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-300", accent: "bg-rose-500" },
  { id: "aspirina", label: "Aspirina", emoji: "🟡", color: "amber", bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-300", accent: "bg-amber-500" },
  { id: "presion", label: "Presión", emoji: "🔵", color: "blue", bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-300", accent: "bg-blue-500" },
  { id: "angiotrofin", label: "Angiotrofin", emoji: "🟢", color: "emerald", bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-300", accent: "bg-emerald-500" },
  { id: "colesterol", label: "Colesterol", emoji: "🟣", color: "purple", bg: "bg-purple-100", text: "text-purple-700", ring: "ring-purple-300", accent: "bg-purple-500" },
];

const DAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
const MONTHS_ES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];

function getKey(year, month) { return `pills_multi_${year}_${month}`; }
function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
function getFirstDay(y, m) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }
function fmtDate(y, m, d) { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
function fmtTime(iso) { return new Date(iso).toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" }); }

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(fmtDate(today.getFullYear(), today.getMonth(), today.getDate()));
  const [toast, setToast] = useState(null);
  const [view, setView] = useState("today");

  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  const loadRecords = useCallback(() => {
    setLoading(true);
    try {
      const raw = localStorage.getItem(getKey(year, month));
      setRecords(raw ? JSON.parse(raw) : {});
    } catch { setRecords({}); }
    setLoading(false);
  }, [year, month]);

  useEffect(() => { loadRecords(); }, [loadRecords]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  const saveRecords = (updated) => {
    setRecords(updated);
    try { localStorage.setItem(getKey(year, month), JSON.stringify(updated)); } catch {}
  };

  const togglePill = (dayStr, pillId) => {
    if (new Date(dayStr) > today) { showToast("No puedes marcar días futuros"); return; }
    const dayData = records[dayStr] || {};
    const updated = { ...records };

    if (dayData[pillId]) {
      const { [pillId]: _, ...rest } = dayData;
      if (Object.keys(rest).length === 0) delete updated[dayStr];
      else updated[dayStr] = rest;
      saveRecords(updated);
      showToast("Registro eliminado");
    } else {
      updated[dayStr] = { ...dayData, [pillId]: { time: new Date().toISOString() } };
      saveRecords(updated);
      const pill = PILLS.find(p => p.id === pillId);
      showToast(`${pill.emoji} ${pill.label} registrada`);
    }
  };

  const markAllToday = () => {
    const dayData = records[todayStr] || {};
    const allTaken = PILLS.every(p => dayData[p.id]);
    if (allTaken) { showToast("Ya tomaste todas hoy"); return; }
    const updated = { ...records };
    const newDayData = { ...dayData };
    PILLS.forEach(p => {
      if (!newDayData[p.id]) newDayData[p.id] = { time: new Date().toISOString() };
    });
    updated[todayStr] = newDayData;
    saveRecords(updated);
    showToast("🎉 Todas registradas");
  };

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year-1); } else setMonth(month-1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year+1); } else setMonth(month+1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(todayStr); };

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDay(year, month);
  const days = [...Array(firstDay).fill(null), ...Array.from({length: daysInMonth}, (_, i) => i + 1)];

  const getPillCount = (dayStr) => { const d = records[dayStr]; return d ? Object.keys(d).length : 0; };
  const getDayStatus = (dayStr) => { const c = getPillCount(dayStr); if (c === PILLS.length) return "complete"; if (c > 0) return "partial"; return "none"; };

  const todayData = records[todayStr] || {};
  const todayTaken = PILLS.filter(p => todayData[p.id]).length;
  const todayTotal = PILLS.length;
  const monthComplete = Object.keys(records).filter(k => getDayStatus(k) === "complete").length;

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif" }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />

      {toast && (
        <div className="fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-gray-900 text-white px-5 py-3 rounded-2xl text-sm font-bold shadow-xl" style={{ animation: "slideDown 0.3s ease" }}>
          {toast}
        </div>
      )}

      <div className="max-w-md mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-xl shadow-lg shadow-violet-200">💊</div>
            <div>
              <h1 className="text-lg font-900 text-gray-800 leading-tight" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
              <p className="text-xs text-gray-400 font-medium">{PILLS.length} medicamentos</p>
            </div>
          </div>
          <div className="flex bg-gray-100 rounded-xl p-1">
            <button onClick={() => { setView("today"); goToday(); }} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${view === "today" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Hoy</button>
            <button onClick={() => setView("calendar")} className={`px-3 py-1.5 rounded-lg text-xs font-bold cursor-pointer transition-all ${view === "calendar" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Mes</button>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm mb-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-gray-500">Progreso de hoy</span>
            <span className="text-xs font-900 text-gray-800" style={{ fontWeight: 900 }}>{todayTaken}/{todayTotal}</span>
          </div>
          <div className="h-3 bg-gray-100 rounded-full overflow-hidden flex gap-0.5">
            {PILLS.map(pill => (
              <div key={pill.id} className={`flex-1 rounded-full transition-all duration-500 ${todayData[pill.id] ? pill.accent : "bg-gray-100"}`} />
            ))}
          </div>
          <div className="flex justify-between mt-2">
            {PILLS.map(p => (
              <div key={p.id} className={`flex items-center gap-1 text-xs ${todayData[p.id] ? "opacity-100" : "opacity-30"}`}>
                <span>{p.emoji}</span>
                <span className="hidden sm:inline font-medium text-gray-500">{p.label.slice(0,4)}</span>
              </div>
            ))}
          </div>
        </div>

        {view === "today" ? (
          <div style={{ animation: "fadeIn 0.3s ease" }}>
            <div className="space-y-3 mb-5">
              {PILLS.map(pill => {
                const taken = todayData[pill.id];
                return (
                  <button key={pill.id} onClick={() => togglePill(todayStr, pill.id)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl transition-all cursor-pointer active:scale-[0.98] ${taken ? `${pill.bg} ring-2 ${pill.ring}` : "bg-white hover:bg-gray-50 shadow-sm"}`}>
                    <span className="text-3xl">{pill.emoji}</span>
                    <div className="flex-1 text-left">
                      <p className={`font-bold ${taken ? pill.text : "text-gray-800"}`}>{pill.label}</p>
                      {taken ? <p className="text-xs text-gray-400 mt-0.5">Tomada a las {fmtTime(taken.time)}</p>
                        : <p className="text-xs text-gray-400 mt-0.5">Toca para registrar</p>}
                    </div>
                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold ${taken ? `${pill.accent} text-white` : "bg-gray-100 text-gray-300"}`}>
                      {taken ? "✓" : ""}
                    </div>
                  </button>
                );
              })}
            </div>
            {todayTaken < todayTotal && (
              <button onClick={markAllToday}
                className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 hover:from-violet-400 hover:to-indigo-400 text-white font-800 py-4 rounded-2xl shadow-lg shadow-violet-200 transition-all cursor-pointer active:scale-[0.98]" style={{ fontWeight: 800 }}>
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
              <button onClick={prevMonth} className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer font-bold">←</button>
              <button onClick={goToday} className="cursor-pointer hover:bg-gray-50 px-3 py-1 rounded-xl transition-all">
                <h2 className="text-base font-800 text-gray-800" style={{ fontWeight: 800 }}>{MONTHS_ES[month]} {year}</h2>
              </button>
              <button onClick={nextMonth} className="w-9 h-9 rounded-xl hover:bg-gray-100 flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer font-bold">→</button>
            </div>

            <div className="grid grid-cols-2 gap-3 mb-4">
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <p className="text-2xl font-900 text-emerald-500" style={{ fontWeight: 900 }}>{monthComplete}</p>
                <p className="text-xs font-semibold text-gray-400">Días completos</p>
              </div>
              <div className="bg-white rounded-2xl p-3 text-center shadow-sm">
                <p className="text-2xl font-900 text-violet-500" style={{ fontWeight: 900 }}>{Math.round((monthComplete / Math.min(today.getDate(), daysInMonth)) * 100 || 0)}%</p>
                <p className="text-xs font-semibold text-gray-400">Cumplimiento</p>
              </div>
            </div>

            <div className="bg-white rounded-3xl shadow-sm p-4 mb-4">
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS_ES.map(d => (<div key={d} className="text-center text-[10px] font-bold text-gray-300 uppercase tracking-wider py-1">{d}</div>))}
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
                            {PILLS.map(p => (<div key={p.id} className={`w-1.5 h-1.5 rounded-full ${records[dayStr]?.[p.id] ? p.accent : "bg-gray-200"}`} />))}
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
                <p className="text-sm font-800 text-gray-800 mb-3" style={{ fontWeight: 800 }}>
                  {new Date(selectedDay + "T12:00:00").toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long" })}
                </p>
                <div className="space-y-2">
                  {PILLS.map(pill => {
                    const taken = records[selectedDay]?.[pill.id];
                    const canToggle = new Date(selectedDay) <= today;
                    return (
                      <button key={pill.id} onClick={() => canToggle && togglePill(selectedDay, pill.id)} disabled={!canToggle}
                        className={`w-full flex items-center gap-3 p-3 rounded-xl transition-all text-left ${canToggle ? "cursor-pointer active:scale-[0.98]" : "cursor-default opacity-50"} ${taken ? pill.bg : "bg-gray-50"}`}>
                        <span className="text-lg">{pill.emoji}</span>
                        <span className={`text-sm font-bold flex-1 ${taken ? pill.text : "text-gray-400"}`}>{pill.label}</span>
                        {taken && <span className="text-xs text-gray-400">{fmtTime(taken.time)}</span>}
                        <div className={`w-6 h-6 rounded-lg flex items-center justify-center text-xs ${taken ? `${pill.accent} text-white` : "bg-gray-200"}`}>
                          {taken ? "✓" : ""}
                        </div>
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
