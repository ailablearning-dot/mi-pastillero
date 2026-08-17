import { useState } from "react";
import { PACIENTE_EMOJIS } from "../domain/catalogs";

export default function PacienteForm({ paciente, onSave, onCancel }) {
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
            className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
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
