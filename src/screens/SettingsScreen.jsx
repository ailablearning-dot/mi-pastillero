import { useState, useEffect } from "react";
import {
  Lock, Settings, Pencil, Trash2, X, Plus, ChevronDown, ArrowLeft,
  Users, BarChart3, Pill, AlertTriangle, HelpCircle, Shield, Sparkles, MessageSquare,
} from 'lucide-react';
import { SUBSCRIPTIONS_ENABLED, openDoc, CONTACT_EMAIL, APP_VERSION } from "../lib/config";
import { getColor } from "../domain/catalogs";
import { supabase } from "../lib/supabase";
import { newPillId, insertPill, removeFromPillQueue } from "../lib/offlineQueue";
import { getSubscriptionInfo, manageSubscriptions } from "../purchases";
import PillForm from "../components/PillForm";

export default function SettingsScreen({ session, pacienteId, pills, onUpdate, onBack, onManagePacientes, onReportes, criticalAlerts, onToggleCriticalAlerts, bioEnabled, onDisableBio }) {
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

  // OPTIMISTA + cola: mismo criterio que el alta desde el home (ver `insertPill`).
  const addPill = async (data) => {
    const saved = { ...data, id: newPillId(), user_id: session.user.id, paciente_id: pacienteId, orden: list.length };
    const nl = [...list, { ...saved, _pending: true }];
    setList(nl); onUpdate(nl);
    setShowForm(false);
    const res = await insertPill(saved);
    const nl2 = res === "rechazada"
      ? nl.filter(p => p.id !== saved.id)
      : nl.map(p => (p.id === saved.id ? { ...p, _pending: res !== "ok" } : p));
    setList(nl2); onUpdate(nl2);
    if (res === "rechazada") alert("No se pudo guardar el medicamento. Inténtalo de nuevo.");
  };

  // Editar y borrar NO llevan cola, pero sí dejan de dar por bueno lo que no se guardó:
  // antes actualizaban la pantalla aunque la petición fallara (el medicamento reaparecía al
  // recargar, o el cambio se perdía sin avisar).
  const editPill = async (data) => {
    const { data: saved, error } = await supabase.from("pastillas").update(data).eq("id", editing.id).select().single();
    if (error || !saved) { alert("No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo."); return; }
    const nl = list.map(p => p.id === editing.id ? saved : p); setList(nl); onUpdate(nl);
    setEditing(null);
  };

  const removePill = async (id) => {
    await removeFromPillQueue(id); // por si aún no había llegado a subir
    const { error } = await supabase.from("pastillas").delete().eq("id", id);
    if (error) { alert("No se pudo eliminar el medicamento. Revisa tu conexión e inténtalo de nuevo."); return; }
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
                        <p className="text-xs text-gray-400">{pill.dosis && `${pill.dosis} · `}{pill.frecuencia}{pill.hora_toma && ` · ${pill.hora_toma}`}{pill._pending && " · 📶 sin sincronizar"}</p>
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
            <button onClick={() => openDoc("soporte")} className="w-full mt-2 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2">
              <HelpCircle size={16} /> Ayuda y soporte
            </button>
            <button onClick={() => window.open(`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Sugerencia — Mi Pastillero")}`, "_system")} className="w-full mt-2 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2">
              <MessageSquare size={16} /> Enviar una sugerencia
            </button>
            <button onClick={() => openDoc("privacidad")} className="w-full mt-2 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2">
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
