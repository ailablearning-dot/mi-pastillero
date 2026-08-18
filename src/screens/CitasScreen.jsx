import { useState, useMemo } from "react";
import { Plus, ArrowLeft, Pencil, Trash2, Bell, MapPin, CalendarDays, ChevronDown } from 'lucide-react';
import { getColor } from "../domain/catalogs";
import {
  partirCitas, emojiCita, colorCita, resumenCita, fechaCitaLabel, horaCitaLabel,
  cuentaRegresivaLabel, tieneHora, avisarHorasAntes, avisoLabel, hoyStr,
} from "../domain/citas";

function TarjetaCita({ cita, medico, onEditar, onBorrar, hoy, atenuada }) {
  const color = getColor(colorCita(cita));
  const horas = avisarHorasAntes(cita);
  return (
    <div className={`flex items-start gap-3 p-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm ${atenuada ? "opacity-60" : ""}`}>
      <div className={`w-10 h-10 rounded-xl ${color.bg} flex items-center justify-center text-lg shrink-0`}>
        {emojiCita(cita)}
      </div>
      <div className="flex-1 min-w-0">
        {/* Sin `truncate`: esta línea es LO que es la cita, y cortarla dejaba cosas como
            "Renovación de medicame…". Que envuelva en dos renglones es mejor que esconder el dato. */}
        <p className="font-bold text-gray-800 dark:text-gray-100 text-sm break-words">{resumenCita(cita, medico)}</p>
        <p className="text-xs text-gray-500 mt-0.5">
          {fechaCitaLabel(cita, hoy)}{tieneHora(cita) ? ` · ${horaCitaLabel(cita)}` : " · Sin hora fija"}
        </p>
        {cita.lugar && (
          <p className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 truncate">
            <MapPin size={11} className="shrink-0" /> <span className="truncate">{cita.lugar}</span>
          </p>
        )}
        {cita.notas && <p className="text-xs text-gray-400 mt-0.5 truncate">{cita.notas}</p>}
        <div className="flex items-center gap-2 mt-1.5">
          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${color.bg} ${color.text}`}>
            {cuentaRegresivaLabel(cita, hoy)}
          </span>
          {horas !== null && !atenuada && (
            <span className="text-[10px] text-gray-400 flex items-center gap-1"><Bell size={10} /> {avisoLabel(horas)}</span>
          )}
        </div>
      </div>
      <div className="flex flex-col gap-1 shrink-0">
        <button onClick={() => onEditar(cita)} aria-label="Editar cita"
          className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-300 flex items-center justify-center hover:text-violet-400"><Pencil size={14} /></button>
        <button onClick={() => onBorrar(cita)} aria-label="Eliminar cita"
          className="w-8 h-8 rounded-xl bg-gray-100 dark:bg-gray-700 hover:bg-red-50 dark:hover:bg-red-900/30 hover:text-red-400 text-gray-400 dark:text-gray-300 flex items-center justify-center"><Trash2 size={14} /></button>
      </div>
    </div>
  );
}

export default function CitasScreen({ citas, medicos = [], paciente, onNueva, onEditar, onBorrar, onBack }) {
  // Las pasadas arrancan plegadas: la pregunta que trae a esta pantalla es "¿qué me toca?", no
  // "¿a qué fui?". El historial sigue estando, a un toque, porque es lo que se le enseña al médico.
  const [verPasadas, setVerPasadas] = useState(false);
  const hoy = hoyStr();
  const medicosById = useMemo(() => Object.fromEntries(medicos.map(m => [m.id, m])), [medicos]);
  const { proximas, pasadas } = useMemo(() => partirCitas(citas || [], hoy), [citas, hoy]);

  const cargando = citas === null;

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }}
         className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto px-4 pb-6">

        <div className="flex items-center gap-3 mb-1">
          {onBack && (
            <button onClick={onBack} className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300"><ArrowLeft size={18} /></button>
          )}
          <h1 className="text-lg text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>Citas</h1>
        </div>
        {paciente && <p className="text-xs text-gray-500 mb-4">Citas de {paciente.emoji} {paciente.nombre}</p>}

        {cargando && <p className="text-sm text-gray-400 py-8 text-center">Cargando…</p>}

        {!cargando && proximas.length === 0 && pasadas.length === 0 && (
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 text-center mb-4">
            <CalendarDays size={32} className="text-violet-300 mx-auto mb-3" />
            <p className="font-bold text-gray-800 dark:text-gray-100 text-sm mb-1">Aún no tienes citas</p>
            <p className="text-xs text-gray-500">Anota la siguiente consulta, estudio o vacuna y te avisamos antes de que llegue.</p>
          </div>
        )}

        {!cargando && proximas.length > 0 && (
          <>
            <h2 className="text-xs font-bold text-gray-500 mb-2 mt-2">Próximas</h2>
            <div className="space-y-2 mb-4">
              {proximas.map(c => (
                <TarjetaCita key={c.id} cita={c} medico={medicosById[c.medico_id]} hoy={hoy}
                  onEditar={onEditar} onBorrar={onBorrar} />
              ))}
            </div>
          </>
        )}

        {!cargando && pasadas.length > 0 && (
          <div className="mb-4">
            <button onClick={() => setVerPasadas(v => !v)}
              className="w-full flex items-center justify-between py-2 text-xs font-bold text-gray-500">
              <span>Pasadas ({pasadas.length})</span>
              <ChevronDown size={16} className={`transition-transform ${verPasadas ? "rotate-180" : ""}`} />
            </button>
            {verPasadas && (
              <div className="space-y-2 mt-1">
                {pasadas.map(c => (
                  <TarjetaCita key={c.id} cita={c} medico={medicosById[c.medico_id]} hoy={hoy}
                    onEditar={onEditar} onBorrar={onBorrar} atenuada />
                ))}
              </div>
            )}
          </div>
        )}

        <button onClick={onNueva}
          className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-violet-200 dark:shadow-none flex items-center justify-center gap-2">
          <Plus size={18} /> Agregar cita
        </button>
      </div>
    </div>
  );
}
