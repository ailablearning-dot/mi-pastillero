import { useState, useEffect, useCallback, useRef } from "react";
import { LocalNotifications } from '@capacitor/local-notifications';
import { SUBSCRIPTIONS_ENABLED, MODELO_SIN_MUROS } from "./lib/config";
import { FUNCIONES, MOTIVO, puedeUsar } from "./domain/plan";

// Qué pestaña abre qué puerta del paywall. Los reportes son de pago igual que las citas: el Excel
// de dos hojas es literalmente la función "voy al médico", y el historial completo es la mitad de
// lo que se vende. Lo que SÍ es gratis son los últimos días del historial, que se ven en el
// calendario con su corte explicado — eso es otra pieza.
// Ya solo Citas: Reportes dejó de ser pestaña (se llega desde el historial, y su candado va en esa
// entrada) y el historial en sí es GRATIS —se ve velado a partir de los 7 días, que es la pieza que
// vende sin cerrar la puerta.
const PUERTAS = {
  citas: FUNCIONES.CITAS,
};

// Cuánto pospone el botón "Posponer" de la notificación. Ahí no se puede elegir —es un toque, no
// una pantalla—, así que va el más corto de los tres que ofrece el modal (10/30/60): quien aplaza
// desde la notificación está ocupado un momento, no cancelando la dosis.
const MINUTOS_POSPONER_NOTIF = 10;
import { getDaysInMonth, fmtDate } from "./domain/dates";
import { getHoras, getNearestBlock, isPillDueOnDay } from "./domain/schedule";
import { verboPara } from "./domain/medTypes";
import { doseLabel } from "./domain/dosage";
import { safeStorage, readPospuestas, writePospuestas } from "./lib/storage";
import { posponerHasta, quitarPosposicion, limpiarVencidas } from "./domain/posponer";
import { diasConDosisTomada, diaCerradoBien, tocaPedirResena } from "./domain/resena";
import { yaSePidioResena, pedirResena } from "./lib/resena";
import { supabase } from "./lib/supabase";
import { newPillId, insertPill, readDoseQueue } from "./lib/offlineQueue";
import { notifId, soundFields, cancelDoseNotif, scheduleDoseNotif } from "./lib/notifications";
import PillForm from "./components/PillForm";
import Paywall from "./components/Paywall";
import PantallaSinConexion from "./components/PantallaSinConexion";
import PantallaCargando from "./components/PantallaCargando";
import CrearCuentaScreen from "./screens/CrearCuentaScreen";
import { esAnonimo } from "./domain/sesion";
import usePremium, { marcarCompraLocal } from "./hooks/usePremium";
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
import FichaEmergenciaScreen from "./screens/FichaEmergenciaScreen";
import MiSaludScreen from "./screens/MiSaludScreen";
import ReportesScreen from "./screens/ReportesScreen";
import HomeScreen from "./screens/HomeScreen";
import CitasScreen from "./screens/CitasScreen";
import CitaForm from "./components/CitaForm";
import useCitas from "./hooks/useCitas";


export default function App() {
  const { criticalAlerts, criticalVolume, cargarPreferencias,
          toggleCriticalAlerts, cambiarVolumenCritico } = useCriticalAlerts();
  const { session, locked, setLocked, covered, setCovered, bioEnabled, setBioEnabled,
          anonFallo, sesionNueva, reintentarSesionAnonima } = useSession(cargarPreferencias);
  // Arranca con el último estado premium conocido leído SÍNCRONAMENTE del espejo en localStorage,
  // para que un usuario premium nunca vea un frame del paywall al abrir. Si no hay espejo (primer
  // arranque / reinstalación), cae a false y el gate de "Cargando…" cubre la verificación async.
  const { hasPremium, setHasPremium, premiumChecked, netUnverified, netTick, setNetTick,
          volviendoDePago, pedirCuentaAlVolver, marcarCuentaPedida } = usePremium(session);
  const { pacientes, setPacientes, pacienteActivoId, setPacienteActivoId,
          showPacienteSelector, setShowPacienteSelector } = usePacientes(session, netTick, sesionNueva);
  // La PERSONA activa, no solo su id: la ficha de emergencia necesita sus alergias y su contacto,
  // y quien la pinta no tiene por qué volver a buscarla en la lista.
  const pacienteActivo = (pacientes || []).find(p => p.id === pacienteActivoId) || null;
  const { pills, setPills } = usePills(session, pacienteActivoId, netTick, sesionNueva);
  const { notifPermission, setNotifPermission, resumeTick, requestNotifPermission, openNotifSettings } =
    useNotifScheduling({ session, pills, pacientes, pacienteActivoId, criticalAlerts, criticalVolume, netTick });
  // Va DESPUÉS de useNotifScheduling a propósito: recibe su `resumeTick` para reagendar los avisos
  // de citas en los mismos momentos que los de las dosis (vuelta del fondo y reconexión).
  const { citas, medicos, guardarCita, borrarCita } =
    useCitas({ session, pacienteActivoId, pacientes, netTick, resumeTick });
  // `screen` guarda o una PESTAÑA (hoy | calendario | reportes | ajustes) o una pantalla APILADA
  // encima de ellas (pacientes | addmed). Las apiladas ocultan la barra y traen su propio "atrás".
  const [screen, setScreen] = useState("hoy");
  // Las pantallas apiladas se abren desde DISTINTAS pestañas: "Gestionar personas" sale tanto del
  // selector del home como de Ajustes. Sin recordar de dónde vino, su "atrás" siempre devolvía al
  // home y sacaba al usuario de Ajustes sin motivo.
  const [volverA, setVolverA] = useState("hoy");
  const abrir = (destino) => { if (esTab(screen)) setVolverA(screen); setScreen(destino); };
  const volver = () => setScreen(volverA);
  // El medicamento que hay que abrir YA EDITÁNDOSE al entrar a la lista. Se usa cuando se llega
  // desde "Editar este medicamento" de la hoja de la dosis: la persona ya eligió cuál, y hacerle
  // buscarlo otra vez en la lista sería devolverle el trabajo. null = entrar a la lista normal.
  const [pillEditando, setPillEditando] = useState(null);
  // La cita que se está editando (null = alta nueva). Vive aquí y no dentro de CitasScreen porque
  // el formulario es una pantalla APILADA, como el de medicamentos: ocupa todo y oculta la barra.
  const [citaEditando, setCitaEditando] = useState(null);
  // ¿Enseñar la confirmación del primer alta? Es un SÍ/NO, no un texto.
  //
  // Antes se guardaba la frase ya calculada y se quedaba congelada: si después se agregaba otro
  // medicamento que tocaba antes, el aviso seguía anunciando el de la primera vez. Visto en
  // device — decía "mañana a las 3" habiendo uno a las 10 de la mañana. Ahora HomeScreen la
  // calcula al pintar, sobre los medicamentos que hay en ese momento, así que no puede mentir.
  const [confirmacion, setConfirmacion] = useState(false);
  // Red de seguridad del arranque: si tras un rato razonable seguimos sin paciente activo, se deja
  // de enseñar un "Cargando…" gris mudo y se dice algo. No afirma que haya fallado —puede ser una
  // red muy lenta— pero da una salida en vez de dejar a la persona mirando una pantalla vacía.
  const [arranqueLento, setArranqueLento] = useState(false);
  // Qué función de pago acaba de tocar (null = paywall cerrado). Es la hoja de pago del modelo
  // nuevo: se abre desde cualquiera de las puertas con candado y se puede cerrar para seguir en
  // la parte gratis.
  const [paywall, setPaywall] = useState(null);
  // Tras comprar siendo anónimo hay que ofrecer la cuenta. Si no, "Restaurar compras" en un
  // teléfono nuevo devolvería la suscripción pero NO los datos: el token del teléfono era la
  // única llave. Es opcional —ya pagó, no se le pone un muro— y se puede hacer luego.
  // false | "compra" (tras pagar) | "datos" (desde Ajustes o el aviso del home). Hoy solo se usa
  // como gate truthy: el mensaje de esa pantalla es el mismo venga de donde venga.
  const [pedirCuenta, setPedirCuenta] = useState(false);
  // "Ya tengo cuenta" desde una sesión anónima. Sin esto había un agujero: quien creó su cuenta y
  // reinstala la app entra como anónimo nuevo —porque no hay sesión guardada— y se queda SIN
  // NINGUNA forma de volver a lo suyo. Sus datos existen en la nube pero son inalcanzables.
  const [mostrarLogin, setMostrarLogin] = useState(false);
  // Una sola forma de preguntar "¿esto está cerrado?", para que ninguna puerta se quede abierta
  // por olvido. Con el modelo viejo nunca bloquea: allí el muro duro ya lo cubría todo.
  const bloqueado = (funcion) => MODELO_SIN_MUROS && !puedeUsar(funcion, hasPremium);
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(fmtDate(today.getFullYear(), today.getMonth(), today.getDate()));
  const [toast, setToast] = useState(null);
  // La vista del home la decide la PESTAÑA. Antes era un interruptor dentro del encabezado, que
  // escondía el calendario detrás de un botón pequeño que mucha gente no llegaba a tocar.
  // "historial" es una pantalla APILADA que se abre desde Hoy, no una pestaña. Lo que pinta es la
  // misma vista de mes de siempre; lo que cambió es por dónde se llega.
  const view = screen === "historial" ? "calendar" : "today";
  const [collapsedBlocks, setCollapsedBlocks] = useState({});
  // Dosis pospuestas — solo para la insignia del home, no es historial (ver `domain/posponer.js`).
  const [pospuestas, setPospuestas] = useState({});
  // ¿Ya se pidió la valoración en la App Store? null mientras no se ha leído: con null NO se
  // decide, porque pedirla dos veces gasta un tiro que no se puede medir.
  const [resenaPedida, setResenaPedida] = useState(null);
  // Guarda de esta ejecución: marcar, deshacer y volver a marcar cierra el día dos veces y
  // dispararía dos peticiones. La marca persistente solo protege entre arranques.
  const resenaLanzadaRef = useRef(false);
  const [pendingAction, setPendingAction] = useState(null);
  // Cita que hay que abrir tras tocar su notificación. Es un PENDIENTE y no una navegación
  // directa porque al tocar la notif la lista puede no estar cargada todavía (arranque en frío),
  // y porque la cita puede ser de OTRO paciente: los avisos se agendan para todos.
  const [pendingCita, setPendingCita] = useState(null);
  const [groupModal, setGroupModal] = useState(null); // { dateStr, hora } — lista de dosis que coinciden
  const [confirmDose, setConfirmDose] = useState(null); // { pill, scheduledTime, dateStr } → modal de confirmación
  const blocksInitRef = useRef(false);
  // Token de secuencia del cargador de historial. Al recuperar la red hay VARIOS loadRecords en
  // vuelo a la vez (uno por la recarga de pastillas, otro al terminar la cola) y sus respuestas
  // pueden llegar desordenadas. Sin esto, la más ANTIGUA llegaba última y pisaba a la buena: la
  // marca hecha sin conexión desaparecía justo al sincronizar.
  const loadSeqRef = useRef(0);
  const swRegRef = useRef(null);

  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  // La pantalla de acceso se quita SOLA en cuanto se entra de verdad.
  //
  // Nadie la cerraba salvo el botón de volver: quien iniciaba sesión se quedaba mirándola con la
  // sesión ya cambiada por debajo, convencido de que no había pasado nada. Visto en device el
  // 2026-08-21 con Apple. Es un fallo que ya estaba —"Ya tengo cuenta" en Ajustes tenía el mismo
  // final— y que se destapó al poner esa puerta en la bienvenida, donde sí se usa.
  //
  // La condición es "dejó de ser anónimo": a esta pantalla solo se llega SIENDO anónimo (las tres
  // entradas lo comprueban), así que en cuanto la sesión es permanente es que entró.
  useEffect(() => {
    if (mostrarLogin && session?.user?.id && !esAnonimo(session)) setMostrarLogin(false);
  }, [mostrarLogin, session]);

  useEffect(() => {
    // Solo cuenta cuando ya hay sesión: antes de eso manda el arranque de la sesión, que tiene su
    // propia pantalla. 8 s es más que suficiente para una carga normal y no tanto como para que
    // alguien crea que la app se colgó.
    if (!session || (pills !== null && pacienteActivoId)) { setArranqueLento(false); return; }
    const id = setTimeout(() => setArranqueLento(true), 8000);
    return () => clearTimeout(id);
  }, [session, pills, pacienteActivoId]);

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
      LocalNotifications.addListener('localNotificationActionPerformed', ({ actionId, notification }) => {
        // Cualquier interacción con la notificación (tap normal o acción "Tomar")
        // abre el modal de confirmación de esa dosis. Navegamos al home porque esos modales
        // solo se renderizan en la pantalla principal: si el usuario dejó la app en Ajustes/
        // Reportes/etc., sin volver al home el modal no aparecería.
        //
        // La excepción es "Posponer": la notificación ofrece ese botón desde siempre, pero el
        // `actionId` se ignoraba y acababa abriendo el mismo modal que un toque normal. O sea que
        // prometía un atajo de un toque y entregaba una pantalla, justo cuando la persona está
        // ocupada — que es la razón por la que pospone.
        const ex = notification.extra || {};
        if (ex.group) { setScreen("hoy"); setGroupModal({ dateStr: ex.dateStr, hora: ex.hora }); } // notif agrupada → lista in-app
        else if (ex.pillId) { setScreen("hoy"); setPendingAction({ pillId: ex.pillId, scheduledTime: ex.scheduledTime, dateStr: ex.dateStr, pacienteId: ex.pacienteId, accion: actionId === 'POSPONER' ? 'posponer' : null }); }
        // Aviso de una CITA: llevamos ya a la pestaña de Citas (para que se vea algo aunque el
        // detalle tarde) y dejamos el resto al efecto, que espera a la lista y al paciente.
        else if (ex.cita && ex.citaId) { setScreen("citas"); setPendingCita({ citaId: ex.citaId, pacienteId: ex.pacienteId }); }
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

  // Las posposiciones se leen al arrancar (sobreviven a cerrar la app: pospones a las 10:00 y
  // vuelves a mirar a las 10:20) y se podan cada medio minuto. La poda no es solo higiene del
  // almacén: es lo que hace DESAPARECER la insignia cuando llega la hora del aviso. Sin ella, con
  // la app abierta la fila seguiría diciendo "pospuesta hasta 11:10" a las 11:30 — una etiqueta
  // vencida en una app de medicación se lee como permiso para no tomarse la pastilla todavía.
  useEffect(() => {
    let vivo = true;
    readPospuestas().then(guardadas => {
      const podadas = limpiarVencidas(guardadas, Date.now());
      if (!vivo) return;
      setPospuestas(podadas);
      if (Object.keys(podadas).length !== Object.keys(guardadas).length) writePospuestas(podadas);
    });
    const t = setInterval(() => {
      setPospuestas(prev => {
        const podadas = limpiarVencidas(prev, Date.now());
        if (Object.keys(podadas).length === Object.keys(prev).length) return prev; // sin cambios → sin re-render
        writePospuestas(podadas);
        return podadas;
      });
    }, 30000);
    return () => { vivo = false; clearInterval(t); };
  }, []);

  useEffect(() => { yaSePidioResena().then(setResenaPedida); }, []);

  // Único sitio que escribe las posposiciones: estado y almacén a la vez, para que no puedan
  // separarse. `cambio` recibe el mapa actual y devuelve el nuevo.
  const actualizarPospuestas = (cambio) => {
    setPospuestas(prev => { const next = cambio(prev); writePospuestas(next); return next; });
  };

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
      // "Posponer" desde la propia notificación: se resuelve aquí y no en el listener porque ahí
      // la lista de pastillas es una copia vieja del cierre —y porque la dosis puede ser de otro
      // paciente, que es el baile que hace este efecto justo arriba.
      if (pendingAction.accion === 'posponer') {
        snoozeDose(pill, pendingAction.scheduledTime, MINUTOS_POSPONER_NOTIF, pendingAction.dateStr);
      } else {
        // Al tocar la notificación abrimos el modal de confirmación (no marcamos directo).
        setConfirmDose({ pill, scheduledTime: pendingAction.scheduledTime, dateStr: pendingAction.dateStr });
      }
      setPendingAction(null);
    }
  }, [pendingAction, pills, session, pacienteActivoId, setPacienteActivoId]);

  // Abre el DETALLE de la cita cuya notificación se tocó. Mismo baile que el de las dosis: si es
  // de otro paciente, primero se activa ese paciente y se espera a que recarguen sus citas.
  useEffect(() => {
    if (!pendingCita || !session) return;
    if (pendingCita.pacienteId && pendingCita.pacienteId !== pacienteActivoId) {
      setPacienteActivoId(pendingCita.pacienteId);
      return; // esperamos a que recarguen las citas del nuevo paciente
    }
    if (!citas) return; // aún no sabemos nada; el efecto vuelve a correr al cargar
    const cita = citas.find(c => c.id === pendingCita.citaId);
    if (cita) { setCitaEditando(cita); setScreen("cita"); }
    // Si ya no existe (se borró desde otro dispositivo), NO nos quedamos esperando para siempre:
    // se limpia el pendiente y el usuario se queda en la lista, que es un final razonable.
    setPendingCita(null);
  }, [pendingCita, citas, session, pacienteActivoId, setPacienteActivoId]);
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

  // Premium encendido y la app vacía: esta persona pagó en otra instalación y sus medicamentos
  // están en una cuenta a la que no ha entrado. Se le PIDE la cuenta, y no se le pone un aviso.
  //
  // Dos intentos anteriores se quedaron cortos, los dos vistos en device:
  //  1. Un toast de 2,2 s ("Recuperamos tu suscripción ✓"). Insuficiente: "me abrió la versión
  //     premium sin recuperar la cuenta, todo salió en blanco pero todas las opciones premium
  //     activadas". Premium con la app vacía no es algo que se avise, es un estado roto.
  //  2. Una bandera escrita EN EL INSTANTE del rescate. Frágil: si el rescate pasó con una versión
  //     anterior de la app, esa bandera no existe y la persona se queda atascada para siempre.
  //     Ahora la condición se DERIVA (ver usePremium), así que da igual cuándo ocurriera.
  //
  // El momento importa tanto como el mensaje: se pide ANTES de que teclee nada. Eso deja sin coste
  // la decisión de que entrar en tu cuenta no arrastre lo capturado (ver lib/anonAuth.js), porque
  // no hay nada capturado todavía. Lo que le pasó al usuario fue el orden contrario.
  //
  // NO es bloqueante: quien compró de invitado y nunca creó cuenta no tiene nada que recuperar, y
  // tiene su "Más tarde". Si lo usa, el aviso del home queda como puerta permanente.
  useEffect(() => {
    if (!pedirCuentaAlVolver) return;
    setPedirCuenta("volviendo");
    marcarCuentaPedida();
  }, [pedirCuentaAlVolver]);

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

  // ¿Acaba de cerrar el día, y bien? Entonces —y solo entonces— se le pide la valoración en la
  // App Store. El momento es la mitad de la decisión: se pide justo después de algo que salió
  // bien, nunca a media mañana con dosis pendientes ni después de un "no lo he tomado". El resto
  // de la regla, y su porqué, están en `domain/resena.js`.
  //
  // ⚠️ Los días se cuentan sobre `records`, que trae el MES cargado del paciente activo. O sea que
  // a principios de mes la cuenta empieza de cero y la petición se retrasa unos días. Se acepta a
  // propósito: el error va hacia callarse, que es el lado seguro, y evita una consulta más en el
  // camino de marcar una dosis —el que la gente recorre veinte veces por semana—.
  const quizaPedirResena = (recordsNext, dayStr) => {
    if (dayStr !== todayStr || resenaLanzadaRef.current) return;
    const clavesDeHoy = (pills || [])
      .filter(p => isPillDueOnDay(p, todayStr))
      .flatMap(p => {
        const hs = getHoras(p.hora_toma, p.frecuencia);
        return (hs.length ? hs : ["00:00"]).map(h => `${p.id}_${h}`);
      });
    const toca = tocaPedirResena({
      diaCompleto: diaCerradoBien(recordsNext[todayStr], clavesDeHoy),
      diasBuenos: diasConDosisTomada(recordsNext),
      yaSePidio: resenaPedida,
    });
    if (!toca) return;
    resenaLanzadaRef.current = true;
    // Un respiro para que primero se vea "¡Todo lo de hoy registrado!". La hoja de Apple encima de
    // la confirmación se comería justo el momento bueno que justifica pedirla.
    setTimeout(async () => { if (await pedirResena()) setResenaPedida(true); }, 1500);
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
    // Y con ella la posposición: `cancelDoseNotif` mata también el aviso aplazado, así que dejar
    // la marca puesta anunciaría un recordatorio que ya no existe.
    actualizarPospuestas(prev => quitarPosposicion(prev, dayStr, key));

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
    quizaPedirResena(reconciledNext, dayStr);
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
    // Deshacer devuelve la dosis a "pendiente", no a "pospuesta": el aviso aplazado se canceló al
    // registrarla y no vuelve. Se reprograma el normal, que es lo que hace la línea de abajo.
    actualizarPospuestas(prev => quitarPosposicion(prev, dayStr, key));
    await scheduleDoseNotif(pill, dayStr, scheduledTime);
    showToast("Registro eliminado");
    if (navigator.onLine) flushOfflineQueue();
  };

  // Pospone el recordatorio de una dosis N minutos.
  //
  // Además de reprogramar la notificación, deja MARCADA la dosis: antes esto solo enseñaba un
  // toast de dos segundos y la fila del home quedaba idéntica a una pastilla que nadie ha tocado,
  // así que a los diez minutos no había forma de saber si el toque había hecho algo. La marca no
  // es historial y no va a la BD — el porqué, en `domain/posponer.js`.
  //
  // Y el toast dejó de prometer lo que no sabe: antes decía "Te recordaremos en N min" pasara lo
  // que pasara, porque el `schedule` iba dentro de un try/catch mudo y el aviso se anunciaba
  // igual aunque no se hubiera programado. Es el mismo criterio de la banda verde del alta, que
  // solo sale si el permiso se concedió de verdad.
  const snoozeDose = async (pill, scheduledTime, minutes, dateStr) => {
    const at = new Date(Date.now() + minutes * 60000);
    const horaAviso = `${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`;
    const nativo = !!window.Capacitor?.isNativePlatform();
    let avisoProgramado = false;
    if (nativo) {
      try {
        await LocalNotifications.schedule({ notifications: [{
          id: notifId(pill.id, 'snooze', scheduledTime), // id estable por dosis: re-posponer reemplaza, no acumula
          title: '💊 Mi Pastillero',
          body: `Recordatorio: ${pill.emoji} ${pill.nombre}${doseLabel(pill, scheduledTime) ? ` (${doseLabel(pill, scheduledTime)})` : ''}`,
          schedule: { at },
          ...soundFields(pill.sonido),
          actionTypeId: 'PILL_ACTIONS',
          extra: { pillId: pill.id, scheduledTime, dateStr: fmtDate(at.getFullYear(), at.getMonth(), at.getDate()), doseKey: `${pill.id}_${scheduledTime}`, pacienteId: pill.paciente_id, snooze: true },
        }]});
        avisoProgramado = true;
      } catch (_) { avisoProgramado = false; }
    }
    // En nativo, si no se pudo agendar no hay nada que posponer: decirlo y no pintar la insignia.
    if (nativo && !avisoProgramado) {
      showToast("No pudimos programar el recordatorio. Inténtalo de nuevo.");
      return;
    }
    const dia = dateStr || todayStr;
    actualizarPospuestas(prev => posponerHasta(prev, dia, `${pill.id}_${scheduledTime}`, at.getTime(), horaAviso));
    // En web no hay notificación local que agendar, así que la insignia sí se pinta pero el aviso
    // NO se promete: la app se queda con lo que sí puede cumplir.
    showToast(avisoProgramado ? `Te avisamos a las ${horaAviso}` : `Pospuesta hasta las ${horaAviso}`);
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
  // El primer arranque SIN RED es el punto débil del modelo sin muros: la sesión anónima necesita
  // internet para crearse. Antes esto se quedaba en "Cargando…" gris para siempre — sin mensaje y
  // sin salida. Y el login tampoco vale: quien acaba de descargar la app no tiene cuenta que usar.
  // Se cuenta lo que pasa, se ofrece reintentar, y además se resuelve sola al volver la red.
  if (session === undefined && anonFallo?.reintentable)
    return <PantallaSinConexion
      mensaje="Necesitamos internet solo para preparar la app la primera vez. Conéctate y seguimos."
      onReintentar={() => reintentarSesionAnonima()} />;
  if (session === undefined) return <PantallaCargando mensaje="Preparando tu pastillero…" />;
  if (!session) return <LoginScreen />;
  // Abierto a propósito desde una sesión anónima: aquí sí se puede volver, y se avisa de lo que
  // se deja atrás. Entrar con otra cuenta NO fusiona: lo capturado en este teléfono quedaría
  // huérfano, y decirlo después sería tarde.
  if (mostrarLogin)
    return <LoginScreen
      onCancelar={() => setMostrarLogin(false)} />;
  if (locked) return <BiometricLockScreen onUnlock={() => { setLocked(false); setCovered(false); }} onUsePassword={() => { supabase.auth.signOut(); setLocked(false); setCovered(false); }} />;
  // Candado de suscripción (solo si SUBSCRIPTIONS_ENABLED). Mientras esté apagado, nada de esto corre.
  if (SUBSCRIPTIONS_ENABLED && session && !premiumChecked && !hasPremium) return <PantallaCargando />;
  // Offline y sin poder verificar la suscripción: pantalla honesta de "Sin conexión" en vez del
  // paywall roto ("Los planes no están disponibles"). Se recupera sola al reconectar (netTick).
  if (SUBSCRIPTIONS_ENABLED && session && !hasPremium && netUnverified && window.Capacitor?.isNativePlatform())
    return <PantallaSinConexion
      mensaje="Necesitamos internet para verificar tu suscripción. Conéctate y vuelve a intentarlo."
      onReintentar={() => setNetTick(t => t + 1)} />;
  // EL MURO DURO, solo mientras el modelo nuevo esté apagado. Con MODELO_SIN_MUROS encendido no
  // hay muro: se entra a la parte gratis y lo de pago se pide en su puerta (ver `paywall`).
  if (!MODELO_SIN_MUROS && SUBSCRIPTIONS_ENABLED && session && !hasPremium && window.Capacitor?.isNativePlatform())
    return <Paywall onPurchased={(fueCompraAqui) => { setHasPremium(true); if (fueCompraAqui) marcarCompraLocal(); }} />;
  // Los tres caminos por los que `usePacientes` puede dejar sin paciente activo —sin red y sin
  // caché, la consulta falla, o el alta del "Yo" inicial es rechazada— acababan todos en un
  // "Cargando…" eterno. El reintento bumpea `netTick`, que es lo que vuelve a disparar la carga.
  if ((pills === null || !pacienteActivoId) && arranqueLento)
    return <PantallaSinConexion
      titulo="Esto está tardando más de lo normal"
      mensaje="Estamos preparando tu información. Revisa tu conexión y vuelve a intentarlo."
      onReintentar={() => { setArranqueLento(false); setNetTick(t => t + 1); }} />;
  if (pills === null || !pacienteActivoId) return <PantallaCargando mensaje="Preparando tu pastillero…" />;
  // La hoja de pago contextual. Va antes que las pantallas apiladas para que se abra encima de
  // cualquiera de ellas sin perder dónde estaba la persona: al cerrarla vuelve exactamente ahí.
  // Va ANTES del paywall: si acaba de comprar, lo que toca es asegurar su cuenta, no venderle otra vez.
  if (pedirCuenta)
    return <CrearCuentaScreen
      motivo={pedirCuenta}
      onListo={({ entro } = {}) => {
        setPedirCuenta(false);
        // Quien VOLVIÓ a su cuenta no creó nada, y la app tiene que decir lo que pasó y no lo que
        // ella hizo. Ver `entrarConLaMismaCredencial` en lib/anonAuth.js.
        //
        // Antes esto añadía "· trajimos tu medicamento" cuando el arrastre había movido filas. Ya
        // no hay arrastre —entrar a tu cuenta la restaura, no la modifica— y tampoco se dice que no
        // se trajo nada: quien vuelve está mirando sus medicamentos de siempre, que es lo que vino
        // a buscar. Explicarle una ausencia que no ha echado en falta es la clase de párrafo que
        // levanta sospecha.
        showToast(entro ? "Entramos a tu cuenta ✓" : "Cuenta creada ✓");
      }}
      onYaTengoCuenta={() => { setPedirCuenta(false); setMostrarLogin(true); }}
      onMasTarde={() => setPedirCuenta(false)} />;

  if (paywall)
    return <Paywall
      funcion={paywall}
      motivo={MOTIVO[paywall]}
      onPurchased={(fueCompraAqui) => {
        setHasPremium(true);
        setPaywall(null);
        // ⚠️ Solo si COMPRÓ aquí. Restaurar pasa `false`, y de esa diferencia depende que en los
        // arranques siguientes se le diga a esta persona lo que le corresponde: "termina de crear
        // tu cuenta" si sus datos están en este teléfono, o "entra a tu cuenta" si vuelve de otra
        // instalación. Ver usePremium.
        if (fueCompraAqui) marcarCompraLocal();
        // Y a quien acaba de PAGAR se le pide la cuenta ya. Quien restauró la recibe por el otro
        // camino (`pedirCuentaAlVolver`), con su propio mensaje.
        if (fueCompraAqui && esAnonimo(session)) setPedirCuenta("compra");
      }}
      onCerrar={() => setPaywall(null)} />;

  // ── Pantallas APILADAS: se abren encima de una pestaña y vuelven a ella ──────────────
  if (screen === "pacientes") return <PacientesScreen session={session} pacientes={pacientes} pacienteActivoId={pacienteActivoId} onChange={(lista) => { setPacientes(lista); if (!lista.find(p => p.id === pacienteActivoId)) setPacienteActivoId(lista[0]?.id); }} onBack={volver} />;
  // La ficha de emergencia. Va GRATIS: no pasa por `bloqueado()` a propósito —poner información
  // médica de urgencia detrás de un pago es lo que el prototipo llama "una bomba de reseñas de una
  // estrella"—. Guarda sobre el paciente activo, que es de quien es la ficha.
  if (screen === "emergencia") return <FichaEmergenciaScreen
    paciente={pacienteActivo}
    pills={pills}
    onGuardar={async (datos) => {
      const { data: saved, error } = await supabase.from("pacientes").update(datos).eq("id", pacienteActivoId).select().single();
      if (error || !saved) { alert("No se pudo guardar la ficha. Revisa tu conexión e inténtalo de nuevo."); return; }
      setPacientes(pacientes.map(p => (p.id === saved.id ? saved : p)));
      showToast("Ficha guardada ✓");
    }}
    onBack={volver} />;
  if (screen === "medicamentos") return <MedicamentosScreen session={session} pacienteId={pacienteActivoId} pills={pills} pillInicial={pillEditando} onUpdate={(nl) => { setPills(nl); safeStorage.set(`pills_cache_${pacienteActivoId}`, JSON.stringify(nl)); }} onBack={() => { setPillEditando(null); volver(); }} />;
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
  if (pills.length === 0 && !["ajustes", "citas"].includes(screen)) return <SetupScreen session={session} pacienteId={pacienteActivoId} pacientes={pacientes} notifPermission={notifPermission} requestNotifPermission={requestNotifPermission}
    // La puerta de quien VUELVE. Sin ella, esta pantalla no tiene salida en una instalación nueva
    // (el "← Volver" solo sale con más de un paciente), así que quien reinstala está obligado a
    // inventarse un medicamento antes de poder decir "ya tengo cuenta". Empezar como invitado se
    // queda; lo que faltaba era esto.
    onEntrarConCuenta={MODELO_SIN_MUROS && esAnonimo(session) ? () => setMostrarLogin(true) : null}
    onDone={(p, info) => {
      setPills(p);
      // El caché TAMBIÉN, como hacen las demás rutas de guardado. Sin esto se quedaba diciendo
      // "no tiene ninguno" justo después del primer medicamento de la vida de alguien: al reabrir
      // se pintaba medio segundo la bienvenida vacía, y SIN CONEXIÓN el medicamento real ni
      // siquiera aparecía.
      safeStorage.set(`pills_cache_${pacienteActivoId}`, JSON.stringify(p));
      setScreen("hoy");
      // Solo se promete el recordatorio si el permiso se concedió. La hora se calcula de los
      // medicamentos recién dados de alta, no de `pills`, que aún no se ha re-renderizado.
      // Solo se enseña si el permiso se concedió de verdad: prometer un recordatorio que no va a
      // sonar sería mentir, y para ese caso ya está el aviso ámbar.
      setConfirmacion(!!info?.recordatorioActivo);
    }} onCancel={() => { const otro = pacientes.find(p => p.id !== pacienteActivoId) || pacientes[0]; if (otro) setPacienteActivoId(otro.id); setScreen("hoy"); }} />;

  // ── PESTAÑAS ─────────────────────────────────────────────────────────────────────────
  // Todas comparten la barra inferior y dejan hueco abajo para no quedar tapadas por ella.
  const conTabs = (contenido) => (
    <>
      <div style={{ paddingBottom: "calc(74px + env(safe-area-inset-bottom, 0px))" }}>{contenido}</div>
      <TabBar
        // El historial y los reportes son pantallas APILADAS que se abren desde Mi salud, así que
        // la barra sigue marcando esa pestaña: no te has ido de ahí.
        activa={screen === "historial" || screen === "reportes" ? "salud" : screen}
        bloqueadas={Object.keys(PUERTAS).filter(id => bloqueado(PUERTAS[id]))}
        onCambiar={(id, bloqueada) => {
          // Tocar una pestaña con candado NO navega: abre la hoja de pago hablando de ESA función.
          if (bloqueada) { setPaywall(PUERTAS[id]); return; }
          // Irse de Hoy cierra la confirmación del primer medicamento: ya cumplió. Si no,
          // se queda hasta que toquen la ✕ —que mucha gente no toca— y mientras tanto
          // mantiene callado el ofrecimiento de Face ID toda la sesión.
          if (id !== screen) setConfirmacion(false);
          setScreen(id);
        }} />
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
  if (screen === "salud") return conTabs(
    <MiSaludScreen
      paciente={pacienteActivo}
      pills={pills}
      historialCompleto={!bloqueado(FUNCIONES.HISTORIAL_COMPLETO)}
      onFichaEmergencia={() => abrir("emergencia")}
      onMisMedicamentos={() => { setPillEditando(null); abrir("medicamentos"); }}
      onHistorial={() => abrir("historial")}
      onReportes={() => bloqueado(FUNCIONES.HISTORIAL_COMPLETO) ? setPaywall(FUNCIONES.HISTORIAL_COMPLETO) : abrir("reportes")} />
  );
  // Reportes ya NO es pestaña: se llega desde el historial, y su candado vive en esa entrada.
  if (screen === "reportes") return conTabs(
    <ReportesScreen session={session} paciente={pacienteActivo} pills={pills} onBack={volver} />
  );
  if (screen === "ajustes") return conTabs(
    <SettingsScreen session={session} pills={pills} onBack={null} pacientesBloqueado={bloqueado(FUNCIONES.MULTIPACIENTE)} sesionAnonima={MODELO_SIN_MUROS && esAnonimo(session)} onCrearCuenta={() => setPedirCuenta(volviendoDePago ? "volviendo" : "datos")} onEntrarConCuenta={() => setMostrarLogin(true)} onManagePacientes={() => bloqueado(FUNCIONES.MULTIPACIENTE) ? setPaywall(FUNCIONES.MULTIPACIENTE) : abrir("pacientes")} criticalAlerts={criticalAlerts} onToggleCriticalAlerts={toggleCriticalAlerts} criticalVolume={criticalVolume} onChangeCriticalVolume={cambiarVolumenCritico} bioEnabled={bioEnabled} onDisableBio={async () => { localStorage.removeItem("bio_cred_id"); await safeStorage.remove("bio_enabled"); setBioEnabled(false); showToast("Face ID desactivado"); }} />
  );

  return conTabs(
    <HomeScreen
      onEditarPill={(p) => { setPillEditando(p); abrir("medicamentos"); }}
      session={session} bioEnabled={bioEnabled} pacientes={pacientes}
      pacienteActivoId={pacienteActivoId} showPacienteSelector={showPacienteSelector}
      pills={pills} screen={screen} year={year} month={month} records={records}
      loading={loading} selectedDay={selectedDay} toast={toast} view={view}
      collapsedBlocks={collapsedBlocks} groupModal={groupModal} confirmDose={confirmDose}
      pospuestas={pospuestas} onPospuesta={(dia, doseKey, hastaMs, hora) => actualizarPospuestas(prev => posponerHasta(prev, dia, doseKey, hastaMs, hora))}
      notifPermission={notifPermission}
      confirmacion={confirmacion} onCerrarConfirmacion={() => setConfirmacion(false)}
      hasPremium={hasPremium} modeloSinMuros={MODELO_SIN_MUROS} onPedirPremium={setPaywall}
      sesionAnonima={MODELO_SIN_MUROS && esAnonimo(session)} onCrearCuenta={() => setPedirCuenta(volviendoDePago ? "volviendo" : "datos")}
      volviendoDePago={volviendoDePago}
      setBioEnabled={setBioEnabled} setShowPacienteSelector={setShowPacienteSelector}
      setScreen={setScreen} setRecords={setRecords} setSelectedDay={setSelectedDay}
      abrir={abrir}
      setCollapsedBlocks={setCollapsedBlocks} setGroupModal={setGroupModal}
      setConfirmDose={setConfirmDose}
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
