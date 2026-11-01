import { useState, useEffect, useRef } from "react";
import { Fingerprint } from 'lucide-react';
import { authenticateBiometric } from "../lib/biometrics";

export default function BiometricLockScreen({ onUnlock, onUsePassword }) {
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [trying, setTrying] = useState(false);
  // Qué intento manda ahora mismo. Si el usuario lanza uno nuevo mientras otro sigue en el aire,
  // lo que conteste el viejo ya no puede pintar nada —ni, sobre todo, abrir la app—.
  const intentoRef = useRef(0);

  const tryAuth = async (isRetry = false) => {
    const miIntento = ++intentoRef.current;
    setTrying(true);
    setError(null);
    setAviso(null);
    try {
      await authenticateBiometric();
      if (miIntento !== intentoRef.current) return; // llegó tarde: manda otro intento
      onUnlock();
    } catch (e) {
      if (miIntento !== intentoRef.current) return;
      // "User interaction required" (código 13): el Face ID se pidió antes de que la app estuviera
      // del todo activa. Reintentar UNA vez tras un instante lo resuelve sin molestar al usuario
      // (evita el segundo prompt fallido que se veía como "doble" al arrancar).
      if (!isRetry && String(e?.bioCode) === "13") {
        setTimeout(() => tryAuth(true), 350);
        return;
      }
      // Cancelar el Face ID NO es un error y no se pinta en rojo. Pero tampoco puede quedarse en
      // silencio: la pantalla se ve idéntica a antes de intentarlo y parece colgada. Se dice qué
      // hacer, que es lo único que falta. El tope de tiempo acaba en el mismo sitio: tampoco es
      // un fallo del lector, es que no contestó.
      if (e.name === "NotAllowedError" || e.name === "BiometricTimeout")
        setAviso("Toca «Desbloquear» para intentarlo otra vez.");
      else setError("No se pudo verificar. Intenta de nuevo.");
    } finally {
      if (miIntento === intentoRef.current) setTrying(false);
    }
  };

  useEffect(() => { tryAuth(); }, []);

  // ── Que volver a la app SIEMPRE devuelva el botón ────────────────────────────────────
  //
  // Es el cuelgue reportado: "Verificando…" en gris, sin prompt, sin mensaje, y el botón
  // DESHABILITADO porque `trying` se quedó puesto. Lo único tocable era "Usar contraseña", que
  // cierra la sesión. Pasa cuando la app se va a segundo plano con el prompt presentado: el
  // sistema lo descarta y el plugin nunca contesta, así que el `finally` que baja `trying` no
  // llega a correr jamás.
  //
  // ⚠️ Esto NO puede colgar de `visibilitychange` / `focus` / `pageshow`. Es la lección que ya
  // está escrita en useSession.js: en WKWebView esos eventos no siempre llegan al reanudar —es
  // justo lo que obligó a 684730e—, y una red de seguridad que depende de cazar un evento se cae
  // el día que el evento no llega. En iOS eso dejaba el cuelgue intacto hasta el tope de 60 s de
  // biometrics.js, que es el mismo cuelgue con otro reloj.
  //
  // Se MUESTREA `document.hidden`, que siempre dice la verdad se haya emitido lo que se haya
  // emitido. Y se exige haber visto el fondo antes de soltar el botón: sin esa condición, un
  // prompt legítimo —que en iOS puede presentarse sin que el WebView se declare oculto— se
  // quedaría con el botón liberado por detrás, y tocarlo apilaría un segundo prompt.
  //
  // No se re-lanza nada al volver: solo se devuelve el control y decide el usuario. El intento
  // viejo tampoco se invalida — si el prompt seguía vivo y contesta que sí, entrar es lo que
  // toca. Solo corre mientras `trying` está puesto, que en uso normal son los segundos del Face
  // ID: no hay temporizador vivo el resto del tiempo.
  useEffect(() => {
    if (!trying) return;
    const inicio = Date.now();
    let fueAlFondo = false;
    let visibleDesde = null;
    const id = setInterval(() => {
      if (document.hidden) { fueAlFondo = true; visibleDesde = null; return; }
      if (!fueAlFondo) return;              // nunca se fue: el prompt sigue siendo suyo
      if (visibleDesde === null) { visibleDesde = Date.now(); return; }
      // La gracia es para no robarle el prompt a quien acaba de volver y lo tiene delante.
      if (Date.now() - visibleDesde < 1200) return;
      // Rastro a propósito, y es EL importante: si esta línea sale en device, el cuelgue
      // reportado era este y no otro. Si no sale nunca, el camino ni siquiera se pisó — que es
      // justo lo que no se puede saber mirando una pantalla que ya no se cuelga.
      console.warn(`[candado] el prompt no contestó tras volver del fondo (${Date.now() - inicio} ms esperando) — se devuelve el botón`);
      setTrying(false);
      setAviso("Toca «Desbloquear» para intentarlo otra vez.");
    }, 400);
    return () => clearInterval(id);
  }, [trying]);

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 8px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-violet-200 dark:shadow-none mx-auto mb-4">💊</div>
        <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
        <p className="text-sm text-gray-400">Verifica tu identidad para continuar</p>
      </div>
      {/* `() => tryAuth()` y no `tryAuth` a secas: React le pasa el evento del clic como primer
          argumento, que aquí es `isRetry`. Un MouseEvent es truthy, así que tocar «Desbloquear»
          se contaba como "esto YA es el reintento" y se saltaba el único reintento automático
          que hay — justo el del código 13, el que existe para cuando el Face ID se pide antes de
          que la app esté del todo activa, que es el caso de este botón. */}
      <button onClick={() => tryAuth()} disabled={trying}
        className="w-full max-w-xs flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-base font-bold shadow-lg shadow-violet-200 dark:shadow-none mb-4 disabled:opacity-60 transition-all"
        style={{ fontWeight: 800 }}>
        <Fingerprint size={24} />
        {trying ? "Verificando..." : "Desbloquear"}
      </button>
      {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
      {aviso && <p className="text-xs text-gray-400 mb-4">{aviso}</p>}
      <button onClick={onUsePassword} className="text-xs text-gray-400 underline underline-offset-2 cursor-pointer">
        Usar contraseña
      </button>
    </div>
  );
}

// Traduce los mensajes de error de Supabase Auth (vienen en inglés) a español.
