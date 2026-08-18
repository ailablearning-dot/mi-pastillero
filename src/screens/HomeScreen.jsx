import { Settings, LogOut, X, Plus, ChevronDown, ChevronLeft, ChevronRight, ArrowRight, Bell, Fingerprint } from 'lucide-react';
import { getColor } from "../domain/catalogs";
import {
  DAYS_ES, MONTHS_ES, getDaysInMonth, getFirstDay,
  fmtDate, fmtTime, fmt12h, formatTimingDiff, getTimingInfo,
} from "../domain/dates";
import { getHoras, isPillDueOnDay } from "../domain/schedule";
import { doseLabel } from "../domain/dosage";
import { participioFPara, capitalizar } from "../domain/medTypes";
import { supabase } from "../lib/supabase";
import { biometricSupported, registerBiometric } from "../lib/biometrics";
import DoseConfirmModal from "../components/DoseConfirmModal";
import GroupDoseModal from "../components/GroupDoseModal";

// La pantalla principal: el día de hoy por bloques horarios y la vista de mes.
// Solo pinta y delega: todo el estado y las acciones viven en App y llegan por props.
// Los cálculos derivados (bloques, conteos, estado de cada día) sí se hacen aquí,
// porque son función pura de `pills` y `records` y no tienen por qué subir.

export default function HomeScreen({
  // estado
  session, bioEnabled, pacientes, pacienteActivoId, showPacienteSelector, pills, screen,
  year, month, records, loading, selectedDay, toast, view, collapsedBlocks,
  groupModal, confirmDose, confirmLogout, notifPermission,
  // setters
  setBioEnabled, setShowPacienteSelector, setScreen, abrir, setRecords, setSelectedDay,
  setCollapsedBlocks, setGroupModal, setConfirmDose, setConfirmLogout,
  // acciones
  requestNotifPermission, openNotifSettings, setPacienteActivoId, cacheRecords, loadRecords,
  showToast, recordDose, clearDose, snoozeDose, markBlockDoses, prevMonth, nextMonth, goToday,
}) {
  const today = new Date();
  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

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
          {/* El interruptor Hoy/Mes y el engrane se fueron a la barra de pestañas: eran dos
              controles pequeños en una esquina, y el calendario en particular casi no se
              descubría. Aquí solo queda cerrar sesión. */}
          <div className="flex items-center gap-2">
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
                <p className="text-xs text-violet-400">Toca aquí para recibir avisos a la hora de cada medicamento</p>
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
                No hay medicamentos para hoy
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
                                  ? <>Programada {dose.scheduledTime} · {capitalizar(participioFPara(dose.pill))} {fmtTime(rec.time)}</>
                                  : skipped
                                    ? <>No {participioFPara(dose.pill)} · {dose.scheduledTime}</>
                                    : `${doseLabel(dose.pill, dose.scheduledTime) ? doseLabel(dose.pill, dose.scheduledTime) + " · " : ""}${dose.scheduledTime}`}
                              </p>
                              {/* Antes decía "sin sincronizar", que es lenguaje de programador y en una
                                  app de medicación se lee como "algo falló, tu dosis no quedó
                                  registrada" — justo la duda que NO queremos sembrar. El dato
                                  tranquilizador es que sí quedó guardada; que aún no haya subido a la
                                  nube es un detalle técnico que al usuario no le cambia nada.
                                  Dos cosas distintas pueden estar sin subir, y las dos importan igual al
                                  usuario: el ALTA del medicamento (`pill._pending`) y la MARCA de esta
                                  dosis (`rec.pending`, que se pone al fallar la escritura sin red).
                                  Faltaba la segunda: marcar una dosis en avión no mostraba nada, así que
                                  no había forma de saber que aún no estaba en el servidor. */}
                              {(dose.pill._pending || rec?.pending) && (
                                <span className="inline-block mt-1 text-xs font-bold px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300">✓ Guardado en el teléfono</span>
                              )}
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
                🎉 ¡Todo lo de hoy registrado!
              </div>
            )}
            {todayTotal > 0 && todayPending === 0 && todayTaken < todayTotal && (
              <div className="w-full bg-gray-50 dark:bg-gray-800 border-2 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300 font-bold py-4 rounded-2xl text-center text-sm">
                Día registrado ({todayTaken}/{todayTotal} dosis)
              </div>
            )}
            {/* Alta de un medicamento nuevo directo desde el home (antes solo se podía desde Ajustes,
                nada descubrible). Abre el mismo formulario de "Nuevo medicamento". */}
            <button onClick={() => abrir("addmed")} className="w-full mt-3 py-3 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 text-sm font-bold text-violet-600 dark:text-violet-300 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 active:scale-[0.99] transition-all flex items-center justify-center gap-2">
              <Plus size={18} /> Agregar medicamento
            </button>
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
              <div className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-red-100 dark:bg-red-900/40" /> Sin registrar</div>
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
          showToast={showToast}
          onMarked={({ pacienteId, pillId, hora, dateStr, tomado, horaReal }) => {
            // Reflejar la marca en el home al instante SOLO si la dosis es del paciente activo.
            // Updater FUNCIONAL (usa el records ACTUAL, no un closure viejo que borraría las otras
            // marcas — ese era el bug).
            if (pacienteId !== pacienteActivoId) return;
            const key = `${pillId}_${hora}`;
            setRecords(prev => {
              const next = { ...prev, [dateStr]: { ...(prev[dateStr] || {}), [key]: { ...(prev[dateStr]?.[key] || {}), time: horaReal, tomado } } };
              // El caché TAMBIÉN se actualiza aquí (idempotente): loadRecords es caché-primero, así
              // que al cerrar el modal repintaría el caché viejo —sin la marca— y un instante después
              // la marca de la BD. Eso era el "refresh" visible en el home.
              cacheRecords(next);
              return next;
            });
          }}
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
              onClick={() => { setShowPacienteSelector(false); abrir("pacientes"); }}
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
