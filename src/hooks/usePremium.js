// Estado de la suscripción: si hay premium, si ya se pudo comprobar, y el reintento al reconectar.
//
// Va en su propio hook porque es lo único que decide el gate del paywall y porque su historia está
// llena de bordes que costaron caro:
//  - En el primer render la sesión está INDETERMINADA (undefined ≠ null). Tratarla como
//    "deslogueado" borraba el caché de premium y hacía parpadear el paywall a quien sí paga.
//  - Sin conexión hay que distinguir "no tiene premium" de "no pude comprobarlo", o se le enseña
//    un paywall roto a un suscriptor que solo se quedó sin señal.
//
// `netTick` sube al recuperar la red; lo usan también los cargadores de pacientes, pastillas y
// notificaciones para reintentar, así que se devuelve.

import { useState, useEffect, useRef } from "react";
import { SUBSCRIPTIONS_ENABLED } from "../lib/config";
import { safeStorage, cachePremium } from "../lib/storage";
import { withTimeout } from "../lib/offlineQueue";
import { initPurchases, identifyUser, logoutPurchases, addPremiumListener, restore } from "../purchases";
import { esAnonimo } from "../domain/sesion";
import { debeRestaurarEnSilencio } from "../domain/plan";

// La marca de "ya lo intenté en esta instalación". Va en Preferences y no en localStorage a
// propósito: tiene que morir al desinstalar la app, que es justo el momento que este rescate
// atiende. Si sobreviviera, la reinstalación no volvería a intentarlo.
const CLAVE_RESCATE = "restauro_silencioso";

// Y esta se queda: "en este teléfono se restauró una suscripción de una instalación anterior".
// Hace falta que SOBREVIVA a los arranques, no como el aviso de un momento, porque lo que cambia es
// una PUERTA que tiene que seguir ahí hasta que la persona la use. Probado en device: el rescate
// devolvió el premium y la app siguió diciéndole "Termina de crear tu cuenta" — la puerta
// equivocada para quien ya tiene una y lo que quiere es volver a ella. Se borra en cuanto la
// sesión deja de ser anónima, que es cuando ya volvió.
const CLAVE_VOLVIENDO = "restauro_silencioso_ok";

// Restaurar SIN que la persona lo pida. El porqué de cada condición está en
// `debeRestaurarEnSilencio` (domain/plan.js), que es donde se decide y donde tiene pruebas.
//
// Devuelve true solo si había una suscripción y volvió. Si la llamada no se pudo completar —sin
// señal real, RevenueCat lento— NO se anota el intento: se vuelve a probar en el próximo arranque.
// Anotarlo ahí dejaría a alguien que ya pagó encerrado para siempre por un timeout.
async function rescatarSuscripcion(session) {
  if (!debeRestaurarEnSilencio({
    anonimo: esAnonimo(session),
    nativo: !!window.Capacitor?.isNativePlatform(),
    enLinea: navigator.onLine,
    yaIntentado: (await safeStorage.get(CLAVE_RESCATE)) === "1",
  })) return false;
  try {
    const tiene = await withTimeout(restore(), 6000, null);
    if (tiene === null) return false;          // no se pudo: se reintenta, no se anota
    await safeStorage.set(CLAVE_RESCATE, "1");
    return tiene === true;
  } catch (_) {
    return false;                              // tampoco se anota
  }
}

export default function usePremium(session) {
  const [hasPremium, setHasPremium] = useState(() => {
    try { return localStorage.getItem("premium_cache") === "1"; } catch (_) { return false; }
  }); // suscripción activa (o en prueba)
  const [premiumChecked, setPremiumChecked] = useState(!SUBSCRIPTIONS_ENABLED); // con subs off, no hace falta chequear
  const [netUnverified, setNetUnverified] = useState(false); // offline + sin caché premium → pantalla "Sin conexión" (NO paywall)
  const [netTick, setNetTick] = useState(0); // sube al reconectar → re-verifica premium
  const [rescatado, setRescatado] = useState(false);   // se acaba de restaurar → avisar UNA vez
  const [volviendoDePago, setVolviendoDePago] = useState(false); // pagó en otra instalación → puerta
  const premiumListenerRef = useRef(false); // listener de RevenueCat, se agrega una sola vez

  // La bandera persistente se lee al arrancar: la puerta tiene que estar ahí desde el primer
  // fotograma, no solo en el arranque donde ocurrió el rescate.
  useEffect(() => {
    (async () => {
      if ((await safeStorage.get(CLAVE_VOLVIENDO)) === "1") setVolviendoDePago(true);
    })();
  }, []);

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
        // Ya no es anónimo: entró en su cuenta, así que la puerta de "vuelve a ella" ya cumplió.
        if (session.user.is_anonymous !== true) {
          await safeStorage.remove(CLAVE_VOLVIENDO);
          if (!cancelled) setVolviendoDePago(false);
        }
        // Offline NO llamamos a logIn (colgaría/fallaría): sin red = "no se pudo determinar" (null).
        // Timeout de 4s: si logIn se cuelga (sin señal real aunque onLine diga true), resolvemos null.
        const premiumNow = navigator.onLine ? await withTimeout(identifyUser(session.user.id), 4000, null) : null;
        if (premiumNow === true) { setHasPremium(true); cachePremium(true); setNetUnverified(false); }
        else if (premiumNow === false) {
          if (cancelled) return;
          // ⚠️ ANTES de bajar el candado: puede que esta persona YA PAGÓ y lo que pasa es que
          // reinstaló la app. Con sesión anónima su id de Supabase es nuevo, así que para
          // RevenueCat es alguien que nunca compró nada — pero su suscripción sigue viva en su
          // Apple ID. Sin este rescate se le enseña el paywall y Apple le dice "ya estás
          // suscrito": encerrado, sin salida y pagando. Ver domain/plan.js.
          if (await rescatarSuscripcion(session)) {
            if (cancelled) return;
            setHasPremium(true); cachePremium(true); setNetUnverified(false);
            setRescatado(true);
            await safeStorage.set(CLAVE_VOLVIENDO, "1");
            setVolviendoDePago(true);
            return;
          }
          // Definitivo: sin premium. Si NO veníamos de premium cacheado, aplicamos el candado ya.
          // Si SÍ veníamos de premium cacheado, NO bajamos en caliente (RevenueCat a veces devuelve
          // un customerInfo transitorio sin el entitlement justo tras configurar → causaría el flash
          // del paywall). Solo corregimos la caché; si de verdad expiró, entra limpio al próximo inicio.
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

  return { hasPremium, setHasPremium, premiumChecked, netUnverified, netTick, setNetTick,
           rescatado, setRescatado, volviendoDePago };
}
