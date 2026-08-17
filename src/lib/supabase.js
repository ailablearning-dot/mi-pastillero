// Cliente de Supabase y lectura de la sesión persistida.
import { createClient } from "@supabase/supabase-js";
import { SUPABASE_URL, SUPABASE_KEY } from "./config";
import { nativeStorage } from "./storage";

// fetch con TOPE de tiempo para TODAS las llamadas de Supabase (auth, queries). Sin esto, sin
// conexión cada llamada espera el timeout por defecto de iOS (~60s). Tope ÚNICO y amplio (15s):
// NO usamos navigator.onLine para abortar antes, porque en iOS el WebView a veces reporta
// onLine=false en DATOS MÓVILES aunque SÍ haya red → un tope corto (1.5s) abortaba ESCRITURAS
// reales (guardar medicamento, marcar dosis) de forma intermitente en 5G. 15s tolera red lenta y
// sigue evitando el cuelgue de ~60s cuando de verdad no hay conexión. Ya no bloquea el arranque:
// la UI es caché-primero (sesión/pacientes/pastillas) y revalida en segundo plano.
export const timeoutFetch = (url, options = {}) => {
  if (options.signal) return fetch(url, options); // respeta un signal propio si lo hubiera
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), 15000);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(id));
};

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: !window.Capacitor?.isNativePlatform(),
    storage: window.Capacitor?.isNativePlatform() ? nativeStorage : undefined,
  },
  global: { fetch: timeoutFetch },
});

// Clave donde Supabase persiste la sesión (default: sb-<ref>-auth-token, ref = subdominio de la URL).
export const SUPABASE_AUTH_KEY = `sb-${(() => { try { return new URL(SUPABASE_URL).hostname.split(".")[0]; } catch (_) { return ""; } })()}-auth-token`;

// Lee la sesión persistida DIRECTO del storage nativo, sin tocar la red. Fallback para el arranque
// en frío sin conexión: si el access token expiró, getSession() intenta refrescarlo por red y GoTrue
// reintenta con backoff → offline eso se cuelga y la app se queda en "Cargando…" hasta el próximo
// resume. Con esto entramos a modo offline/grace de inmediato (onAuthStateChange corrige al reconectar).
export const readStoredSession = async () => {
  try {
    const raw = await nativeStorage.getItem(SUPABASE_AUTH_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const s = parsed?.currentSession || parsed; // v2 guarda la sesión directa; toleramos el wrap v1
    return (s && s.access_token && s.user) ? s : null;
  } catch (_) { return null; }
};
