import { useState, useEffect, useRef } from "react";
import {
  Lock, Settings, Trash2, ChevronDown, ArrowLeft,
  Users, Pill, AlertTriangle, HelpCircle, Shield, Sparkles, MessageSquare,
} from 'lucide-react';
import { SUBSCRIPTIONS_ENABLED, openDoc, CONTACT_EMAIL, APP_VERSION, ENTORNO_LABEL } from "../lib/config";
import { supabase } from "../lib/supabase";
import { getSubscriptionInfo, manageSubscriptions } from "../purchases";
import { VOLUMENES } from "../lib/notifications";
import PillForm from "../components/PillForm";

export default function SettingsScreen({ session, pills, onBack, onMisMedicamentos, onManagePacientes,
  pacientesBloqueado, sesionAnonima, onCrearCuenta, criticalAlerts, onToggleCriticalAlerts, criticalVolume, onChangeCriticalVolume, bioEnabled, onDisableBio }) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState(null);
  const [subInfo, setSubInfo] = useState(null); // detalles de la suscripción (null si no hay / web)
  const [subOpen, setSubOpen] = useState(false); // acordeón "Tu suscripción"
  const [alertsOpen, setAlertsOpen] = useState(false); // acordeón "Alertas críticas"

  // Escucha inmediata al tocar un nivel. Tercer intento, y conviene dejar por qué:
  //
  //  1) `new Audio()` + `.volume` → en el WebView de iOS asignar `volume` se IGNORA: sonaba,
  //     pero los cuatro niveles idénticos.
  //  2) AudioContext + fetch + decodeAudioData + BufferSource → dejó de sonar del todo. Bajar y
  //     decodificar el archivo a mano añade dos puntos de fallo (el esquema capacitor:// y el
  //     decodificador) justo donde no hacía falta: el <audio> ya sabía cargarlo solo.
  //  3) Esto: el <audio> carga como siempre —eso ya funcionaba— y se enruta por un nodo de
  //     ganancia, que es lo único que aporta Web Audio aquí. El elemento y su nodo se crean UNA
  //     vez (iOS solo permite un MediaElementSource por elemento) y luego solo cambia la ganancia.
  //
  // Si algo falla se reproduce igual sin control de volumen, y el motivo se muestra en pantalla:
  // "no se escucha nada" sin más ya nos costó dos rondas de diagnóstico a ciegas.
  const ctxRef = useRef(null);
  const elRef = useRef(null);
  const gainRef = useRef(null);
  const [audioMsg, setAudioMsg] = useState(null);

  useEffect(() => () => {
    try { elRef.current?.pause(); } catch (_) {}
    try { ctxRef.current?.close(); } catch (_) {}
    ctxRef.current = null; elRef.current = null; gainRef.current = null;
  }, []);

  const escuchar = async (valor) => {
    const vol = Math.max(0, Math.min(1, valor));
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) throw new Error("sin Web Audio");
      if (!ctxRef.current) {
        const ctx = new Ctx();
        const el = new Audio("/sounds/ding.mp3");
        el.preload = "auto";
        const src = ctx.createMediaElementSource(el);
        const gain = ctx.createGain();
        src.connect(gain).connect(ctx.destination);
        ctxRef.current = ctx; elRef.current = el; gainRef.current = gain;
      }
      if (ctxRef.current.state === "suspended") await ctxRef.current.resume();
      gainRef.current.gain.value = vol;
      elRef.current.currentTime = 0;
      await elRef.current.play();
      setAudioMsg(null);
    } catch (e) {
      // Respaldo: que al menos suene, aunque sin poder variar el volumen.
      try { const a = new Audio("/sounds/ding.mp3"); a.play().catch(() => {}); } catch (_) {}
      setAudioMsg(`No se pudo ajustar el volumen de la prueba (${e?.name || "error"}: ${e?.message || "desconocido"}). El ajuste sí quedó guardado.`);
    }
  };

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

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 px-4 pb-6">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          {onBack && (<button onClick={onBack} className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-gray-400"><ArrowLeft size={18} /></button>)}
          <h1 className="text-lg text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>Ajustes</h1>
        </div>
        {true ? (
          <>
            {/* Antes era un acordeón con toda la lista, el alta, la edición y el borrado dentro
                de Ajustes. Es la parte más grande de esta pantalla —más que "Gestionar
                pacientes"— así que ahora tiene la suya. */}
            {/* Ojo con el texto: decir "tus datos solo están en este teléfono" era FALSO y encima
                contradecía a la pantalla de cuenta, que promete que ya están guardados. Los datos
                SÍ están en la nube desde el segundo uno; lo que vive solo en el teléfono es la
                LLAVE para llegar a ellos. Por eso se habla de recuperarlos, no de guardarlos.
                Va arriba del todo porque quien tocó "Más tarde" necesita volver aquí sin buscar. */}
            {sesionAnonima && onCrearCuenta && (
              <button onClick={onCrearCuenta} className="w-full px-4 py-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 text-sm font-bold text-amber-700 dark:text-amber-400 flex items-center gap-2 mb-2 text-left">
                <Shield size={16} className="shrink-0" />
                <span className="flex-1">Crear mi cuenta
                  <span className="block text-[11px] font-medium text-amber-600 dark:text-amber-500">Sin cuenta no podrás recuperarlos si cambias de teléfono</span>
                </span>
              </button>
            )}
            <button onClick={onMisMedicamentos} className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2 mb-2">
              <Pill size={16} /> Mis medicamentos ({pills.length})
            </button>
            {onManagePacientes && (
              <button onClick={onManagePacientes} className="w-full px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2 mb-2">
                <Users size={16} /> Gestionar pacientes
                {/* El candado también aquí: si la fila se ve igual que las gratis, tocarla y que
                    salte el paywall se siente como una trampa. Con el candado delante, la persona
                    ya sabe a qué entra. */}
                {pacientesBloqueado && <Lock size={13} className="ml-auto text-violet-400" />}
              </button>
            )}
            {/* "Ver reportes" YA NO va aquí: es una pestaña de la barra inferior. Estuvo enterrado
                en Ajustes durante meses —una función de pago que nadie encontraba— y la barra se
                creó justamente para sacarlo. Tenerlo en los dos sitios es la mitad del problema
                que se quiso arreglar. */}
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
            {/* Acordeón, como "Mis medicamentos" y "Tu suscripción": con todo desplegado a la vez
                la pantalla se saturaba. Dentro va TODO lo de alertas críticas —encenderlas y su
                volumen— junto, que es donde el usuario lo va a buscar. */}
            <button onClick={() => setAlertsOpen(o => !o)} className="w-full mt-2 px-4 py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm font-bold text-violet-600 flex items-center gap-2">
              <AlertTriangle size={16} /> Alertas críticas
              <span className={`ml-auto text-xs font-bold ${criticalAlerts ? "text-emerald-500" : "text-gray-400"}`}>
                {criticalAlerts ? "Activadas" : "Desactivadas"}
              </span>
              <ChevronDown size={16} className={`transition-transform ${alertsOpen ? "rotate-180" : ""}`} />
            </button>

            {alertsOpen && (
              <div className="w-full mt-2 py-4 px-4 rounded-2xl bg-white dark:bg-gray-800 shadow-sm">
                <div className="flex items-start gap-3">
                  <div className="flex-1">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200">Sonar siempre</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
                      Los recordatorios suenan aunque el teléfono esté en silencio o en Concentración.
                    </p>
                  </div>
                  <button
                    onClick={() => onToggleCriticalAlerts(!criticalAlerts)}
                    aria-label="Activar o desactivar alertas críticas"
                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 mt-0.5 ${criticalAlerts ? "bg-violet-500" : "bg-gray-300 dark:bg-gray-600"}`}
                  >
                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${criticalAlerts ? "translate-x-5" : ""}`} />
                  </button>
                </div>

                {criticalAlerts && (
                  <div className="mt-4 pt-4 border-t border-gray-100 dark:border-gray-700">
                    <p className="text-sm font-bold text-gray-700 dark:text-gray-200 mb-0.5">Volumen</p>
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                      Toca un nivel para escucharlo. Si los escuchas poco —sobre todo en el Apple Watch— súbelo.
                    </p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {VOLUMENES.map(v => (
                        <button
                          key={v.id}
                          onClick={() => { onChangeCriticalVolume(v.id); escuchar(v.valor); }}
                          aria-pressed={criticalVolume === v.id}
                          className={`py-2 rounded-xl text-xs font-bold border transition-all ${
                            criticalVolume === v.id
                              ? "bg-violet-500 border-violet-500 text-white"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300"
                          }`}
                        >
                          {v.label}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-2">
                      {VOLUMENES.find(v => v.id === criticalVolume)?.ayuda}
                    </p>
                    {audioMsg && (
                      <p className="text-xs text-amber-600 dark:text-amber-400 mt-2 leading-relaxed">{audioMsg}</p>
                    )}
                    {/* Honestidad: la prueba suena por el canal de multimedia, no por el de alertas.
                        Sirve para comparar niveles entre sí, no para demostrar el modo silencio — y
                        de hecho la prueba SÍ se calla con el interruptor de silencio, al revés que el
                        recordatorio real. Sin avisarlo, quien tenga el teléfono en silencio no oye
                        nada y da por hecho que está roto. */}
                    <p className="text-xs text-gray-400 mt-2 leading-relaxed">
                      Esta prueba sirve para comparar los niveles entre sí. Si no escuchas nada,
                      revisa que el teléfono no esté en silencio. El recordatorio real sí suena
                      aunque lo esté.
                    </p>
                  </div>
                )}
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
            <p className="text-center text-xs text-gray-400 mt-6">
              Versión {APP_VERSION}
              {/* Solo aparece cuando la compilación NO apunta a producción. En la tienda esto
                  está vacío; si alguna vez se ve, es que se publicó apuntando a dev. */}
              {ENTORNO_LABEL && (
                <span className="ml-2 px-1.5 py-0.5 rounded font-bold bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-400">
                  {ENTORNO_LABEL}
                </span>
              )}
            </p>
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
