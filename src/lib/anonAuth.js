// Sesión anónima: usar la app sin registrarse. Aquí vive el EFECTO; las reglas están en
// src/domain/sesion.js (puras y con pruebas).
//
// El registro deja de estar al principio y pasa al final: se pide cuenta AL COMPRAR, no al abrir.
// Por debajo el usuario tiene su fila en `auth.users` y sus datos van a la nube desde el segundo
// uno; simplemente nunca vio una pantalla de registro.
//
// TRES COSAS COMPROBADAS CONTRA DEV ANTES DE ESCRIBIR ESTO (2026-08-18), para no redescubrirlas:
//
//  1. El usuario anónimo usa el rol `authenticated`, igual que uno permanente. Las políticas RLS
//     de esta app son todas `auth.uid() = user_id`, o sea POR FILA, así que un anónimo solo ve lo
//     suyo — verificado: con 8 usuarios con datos en dev, el anónimo veía 1 fila, la propia.
//     ⚠️ Si algún día se añade una política que dé acceso general al rol `authenticated`, se le
//     abriría a cualquiera que toque "descargar". Eso hay que mirarlo política por política.
//  2. Convertirlo en cuenta permanente CONSERVA EL MISMO id de usuario, así que no se pierde nada.
//     Es `updateUser({email})` → verificar con el código de 6 dígitos → `updateUser({password})`,
//     que es exactamente el flujo OTP que ya existe para restablecer la contraseña.
//  3. Requiere DOS interruptores en el dashboard: "Anonymous sign-ins" y "Manual linking". Sin el
//     primero no se crea la sesión; sin el segundo se crea pero NUNCA se puede convertir.

import { supabase } from "./supabase";
import { clasificarFalloAnon, clasificarFalloConversion } from "../domain/sesion.js";

export { esAnonimo, esPermanente, textoDatosASalvo } from "../domain/sesion.js";

// Crea la sesión anónima. NUNCA lanza: devuelve { session, fallo }.
//
// No lleva ni timeout ni reintento a propósito: quién reintenta y cuándo es decisión del arranque
// (useSession), que es el que sabe si hay red y si el usuario está delante. Este módulo hace una
// sola cosa y dice qué pasó.
export const crearSesionAnonima = async () => {
  try {
    const { data, error } = await supabase.auth.signInAnonymously();
    if (error) return { session: null, fallo: clasificarFalloAnon(error) };
    return { session: data?.session || null, fallo: null };
  } catch (e) {
    return { session: null, fallo: clasificarFalloAnon(e) };
  }
};

// ── Convertir la sesión anónima en una cuenta de verdad ──────────────────────────────
//
// Se VINCULA un correo al usuario anónimo que ya existe. El id de usuario NO cambia, así que sus
// medicamentos, su historial y sus citas siguen siendo suyos sin migrar una sola fila. Crear una
// cuenta nueva y mover los datos sería el error caro de este modelo: se pierde todo justo en el
// momento en que la persona paga.
//
// Requiere "Manual linking" activado en el dashboard (ver arriba).

// Paso 1: pide el correo y manda el código de 6 dígitos.
export const vincularCorreo = async (email) => {
  try {
    const { error } = await supabase.auth.updateUser({ email: String(email || "").trim() });
    if (error) return { ok: false, fallo: clasificarFalloConversion(error) };
    return { ok: true, fallo: null };
  } catch (e) { return { ok: false, fallo: clasificarFalloConversion(e) }; }
};

// Paso 2: confirma con el código. El tipo es 'email_change' porque para Supabase esto es un
// cambio de correo del usuario que ya existe — que es exactamente lo que queremos que sea.
export const confirmarCorreo = async (email, token) => {
  try {
    const { error } = await supabase.auth.verifyOtp({
      email: String(email || "").trim(), token: String(token || "").trim(), type: "email_change",
    });
    if (error) return { ok: false, fallo: clasificarFalloConversion(error) };
    return { ok: true, fallo: null };
  } catch (e) { return { ok: false, fallo: clasificarFalloConversion(e) }; }
};

// Paso 3: contraseña, para que pueda volver a entrar desde otro teléfono. Solo se puede DESPUÉS
// de verificar el correo; antes, Supabase lo rechaza.
export const ponerContrasena = async (password) => {
  try {
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return { ok: false, fallo: clasificarFalloConversion(error) };
    return { ok: true, fallo: null };
  } catch (e) { return { ok: false, fallo: clasificarFalloConversion(e) }; }
};
