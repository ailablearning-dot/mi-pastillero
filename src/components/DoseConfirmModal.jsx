import { useState } from "react";
import { Pencil, X } from 'lucide-react';
import { getColor } from "../domain/catalogs";
import { fmt12h } from "../domain/dates";
import { doseLabel } from "../domain/dosage";
import { participioPara, participioFPara, capitalizar } from "../domain/medTypes";

// Modal de confirmación de una dosis puntual (al tocar la notificación o una
// pastilla en la lista): Tomado / Aplazar / No tomado, con hora editable.
export default function DoseConfirmModal({ dose, record, onTaken, onSkip, onSnooze, onClear, onClose }) {
  const { pill, scheduledTime, dateStr } = dose;
  const c = getColor(pill.color);
  const [showSnooze, setShowSnooze] = useState(false);
  const [editingTime, setEditingTime] = useState(false);
  const [customTime, setCustomTime] = useState(() => {
    const n = new Date();
    return `${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
  });
  const alreadyTaken = record?.tomado === true;
  const alreadySkipped = record?.tomado === false;
  const dateLabel = new Date(dateStr + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  // El backdrop NO cierra el modal a propósito: es una decisión de medicación (a menudo abierta
  // desde la notificación) → solo se cierra con la X o eligiendo una opción, para que un toque
  // accidental fuera de la tarjeta no lo descarte y deje la dosis sin registrar.
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-6" style={{ animation: "fadeIn .2s ease" }}>
      <div className="w-full max-w-xs bg-white dark:bg-gray-800 rounded-3xl p-6 relative">
        <button onClick={onClose} aria-label="Cerrar" className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg active:scale-95"><X size={18} /></button>
        <div className="text-center">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">{pill.nombre}</h3>
          <p className="text-sm text-gray-400 mt-0.5">{doseLabel(pill, scheduledTime) ? `${doseLabel(pill, scheduledTime)} · ` : ""}{dateLabel}, {fmt12h(scheduledTime)}</p>
          <div className={`w-20 h-20 rounded-full ${c.accent} flex items-center justify-center text-4xl mx-auto my-5 shadow-lg`}>{pill.emoji}</div>
          <p className="font-bold text-gray-700 dark:text-gray-200 mb-3">¿Ha {participioPara(pill)} su medicamento?</p>
          <div className="text-sm text-gray-500 mb-5 flex items-center justify-center gap-2">
            <span>Hora:</span>
            {editingTime
              ? <input type="time" value={customTime} onChange={e => setCustomTime(e.target.value)} className="border border-gray-200 dark:border-gray-600 rounded-lg px-2 py-1 text-sm dark:bg-gray-700 dark:text-gray-100" />
              : <button onClick={() => setEditingTime(true)} className="font-bold text-violet-600 inline-flex items-center gap-1">Ahora <Pencil size={12} /></button>}
          </div>

          {!showSnooze ? (
            <div className="space-y-2">
              <button onClick={() => onTaken(editingTime ? customTime : null)} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-3 rounded-2xl shadow-lg shadow-violet-200 dark:shadow-none active:scale-[0.98]">{capitalizar(participioFPara(pill))}</button>
              <button onClick={() => setShowSnooze(true)} className="w-full bg-violet-50 dark:bg-gray-700 text-violet-600 dark:text-violet-300 font-bold py-3 rounded-2xl active:scale-[0.98]">Posponer</button>
              <button onClick={onSkip} className="w-full text-red-500 font-bold py-2 active:scale-[0.98]">No {participioFPara(pill)}</button>
              {(alreadyTaken || alreadySkipped) && (
                <button onClick={onClear} className="w-full text-gray-400 text-xs font-bold pt-1">Deshacer registro</button>
              )}
            </div>
          ) : (
            <div>
              <p className="text-xs text-gray-400 mb-2">Recordar en:</p>
              <div className="flex gap-2">
                {[10, 30, 60].map(min => (
                  <button key={min} onClick={() => onSnooze(min)} className="flex-1 bg-violet-50 dark:bg-gray-700 text-violet-600 dark:text-violet-300 font-bold py-3 rounded-2xl active:scale-[0.98]">{min} min</button>
                ))}
              </div>
              <button onClick={() => setShowSnooze(false)} className="w-full text-gray-400 text-xs font-bold pt-3">Cancelar</button>
            </div>
          )}
          {/* `record.pending` = la marca se guardó en el teléfono pero aún no subió. Sin esto el
              modal decía "Ya registrado" a secas, que sin conexión no es del todo cierto. */}
          {alreadyTaken && <p className="text-xs text-emerald-500 font-bold mt-3">Ya registrado como {participioPara(pill)}{record?.pending && " · 📶 sin sincronizar"}</p>}
          {alreadySkipped && <p className="text-xs text-red-500 font-bold mt-3">Marcado como no {participioFPara(pill)}{record?.pending && " · 📶 sin sincronizar"}</p>}
        </div>
      </div>
    </div>
  );
}
