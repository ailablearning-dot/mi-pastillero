// Permiso de notificaciones y programación de los recordatorios.
//
// Aquí vive el arreglo del bug más grave que ha tenido la app: el programador leía la lista de
// medicamentos SOLO por red y, sin conexión, concluía "no hay medicamentos" y llamaba a
// scheduleLocalNotifs([]) — que CANCELA todo lo pendiente. Quedarse sin señal borraba los
// recordatorios en silencio y no volvían hasta reabrir la app, cosa que el usuario no hace porque
// justamente espera que ella le avise.
//
// De ahí las tres reglas que gobiernan este archivo:
//  1. Si no se pudo leer, NUNCA se cancela lo ya programado.
//  2. La última lista conocida se cachea para poder agendar en un arranque en frío sin red.
//  3. El paciente activo se toma del estado en memoria, que sí incluye lo creado sin conexión.
//
// `resumeTick` sube al volver del fondo: así "hoy" siempre es el día 0 y la cola pendiente se
// refresca cada vez que el usuario abre la app.

import { useState, useEffect } from "react";
import { LocalNotifications } from '@capacitor/local-notifications';
import { fmtDate } from "../domain/dates";
import { readAllPillsCache, writeAllPillsCache } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { scheduleLocalNotifs } from "../lib/notifications";

export default function useNotifScheduling({ session, pills, pacientes, pacienteActivoId, criticalAlerts, criticalVolume, netTick }) {
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "default"
  );
  const [resumeTick, setResumeTick] = useState(0); // sube al volver del fondo → reprograma

  const requestNotifPermission = async () => {
    if (window.Capacitor?.isNativePlatform()) {
      await LocalNotifications.registerActionTypes({ types: [{ id: 'PILL_ACTIONS', actions: [
        { id: 'TOMAR', title: 'Tomar 💊', foreground: true },
        { id: 'POSPONER', title: 'Posponer' },
      ]}] }).catch(() => {});
      const { display } = await LocalNotifications.requestPermissions();
      setNotifPermission(display);
      // No agendamos aquí solo el paciente activo: el efecto de scheduling reacciona al
      // cambio de `notifPermission` y reprograma TODOS los pacientes (con su sonido).
    } else {
      if (typeof Notification === "undefined") return;
      const result = await Notification.requestPermission();
      setNotifPermission(result);
    }
  };

  // Si el usuario ya denegó las notificaciones, iOS no vuelve a preguntar: hay que
  // mandarlo a los Ajustes de la app para reactivarlas.
  const openNotifSettings = () => {
    if (window.Capacitor?.isNativePlatform()) window.open("app-settings:", "_system");
  };


  // Reprograma las notificaciones al VOLVER del fondo (además del arranque en frío y de
  // editar un medicamento). Así "hoy" siempre queda como día 0 y la cola pendiente se
  // refresca cada vez que el usuario abre la app. Corre siempre en nativo (no depende de
  // Face ID, a diferencia del efecto de arriba).
  useEffect(() => {
    if (!window.Capacitor?.isNativePlatform()) return;
    const onVis = () => { if (!document.hidden) setResumeTick(t => t + 1); };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);

  useEffect(() => {
    if (!session || !window.Capacitor?.isNativePlatform()) return;
    if (notifPermission !== 'granted') return;
    // Las notificaciones se programan para TODOS los pacientes (no solo el activo),
    // si no, al cambiar de paciente los demás dejaban de sonar. `pills` se usa solo
    // como señal de cambio (alta/baja/edición de un medicamento reagenda todo).
    //
    // CACHÉ-PRIMERO, y es la parte importante: antes esto leía la lista SOLO por red y, sin
    // conexión, `allPills` venía vacío → se llamaba a scheduleLocalNotifs([]), que CANCELA
    // todas las pendientes. Es decir: quedarse sin señal BORRABA los recordatorios, y no
    // volvían hasta reabrir la app — el usuario nunca la abre, porque espera que ella le avise.
    // Reglas ahora: (1) si no se pudo leer, NUNCA se cancela lo ya programado; (2) la última
    // lista conocida se guarda en caché para poder agendar en un arranque en frío sin red;
    // (3) el paciente activo se toma del estado en memoria, que sí incluye lo creado offline.
    (async () => {
      const { data: remotas, error: errPills } = await supabase
        .from("pastillas")
        .select("*")
        .eq("user_id", session.user.id)
        .order("orden");
      let base;
      if (!errPills && remotas) { base = remotas; writeAllPillsCache(remotas); }
      else base = await readAllPillsCache();
      const allPills = (pacienteActivoId && pills)
        ? [...base.filter(p => p.paciente_id !== pacienteActivoId), ...pills]
        : base;
      // Sin datos Y sin haber podido leer → no sabemos nada: dejar lo programado en paz.
      if (!allPills.length) { if (!errPills) scheduleLocalNotifs([]); return; }
      // Dosis ya tomadas en los próximos 7 días (de cualquier paciente) para no reprogramarlas.
      const now = new Date();
      const start = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
      const end = new Date(now); end.setDate(end.getDate() + 7);
      const endStr = fmtDate(end.getFullYear(), end.getMonth(), end.getDate());
      // Si esta consulta falla (sin red), `taken` queda vacío y se reagenda alguna dosis ya
      // tomada. Se acepta a propósito: recordar de más molesta, recordar de menos es el riesgo
      // que esta pantalla existe para evitar. Las de hoy ya pasadas se descartan por hora.
      const { data } = await supabase
        .from("medicamentos")
        .select("nombre,fecha,hora_programada,tomado,paciente_id")
        .eq("user_id", session.user.id)
        .eq("tomado", true)
        .gte("fecha", start)
        .lte("fecha", endStr);
      const taken = new Set();
      (data || []).forEach(row => {
        // Emparejar por paciente + nombre (dos pacientes pueden tener el mismo medicamento).
        const pill = allPills.find(p => p.paciente_id === row.paciente_id && p.nombre === row.nombre);
        if (!pill || !row.hora_programada) return;
        const fecha = String(row.fecha).slice(0, 10);
        const hora = String(row.hora_programada).slice(0, 5);
        taken.add(`${pill.id}_${fecha}_${hora}`);
      });
      const pacientesById = Object.fromEntries((pacientes || []).map(p => [p.id, p]));
      scheduleLocalNotifs(allPills, taken, pacientesById);
    })();
    // netTick: al recuperar la red hay que reagendar. Faltaba, y era el segundo agujero: los
    // otros tres efectos sí reintentaban al reconectar, este no — así que tras un rato sin
    // señal los recordatorios seguían borrados hasta el siguiente paso a primer plano.
  }, [pills, notifPermission, session, pacientes, pacienteActivoId, criticalAlerts, criticalVolume, resumeTick, netTick]);

  return { notifPermission, setNotifPermission, resumeTick, requestNotifPermission, openNotifSettings };
}
