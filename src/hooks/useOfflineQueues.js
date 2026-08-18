// Las dos colas de sincronización offline: el MARCADO de dosis y el ALTA de medicamentos.
//
// Es la parte más delicada de la app y la que más ha costado estabilizar, así que va junta y con
// sus porqués a la vista:
//
//  - Cada operación se guarda por la IDENTIDAD de la dosis (paciente + medicamento + fecha + hora
//    programada), no por orden de llegada: re-marcar la misma dosis sin conexión SOBREESCRIBE la
//    anterior, y gana la última intención del usuario.
//  - Reintentar un alta es idempotente porque el id lo fija el TELÉFONO: un insert repetido choca
//    con la PK (23505) y se da por bueno en vez de duplicar el medicamento.
//  - Solo se descarta lo que nunca va a poder guardarse (datos inválidos de raíz). Red, 5xx o token
//    caducado se quedan en la cola: ante la duda NO se tira algo que el usuario escribió.
//  - El reintento periódico es una red de seguridad, no un lujo: con modo avión + Wi-Fi encendido a
//    mano, iOS no emite el evento "online" y la cola se quedaba esperando indefinidamente aunque sí
//    hubiera conexión real. Reproducido en device.

import { useEffect, useCallback, useRef } from "react";
import { safeStorage } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { OFFLINE_QUEUE_KEY, doseQK, readPillQueue, writePillQueue, esRechazoDefinitivo } from "../lib/offlineQueue";

export default function useOfflineQueues({ session, loadRecords, resumeTick, showToast, setPills }) {
  const offlineQueueRef = useRef({});      // dosis marcadas sin conexión, pendientes de sincronizar
  const flushingRef = useRef(false);       // candado: evita que dos disparadores sincronicen a la vez
  const flushRef = useRef(null);           // apunta al último flushOfflineQueue (para llamarlo al cargar la cola)
  const flushingPillsRef = useRef(false);  // mismo candado para la cola de ALTAS de medicamentos

  // ── Cola offline de marcado de dosis ────────────────────────────────────────────────
  const persistOfflineQueue = () => { safeStorage.set(OFFLINE_QUEUE_KEY, JSON.stringify(offlineQueueRef.current)); };
  // Encola (o reemplaza) la operación de una dosis. entry: {paciente_id, nombre, dayStr, scheduledTime, tomado, hora, deleted}
  const enqueueDose = (entry) => {
    offlineQueueRef.current[doseQK(entry.paciente_id, entry.nombre, entry.dayStr, entry.scheduledTime)] = entry;
    persistOfflineQueue();
  };
  const removeQueuedDose = (pacienteId, nombre, dayStr, hora) => {
    const k = doseQK(pacienteId, nombre, dayStr, hora);
    if (offlineQueueRef.current[k]) { delete offlineQueueRef.current[k]; persistOfflineQueue(); }
  };

  // Sincroniza las dosis encoladas con Supabase. Reconcilia cada una por identidad
  // (user+fecha+paciente+nombre+hora_programada) = MISMO patrón que loadRecords y GroupDoseModal
  // (la tabla `medicamentos` no tiene pill_id). Se corta al primer fallo (sigue sin conexión) y
  // deja el resto en cola. Al terminar, recarga la vista para reconciliar los dbId.
  const flushOfflineQueue = useCallback(async () => {
    if (!session?.user?.id || flushingRef.current) return;
    const q = offlineQueueRef.current;
    const keys = Object.keys(q);
    if (!keys.length) return;
    flushingRef.current = true;
    let changed = false;
    try {
      for (const k of keys) {
        const op = q[k];
        const { data: rows, error: selErr } = await supabase.from("medicamentos").select("id,hora_programada")
          .eq("user_id", session.user.id).eq("fecha", op.dayStr)
          .eq("paciente_id", op.paciente_id).eq("nombre", op.nombre);
        if (selErr) break; // sigue sin conexión → cortar y conservar la cola
        // Emparejar por hora_programada tolerando "HH:MM" vs "HH:MM:SS" (como GroupDoseModal).
        const existing = (rows || []).find(r => String(r.hora_programada).slice(0, 5) === op.scheduledTime);
        if (op.deleted) {
          if (existing?.id) { const { error } = await supabase.from("medicamentos").delete().eq("id", existing.id); if (error) break; }
        } else if (existing?.id) {
          const { error } = await supabase.from("medicamentos").update({ tomado: op.tomado, hora: op.hora }).eq("id", existing.id); if (error) break;
        } else {
          const { error } = await supabase.from("medicamentos").insert({ nombre: op.nombre, fecha: op.dayStr, tomado: op.tomado, hora: op.hora, hora_programada: op.scheduledTime, user_id: session.user.id, paciente_id: op.paciente_id }); if (error) break;
        }
        delete q[k];
        changed = true;
      }
    } finally {
      flushingRef.current = false;
    }
    if (changed) {
      persistOfflineQueue();
      if (Object.keys(offlineQueueRef.current).length === 0) showToast("Cambios sincronizados ✓");
      loadRecords(); // reconciliar dbId de la vista actual con lo recién guardado
    }
  }, [session, loadRecords]);
  useEffect(() => { flushRef.current = flushOfflineQueue; }, [flushOfflineQueue]);

  // Cargar la cola persistida al arrancar e intentar sincronizar de inmediato.
  useEffect(() => {
    (async () => {
      const raw = await safeStorage.get(OFFLINE_QUEUE_KEY);
      if (raw) { try { offlineQueueRef.current = JSON.parse(raw) || {}; } catch (_) { offlineQueueRef.current = {}; } }
      flushRef.current?.(); // si hay pendientes y sesión lista, sincroniza sin esperar otro disparador
    })();
  }, []);

  // Drena la cola de ALTAS de medicamentos. Reintentar es idempotente: el id lo fijó el teléfono,
  // así que un insert repetido choca con la PK (23505) y lo damos por bueno en vez de duplicar.
  const flushPillQueue = useCallback(async () => {
    if (!session?.user?.id || flushingPillsRef.current) return;
    const q = await readPillQueue();
    if (!q.length) return;
    flushingPillsRef.current = true;
    try {
      const quedan = [], subidas = [], rechazadas = [];
      for (const pill of q) {
        try {
          const { error } = await supabase.from("pastillas").insert(pill);
          if (!error || error.code === "23505") subidas.push(pill.id);
          // Solo se descarta si los datos son inválidos de raíz (ver `esRechazoDefinitivo`).
          // Cualquier otro fallo —red, 5xx, token caducado— se queda en la cola y se reintenta.
          else if (esRechazoDefinitivo(error)) { rechazadas.push(pill.id); console.error("Alta rechazada, se descarta de la cola:", error); }
          else quedan.push(pill);
        } catch (_) { quedan.push(pill); } // red
      }
      await writePillQueue(quedan);
      if (subidas.length || rechazadas.length) {
        // Updater funcional: el estado pudo cambiar mientras subíamos. Las subidas pierden la marca
        // de pendiente; las rechazadas se quitan (nunca van a existir). El caché lo reescribe el
        // loader al revalidar.
        setPills(prev => prev
          ?.filter(p => !rechazadas.includes(p.id))
          .map(p => (subidas.includes(p.id) ? { ...p, _pending: false } : p)) ?? prev);
      }
    } finally { flushingPillsRef.current = false; }
  }, [session]);

  // Disparadores de sincronización: al reconectar, al volver del fondo, y al tener sesión lista.
  useEffect(() => {
    const onOnline = () => { flushOfflineQueue(); flushPillQueue(); };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [flushOfflineQueue, flushPillQueue]);
  useEffect(() => { flushOfflineQueue(); flushPillQueue(); }, [resumeTick, flushOfflineQueue, flushPillQueue]);
  useEffect(() => { if (session?.user?.id) { flushOfflineQueue(); flushPillQueue(); } }, [session, flushOfflineQueue, flushPillQueue]);
  // Red de seguridad: reintento periódico mientras haya altas pendientes. Los eventos del sistema
  // no siempre llegan — con modo avión + Wi-Fi encendido a mano, iOS no emite "online" y la cola se
  // quedaba esperando indefinidamente aunque hubiera conexión real (reportado en device).
  useEffect(() => {
    if (!session?.user?.id) return;
    const id = setInterval(async () => { if ((await readPillQueue()).length) flushPillQueue(); }, 30000);
    return () => clearInterval(id);
  }, [session, flushPillQueue]);

  return { enqueueDose, removeQueuedDose, flushOfflineQueue };
}
