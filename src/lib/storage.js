// Storage que funciona igual en nativo (Preferences/UserDefaults) y en web (localStorage).
import { Preferences } from '@capacitor/preferences';

// En Capacitor nativo, el localStorage del WKWebView a veces no persiste entre relanzamientos.
// Usamos Preferences (UserDefaults en iOS) como storage del auth de Supabase para que la sesión
// sobreviva al cerrar la app. En web seguimos usando localStorage (default).
export const nativeStorage = {
  async getItem(key) { const { value } = await Preferences.get({ key }); return value; },
  async setItem(key, value) { await Preferences.set({ key, value }); },
  async removeItem(key) { await Preferences.remove({ key }); },
};

// Helper general para storage que funciona en nativo y web.
// Útil para flags propios de la app (paciente activo, etc.).
export const safeStorage = {
  async get(key) {
    if (window.Capacitor?.isNativePlatform()) {
      const { value } = await Preferences.get({ key });
      return value;
    }
    return localStorage.getItem(key);
  },
  async set(key, value) {
    if (window.Capacitor?.isNativePlatform()) await Preferences.set({ key, value });
    else localStorage.setItem(key, value);
  },
  async remove(key) {
    if (window.Capacitor?.isNativePlatform()) await Preferences.remove({ key });
    else localStorage.removeItem(key);
  },
};

// Última lista conocida de medicamentos de TODOS los pacientes. La usa el programador de
// notificaciones para poder agendar sin conexión: antes leía la lista por red y, si fallaba,
// concluía "no hay medicamentos" y cancelaba todo lo pendiente — quedarse sin señal borraba
// los recordatorios. Es una caché de solo lectura para agendar; la BD sigue siendo la verdad.
export const ALL_PILLS_CACHE_KEY = "all_pills_cache";
export const readAllPillsCache = async () => {
  try { return JSON.parse(await safeStorage.get(ALL_PILLS_CACHE_KEY)) || []; } catch (_) { return []; }
};
export const writeAllPillsCache = (arr) => safeStorage.set(ALL_PILLS_CACHE_KEY, JSON.stringify(arr));

// Espejo del estado premium. La fuente de verdad es Preferences (async), pero además lo
// escribimos en localStorage (SÍNCRONO) para poder leerlo en el PRIMER render y así arrancar
// ya como premium, sin el parpadeo del paywall mientras RevenueCat/Preferences responden.
export const cachePremium = (isPrem) => {
  const v = isPrem ? "1" : "0";
  safeStorage.set("premium_cache", v);
  try { localStorage.setItem("premium_cache", v); } catch (_) { /* noop */ }
};
