import { useState, useEffect } from "react";
import { Pencil, Trash2, Plus, ArrowLeft } from 'lucide-react';
import { supabase } from "../lib/supabase";
import PacienteForm from "../components/PacienteForm";

export default function PacientesScreen({ session, pacientes, pacienteActivoId, onChange, onBack }) {
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
