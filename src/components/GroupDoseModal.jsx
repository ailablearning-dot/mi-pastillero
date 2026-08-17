import { useState, useEffect } from "react";
import { X } from 'lucide-react';
import { LocalNotifications } from '@capacitor/local-notifications';
import { getColor } from "../domain/catalogs";
import { fmt12h, fmtDate } from "../domain/dates";
import { getHoras, isPillDueOnDay } from "../domain/schedule";
import { safeStorage } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { notifId, soundFields } from "../lib/notifications";

export default function GroupDoseModal({ session, dateStr, hora, pacientes, onClose, onMarked, showToast }) {
  const [doses, setDoses] = useState(null);         // [{ key, pill, pacienteNombre }]
  const [status, setStatus] = useState({});         // key -> true | false | 'snoozed'
  const [snoozeFor, setSnoozeFor] = useState(null); // key en modo "posponer"
  const pacById = Object.fromEntries((pacientes || []).map(p => [p.id, p]));

  useEffect(() => {
    (async () => {
      // Arma la lista de dosis de ESTE horario a partir de una lista de pastillas.
      const buildList = (allPills) => (allPills || [])
        .filter(p => isPillDueOnDay(p, dateStr) && getHoras(p.hora_toma, p.frecuencia).includes(hora))
        .map(p => ({ key: `${p.id}_${hora}`, pill: p, pacienteNombre: pacById[p.paciente_id]?.nombre || "" }));

      // CACHÉ-PRIMERO: mostrar la lista YA desde las cachés de pastillas por paciente, sin esperar la
      // red (antes el modal tardaba 1-2s en 5G porque hacía 2 consultas antes de mostrar nada). El
      // estado "tomada/no tomada" se rellena abajo con la revalidación (o queda pendiente si no hay red).
      const cachedPills = [];
      for (const p of (pacientes || [])) {
        try { const raw = await safeStorage.get(`pills_cache_${p.id}`); if (raw) cachedPills.push(...JSON.parse(raw)); } catch (_) { /* noop */ }
      }
      if (cachedPills.length) setDoses(buildList(cachedPills));

      // Revalidar contra la BD (pastillas frescas + registros del día) y actualizar lista + estado.
      const [pillsRes, recsRes] = await Promise.all([
        supabase.from("pastillas").select("*").eq("user_id", session.user.id).order("orden"),
        supabase.from("medicamentos").select("id,nombre,tomado,paciente_id,hora_programada").eq("user_id", session.user.id).eq("fecha", dateStr),
      ]);
      const allPills = pillsRes.data || cachedPills;
      const recs = recsRes.data;
      const st = {};
      const list = buildList(allPills).map(d => {
        const rec = (recs || []).find(r => r.paciente_id === d.pill.paciente_id && r.nombre === d.pill.nombre && String(r.hora_programada).slice(0, 5) === hora);
        if (rec) st[d.key] = rec.tomado;
        return d;
      });
      setDoses(list);
      setStatus(st);
    })();
  }, []);

  const marcar = async (dose, tomado) => {
    const horaReal = new Date().toLocaleTimeString("es-ES");
    const { data: recs } = await supabase.from("medicamentos").select("id")
      .eq("user_id", session.user.id).eq("fecha", dateStr)
      .eq("paciente_id", dose.pill.paciente_id).eq("nombre", dose.pill.nombre).eq("hora_programada", hora);
    const existing = recs?.[0];
    let err = null;
    if (existing?.id) {
      const { error } = await supabase.from("medicamentos").update({ tomado, hora: horaReal }).eq("id", existing.id);
      err = error;
    } else {
      const { error } = await supabase.from("medicamentos").insert({ nombre: dose.pill.nombre, fecha: dateStr, tomado, hora: horaReal, hora_programada: hora, user_id: session.user.id, paciente_id: dose.pill.paciente_id });
      err = error;
    }
    if (err) { showToast?.("No se pudo guardar. Revisa tu conexión e inténtalo de nuevo."); return; } // NO marcar si la BD falló
    if (window.Capacitor?.isNativePlatform()) {
      try { await LocalNotifications.cancel({ notifications: [{ id: notifId(dose.pill.id, 'snooze', hora) }] }); } catch (_) { /* noop */ }
    }
    setStatus(s => ({ ...s, [dose.key]: tomado }));
    // Reflejar en el home al instante (optimista) — el paciente activo lo maneja onMarked; los demás,
    // al cambiar de paciente (loadRecords). Evita depender solo de loadRecords al cerrar.
    onMarked?.({ pacienteId: dose.pill.paciente_id, pillId: dose.pill.id, hora, dateStr, tomado, horaReal });
  };

  const posponer = async (dose, minutes) => {
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const at = new Date(Date.now() + minutes * 60000);
        await LocalNotifications.schedule({ notifications: [{
          id: notifId(dose.pill.id, 'snooze', hora), // id estable por dosis: re-posponer reemplaza, no acumula
          title: '💊 Mi Pastillero',
          body: `Recordatorio: ${dose.pill.emoji} ${dose.pill.nombre}${dose.pill.dosis ? ` (${dose.pill.dosis})` : ''}`,
          schedule: { at },
          ...soundFields(dose.pill.sonido),
          actionTypeId: 'PILL_ACTIONS',
          extra: { pillId: dose.pill.id, scheduledTime: hora, dateStr: fmtDate(at.getFullYear(), at.getMonth(), at.getDate()), doseKey: `${dose.pill.id}_${hora}`, pacienteId: dose.pill.paciente_id, snooze: true },
        }]});
      } catch (_) { /* noop */ }
    }
    setStatus(s => ({ ...s, [dose.key]: 'snoozed' }));
    setSnoozeFor(null);
  };

  const dateLabel = new Date(dateStr + "T12:00:00").toLocaleDateString("es-ES", { day: "numeric", month: "short" });

  // Igual que DoseConfirmModal: el backdrop NO cierra (decisión de medicación desde notificación);
  // solo la X o resolver las dosis. Evita el descarte accidental por un toque fuera de la tarjeta.
  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-5" style={{ animation: "fadeIn .2s ease" }}>
      <div className="w-full max-w-sm bg-white dark:bg-gray-800 rounded-3xl p-5 relative max-h-[80vh] flex flex-col">
        <button onClick={onClose} aria-label="Cerrar" className="absolute -top-3 -left-3 w-9 h-9 rounded-full bg-red-500 text-white flex items-center justify-center shadow-lg active:scale-95"><X size={18} /></button>
        <div className="text-center mb-3">
          <h3 className="text-lg font-bold text-gray-800 dark:text-gray-100">Medicamentos de las {fmt12h(hora)}</h3>
          <p className="text-sm text-gray-400">{dateLabel}</p>
        </div>
        {doses === null ? (
          <p className="text-center text-sm text-gray-400 py-6">Cargando…</p>
        ) : doses.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6">No hay medicamentos para esta hora.</p>
        ) : (
          <div className="overflow-y-auto space-y-3 pr-1">
            {doses.map(dose => {
              const c = getColor(dose.pill.color);
              const st = status[dose.key];
              return (
                <div key={dose.key} className={`rounded-2xl p-3 ${c.bg}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{dose.pill.emoji}</span>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold text-sm ${c.text} truncate`}>{dose.pill.nombre}</p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">{dose.pacienteNombre}{dose.pill.dosis ? ` · ${dose.pill.dosis}` : ""}</p>
                    </div>
                  </div>
                  {st === true ? (
                    <p className="text-xs font-bold text-emerald-600 mt-2 text-center">✓ Tomada</p>
                  ) : st === false ? (
                    <p className="text-xs font-bold text-red-500 mt-2 text-center">No tomada</p>
                  ) : st === 'snoozed' ? (
                    <p className="text-xs font-bold text-violet-500 mt-2 text-center">Pospuesta</p>
                  ) : snoozeFor === dose.key ? (
                    <div className="flex gap-2 mt-2 items-center">
                      {[10, 30, 60].map(min => (
                        <button key={min} onClick={() => posponer(dose, min)} className="flex-1 bg-white/70 dark:bg-gray-700 text-violet-600 dark:text-violet-300 font-bold py-2 rounded-xl text-xs active:scale-[0.98]">{min}m</button>
                      ))}
                      <button onClick={() => setSnoozeFor(null)} aria-label="Cancelar" className="px-2 text-gray-400 text-xs">✕</button>
                    </div>
                  ) : (
                    <div className="flex gap-2 mt-2">
                      <button onClick={() => marcar(dose, true)} className="flex-1 bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-2 rounded-xl text-xs active:scale-[0.98]">Tomada</button>
                      <button onClick={() => setSnoozeFor(dose.key)} className="flex-1 bg-white/70 dark:bg-gray-700 text-violet-600 dark:text-violet-300 font-bold py-2 rounded-xl text-xs active:scale-[0.98]">Posponer</button>
                      <button onClick={() => marcar(dose, false)} className="flex-1 text-red-500 font-bold py-2 rounded-xl text-xs active:scale-[0.98]">No tomada</button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
        <button onClick={onClose} className="w-full mt-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-bold text-sm">Cerrar</button>
      </div>
    </div>
  );
}

// Periodo de gracia del bloqueo biométrico: si vuelves del fondo antes de esto,
// no se re-pide Face ID (evita re-verificar al salir de la app un rato).
