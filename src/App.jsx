import { useState, useEffect, useCallback, useRef } from "react";
import { LocalNotifications } from '@capacitor/local-notifications';
import { WifiOff } from 'lucide-react';
import { SUBSCRIPTIONS_ENABLED } from "./lib/config";
import { getDaysInMonth, fmtDate } from "./domain/dates";
import { getHoras, getNearestBlock, isPillDueOnDay } from "./domain/schedule";
import { verboPara } from "./domain/medTypes";
import { doseLabel } from "./domain/dosage";
import { safeStorage } from "./lib/storage";
import { supabase } from "./lib/supabase";
import { newPillId, insertPill, readDoseQueue } from "./lib/offlineQueue";
import { notifId, soundFields, cancelDoseNotif, scheduleDoseNotif } from "./lib/notifications";
import PillForm from "./components/PillForm";
import Paywall from "./components/Paywall";
import usePremium from "./hooks/usePremium";
import usePacientes from "./hooks/usePacientes";
import useCriticalAlerts from "./hooks/useCriticalAlerts";
import useOfflineQueues from "./hooks/useOfflineQueues";
import usePills from "./hooks/usePills";
import useNotifScheduling from "./hooks/useNotifScheduling";
import useSession from "./hooks/useSession";
import MedicamentosScreen from "./screens/MedicamentosScreen";
import TabBar, { esTab } from "./components/TabBar";
import BiometricLockScreen from "./screens/BiometricLockScreen";
import LoginScreen from "./screens/LoginScreen";
import SetupScreen from "./screens/SetupScreen";
import SettingsScreen from "./screens/SettingsScreen";
import PacientesScreen from "./screens/PacientesScreen";
import ReportesScreen from "./screens/ReportesScreen";
import HomeScreen from "./screens/HomeScreen";
import CitasScreen from "./screens/CitasScreen";
import CitaForm from "./components/CitaForm";
import useCitas from "./hooks/useCitas";


export default function App() {
  const { criticalAlerts, criticalVolume, cargarPreferencias,
          toggleCriticalAlerts, cambiarVolumenCritico } = useCriticalAlerts();
  const { session, locked, setLocked, covered, setCovered, bioEnabled, setBioEnabled } =
    useSession(cargarPreferencias);
  // Arranca con el último estado premium conocido leído SÍNCRONAMENTE del espejo en localStorage,
  // para que un usuario premium nunca vea un frame del paywall al abrir. Si no hay espejo (primer
  // arranque / reinstalación), cae a false y el gate de "Cargando…" cubre la verificación async.
  const { hasPremium, setHasPremium, premiumChecked, netUnverified, netTick, setNetTick } = usePremium(session);
  const { pacientes, setPacientes, pacienteActivoId, setPacienteActivoId,
          showPacienteSelector, setShowPacienteSelector } = usePacientes(session, netTick);
  const { pills, setPills } = usePills(session, pacienteActivoId, netTick);
  const { notifPermission, setNotifPermission, resumeTick, requestNotifPermission, openNotifSettings } =
    useNotifScheduling({ session, pills, pacientes, pacienteActivoId, criticalAlerts, criticalVolume, netTick });
  // Va DESPUÉS de useNotifScheduling a propósito: recibe su `resumeTick` para reagendar los avisos
  // de citas en los mismos momentos que los de las dosis (vuelta del fondo y reconexión).
  const { citas, medicos, guardarCita, borrarCita } =
    useCitas({ session, pacienteActivoId, pacientes, netTick, resumeTick });
  // `screen` guarda o una PESTAÑA (hoy | calendario | reportes | ajustes) o una pantalla APILADA
  // encima de ellas (pacientes | addmed). Las apiladas ocultan la barra y traen su propio "atrás".
  const [screen, setScreen] = useState("hoy");
  // Las pantallas apiladas se abren desde DISTINTAS pestañas: "Gestionar pacientes" sale tanto del
  // selector del home como de Ajustes. Sin recordar de dónde vino, su "atrás" siempre devolvía al
  // home y sacaba al usuario de Ajustes sin motivo.
  const [volverA, setVolverA] = useState("hoy");
  const abrir = (destino) => { if (esTab(screen)) setVolverA(screen); setScreen(destino); };
  const volver = () => setScreen(volverA);
  // La cita que se está editando (null = alta nueva). Vive aquí y no dentro de CitasScreen porque
  // el formulario es una pantalla APILADA, como el de medicamentos: ocupa todo y oculta la barra.
  const [citaEditando, setCitaEditando] = useState(null);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(fmtDate(today.getFullYear(), today.getMonth(), today.getDate()));
  const [toast, setToast] = useState(null);
  // La vista del home la decide la PESTAÑA. Antes era un interruptor dentro del encabezado, que
  // escondía el calendario detrás de un botón pequeño que mucha gente no llegaba a tocar.
  const view = screen === "calendario" ? "calendar" : "today";
  const [collapsedBlocks, setCollapsedBlocks] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const [groupModal, setGroupModal] = useState(null); // { dateStr, hora } — lista de dosis que coinciden
  const [confirmDose, setConfirmDose] = useState(null); // { pill, scheduledTime, dateStr } → modal de confirmación
  const [confirmLogout, setConfirmLogout] = useState(false); // confirmación antes de cerrar sesión
  const blocksInitRef = useRef(false);
  // Token de secuencia del cargador de historial. Al recuperar la red hay VARIOS loadRecords en
  // vuelo a la vez (uno por la recarga de pastillas, otro al terminar la cola) y sus respuestas
  // pueden llegar desordenadas. Sin esto, la más ANTIGUA llegaba última y pisaba a la buena: la
  // marca hecha sin conexión desaparecía justo al sincronizar.
  const loadSeqRef = useRef(0);
  const swRegRef = useRef(null);

  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  // Arranque de PLATAFORMA (no de sesión: eso vive en useSession). Service worker, tipos de acción
  // de las notificaciones, permiso actual, teclado, y el toque en una notificación.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(reg => { swRegRef.current = reg; });
    }
    if (window.Capacitor?.isNativePlatform()) {
      LocalNotifications.registerActionTypes({ types: [{ id: 'PILL_ACTIONS', actions: [
        { id: 'TOMAR', title: 'Tomar 💊', foreground: true },
        { id: 'POSPONER', title: 'Posponer' },
      ]}] }).catch(() => {});
      LocalNotifications.checkPermissions().then(({ display }) => {
        setNotifPermission(display); // 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
      });
    }

    const kb = window.Capacitor?.Plugins?.Keyboard;
    if (kb) {
      kb.addListener('keyboardWillShow', (info) => {
        document.documentElement.style.setProperty('--keyboard-height', `${info.keyboardHeight}px`);
      });
      kb.addListener('keyboardWillHide', () => {
        document.documentElement.style.setProperty('--keyboard-height', '0px');
      });
    }

    let actionListener;
    if (window.Capacitor?.isNativePlatform()) {
      LocalNotifications.addListener('localNotificationActionPerformed', ({ notification }) => {
        // Cualquier interacción con la notificación (tap normal o acción "Tomar")
        // abre el modal de confirmación de esa dosis. Navegamos al home porque esos modales
        // solo se renderizan en la pantalla principal: si el usuario dejó la app en Ajustes/
        // Reportes/etc., sin volver al home el modal no aparecería.
        const ex = notification.extra || {};
        if (ex.group) { setScreen("hoy"); setGroupModal({ dateStr: ex.dateStr, hora: ex.hora }); } // notif agrupada → lista in-app
        else if (ex.pillId) { setScreen("hoy"); setPendingAction({ pillId: ex.pillId, scheduledTime: ex.scheduledTime, dateStr: ex.dateStr, pacienteId: ex.pacienteId }); }
      }).then(handle => { actionListener = handle; });
    }

    return () => {
      window.Capacitor?.Plugins?.Keyboard?.removeAllListeners();
      actionListener?.remove();
    };
  }, []);

  // Persiste el paciente activo (compartido entre cierres de la app)






  useEffect(() => {
    if (blocksInitRef.current || !pills?.length) return;
    blocksInitRef.current = true;
    const slots = [...new Set(
      pills.filter(p => isPillDueOnDay(p, todayStr))
           .flatMap(p => { const hs = getHoras(p.hora_toma, p.frecuencia); return hs.length ? hs : ["00:00"]; })
    )];
    if (!slots.length) return;
    const nearest = getNearestBlock(slots);
    const initial = {};
    slots.forEach(t => { if (t !== nearest) initial[t] = true; });
    setCollapsedBlocks(initial);
  }, [pills]);


  // Clave de caché del historial: por paciente + mes visible (el historial en memoria es de un mes).
  const recordsCacheKey = () => `records_cache_${pacienteActivoId}_${year}_${month}`;
  // Mantiene el caché del historial al día tras marcar/desmarcar, para que las marcas (incluidas las
  // hechas SIN conexión) se vean también en un arranque en frío offline y al navegar entre meses.
  const cacheRecords = (recordsObj) => { safeStorage.set(recordsCacheKey(), JSON.stringify(recordsObj)); };

  const loadRecords = useCallback(async () => {
    if (!session || !pills?.length) { setLoading(false); return; }
    // GUARD anti-race: al cambiar de paciente, `pacienteActivoId` cambia YA pero `pills` sigue
    // siendo el del paciente anterior hasta que resuelve su loader async. Sin esto, corríamos con
    // el paciente NUEVO y las pastillas VIEJAS: ninguna fila casaba por nombre → built={} → se
    // pintaba todo pendiente Y se cacheaba "{}" (las marcas "desaparecían" al entrar al paciente).
    // Salimos sin tocar nada; el efecto vuelve a dispararse cuando `pills` ya es del activo.
    // (defensivo: si a una pastilla le faltara `paciente_id`, no bloqueamos la carga del historial)
    if (pills.some(p => p.paciente_id && p.paciente_id !== pacienteActivoId)) return;
    const cacheKey = `records_cache_${pacienteActivoId}_${year}_${month}`;
    // CACHÉ-PRIMERO: mostrar el historial cacheado del mes YA (sin spinner si hay). Antes, online se
    // ponía el spinner y se hacía fetch → en 5G la consulta terminaba DESPUÉS del Face ID → el home
    // "refrescaba" (lista → spinner → lista) tras desbloquear. Con esto: caché al instante, y la
    // revalidación en 2º plano solo actualiza si de verdad cambió (re-render invisible).
    const raw = await safeStorage.get(cacheKey);
    let hadCache = false;
    if (raw) { try { setRecords(JSON.parse(raw)); hadCache = true; } catch (_) { /* noop */ } }
    if (!navigator.onLine) { setLoading(false); return; } // offline: nos quedamos con el caché
    if (!hadCache) setLoading(true); // spinner solo si no había nada que mostrar
    const miTurno = ++loadSeqRef.current;
    // La cola se lee DOS veces, y cada lectura responde a un problema distinto:
    //  - ANTES de la consulta, para no PERDER la marca: si la sincronización vacía la cola mientras
    //    nuestra consulta viaja, seguimos teniendo la entrada.
    //  - DESPUÉS, para saber si de verdad sigue pendiente. Con solo la primera lectura, una carga que
    //    arrancó justo antes de sincronizar dejaba la etiqueta "pendiente" pegada aunque la fila ya
    //    estuviera en la BD.
    const colaAntes = await readDoseQueue();
    const firstDay = `${year}-${String(month+1).padStart(2,"0")}-01`;
    const lastDay = `${year}-${String(month+1).padStart(2,"0")}-${String(getDaysInMonth(year, month)).padStart(2,"0")}`;
    const { data, error } = await supabase.from("medicamentos").select("*").eq("user_id", session.user.id).eq("paciente_id", pacienteActivoId).gte("fecha", firstDay).lte("fecha", lastDay).order("fecha").order("hora_programada");
    if (error) { console.error("Error cargando registros:", error); setLoading(false); return; }
    const built = {};
    (data || []).forEach(row => {
      const fecha = String(row.fecha).slice(0, 10);
      const pill = pills.find(p => p.nombre === row.nombre) || pills.find(p => p.id === row.nombre);
      if (!pill) return;
      if (!built[fecha]) built[fecha] = {};
      // slice(0,5): la BD puede devolver "08:00:00" y la clave de la vista usa "08:00". Sin recortar,
      // la marca queda bajo una clave que nadie consulta y se ve como si no existiera. Mismo criterio
      // que en la cola offline y en GroupDoseModal.
      const scheduled = String(row.hora_programada || pill.hora_toma || "00:00").slice(0, 5);
      built[fecha][`${pill.id}_${scheduled}`] = { time: row.hora, dbId: row.id, tomado: row.tomado };
    });

    // Reponer lo que AÚN NO HA SUBIDO. Sin esto se perdían marcas hechas sin conexión: al recuperar
    // la red, el evento "online" dispara a la vez la sincronización de la cola y una recarga de
    // pastillas — y esa recarga hace correr este cargador, que reconstruía el historial desde la BD
    // (donde la marca todavía no está) y la borraba de la pantalla. Era una carrera: unas veces se
    // recuperaba al terminar la cola y otras no. Superponiendo la cola, el orden deja de importar.
    // Es el mismo patrón que usePills, al que sí se le había puesto y a este se le olvidó.
    const colaAhora = await readDoseQueue();
    for (const [k, op] of Object.entries(colaAntes)) {
      if (op.paciente_id !== pacienteActivoId) continue;
      const pill = pills.find(p => p.nombre === op.nombre);
      if (!pill) continue;
      const clave = `${pill.id}_${op.scheduledTime}`;
      if (!built[op.dayStr]) built[op.dayStr] = {};
      const sigueEnCola = !!colaAhora[k];
      if (op.deleted) { if (sigueEnCola) delete built[op.dayStr][clave]; continue; }
      if (sigueEnCola) {
        built[op.dayStr][clave] = { time: op.hora, tomado: op.tomado, pending: true };
      } else if (!built[op.dayStr][clave]) {
        // Se sincronizó mientras viajaba nuestra consulta: la marca es buena y YA NO está
        // pendiente, solo que nuestro snapshot de la BD es anterior al insert. Sin `pending`.
        built[op.dayStr][clave] = { time: op.hora, tomado: op.tomado };
      }
    }
    // Si mientras viajaba nuestra consulta arrancó otra carga, la nuestra está OBSOLETA: aplicarla
    // pisaría datos más frescos. Se descarta sin tocar ni la vista ni el caché.
    if (miTurno !== loadSeqRef.current) return;
    const builtStr = JSON.stringify(built);
    // Cinturón y tirantes: si la BD devolvió filas y NINGUNA casó con las pastillas en memoria, algo
    // está desalineado — no pisamos la vista ni envenenamos el caché con un objeto vacío.
    if ((data || []).length && !Object.keys(built).length) { setLoading(false); return; }
    if (builtStr !== raw) setRecords(built); // solo actualiza si cambió vs el caché → no parpadea el home tras el unlock
    safeStorage.set(cacheKey, builtStr); // caché para ver el historial sin conexión
    setLoading(false);
  }, [year, month, session, pills, pacienteActivoId]);


 useEffect(() => { if (session && pills?.length && pacienteActivoId) loadRecords(); }, [loadRecords, session, pills, pacienteActivoId]);

  useEffect(() => {
    if (!pendingAction || !session) return;
    // Si la dosis es de otro paciente, lo activamos primero: así las pastillas se
    // recargan para ese paciente y el registro cae en el paciente correcto.
    if (pendingAction.pacienteId && pendingAction.pacienteId !== pacienteActivoId) {
      setPacienteActivoId(pendingAction.pacienteId);
      return; // esperamos a que recarguen las `pills` del nuevo paciente
    }
    if (!pills?.length) return;
    const pill = pills.find(p => p.id === pendingAction.pillId);
    if (pill) {
      // Al tocar la notificación abrimos el modal de confirmación (no marcamos directo).
      setConfirmDose({ pill, scheduledTime: pendingAction.scheduledTime, dateStr: pendingAction.dateStr });
      setPendingAction(null);
    }
  }, [pendingAction, pills, session, pacienteActivoId, setPacienteActivoId]);
 useEffect(() => {
    if (!pills?.length) return;
    if (window.Capacitor?.isNativePlatform()) return;
    const check = () => {
      const now = new Date();
      const hhmm = `${String(now.getHours()).padStart(2,"0")}:${String(now.getMinutes()).padStart(2,"0")}`;
      pills.forEach(pill => {
        const horas = getHoras(pill.hora_toma, pill.frecuencia);
        if (horas.includes(hhmm)) {
          const todayKey = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
          const taken = horas.some(h => records[todayKey]?.[`${pill.id}_${h}`]);
          if (!taken && Notification.permission === "granted") {
            const notifOptions = {
              body: `Es hora de ${verboPara(pill)} ${pill.emoji} ${pill.nombre}${doseLabel(pill, scheduledTime) ? ` (${doseLabel(pill, scheduledTime)})` : ""}`,
              icon: "/icon-192.png",
              badge: "/icon-192.png",
              tag: `pill-${pill.id}`
            };
            if (swRegRef.current) {
              swRegRef.current.showNotification("💊 Mi Pastillero", notifOptions);
            } else {
              new Notification("💊 Mi Pastillero", notifOptions);
            }
          }
        }
      });
    };
    const interval = setInterval(check, 60000);
    return () => clearInterval(interval);
  }, [pills, records]);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2200); };

  // Va DESPUÉS de loadRecords y showToast a propósito: son `const`, así que llamarlo antes las
  // dejaría en zona muerta temporal y reventaría al arrancar — sin que el build dijera nada.
  const { enqueueDose, removeQueuedDose, flushOfflineQueue } = useOfflineQueues({
    session, loadRecords, resumeTick, showToast, setPills,
  });

  // Alta de un medicamento nuevo desde el botón del home (screen "addmed"). Reusa el mismo
  // insert que Ajustes; guarda para el paciente activo, actualiza la lista + el caché y vuelve al home.
  const addPillFromHome = async (data) => {
    // OPTIMISTA: el id lo genera el teléfono, así el medicamento aparece YA y la pantalla no
    // espera a la red (con red mala esa espera llegaba a 10 s y a veces se perdía lo escrito).
    const saved = { ...data, id: newPillId(), user_id: session.user.id, paciente_id: pacienteActivoId, orden: pills.length };
    const nl = [...pills, { ...saved, _pending: true }];
    setPills(nl);
    safeStorage.set(`pills_cache_${pacienteActivoId}`, JSON.stringify(nl)); // mantener el caché al día
    setScreen("hoy");
    showToast(`${saved.emoji || "💊"} ${saved.nombre} agregado`);
    // Sube en segundo plano; si falla queda en la cola y se reintenta al reconectar.
    const res = await insertPill(saved);
    setPills(prev => {
      if (!prev?.some(p => p.id === saved.id)) return prev; // cambió de paciente mientras subía
      // Rechazada: el servidor no la quiere, así que la quitamos en vez de dejar un medicamento
      // fantasma que nunca va a existir.
      const next = res === "rechazada"
        ? prev.filter(p => p.id !== saved.id)
        : prev.map(p => (p.id === saved.id ? { ...p, _pending: res !== "ok" } : p));
      safeStorage.set(`pills_cache_${saved.paciente_id}`, JSON.stringify(next));
      return next;
    });
    if (res === "encolada") showToast("Guardado ✓ Se subirá cuando haya conexión");
    if (res === "rechazada") showToast("No se pudo guardar el medicamento. Inténtalo de nuevo.");
  };

  // Registra una dosis como tomada (tomado=true) o no tomada (tomado=false).
  // customHora: "HH:MM" opcional (hora real de la toma); si falta, usa la hora actual.
  const recordDose = async (dayStr, pill, scheduledTime, tomado, customHora) => {
    if (new Date(dayStr) > today) { showToast("No puedes marcar días futuros"); return; }
    const key = `${pill.id}_${scheduledTime}`;
    const dayData = records[dayStr] || {};
    const existing = dayData[key];
    let hora;
    if (customHora) {
      const [h, m] = customHora.split(":").map(Number);
      const dt = new Date(); dt.setHours(h, m, 0, 0);
      hora = dt.toLocaleTimeString("es-ES");
    } else {
      hora = new Date().toLocaleTimeString("es-ES");
    }
    // OPTIMISTA: pintamos la marca YA, sin esperar la red, para que la confirmación sea
    // instantánea. Antes el camino ONLINE hacía await a Supabase ANTES de pintar → en 4G/5G la
    // tarjeta se veía sin marcar 1-3s (peor al venir de la notificación, con la red reconectando).
    // Conservamos el dbId si ya existía (es un update). La BD reconcilia después (o se encola).
    const optimisticNext = { ...records, [dayStr]: { ...dayData, [key]: { ...(existing || {}), time: hora, tomado } } };
    setRecords(optimisticNext);
    cacheRecords(optimisticNext);
    // Si la dosis es de hoy, deja su bloque expandido para que se vea la confirmación en la tarjeta.
    if (dayStr === todayStr) setCollapsedBlocks(prev => ({ ...prev, [scheduledTime]: false }));
    // Dosis resuelta (tomada u omitida): cancelar la notif local para que no suene.
    await cancelDoseNotif(pill, dayStr, scheduledTime);

    // Sincronizar con la BD (o encolar si no hay red / la escritura falla).
    const online = navigator.onLine;
    let saved = null, failed = !online;
    if (online) {
      if (existing?.dbId) {
        const { error } = await supabase.from("medicamentos").update({ tomado, hora }).eq("id", existing.dbId);
        if (error) failed = true; else saved = { ...existing, time: hora, tomado };
      } else {
        const { data, error } = await supabase.from("medicamentos").insert({ nombre: pill.nombre, fecha: dayStr, tomado, hora, hora_programada: scheduledTime, user_id: session.user.id, paciente_id: pacienteActivoId }).select().single();
        if (error || !data) failed = true; else saved = { time: data.hora, dbId: data.id, tomado };
      }
    }
    // Reconciliar esa dosis: dbId real si guardó; marca "pending" (encolada) si falló/offline.
    if (failed) enqueueDose({ paciente_id: pacienteActivoId, nombre: pill.nombre, dayStr, scheduledTime, tomado, hora, deleted: false });
    else removeQueuedDose(pacienteActivoId, pill.nombre, dayStr, scheduledTime); // por si estaba encolada
    const resolved = failed ? { time: hora, tomado, pending: true } : saved;
    const reconciledNext = { ...optimisticNext, [dayStr]: { ...optimisticNext[dayStr], [key]: resolved } };
    setRecords(reconciledNext);
    cacheRecords(reconciledNext);
    showToast(failed
      ? "Guardado ✓ Se subirá cuando haya conexión"
      : (tomado ? `${pill.emoji} ${pill.nombre} registrada` : `${pill.nombre} marcada como no tomada`));
    if (!failed) flushOfflineQueue(); // online → intenta drenar lo que hubiera pendiente
  };

  // Borra el registro de una dosis (deshacer). Reprograma la notif si su hora no ha pasado.
  const clearDose = async (dayStr, pill, scheduledTime) => {
    const key = `${pill.id}_${scheduledTime}`;
    const dayData = records[dayStr] || {};
    const rec = dayData[key];
    if (!rec) return;
    if (rec.dbId) {
      // Ya estaba en la BD: intentar borrar; si no hay red (o falla), encolar el borrado.
      let ok = false;
      if (navigator.onLine) { const { error } = await supabase.from("medicamentos").delete().eq("id", rec.dbId); ok = !error; }
      if (!ok) enqueueDose({ paciente_id: pacienteActivoId, nombre: pill.nombre, dayStr, scheduledTime, deleted: true });
    } else {
      // Nunca se sincronizó (se marcó offline): basta quitar la operación encolada.
      removeQueuedDose(pacienteActivoId, pill.nombre, dayStr, scheduledTime);
    }
    const updated = { ...records };
    const { [key]: _, ...rest } = dayData;
    if (Object.keys(rest).length === 0) delete updated[dayStr];
    else updated[dayStr] = rest;
    setRecords(updated);
    cacheRecords(updated); // mantener el caché al día tras deshacer
    await scheduleDoseNotif(pill, dayStr, scheduledTime);
    showToast("Registro eliminado");
    if (navigator.onLine) flushOfflineQueue();
  };

  // Pospone el recordatorio de una dosis N minutos (solo iOS nativo reprograma notif).
  const snoozeDose = async (pill, scheduledTime, minutes) => {
    if (window.Capacitor?.isNativePlatform()) {
      try {
        const at = new Date(Date.now() + minutes * 60000);
        await LocalNotifications.schedule({ notifications: [{
          id: notifId(pill.id, 'snooze', scheduledTime), // id estable por dosis: re-posponer reemplaza, no acumula
          title: '💊 Mi Pastillero',
          body: `Recordatorio: ${pill.emoji} ${pill.nombre}${doseLabel(pill, scheduledTime) ? ` (${doseLabel(pill, scheduledTime)})` : ''}`,
          schedule: { at },
          ...soundFields(pill.sonido),
          actionTypeId: 'PILL_ACTIONS',
          extra: { pillId: pill.id, scheduledTime, dateStr: fmtDate(at.getFullYear(), at.getMonth(), at.getDate()), doseKey: `${pill.id}_${scheduledTime}`, pacienteId: pill.paciente_id, snooze: true },
        }]});
      } catch (_) { /* noop */ }
    }
    showToast(`Te recordaremos en ${minutes} min`);
  };

  const markBlockDoses = async (scheduledTime) => {
    const now = new Date();
    const dayStr = fmtDate(now.getFullYear(), now.getMonth(), now.getDate());
    if (new Date(dayStr) > today) { showToast("No puedes marcar días futuros"); return; }
    const dayData = records[dayStr] || {};
    const duePills = pills?.filter(p => isPillDueOnDay(p, dayStr)) || [];
    const pending = duePills.flatMap(p => {
      const hs = getHoras(p.hora_toma, p.frecuencia);
      return (hs.length ? hs : ["00:00"]).filter(h => h === scheduledTime).map(h => ({ pill: p, key: `${p.id}_${h}` }));
    }).filter(d => !dayData[d.key]);
    if (pending.length === 0) return;
    const hora = now.toLocaleTimeString("es-ES");

    // OPTIMISTA: marcar TODAS las dosis del bloque YA (sin esperar la red) para confirmación
    // instantánea. La BD reconcilia los dbId después (o se encolan si no hay red / falla).
    const optimisticDay = { ...dayData };
    for (const d of pending) optimisticDay[`${d.pill.id}_${scheduledTime}`] = { time: hora, tomado: true };
    const optimisticNext = { ...records, [dayStr]: optimisticDay };
    setRecords(optimisticNext);
    cacheRecords(optimisticNext);
    // Deja el bloque expandido para que se vean las confirmaciones "Tomada" por pastilla.
    setCollapsedBlocks(prev => ({ ...prev, [scheduledTime]: false }));
    // Cancelar notifs del bloque recién registrado (offline u online la dosis queda guardada).
    for (const d of pending) await cancelDoseNotif(d.pill, dayStr, scheduledTime);

    const online = navigator.onLine;
    let rows = null, failed = !online;
    if (online) {
      const { data, error } = await supabase.from("medicamentos").insert(pending.map(d => ({ nombre: d.pill.nombre, fecha: dayStr, tomado: true, hora, hora_programada: scheduledTime, user_id: session.user.id, paciente_id: pacienteActivoId }))).select();
      if (error || !data) failed = true; else rows = data;
    }
    // Reconciliar: dbId real si guardó; "pending" (encolada) si falló/offline.
    const resolvedDay = { ...optimisticNext[dayStr] };
    if (failed) {
      for (const d of pending) {
        enqueueDose({ paciente_id: pacienteActivoId, nombre: d.pill.nombre, dayStr, scheduledTime, tomado: true, hora, deleted: false });
        resolvedDay[`${d.pill.id}_${scheduledTime}`] = { time: hora, tomado: true, pending: true };
      }
    } else {
      rows.forEach(row => {
        const pill = pills.find(p => p.nombre === row.nombre);
        if (pill) resolvedDay[`${pill.id}_${scheduledTime}`] = { time: row.hora, dbId: row.id, tomado: true };
      });
    }
    const reconciledNext = { ...optimisticNext, [dayStr]: resolvedDay };
    setRecords(reconciledNext);
    cacheRecords(reconciledNext);
    showToast(failed ? "Guardado ✓ Se subirá cuando haya conexión" : `💊 ${scheduledTime} — todas registradas`);
    if (!failed) flushOfflineQueue();
  };

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(todayStr); };


  // ── El velo de privacidad va ENCIMA, no en lugar del contenido ───────────────────────
  // Antes esto era un `if (covered) return <velo/>`, y eso DESMONTABA el árbol entero cada vez que
  // la app pasaba a segundo plano. Consecuencia real, reportada en device: bastaba cambiar un
  // momento a otra app para que un formulario a medio llenar se perdiera — sin haber cerrado nada.
  // Afectaba a los tres formularios (medicamento, paciente y cita), a todo el que tenga Face ID.
  // Como capa encima el snapshot del multitareas sigue tapado, pero el estado sobrevive.
  const velo = covered ? (
    <div
      aria-hidden="true"
      className="fixed inset-0 z-[100] bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center"
    >
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-violet-200 dark:shadow-none">💊</div>
    </div>
  ) : null;

  const contenido = () => {
  if (session === undefined) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (!session) return <LoginScreen />;
  if (locked) return <BiometricLockScreen onUnlock={() => { setLocked(false); setCovered(false); }} onUsePassword={() => { supabase.auth.signOut(); setLocked(false); setCovered(false); }} />;
  // Candado de suscripción (solo si SUBSCRIPTIONS_ENABLED). Mientras esté apagado, nada de esto corre.
  if (SUBSCRIPTIONS_ENABLED && session && !premiumChecked && !hasPremium) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  // Offline y sin poder verificar la suscripción: pantalla honesta de "Sin conexión" en vez del
  // paywall roto ("Los planes no están disponibles"). Se recupera sola al reconectar (netTick).
  if (SUBSCRIPTIONS_ENABLED && session && !hasPremium && netUnverified && window.Capacitor?.isNativePlatform())
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-gray-50 dark:bg-gray-900">
        <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center"><WifiOff size={28} className="text-gray-400" /></div>
        <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Sin conexión</h2>
        <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">Necesitamos internet para verificar tu suscripción. Conéctate y vuelve a intentarlo.</p>
        <button onClick={() => setNetTick(t => t + 1)} className="mt-2 px-6 py-3 rounded-2xl bg-violet-500 text-white text-sm font-bold active:scale-95 transition-all">Reintentar</button>
      </div>
    );
  if (SUBSCRIPTIONS_ENABLED && session && !hasPremium && window.Capacitor?.isNativePlatform()) return <Paywall onPurchased={() => setHasPremium(true)} />;
  if (pills === null || !pacienteActivoId) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  // ── Pantallas APILADAS: se abren encima de una pestaña y vuelven a ella ──────────────
  if (screen === "pacientes") return <PacientesScreen session={session} pacientes={pacientes} pacienteActivoId={pacienteActivoId} onChange={(lista) => { setPacientes(lista); if (!lista.find(p => p.id === pacienteActivoId)) setPacienteActivoId(lista[0]?.id); }} onBack={volver} />;
  if (screen === "medicamentos") return <MedicamentosScreen session={session} pacienteId={pacienteActivoId} pills={pills} onUpdate={(nl) => { setPills(nl); safeStorage.set(`pills_cache_${pacienteActivoId}`, JSON.stringify(nl)); }} onBack={volver} />;
  if (screen === "addmed") return <PillForm title="Nuevo medicamento" onSave={addPillFromHome} onCancel={volver} />;
  // El formulario devuelve el resultado a CitaForm: si falla, él NO se cierra y conserva lo escrito.
  if (screen === "cita") return <CitaForm cita={citaEditando} medicos={medicos}
    onSave={async (datos) => {
      const res = await guardarCita(datos, citaEditando);
      if (res.ok) { showToast(citaEditando ? "Cita actualizada ✓" : "Cita guardada ✓"); setCitaEditando(null); setScreen("citas"); }
      return res;
    }}
    onCancel={() => { setCitaEditando(null); setScreen("citas"); }} />;
  // Sin medicamentos no hay nada que enseñar en las pestañas: primero se da de alta uno.
  // "citas" queda fuera del gate: una cita se puede anotar sin tener ningún medicamento dado de alta.
  if (pills.length === 0 && !["ajustes", "citas"].includes(screen)) return <SetupScreen session={session} pacienteId={pacienteActivoId} pacientes={pacientes} onDone={(p) => { setPills(p); setScreen("hoy"); }} onCancel={() => { const otro = pacientes.find(p => p.id !== pacienteActivoId) || pacientes[0]; if (otro) setPacienteActivoId(otro.id); setScreen("hoy"); }} />;

  // ── PESTAÑAS ─────────────────────────────────────────────────────────────────────────
  // Todas comparten la barra inferior y dejan hueco abajo para no quedar tapadas por ella.
  const conTabs = (contenido) => (
    <>
      <div style={{ paddingBottom: "calc(74px + env(safe-area-inset-bottom, 0px))" }}>{contenido}</div>
      <TabBar activa={screen} onCambiar={setScreen} />
    </>
  );

  if (screen === "citas") return conTabs(
    <CitasScreen
      citas={citas} medicos={medicos} paciente={pacientes.find(p => p.id === pacienteActivoId)}
      onNueva={() => { setCitaEditando(null); abrir("cita"); }}
      onEditar={(c) => { setCitaEditando(c); abrir("cita"); }}
      onBorrar={async (c) => {
        if (!confirm("¿Eliminar esta cita?")) return;
        const res = await borrarCita(c);
        showToast(res.ok ? "Cita eliminada" : "No se pudo eliminar");
      }}
      onBack={null} />
  );
  if (screen === "reportes") return conTabs(
    <ReportesScreen session={session} paciente={pacientes.find(p => p.id === pacienteActivoId)} pills={pills} onBack={null} />
  );
  if (screen === "ajustes") return conTabs(
    <SettingsScreen session={session} pills={pills} onBack={null} onMisMedicamentos={() => abrir("medicamentos")} onManagePacientes={() => abrir("pacientes")} onReportes={() => setScreen("reportes")} criticalAlerts={criticalAlerts} onToggleCriticalAlerts={toggleCriticalAlerts} criticalVolume={criticalVolume} onChangeCriticalVolume={cambiarVolumenCritico} bioEnabled={bioEnabled} onDisableBio={async () => { localStorage.removeItem("bio_cred_id"); await safeStorage.remove("bio_enabled"); setBioEnabled(false); showToast("Face ID desactivado"); }} />
  );

  return conTabs(
    <HomeScreen
      session={session} bioEnabled={bioEnabled} pacientes={pacientes}
      pacienteActivoId={pacienteActivoId} showPacienteSelector={showPacienteSelector}
      pills={pills} screen={screen} year={year} month={month} records={records}
      loading={loading} selectedDay={selectedDay} toast={toast} view={view}
      collapsedBlocks={collapsedBlocks} groupModal={groupModal} confirmDose={confirmDose}
      confirmLogout={confirmLogout} notifPermission={notifPermission}
      setBioEnabled={setBioEnabled} setShowPacienteSelector={setShowPacienteSelector}
      setScreen={setScreen} setRecords={setRecords} setSelectedDay={setSelectedDay}
      abrir={abrir}
      setCollapsedBlocks={setCollapsedBlocks} setGroupModal={setGroupModal}
      setConfirmDose={setConfirmDose} setConfirmLogout={setConfirmLogout}
      requestNotifPermission={requestNotifPermission} openNotifSettings={openNotifSettings}
      setPacienteActivoId={setPacienteActivoId} cacheRecords={cacheRecords}
      loadRecords={loadRecords} showToast={showToast} recordDose={recordDose}
      clearDose={clearDose} snoozeDose={snoozeDose} markBlockDoses={markBlockDoses}
      prevMonth={prevMonth} nextMonth={nextMonth} goToday={goToday}
    />
  );
  };

  return <>{contenido()}{velo}</>;
}
