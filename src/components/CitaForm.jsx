import { useState } from "react";
import { ArrowLeft } from 'lucide-react';
import { fmtDate } from "../domain/dates";
import { TIPOS_CITA, AVISOS, AVISO_POR_DEFECTO, TIPO_CITA_POR_DEFECTO, horaDe } from "../domain/citas";
import MedicoCombobox from "./MedicoCombobox";

const hoyISO = () => { const d = new Date(); return fmtDate(d.getFullYear(), d.getMonth(), d.getDate()); };

export default function CitaForm({ cita, medicos = [], onSave, onCancel }) {
  const [tipo, setTipo] = useState(cita?.tipo || TIPO_CITA_POR_DEFECTO);
  const [motivo, setMotivo] = useState(cita?.motivo || "");
  const [fecha, setFecha] = useState(cita?.fecha ? String(cita.fecha).slice(0, 10) : hoyISO());
  // "Sin hora fija" NO es un hueco vacío que se te olvidó llenar: hay citas que de verdad no
  // tienen hora (un estudio al que se llega en ayunas cuando abren). Por eso es un interruptor
  // explícito y no "deja la hora en blanco", que se leería como un error.
  const [sinHora, setSinHora] = useState(!!cita && !cita.hora);
  const [hora, setHora] = useState(horaDe(cita) || "09:00");
  const [lugar, setLugar] = useState(cita?.lugar || "");
  const [notas, setNotas] = useState(cita?.notas || "");
  const [aviso, setAviso] = useState(
    cita ? (cita.avisar_horas_antes === null ? null : Number(cita.avisar_horas_antes)) : AVISO_POR_DEFECTO
  );

  const medicoInicial = cita?.medico_id ? medicos.find(m => m.id === cita.medico_id) : null;
  const [medico, setMedico] = useState({
    medicoId: medicoInicial?.id || null,
    nombre: medicoInicial?.nombre || "",
    especialidad: medicoInicial?.especialidad || "",
  });

  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(null);

  const cls = "w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300";
  const lbl = "text-xs font-bold text-gray-500 mb-1 block";

  const handleSave = async () => {
    if (!fecha) { setError("Falta la fecha de la cita."); return; }
    setGuardando(true);
    setError(null);
    const res = await onSave({
      tipo,
      motivo,
      medicoId: medico.medicoId,
      medicoNombre: medico.nombre,
      medicoEspecialidad: medico.especialidad,
      fecha,
      hora: sinHora ? null : hora,
      lugar,
      notas,
      avisar_horas_antes: aviso,
    });
    setGuardando(false);
    // Si falló NO se cierra el formulario: lo que la persona escribió se queda en pantalla y
    // basta con volver a darle a Guardar. Cerrarlo y perderlo todo es el peor final posible.
    if (res && res.ok === false) {
      setError(navigator.onLine
        ? "No se pudo guardar la cita. Inténtalo otra vez."
        : "Sin conexión: las citas todavía necesitan internet para guardarse.");
    }
  };

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div
        className="w-full flex flex-col bg-white dark:bg-gray-900 overflow-hidden"
        style={{ fontFamily: "'Nunito', sans-serif", touchAction: 'pan-y', height: '100%' }}
      >
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px' }}
        >
          <button onClick={onCancel} className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300"><ArrowLeft size={18} /></button>
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{cita ? "Editar cita" : "Nueva cita"}</h2>
        </div>

        <div
          className="flex-1 min-h-0 overflow-y-auto px-5"
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-y', overflowX: 'hidden' }}
        >
          <div className="py-4 space-y-4 overflow-x-hidden">

            <div>
              <label className={lbl}>Tipo de cita</label>
              <select value={tipo} onChange={e => setTipo(e.target.value)} className={cls}>
                {TIPOS_CITA.map(t => <option key={t.id} value={t.id}>{t.emoji}  {t.label}</option>)}
              </select>
            </div>

            <div>
              <label className={lbl}>¿Para qué es? <span className="font-normal text-gray-400">(opcional)</span></label>
              <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Ej: Revisión de la presión" maxLength={80} className={cls} />
            </div>

            <MedicoCombobox
              medicos={medicos}
              nombre={medico.nombre}
              medicoId={medico.medicoId}
              especialidad={medico.especialidad}
              onChange={setMedico}
              cls={cls}
              lbl={lbl}
            />

            <div>
              <label className={lbl}>Fecha <span className="text-red-500">*</span></label>
              <input value={fecha} onChange={e => { setFecha(e.target.value); setError(null); }} type="date" required
                className={`${cls} ${!fecha ? "border-red-300 dark:border-red-500" : ""}`} />
            </div>

            <div>
              <label className={lbl}>Hora</label>
              <div className="grid grid-cols-2 gap-2 mb-2">
                <button type="button" onClick={() => setSinHora(false)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${!sinHora ? "bg-violet-500 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                  A una hora
                </button>
                <button type="button" onClick={() => setSinHora(true)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${sinHora ? "bg-violet-500 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                  Sin hora fija
                </button>
              </div>
              {!sinHora
                ? <input value={hora} onChange={e => setHora(e.target.value)} type="time" className={cls} />
                : <p className="text-[11px] text-gray-400">Se recordará ese día por la mañana.</p>}
            </div>

            <div>
              <label className={lbl}>Lugar <span className="font-normal text-gray-400">(opcional)</span></label>
              <input value={lugar} onChange={e => setLugar(e.target.value)} placeholder="Ej: Hospital Ángeles, consultorio 302" maxLength={120} className={cls} />
            </div>

            <div>
              <label className={lbl}>Avisarme</label>
              <div className="grid grid-cols-2 gap-2">
                {AVISOS.map(a => (
                  <button key={String(a.horas)} type="button" onClick={() => setAviso(a.horas)}
                    className={`py-2.5 rounded-xl text-xs font-bold transition-all ${aviso === a.horas ? "bg-violet-500 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                    {a.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className={lbl}>Notas <span className="font-normal text-gray-400">(opcional)</span></label>
              <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={3}
                placeholder="Ej: llevar estudios previos, acudir en ayunas" maxLength={300}
                className={`${cls} resize-none`} />
            </div>

          </div>
        </div>

        <div
          className="flex-shrink-0 px-5 pt-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {error && (
            <div className="text-xs font-medium text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-xl mb-2">{error}</div>
          )}
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} disabled={guardando} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200 dark:shadow-none disabled:opacity-60">{guardando ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </div>
    </>
  );
}
