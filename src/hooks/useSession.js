// Quién es el usuario y si la app está bloqueada.
//
// Tres decisiones de este archivo tienen historia y conviene no "mejorarlas" sin leerla:
//
//  - SESIÓN GUARDADA PRIMERO. Se lee del storage (local, instantáneo) y se entra SIN esperar a la
//    red; getSession() valida en segundo plano. Antes se esperaba hasta 10 s a getSession y en red
//    lenta la app se quedaba en "Cargando…" varios segundos.
//  - Los `setSession` son IDEMPOTENTES por identidad de usuario: en un simple refresco de token NO
//    se re-setea, porque cambiar la referencia re-dispara todos los efectos y producía el "doble
//    refresco" del home. Y si aquí se calcula null por un timeout raro, no se tira una sesión válida.
//  - El velo de privacidad al ir al fondo NO pide Face ID, y el re-bloqueo tiene periodo de gracia:
//    salir dos segundos y volver ya no re-pide Face ID (antes bloqueaba en cada paso al fondo).
//
// El flag de Face ID vive en Preferences y no en localStorage: en iOS localStorage no sobrevive al
// relanzamiento de la app.

import { useState, useEffect, useRef, useCallback } from "react";
import { safeStorage } from "../lib/storage";
import { supabase, readStoredSession } from "../lib/supabase";
import { withTimeout } from "../lib/offlineQueue";
import { MODELO_SIN_MUROS } from "../lib/config";
import { crearSesionAnonima } from "../lib/anonAuth";

const LOCK_GRACE_MS = 3 * 60 * 1000; // 3 minutos

export default function useSession(cargarPreferencias) {
  const [session, setSession] = useState(undefined);
  const [locked, setLocked] = useState(false);
  const [covered, setCovered] = useState(false); // velo al ir al fondo, SIN pedir Face ID
  const [bioEnabled, setBioEnabled] = useState(false); // se carga async desde Preferences al montar
  const hiddenAtRef = useRef(0); // último paso a segundo plano (para el periodo de gracia)

  // ── Sesión anónima: entrar sin registro ────────────────────────────────────────────────
  // Mientras MODELO_SIN_MUROS sea false nada de esto corre y el arranque es el de siempre.
  const [anonFallo, setAnonFallo] = useState(null); // último fallo al crearla (para la UI)
  const sessionRef = useRef(undefined);   // lectura fresca desde callbacks, sin re-crearlos
  const anonEnCursoRef = useRef(false);   // candado: nunca dos intentos a la vez
  const anonNoInsistirRef = useRef(false);// fallo NO reintentable (el interruptor está apagado)
  useEffect(() => { sessionRef.current = session; }, [session]);

  // Crea la sesión anónima si de verdad no hay ninguna. Nunca lanza.
  const intentarSesionAnonima = useCallback(async () => {
    if (!MODELO_SIN_MUROS) return;
    if (anonEnCursoRef.current) return;
    // Un fallo de configuración no se arregla reintentando: insistir sería un bucle infinito
    // contra un interruptor apagado, y encima gastaría el límite de 30 por hora de Supabase.
    if (anonNoInsistirRef.current) return;
    // Si ya hay sesión —guardada, recién creada, o puesta por onAuthStateChange— no se toca.
    // Crear una anónima encima sería DARLE OTRA IDENTIDAD a alguien que ya tenía la suya.
    if (sessionRef.current) return;
    // Sin red no se intenta siquiera: se marca y lo recoge el reintento de abajo. La sesión se
    // QUEDA en `undefined` — no se pone `null`, que enseñaría un login inútil a alguien que nunca
    // ha tenido cuenta. Quien pinta algo útil con esto es App, mirando `anonFallo`.
    if (navigator.onLine === false) {
      setAnonFallo({ tipo: "sin-red", reintentable: true, mensaje: "Sin conexión al crear la sesión. Se reintentará." });
      return;
    }

    anonEnCursoRef.current = true;
    try {
      const { session: nueva, fallo } = await crearSesionAnonima();
      if (nueva) {
        setAnonFallo(null);
        // Mismo set idempotente que el arranque: si el listener ya puso esta misma sesión,
        // se conserva su referencia para no re-disparar todos los efectos.
        setSession(prev => (prev?.user?.id === nueva.user?.id ? prev : nueva));
      } else if (fallo) {
        setAnonFallo(fallo);
        // Si NO se puede reintentar (el interruptor de Supabase está apagado) se admite que no
        // hay nadie y App cae a la pantalla de acceso. Es un callejón sin salida, pero ese fallo
        // es un error de configuración que no debe llegar nunca a producción, y grita en consola.
        //
        // Si SÍ se puede reintentar, la sesión se queda en `undefined` a propósito: App enseña la
        // pantalla de "sin conexión" con su botón, que se resuelve sola en cuanto vuelva la red.
        if (!fallo.reintentable) setSession(prev => (prev === undefined ? null : prev));
        if (!fallo.reintentable) {
          anonNoInsistirRef.current = true;
          // Se GRITA a propósito. Un fallo de configuración tratado como uno de red se queda
          // callado para siempre, y la app se quedaría en la pantalla de acceso sin decir por qué.
          console.error("[sesión anónima] no se puede crear:", fallo.mensaje);
        }
      }
    } finally { anonEnCursoRef.current = false; }
  }, []);

  useEffect(() => {
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
      // Si no hay sesión pero vamos a crear una anónima, NO se pone `null` todavía: `null`
      // significa "no hay nadie" y App pinta la pantalla de acceso con él. Poniéndolo aquí se veía
      // el login PARPADEAR medio segundo antes de entrar (reportado en device). Se deja en
      // `undefined` —que es "aún no se sabe", y pinta "Cargando…"— hasta que la anónima resuelva.
      const vaACrearAnonima = !session && MODELO_SIN_MUROS;
      // Set idempotente: si el listener onAuthStateChange ya puso la sesión del MISMO usuario (carrera
      // de arranque), conservamos esa referencia (evita un segundo render = "doble refresco"). Y si ya
      // hay una sesión válida pero aquí calculamos null (timeout raro), NO la tiramos.
      if (!vaACrearAnonima) {
        setSession(prev => {
          if (prev && prev.user?.id === session?.user?.id) return prev;
          if (prev && !session) return prev;
          return session;
        });
      }
      // El flag de Face ID vive en Preferences (localStorage no persiste en iOS al relanzar).
      const bio = (await safeStorage.get("bio_enabled")) === "true";
      setBioEnabled(bio);
      if (session && bio) setLocked(true);
      await cargarPreferencias(); // alertas críticas: encendido/apagado y volumen
      // Nadie ha entrado nunca en este teléfono: se le crea una sesión anónima y entra directo.
      // Va AL FINAL a propósito, cuando ya se sabe que no hay sesión guardada ni remota.
      if (!session) await intentarSesionAnonima();
    })();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, newSession) => {
      // Solo actualizamos si cambió la IDENTIDAD (login / logout / cambio de usuario). En
      // TOKEN_REFRESHED (mismo usuario) conservamos la referencia para NO re-disparar los efectos
      // y evitar el "doble refresco" del home. El token lo maneja el cliente por dentro (nada usa
      // session.access_token en la app).
      setSession(prev => (prev?.user?.id === newSession?.user?.id ? prev : newSession));
    });

    return () => subscription.unsubscribe();
  }, [intentarSesionAnonima]);

  // Reintento de la sesión anónima. Es el punto débil del modelo: crearla NECESITA red, y sin
  // ella el primer arranque se quedaría en blanco para siempre.
  //
  // El intervalo no es un lujo, es la misma lección que la cola offline: con modo avión + Wi-Fi
  // encendido a mano, iOS NO emite el evento "online" y el reintento se quedaría esperando
  // indefinidamente aunque sí hubiera conexión real (reproducido en device).
  useEffect(() => {
    if (!MODELO_SIN_MUROS) return;
    const alReconectar = () => intentarSesionAnonima();
    window.addEventListener("online", alReconectar);
    const id = setInterval(() => { if (sessionRef.current === null) intentarSesionAnonima(); }, 30000);
    return () => { window.removeEventListener("online", alReconectar); clearInterval(id); };
  }, [intentarSesionAnonima]);

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

  return { session, locked, setLocked, covered, setCovered, bioEnabled, setBioEnabled,
           anonFallo, reintentarSesionAnonima: intentarSesionAnonima };
}
