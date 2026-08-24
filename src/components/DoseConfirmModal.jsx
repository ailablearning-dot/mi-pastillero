import { useState } from "react";
import { Pencil, X } from 'lucide-react';
import { getColor } from "../domain/catalogs";
import { fmt12h } from "../domain/dates";
import { doseLabel } from "../domain/dosage";
import { participioPara, participioFPara, capitalizar } from "../domain/medTypes";

// Modal de confirmación de una dosis puntual (al tocar la notificación o una
// pastilla en la lista): Tomado / Aplazar / No tomado, con hora editable.
// `onEditar` lleva al formulario de ESTE medicamento. Va aquí y no como un lápiz en la fila del
// home porque el toque en la fila ya está ocupado por la acción principal —marcar la dosis, lo que
// la gente hace veinte veces por semana— y no se comparte ni se mueve. Dentro de esta hoja, en
// cambio, ya se está decidiendo qué hacer con esta pastilla.
//
// Existe porque "Mis medicamentos" vive dentro de Ajustes y casi nadie llega: es el mismo criterio
// que sacó "gestionar personas" al selector del avatar. Las acciones van donde nace la necesidad,
// no donde encajan en el menú.
export default function DoseConfirmModal({ dose, record, pospuesta, onTaken, onSkip, onSnooze, onClear, onClose, onEditar }) {
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
  // Una dosis registrada nunca se anuncia como pospuesta: manda el registro.
  const aplazada = !record && pospuesta?.hasta > Date.now();
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
          {/* EL ESTADO VA ARRIBA, con la dosis, y como etiqueta — no debajo de los botones.
              Reportado en device: al final de la pila se leía como una opción más ("¿'Ya registrado
              como tomada' es algo que puedo tocar?"), porque quedaba justo debajo de "Editar este
              medicamento", que sí lo es. Aquí describe la dosis, que es lo que es.
              `record.pending` = la marca se guardó en el teléfono pero aún no subió; sin decirlo,
              "Ya registrado" sin conexión no sería del todo cierto. */}
          {(alreadyTaken || alreadySkipped || aplazada) && (
            <div className="mt-3 flex justify-center">
              <span className={`inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1 rounded-full ${
                alreadyTaken ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300"
                : alreadySkipped ? "bg-red-50 dark:bg-red-950/40 text-red-500 dark:text-red-300"
                : "bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300"}`}>
                {alreadyTaken ? `✓ Ya ${participioFPara(pill)}`
                  : alreadySkipped ? `✕ No ${participioFPara(pill)}`
                  : `⏰ Pospuesta hasta las ${pospuesta.hora}`}
                {(alreadyTaken || alreadySkipped) && record?.pending && " · en el teléfono"}
              </span>
            </div>
          )}
          <div className={`w-20 h-20 rounded-full ${c.accent} flex items-center justify-center text-4xl mx-auto my-5 shadow-lg`}>{pill.emoji}</div>
          {/* Con la dosis ya resuelta, "¿Ha tomado su medicamento?" es una pregunta cuya respuesta
              está dos líneas más arriba. Se cambia por lo que de verdad se viene a hacer aquí. */}
          <p className="font-bold text-gray-700 dark:text-gray-200 mb-3">
            {(alreadyTaken || alreadySkipped) ? "¿Quieres cambiarlo?" : `¿Ha ${participioPara(pill)} su medicamento?`}
          </p>
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
              {onEditar && (
                <button onClick={onEditar} className="w-full text-gray-400 text-xs font-bold pt-1 flex items-center justify-center gap-1">
                  <Pencil size={11} /> Editar este medicamento
                </button>
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
        </div>
      </div>
    </div>
  );
}
