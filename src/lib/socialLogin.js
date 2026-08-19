// Tokens nativos de Apple y Google. Solo obtiene el token; qué se hace con él —entrar o VINCULAR
// a una sesión anónima— lo decide quien llama.
//
// Vive aparte porque lo usan dos sitios: el login de siempre y la conversión de una sesión
// anónima en cuenta. `SocialLogin.initialize` no debe llamarse dos veces con configuraciones
// distintas, así que los candados de inicialización viven aquí y no repartidos por las pantallas.

import { SocialLogin } from '@capgo/capacitor-social-login';
import { GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "./config";

let googleListo = false;
let appleListo = false;

// Devuelve el idToken, o null si el usuario canceló o falta configuración.
// Nunca lanza por cancelación: cancelar no es un error que haya que enseñar.
export const tokenDeGoogle = async () => {
  if (!GOOGLE_IOS_CLIENT_ID) return { token: null, motivo: "Falta configurar Google (VITE_GOOGLE_IOS_CLIENT_ID)." };
  try {
    if (!googleListo) {
      await SocialLogin.initialize({ google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID } });
      googleListo = true;
    }
    const res = await SocialLogin.login({ provider: "google", options: { scopes: ["email", "profile"] } });
    const token = res?.result?.idToken;
    return token ? { token, motivo: null } : { token: null, motivo: "No se pudo obtener el token de Google." };
  } catch (e) {
    const m = e?.message || "";
    return { token: null, motivo: /cancel/i.test(m) ? null : (m || "No se pudo continuar con Google.") };
  }
};

export const tokenDeApple = async () => {
  try {
    if (!appleListo) { await SocialLogin.initialize({ apple: {} }); appleListo = true; }
    const res = await SocialLogin.login({ provider: "apple", options: { scopes: ["name", "email"] } });
    const token = res?.result?.idToken;
    return token ? { token, motivo: null } : { token: null, motivo: "No se pudo obtener el token de Apple." };
  } catch (e) {
    const m = e?.message || "";
    return { token: null, motivo: /cancel/i.test(m) ? null : (m || "No se pudo continuar con Apple.") };
  }
};
