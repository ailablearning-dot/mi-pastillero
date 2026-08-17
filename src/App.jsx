import { useState, useEffect, useCallback, useRef } from "react";
import { LocalNotifications } from '@capacitor/local-notifications';
import { WifiOff } from 'lucide-react';
import { initPurchases, identifyUser, logoutPurchases, addPremiumListener } from "./purchases";
import { SUBSCRIPTIONS_ENABLED } from "./lib/config";
import { getDaysInMonth, fmtDate } from "./domain/dates";
import { getHoras, getNearestBlock, isPillDueOnDay } from "./domain/schedule";
import { verboPara } from "./domain/medTypes";
import { doseLabel } from "./domain/dosage";
import { safeStorage, cachePremium, readAllPillsCache, writeAllPillsCache } from "./lib/storage";
import { supabase, readStoredSession } from "./lib/supabase";
import { doseQK, newPillId, readPillQueue, writePillQueue, insertPill, esRechazoDefinitivo, withTimeout, OFFLINE_QUEUE_KEY } from "./lib/offlineQueue";
import { notifId, soundFields, cancelDoseNotif, scheduleDoseNotif, scheduleLocalNotifs, setCriticalAlertsEnabled, setCriticalVolume, VOLUMEN_POR_DEFECTO } from "./lib/notifications";
import PillForm from "./components/PillForm";
import Paywall from "./components/Paywall";
import BiometricLockScreen from "./screens/BiometricLockScreen";
import LoginScreen from "./screens/LoginScreen";
import SetupScreen from "./screens/SetupScreen";
import SettingsScreen from "./screens/SettingsScreen";
import PacientesScreen from "./screens/PacientesScreen";
import ReportesScreen from "./screens/ReportesScreen";
import HomeScreen from "./screens/HomeScreen";

const LOCK_GRACE_MS = 3 * 60 * 1000; // 3 minutos

export default function App() {
  const [session, setSession] = useState(undefined);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false); // velo de privacidad al ir al fondo (sin pedir Face ID)
  const [criticalAlerts, setCriticalAlerts] = useState(true); // Alertas Críticas ON por defecto
  const [criticalVolume, setCriticalVolumeState] = useState(VOLUMEN_POR_DEFECTO);
  const [bioEnabled, setBioEnabled] = useState(false); // se carga async desde Preferences al montar
  // Arranca con el último estado premium conocido leído SÍNCRONAMENTE del espejo en localStorage,
  // para que un usuario premium nunca vea un frame del paywall al abrir. Si no hay espejo (primer
  // arranque / reinstalación), cae a false y el gate de "Cargando…" cubre la verificación async.
  const [hasPremium, setHasPremium] = useState(() => {
    try { return localStorage.getItem("premium_cache") === "1"; } catch (_) { return false; }
  }); // suscripción activa (o en prueba)
  const [premiumChecked, setPremiumChecked] = useState(!SUBSCRIPTIONS_ENABLED); // con subs off, no hace falta chequear
  const [netUnverified, setNetUnverified] = useState(false); // offline + sin caché premium → pantalla "Sin conexión" (NO paywall)
  const [netTick, setNetTick] = useState(0); // sube al reconectar → re-verifica premium
  const [pacientes, setPacientes] = useState([]);
  const [pacienteActivoId, setPacienteActivoIdState] = useState(null);
  const [showPacienteSelector, setShowPacienteSelector] = useState(false);
  const [pills, setPills] = useState(null);
  const [screen, setScreen] = useState("main");
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [records, setRecords] = useState({});
  const [loading, setLoading] = useState(true);
  const [selectedDay, setSelectedDay] = useState(fmtDate(today.getFullYear(), today.getMonth(), today.getDate()));
  const [toast, setToast] = useState(null);
  const [view, setView] = useState("today");
  const [collapsedBlocks, setCollapsedBlocks] = useState({});
  const [pendingAction, setPendingAction] = useState(null);
  const [groupModal, setGroupModal] = useState(null); // { dateStr, hora } — lista de dosis que coinciden
  const [confirmDose, setConfirmDose] = useState(null); // { pill, scheduledTime, dateStr } → modal de confirmación
  const [confirmLogout, setConfirmLogout] = useState(false); // confirmación antes de cerrar sesión
  const blocksInitRef = useRef(false);
  const premiumListenerRef = useRef(false); // listener de RevenueCat agregado una sola vez
  const pacientesLoadedRef = useRef(null); // guard: evita cargar/auto-crear "Yo" dos veces por eventos de auth casi simultáneos
  const swRegRef = useRef(null);
  const offlineQueueRef = useRef({});      // dosis marcadas sin conexión, pendientes de sincronizar
  const flushingRef = useRef(false);       // candado: evita que dos disparadores sincronicen a la vez
  const flushRef = useRef(null);           // apunta al último flushOfflineQueue (para llamarlo al cargar la cola)
  const flushingPillsRef = useRef(false);  // mismo candado para la cola de ALTAS de medicamentos
  const hiddenAtRef = useRef(0); // timestamp del último paso a segundo plano (para el periodo de gracia del bloqueo)
  const [notifPermission, setNotifPermission] = useState(
    typeof Notification !== "undefined" ? Notification.permission : "prompt"
  );
  const [resumeTick, setResumeTick] = useState(0); // sube al volver del fondo → dispara reprogramación de notifs

  const todayStr = fmtDate(today.getFullYear(), today.getMonth(), today.getDate());

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.ready.then(reg => { swRegRef.current = reg; });
    }
    (async () => {
      // SESIÓN GUARDADA PRIMERO: la leemos del storage (lectura local, rápida) y entramos SIN
      // esperar a la red. getSession() valida/refresca en segundo plano (onAuthStateChange corrige
      // si el token cambió o la sesión ya no es válida). Antes esperábamos hasta 10s a getSession
      // → "Cargando…" varios segundos en red lenta (p.ej. 5G reconectando tras quitar el cable).
      let session;
      if (window.Capacitor?.isNativePlatform()) {
        const stored = await readStoredSession();
        if (stored) {
          session = stored;
          // Validar en segundo plano; solo re-setea si cambió el USUARIO (raro) o si la sesión ya no
          // es válida (→ null → logout). En un simple refresh de token NO re-seteamos (mismo usuario)
          // para no re-disparar los efectos ni causar el "doble refresco" del home.
          supabase.auth.getSession().then(({ data }) => {
            const s = data.session;
            if (!s) setSession(null);
            else if (s.user?.id !== stored.user?.id) setSession(s);
          }).catch(() => { /* offline / red: conservamos la sesión guardada */ });
        } else {
          // Sin sesión guardada: esperamos a getSession (con tope) para decidir login vs app.
          const offline = navigator.onLine === false;
          session = await withTimeout(
            supabase.auth.getSession().then(({ data }) => data.session).catch(() => null),
            offline ? 2000 : 10000,
            null
          );
        }
      } else {
        const { data } = await supabase.auth.getSession();
        session = data.session;
      }
      // Set idempotente: si el listener onAuthStateChange ya puso la sesión del MISMO usuario (carrera
      // de arranque), conservamos esa referencia (evita un segundo render = "doble refresco"). Y si ya
      // hay una sesión válida pero aquí calculamos null (timeout raro), NO la tiramos.
      setSession(prev => {
        if (prev && prev.user?.id === session?.user?.id) return prev;
        if (prev && !session) return prev;
        return session;
      });
      // El flag de Face ID vive en Preferences (localStorage no persiste en iOS al relanzar).
      const bio = (await safeStorage.get("bio_enabled")) === "true";
      setBioEnabled(bio);
      if (session && bio) setLocked(true);
      // Alertas Críticas: default ON (solo se apaga si el usuario lo guardó como "false").
      const crit = await safeStorage.get("critical_alerts");
      const critOn = (crit == null) ? true : (crit === "true");
      setCriticalAlertsEnabled(critOn);
      setCriticalAlerts(critOn);
      const vol = await safeStorage.get("critical_volume");
      const volId = vol || VOLUMEN_POR_DEFECTO;
      setCriticalVolume(volId);          // el módulo de notificaciones, que es quien lo usa
      setCriticalVolumeState(volId);     // y la pantalla de ajustes
    })();
    if (window.Capacitor?.isNativePlatform()) {
      LocalNotifications.registerActionTypes({ types: [{ id: 'PILL_ACTIONS', actions: [
        { id: 'TOMAR', title: 'Tomar 💊', foreground: true },
        { id: 'POSPONER', title: 'Posponer' },
      ]}] }).catch(() => {});
      LocalNotifications.checkPermissions().then(({ display }) => {
        setNotifPermission(display); // 'granted' | 'denied' | 'prompt' | 'prompt-with-rationale'
      });
    }
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, newSession) => {
      // Solo actualizamos si cambió la IDENTIDAD (login / logout / cambio de usuario). En
      // TOKEN_REFRESHED (mismo usuario) conservamos la referencia para NO re-disparar los efectos
      // y evitar el "doble refresco" del home. El token lo maneja el cliente por dentro (nada usa
      // session.access_token en la app).
      setSession(prev => (prev?.user?.id === newSession?.user?.id ? prev : newSession));
    });

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
        if (ex.group) { setScreen("main"); setGroupModal({ dateStr: ex.dateStr, hora: ex.hora }); } // notif agrupada → lista in-app
        else if (ex.pillId) { setScreen("main"); setPendingAction({ pillId: ex.pillId, scheduledTime: ex.scheduledTime, dateStr: ex.dateStr, pacienteId: ex.pacienteId }); }
      }).then(handle => { actionListener = handle; });
    }

    return () => {
      subscription.unsubscribe();
      window.Capacitor?.Plugins?.Keyboard?.removeAllListeners();
      actionListener?.remove();
    };
  }, []);

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

  // Enciende/apaga Alertas Críticas. Actualiza la preferencia + el módulo de notificaciones;
  // el efecto de scheduling (que depende de `criticalAlerts`) reprograma con el nuevo nivel.
  const toggleCriticalAlerts = (val) => {
    setCriticalAlertsEnabled(val);
    setCriticalAlerts(val);
    safeStorage.set("critical_alerts", String(val));
  };

  // Cambiar el volumen obliga a REPROGRAMAR: el volumen viaja dentro de cada notificación ya
  // agendada, así que las pendientes conservarían el valor viejo. `criticalVolume` está en las
  // dependencias del efecto de scheduling justo para eso.
  const cambiarVolumenCritico = (id) => {
    setCriticalVolume(id);
    setCriticalVolumeState(id);
    safeStorage.set("critical_volume", id);
  };

  // Si el usuario ya denegó las notificaciones, iOS no vuelve a preguntar: hay que
  // mandarlo a los Ajustes de la app para reactivarlas.
  const openNotifSettings = () => {
    if (window.Capacitor?.isNativePlatform()) window.open("app-settings:", "_system");
  };

  // Persiste el paciente activo (compartido entre cierres de la app)
  const setPacienteActivoId = useCallback(async (id) => {
    setPacienteActivoIdState(id);
    if (id) await safeStorage.set("paciente_activo_id", id);
  }, []);

  // Privacidad + re-bloqueo con periodo de gracia (visibilitychange del WKWebView).
  // Al IR al fondo: cubrimos la pantalla con un velo (para el snapshot del multitareas)
  // SIN pedir Face ID, y guardamos la hora. Al VOLVER: quitamos el velo y solo re-pedimos
  // Face ID si estuvo en el fondo más de LOCK_GRACE_MS. Así, salir unos segundos y volver
  // ya no re-pide Face ID (antes se bloqueaba en cada paso al fondo = incómodo).
  useEffect(() => {
    if (!session || !bioEnabled) return;
    const onVisibility = () => {
      // Si ya estamos en el candado, NO tocar el velo ni re-bloquear: el "hidden/visible" viene del
      // PROMPT de Face ID, no de un backgrounding real. Antes esto ponía el velo durante el Face ID y,
      // al desbloquear, quedaba un frame de velo antes del home = el "doble refresco" que se veía.
      if (locked) return;
      if (document.hidden) {
        hiddenAtRef.current = Date.now();
        setCovered(true);
      } else {
        setCovered(false);
        if (Date.now() - (hiddenAtRef.current || 0) > LOCK_GRACE_MS) setLocked(true);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [session, bioEnabled, locked]);

  // RevenueCat: inicializa (no-op sin API key / en web), identifica al usuario y
  // chequea si tiene suscripción activa. Todo detrás de SUBSCRIPTIONS_ENABLED, así
  // que mientras esté apagado no toca nada del flujo actual.
  useEffect(() => {
    if (!SUBSCRIPTIONS_ENABLED) return;
    // Sesión AÚN NO DETERMINADA (undefined ≠ null). Sin esto, en el primer render entrábamos por la
    // rama "deslogueado": logoutPurchases + setHasPremium(false) + cachePremium(false) (¡borraba el
    // caché!) + premiumChecked=false. Como el home ya se pinta al instante (hasPremium se lazy-
    // inicializa del caché), el usuario veía HOME → "Cargando" (gate 2) → HOME: el "refresco" al
    // abrir la app. Esperamos a saber si hay sesión; `null` (deslogueado de verdad) sí sigue de largo.
    if (session === undefined) return;
    // Una pasada que quedó obsoleta (cambió `session` mientras ella esperaba a RevenueCat) NO debe
    // QUITAR acceso: sus resultados son de otro usuario/estado. Conceder tarde es inofensivo (la
    // pasada vigente recalcula), retirar tarde causa el parpadeo o deja un candado equivocado.
    let cancelled = false;
    (async () => {
      let cachedPremium = false;
      try {
      // Optimista: arranca con el último estado premium conocido (caché local). Evita que el
      // paywall parpadee al abrir para un usuario premium, y que se quede ATRAPADO sin conexión
      // (si RevenueCat no puede verificar, respetamos el caché en vez de mostrar el paywall).
      cachedPremium = (await safeStorage.get("premium_cache")) === "1";
      if (cachedPremium) setHasPremium(true);

      await withTimeout(initPurchases(), 4000, undefined); // no bloquear el arranque si RC se cuelga offline
      // Listener reactivo (una sola vez): SOLO DESBLOQUEA (nunca bloquea), para no causar
      // parpadeos por estados transitorios de RevenueCat (p.ej. el usuario anónimo antes de
      // identificarse). El bloqueo real solo ocurre con un chequeo confiable (abajo).
      if (!premiumListenerRef.current) {
        const id = await withTimeout(addPremiumListener((premium) => {
          if (premium) { setHasPremium(true); cachePremium(true); setNetUnverified(false); }
        }), 3000, null);
        if (id !== null && id !== undefined) premiumListenerRef.current = true;
      }
      if (session?.user?.id) {
        // Offline NO llamamos a logIn (colgaría/fallaría): sin red = "no se pudo determinar" (null).
        // Timeout de 4s: si logIn se cuelga (sin señal real aunque onLine diga true), resolvemos null.
        const premiumNow = navigator.onLine ? await withTimeout(identifyUser(session.user.id), 4000, null) : null;
        if (premiumNow === true) { setHasPremium(true); cachePremium(true); setNetUnverified(false); }
        else if (premiumNow === false) {
          // Definitivo: sin premium. Si NO veníamos de premium cacheado, aplicamos el candado ya.
          // Si SÍ veníamos de premium cacheado, NO bajamos en caliente (RevenueCat a veces devuelve
          // un customerInfo transitorio sin el entitlement justo tras configurar → causaría el flash
          // del paywall). Solo corregimos la caché; si de verdad expiró, entra limpio al próximo inicio.
          if (cancelled) return;
          cachePremium(false); setNetUnverified(false);
          if (!cachedPremium) setHasPremium(false);
        }
        else {
          // premiumNow === null: no se pudo verificar (offline, timeout de red, o error de RC).
          if (cachedPremium || !navigator.onLine) {
            // Ya verificado antes (caché) O sin conexión → MODO GRACIA: entra al home. Sin conexión
            // el paywall no sirve igual (no se pueden cargar ni comprar planes), así que nunca
            // bloqueamos por red caída; NO persistimos premium (no llamamos cachePremium) → al
            // reconectar se re-verifica y, si de verdad no tiene, el candado entra limpio.
            setHasPremium(true); setNetUnverified(false);
          } else {
            // ONLINE pero no se pudo verificar (RC caído / timeout): pantalla "Sin conexión" con reintento.
            setNetUnverified(true);
          }
        }
      } else {
        // SIN sesión (deslogueado). CLAVE para el parpadeo: NO dejar premiumChecked en true.
        // Si quedara en true, al INICIAR SESIÓN el efecto vuelve a verificar premium de forma
        // async y, mientras tanto, el gate de "Cargando…" (que exige !premiumChecked) NO aplicaría
        // → se colaría un frame del paywall antes de confirmar que el usuario es premium. Con
        // premiumChecked=false, el login muestra "Cargando…" hasta confirmar, jamás el paywall.
        await logoutPurchases();
        if (cancelled) return; // ya hay sesión nueva: no borres su premium ni su caché
        setHasPremium(false);
        cachePremium(false); // al cerrar sesión, limpiar el caché premium
        setNetUnverified(false);
      }
      } catch (e) {
        // Algo lanzó (típico: RevenueCat en 5G/Wi-Fi con error de backend). NO colgar la app: si
        // veníamos de premium cacheado o estamos offline, entramos en modo gracia (no bloquear a
        // un premium por un fallo de RC). Si no, el candado/paywall decide abajo (nunca "Cargando").
        if (session?.user?.id && (cachedPremium || !navigator.onLine)) { setHasPremium(true); setNetUnverified(false); }
      } finally {
        // SIEMPRE resolvemos el gate de "Cargando": con sesión → verificado=true (jamás se queda
        // colgado aunque RevenueCat falle); sin sesión → false (fix del flash del paywall al entrar).
        // Salvo si esta pasada quedó obsoleta: la vigente resolverá el gate con su propio estado.
        if (!cancelled) setPremiumChecked(!!session?.user?.id);
      }
    })();
    return () => { cancelled = true; };
  }, [session, netTick]);

  // Al RECONECTAR, re-verifica premium para salir solo de la pantalla "Sin conexión".
  useEffect(() => {
    const onOnline = () => setNetTick(t => t + 1);
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, []);

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

  // Cargar pacientes del usuario actual + auto-crear "Yo" si no tiene ninguno
  useEffect(() => {
    if (!session) { pacientesLoadedRef.current = null; return; }
    // Guard sincrónico: al iniciar sesión Supabase emite varios eventos de auth
    // (INITIAL_SESSION + SIGNED_IN) → este efecto corría dos veces y creaba dos "Yo".
    // Con el ref por usuario solo corre una vez. (Se resetea al hacer signOut arriba.)
    if (pacientesLoadedRef.current === session.user.id) return;
    pacientesLoadedRef.current = session.user.id;
    const cacheKey = `pacientes_cache_${session.user.id}`;
    const applyActive = async (lista) => {
      setPacientes(lista);
      // Restaurar paciente activo o usar el primero
      const saved = await safeStorage.get("paciente_activo_id");
      const valido = lista.find(p => p.id === saved);
      const activo = valido ? valido.id : lista[0]?.id;
      setPacienteActivoIdState(activo);
      if (activo && activo !== saved) await safeStorage.set("paciente_activo_id", activo);
    };
    const fromCache = async () => {
      const raw = await safeStorage.get(cacheKey);
      if (raw) { try { const lista = JSON.parse(raw); if (lista.length) { await applyActive(lista); return true; } } catch (_) { /* noop */ } }
      return false;
    };
    (async () => {
      // CACHÉ-PRIMERO: mostrar los pacientes cacheados YA (online u offline) para no bloquear el
      // arranque esperando la red. En red lenta esto es la diferencia entre "Cargando…" varios
      // segundos y entrar al instante. Luego, si hay conexión, revalidamos contra la BD.
      const cachedShown = await fromCache();
      // Sin conexión: quedarse con la caché; NO consultar ni crear "Yo" (fallaría / duplicaría).
      if (!navigator.onLine) { if (!cachedShown) pacientesLoadedRef.current = null; return; }
      const { data: pacs, error } = await supabase.from("pacientes").select("*").eq("user_id", session.user.id).order("orden").order("created_at");
      if (error) { if (!cachedShown) pacientesLoadedRef.current = null; return; } // red falló → nos quedamos con la caché ya mostrada (o reintentar si no había)
      let lista = pacs || [];
      // Auto-crear "Yo" para usuarios nuevos (sin pacientes después de la migración)
      if (lista.length === 0) {
        // es_default:true + índice único parcial (migración 004) garantizan un solo
        // default por usuario aunque una carrera intente crear el segundo.
        const { data: nuevo } = await supabase.from("pacientes").insert({
          user_id: session.user.id, nombre: "Yo", emoji: "👤", orden: 0, es_default: true
        }).select().single();
        if (nuevo) {
          lista = [nuevo];
        } else {
          // El insert falló (p.ej. violación del índice único por una carrera, o red) →
          // re-leer para quedarnos con el "Yo" que sí exista.
          const { data: again } = await supabase.from("pacientes").select("*").eq("user_id", session.user.id).order("orden").order("created_at");
          lista = again || [];
        }
      }
      // Solo re-aplicar si CAMBIÓ vs lo que ya mostramos del caché → evita un re-render y una
      // reprogramación redundante de notificaciones (pesada: ~60 notifs) durante el arranque.
      const freshStr = JSON.stringify(lista);
      if (freshStr !== (await safeStorage.get(cacheKey))) await applyActive(lista);
      safeStorage.set(cacheKey, freshStr); // caché para arranques offline
    })();
  }, [session, netTick]); // netTick: reintenta al reconectar (si la carga offline falló sin caché)

  // Cargar pastillas del paciente activo. Se cachean localmente para que SIN conexión la app
  // muestre los medicamentos reales (no "Configura tus medicamentos") y no se borren al reabrir /
  // reactivar la app offline. Con timeout para no colgarse si la red no responde.
  useEffect(() => {
    if (!session || !pacienteActivoId) return;
    const cacheKey = `pills_cache_${pacienteActivoId}`;
    (async () => {
      // CACHÉ-PRIMERO: mostrar las pastillas cacheadas YA para no bloquear la UI esperando la red
      // (arranque instantáneo en red lenta). Luego revalidamos contra la BD y refrescamos si cambió.
      let hadCache = false;
      const raw = await safeStorage.get(cacheKey);
      if (raw) { try { setPills(JSON.parse(raw)); hadCache = true; } catch (_) { /* noop */ } }
      if (navigator.onLine) {
        const res = await withTimeout(
          supabase.from("pastillas").select("*").eq("user_id", session.user.id).eq("paciente_id", pacienteActivoId).order("orden"),
          6000, { data: null, error: true }
        );
        if (!res.error && res.data) {
          // Las altas que aún NO han subido no están en la BD: si nos quedáramos solo con lo que
          // devuelve, el medicamento recién creado DESAPARECERÍA de la lista. Las reponemos desde
          // la cola (solo las de este paciente) marcadas como pendientes.
          const pendientes = (await readPillQueue())
            .filter(p => p.paciente_id === pacienteActivoId && !res.data.some(d => d.id === p.id))
            .map(p => ({ ...p, _pending: true }));
          const lista = pendientes.length ? [...res.data, ...pendientes] : res.data;
          const fresh = JSON.stringify(lista);
          if (fresh !== raw) setPills(lista); // solo si CAMBIÓ vs el caché → evita re-render y re-ejecutar loadRecords (el "doble refresco")
          safeStorage.set(cacheKey, fresh);
          return;
        }
      }
      // Offline o la consulta falló y NO había caché: no dejar "Cargando…" colgado.
      if (!hadCache) setPills(prev => (prev === null ? [] : prev));
    })();
  }, [session, pacienteActivoId, netTick]); // netTick: refresca/reintenta al reconectar

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
      const scheduled = row.hora_programada || pill.hora_toma?.slice(0,5) || "00:00";
      built[fecha][`${pill.id}_${scheduled}`] = { time: row.hora, dbId: row.id, tomado: row.tomado };
    });
    const builtStr = JSON.stringify(built);
    // Cinturón y tirantes: si la BD devolvió filas y NINGUNA casó con las pastillas en memoria, algo
    // está desalineado — no pisamos la vista ni envenenamos el caché con un objeto vacío.
    if ((data || []).length && !Object.keys(built).length) { setLoading(false); return; }
    if (builtStr !== raw) setRecords(built); // solo actualiza si cambió vs el caché → no parpadea el home tras el unlock
    safeStorage.set(cacheKey, builtStr); // caché para ver el historial sin conexión
    setLoading(false);
  }, [year, month, session, pills, pacienteActivoId]);

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

  // Alta de un medicamento nuevo desde el botón del home (screen "addmed"). Reusa el mismo
  // insert que Ajustes; guarda para el paciente activo, actualiza la lista + el caché y vuelve al home.
  const addPillFromHome = async (data) => {
    // OPTIMISTA: el id lo genera el teléfono, así el medicamento aparece YA y la pantalla no
    // espera a la red (con red mala esa espera llegaba a 10 s y a veces se perdía lo escrito).
    const saved = { ...data, id: newPillId(), user_id: session.user.id, paciente_id: pacienteActivoId, orden: pills.length };
    const nl = [...pills, { ...saved, _pending: true }];
    setPills(nl);
    safeStorage.set(`pills_cache_${pacienteActivoId}`, JSON.stringify(nl)); // mantener el caché al día
    setScreen("main");
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
    if (res === "encolada") showToast("Sin conexión: se guardó y se sincronizará al reconectar 📶");
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
      ? "Sin conexión: se guardó y se sincronizará al reconectar 📶"
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
    showToast(failed ? "Sin conexión: se guardó y se sincronizará al reconectar 📶" : `💊 ${scheduledTime} — todas registradas`);
    if (!failed) flushOfflineQueue();
  };

  const prevMonth = () => { if (month === 0) { setMonth(11); setYear(year - 1); } else setMonth(month - 1); };
  const nextMonth = () => { if (month === 11) { setMonth(0); setYear(year + 1); } else setMonth(month + 1); };
  const goToday = () => { setYear(today.getFullYear()); setMonth(today.getMonth()); setSelectedDay(todayStr); };


  if (session === undefined) return <div className="min-h-screen flex items-center justify-center text-gray-400">Cargando...</div>;
  if (!session) return <LoginScreen />;
  if (locked) return <BiometricLockScreen onUnlock={() => { setLocked(false); setCovered(false); }} onUsePassword={() => { supabase.auth.signOut(); setLocked(false); setCovered(false); }} />;
  if (covered) return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center">
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-violet-200 dark:shadow-none">💊</div>
    </div>
  );
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
  if (screen === "pacientes") return <PacientesScreen session={session} pacientes={pacientes} pacienteActivoId={pacienteActivoId} onChange={(lista) => { setPacientes(lista); if (!lista.find(p => p.id === pacienteActivoId)) setPacienteActivoId(lista[0]?.id); }} onBack={() => setScreen("main")} />;
  if (screen === "reportes") return <ReportesScreen session={session} paciente={pacientes.find(p => p.id === pacienteActivoId)} pills={pills} onBack={() => setScreen("main")} />;
  if (screen === "addmed") return <PillForm title="Nuevo medicamento" onSave={addPillFromHome} onCancel={() => setScreen("main")} />;
  if (pills.length === 0 && screen !== "settings") return <SetupScreen session={session} pacienteId={pacienteActivoId} pacientes={pacientes} onDone={(p) => { setPills(p); setScreen("main"); }} onCancel={() => { const otro = pacientes.find(p => p.id !== pacienteActivoId) || pacientes[0]; if (otro) setPacienteActivoId(otro.id); setScreen("main"); }} />;
  if (screen === "settings") return <SettingsScreen session={session} pacienteId={pacienteActivoId} pills={pills} onUpdate={(nl) => { setPills(nl); safeStorage.set(`pills_cache_${pacienteActivoId}`, JSON.stringify(nl)); }} onBack={() => setScreen("main")} onManagePacientes={() => setScreen("pacientes")} onReportes={() => setScreen("reportes")} criticalAlerts={criticalAlerts} onToggleCriticalAlerts={toggleCriticalAlerts} criticalVolume={criticalVolume} onChangeCriticalVolume={cambiarVolumenCritico} bioEnabled={bioEnabled} onDisableBio={async () => { localStorage.removeItem("bio_cred_id"); await safeStorage.remove("bio_enabled"); setBioEnabled(false); showToast("Face ID desactivado"); }} />;

  return (
    <HomeScreen
      session={session} bioEnabled={bioEnabled} pacientes={pacientes}
      pacienteActivoId={pacienteActivoId} showPacienteSelector={showPacienteSelector}
      pills={pills} screen={screen} year={year} month={month} records={records}
      loading={loading} selectedDay={selectedDay} toast={toast} view={view}
      collapsedBlocks={collapsedBlocks} groupModal={groupModal} confirmDose={confirmDose}
      confirmLogout={confirmLogout} notifPermission={notifPermission}
      setBioEnabled={setBioEnabled} setShowPacienteSelector={setShowPacienteSelector}
      setScreen={setScreen} setRecords={setRecords} setSelectedDay={setSelectedDay}
      setView={setView} setCollapsedBlocks={setCollapsedBlocks} setGroupModal={setGroupModal}
      setConfirmDose={setConfirmDose} setConfirmLogout={setConfirmLogout}
      requestNotifPermission={requestNotifPermission} openNotifSettings={openNotifSettings}
      setPacienteActivoId={setPacienteActivoId} cacheRecords={cacheRecords}
      loadRecords={loadRecords} showToast={showToast} recordDose={recordDose}
      clearDose={clearDose} snoozeDose={snoozeDose} markBlockDoses={markBlockDoses}
      prevMonth={prevMonth} nextMonth={nextMonth} goToday={goToday}
    />
  );
}
