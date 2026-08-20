import { useState } from "react";
import { esAnonimo } from "../domain/sesion.js";
import { Plus, X, ArrowRight } from 'lucide-react';
import { getColor } from "../domain/catalogs";
import { doseLabel } from "../domain/dosage";
import { pautaLabel } from "../domain/schedule";
import { supabase } from "../lib/supabase";
import { newPillId, insertPill, removeFromPillQueue } from "../lib/offlineQueue";
import PillForm from "../components/PillForm";

export default function SetupScreen({ session, pacienteId, pacientes, notifPermission, requestNotifPermission, onDone, onCancel }) {
  const [pills, setPills] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  // OPTIMISTA + cola, igual que las otras dos altas (ver `insertPill`). Aquí importa especialmente:
  // es el alta inicial, y antes un fallo de red dejaba al usuario sin poder terminar el onboarding.
  const addPill = async (data) => {
    const saved = { ...data, id: newPillId(), user_id: session.user.id, paciente_id: pacienteId, orden: pills.length };
    setPills(prev => [...prev, { ...saved, _pending: true }]);
    setShowForm(false);
    const res = await insertPill(saved);
    if (res === "rechazada") { setPills(prev => prev.filter(p => p.id !== saved.id)); alert("No se pudo guardar el medicamento. Inténtalo de nuevo."); return; }
    setPills(prev => prev.map(p => (p.id === saved.id ? { ...p, _pending: res !== "ok" } : p)));
  };

  const removePill = async (id) => {
    await removeFromPillQueue(id); // por si aún no había llegado a subir
    const { error } = await supabase.from("pastillas").delete().eq("id", id);
    if (error) { alert("No se pudo eliminar el medicamento. Revisa tu conexión e inténtalo de nuevo."); return; }
    setPills(pills.filter(p => p.id !== id));
  };

  const finish = async () => {
    if (pills.length === 0) return;
    setSaving(true);
    // El permiso de notificaciones se pide AQUÍ, no con la banda del home.
    //
    // La banda tenía sentido cuando para llegar al home había que registrarse y pagar: quien
    // llegaba estaba muy comprometido. Sin muros la gente entra en segundos y una banda se
    // ignora. Este es el único momento en que el permiso se explica solo: la persona acaba de
    // decir "recuérdame esto", así que el sistema le pregunta justo por lo que pidió.
    let concedido = notifPermission === "granted";
    if (!concedido && requestNotifPermission) {
      try { concedido = (await requestNotifPermission()) === "granted"; } catch (_) { /* noop */ }
    }
    // Se le pasa al home si puede prometer de verdad el recordatorio. Si lo denegó NO se enseña
    // la confirmación verde: sería mentirle, y el aviso ámbar de "recordatorios apagados" ya
    // cuenta lo que pasa.
    onDone(pills, { recordatorioActivo: concedido });
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
          {/* Texto del prototipo aprobado. "Configura tus medicamentos" pedía una tarea; esto
              pide UN paso, que es lo que de verdad hay que dar. De 16 cuentas creadas, 11 nunca
              agregaron un medicamento: el problema era no saber por dónde empezar. */}
          {/* La bienvenida va ENCIMA y el titular del prototipo se queda intacto: aquel pide UN
              paso, que es lo que hace falta; pero sin un saludo la primera pantalla de la app
              entra en frío. Solo para quien acaba de llegar sin cuenta.
              "Te damos la bienvenida" y no "Bienvenido(a)": no sabemos si quien abre la app es
              hombre o mujer, y los paréntesis se leen como formulario de trámite justo donde hace
              falta que suene humano. Esta forma es neutra por gramática, no por tipografía. */}
          {/* La bienvenida y el "primer medicamento" solo mientras la lista está vacía. En cuanto
              hay uno dado de alta, seguir pidiendo el PRIMERO con ese medicamento listado justo
              debajo se contradice a sí mismo. El segundo titular sigue pidiendo un solo paso —y
              deja claro que ya se puede terminar. */}
          {esAnonimo(session) && pills.length === 0 && (
            <p className="text-sm font-bold text-violet-500 mb-1">Te damos la bienvenida</p>
          )}
          <h1 className="text-xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>
            {pills.length === 0 ? "Empieza por tu primer medicamento" : "¿Tomas algún otro?"}
          </h1>
          {/* El prototipo ponía aquí "No necesitas crear cuenta", como respuesta a la objeción
              de quien descarga una app de salud. Se quita por decisión del usuario tras verlo en
              device: si nunca se le enseñó un registro, mencionar cuentas introduce una idea que
              nadie tenía en la cabeza — contesta una pregunta que no se ha hecho. La promesa
              sigue cumpliéndose de hecho: entra sin que se le pida nada. */}
          <p className="text-sm text-gray-400">{pills.length === 0 ? "Te avisamos a la hora exacta." : "Agrega los que quieras, o empieza ya."}</p>
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
                      <p className="text-xs text-gray-400">{doseLabel(pill) && `${doseLabel(pill)} · `}{pautaLabel(pill)}{pill.hora_toma && ` · ${pill.hora_toma}`}</p>
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
