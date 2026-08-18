import { useState } from "react";
import { ArrowLeft, Pencil, X, Plus, Copy } from 'lucide-react';
import { getColor } from "../domain/catalogs";
import { doseLabel } from "../domain/dosage";
import { pautaLabel } from "../domain/schedule";
import { supabase } from "../lib/supabase";
import { newPillId, insertPill, removeFromPillQueue } from "../lib/offlineQueue";
import PillForm from "../components/PillForm";

// Pantalla propia para la lista de medicamentos. Antes era un ACORDEÓN dentro de Ajustes, y se
// había quedado pequeño el sitio: con el alta, la edición, el duplicado y el borrado es la parte
// más grande de esa pantalla — más que "Gestionar pacientes", que sí tenía la suya.
export default function MedicamentosScreen({ session, pacienteId, pills, onUpdate, onBack }) {
  const [list, setList] = useState(pills);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [duplicating, setDuplicating] = useState(null); // medicamento del que se parte al duplicar

  // OPTIMISTA + cola: el medicamento aparece al instante y se sincroniza después (ver `insertPill`).
  const addPill = async (data) => {
    const saved = { ...data, id: newPillId(), user_id: session.user.id, paciente_id: pacienteId, orden: list.length };
    const nl = [...list, { ...saved, _pending: true }];
    setList(nl); onUpdate(nl);
    setShowForm(false);
    setDuplicating(null); // si venía de Duplicar, hay que cerrarlo también o el form no se va
    const res = await insertPill(saved);
    const nl2 = res === "rechazada"
      ? nl.filter(p => p.id !== saved.id)
      : nl.map(p => (p.id === saved.id ? { ...p, _pending: res !== "ok" } : p));
    setList(nl2); onUpdate(nl2);
    if (res === "rechazada") alert("No se pudo guardar el medicamento. Inténtalo de nuevo.");
  };

  // Editar y borrar NO llevan cola, pero sí dejan de dar por bueno lo que no se guardó: antes
  // actualizaban la pantalla aunque la petición fallara (el medicamento reaparecía al recargar).
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
    setList(nl); onUpdate(nl);
  };

  if (showForm || editing || duplicating) {
    // Al duplicar se pasa una COPIA sin `id`: el formulario la trata como nueva (guarda con addPill
    // y genera su propio id) pero llega con todo lleno. Sin quitar el id sobrescribiría el original.
    const base = duplicating
      ? { ...duplicating, id: undefined, nombre: `${duplicating.nombre} (2)`, _pending: undefined }
      : editing;
    return (
      <PillForm
        title={editing ? "Editar medicamento" : duplicating ? "Duplicar medicamento" : "Nuevo medicamento"}
        pill={base}
        onSave={editing ? editPill : addPill}
        onCancel={() => { setShowForm(false); setEditing(null); setDuplicating(null); }}
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

        <div className="space-y-3 mb-3">
          {list.map(pill => {
            const c = getColor(pill.color);
            return (
              <div key={pill.id} className={`flex items-center gap-3 p-4 rounded-2xl ${c.bg}`}>
                <span className="text-2xl">{pill.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${c.text}`}>{pill.nombre}</p>
                  <p className="text-xs text-gray-400">{doseLabel(pill) && `${doseLabel(pill)} · `}{pautaLabel(pill)}{pill.hora_toma && ` · ${pill.hora_toma}`}{pill._pending && " · 📶 sin sincronizar"}</p>
                </div>
                {/* Duplicar resuelve barato "una dosis de lunes a jueves y otra de viernes a
                    domingo": copia todo y solo hay que cambiar los días y la cantidad. */}
                <button onClick={() => setDuplicating(pill)} aria-label={`Duplicar ${pill.nombre}`} className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center text-gray-400 hover:text-violet-400 shrink-0"><Copy size={14} /></button>
                <button onClick={() => setEditing(pill)} aria-label={`Editar ${pill.nombre}`} className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center text-gray-400 hover:text-violet-400 shrink-0"><Pencil size={14} /></button>
                <button onClick={() => removePill(pill.id)} aria-label={`Eliminar ${pill.nombre}`} className="w-7 h-7 rounded-lg bg-white/60 flex items-center justify-center text-gray-400 hover:text-red-400 shrink-0"><X size={14} /></button>
              </div>
            );
          })}
        </div>

        <button onClick={() => setShowForm(true)} className="w-full py-3 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 text-sm font-bold text-violet-600 dark:text-violet-300 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all flex items-center justify-center gap-1">
          <Plus size={16} /> Agregar medicamento
        </button>
      </div>
    </div>
  );
}
