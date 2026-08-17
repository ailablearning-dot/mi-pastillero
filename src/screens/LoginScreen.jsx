import { useState } from "react";
import { SocialLogin } from '@capgo/capacitor-social-login';
import { TERMS_URL, PRIVACY_URL, linkDoc, GOOGLE_IOS_CLIENT_ID, GOOGLE_WEB_CLIENT_ID } from "../lib/config";
import { supabase } from "../lib/supabase";

let googleInitialized = false; // SocialLogin.initialize se hace una sola vez
let appleInitialized = false;  // idem para Apple

function authErrorES(msg) {
  const m = (msg || "").toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Aún no confirmas tu cuenta. Revisa el código que te enviamos por correo.";
  if (m.includes("user already registered") || m.includes("already been registered")) return "Este email ya está registrado. Intenta iniciar sesión.";
  if (m.includes("password should be at least")) return "La contraseña debe tener al menos 8 caracteres.";
  if (m.includes("unable to validate email") || m.includes("invalid format")) return "El correo no tiene un formato válido.";
  if (m.includes("for security purposes") || m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera un momento e inténtalo de nuevo.";
  if (m.includes("failed to fetch") || m.includes("network")) return "Sin conexión. Revisa tu internet e inténtalo de nuevo.";
  return msg || "Ocurrió un error. Inténtalo de nuevo.";
}

export default function LoginScreen() {
  const [mode, setMode] = useState("login"); // "login" | "register" | "forgot" | "reset" | "confirm"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [code, setCode] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [msg, setMsg] = useState(null);
  const [loading, setLoading] = useState(false);
  const [acceptedTerms, setAcceptedTerms] = useState(false); // consentimiento en el registro

  const switchMode = (m) => {
    setMode(m);
    setMsg(null);
    setPasswordConfirm("");
    setPassword("");
    setAcceptedTerms(false);
    if (m !== "reset") setCode("");
  };

  // Paso 1 del reset: envía el email con el código de 6 dígitos (OTP de recovery).
  const handleForgotPassword = async () => {
    if (!email) {
      setMsg({ type: "error", text: "Ingresa tu email primero." });
      return;
    }
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    setLoading(false);
    if (error) {
      setMsg({ type: "error", text: authErrorES(error.message) });
      return;
    }
    setMode("reset");
    setPassword("");
    setPasswordConfirm("");
    setCode("");
    setMsg({ type: "ok", text: "Te enviamos un código de 6 dígitos a tu email." });
  };

  // Paso 2 del reset: verifica el código y establece la nueva contraseña.
  // verifyOtp crea la sesión; updateUser la cambia; onAuthStateChange entra a la app.
  const handleReset = async () => {
    const token = code.trim();
    if (token.length < 6) {
      setMsg({ type: "error", text: "Ingresa el código que te enviamos por email." });
      return;
    }
    if (password.length < 8) {
      setMsg({ type: "error", text: "La contraseña debe tener al menos 8 caracteres." });
      return;
    }
    if (password !== passwordConfirm) {
      setMsg({ type: "error", text: "Las contraseñas no coinciden." });
      return;
    }
    setLoading(true);
    setMsg(null);
    const { error: vErr } = await supabase.auth.verifyOtp({ email, token, type: "recovery" });
    if (vErr) {
      setLoading(false);
      setMsg({ type: "error", text: "Código inválido o expirado. Solicita uno nuevo." });
      return;
    }
    const { error: uErr } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (uErr) {
      setMsg({ type: "error", text: uErr.message });
      return;
    }
    // Aviso de seguridad "tu contraseña fue actualizada" (Edge Function + Resend).
    // Fire-and-forget: si el correo falla, no debe afectar el ingreso a la app.
    supabase.functions.invoke("notify-password-changed").catch(() => {});
    // La sesión ya quedó activa: la app entra sola vía onAuthStateChange.
  };

  // Confirmación de cuenta nueva por OTP (reemplaza el enlace web del email).
  // verifyOtp con type "signup" confirma el email y crea la sesión → entra a la app.
  const handleConfirm = async () => {
    const token = code.trim();
    if (token.length < 6) {
      setMsg({ type: "error", text: "Ingresa el código que te enviamos por email." });
      return;
    }
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.verifyOtp({ email, token, type: "signup" });
    setLoading(false);
    if (error) {
      setMsg({ type: "error", text: "Código inválido o expirado. Solicita uno nuevo." });
      return;
    }
    // La sesión ya quedó activa: la app entra sola vía onAuthStateChange.
  };

  const handleResendSignup = async () => {
    if (!email) { setMsg({ type: "error", text: "Ingresa tu email primero." }); return; }
    setLoading(true);
    setMsg(null);
    const { error } = await supabase.auth.resend({ type: "signup", email });
    setLoading(false);
    setMsg(error ? { type: "error", text: error.message } : { type: "ok", text: "Te reenviamos el código." });
  };

  const handleEmail = async () => {
    if (mode === "forgot") { await handleForgotPassword(); return; }
    if (mode === "reset") { await handleReset(); return; }
    if (mode === "confirm") { await handleConfirm(); return; }
    setLoading(true);
    setMsg(null);
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setMsg({ type: "error", text: authErrorES(error.message) });
    } else {
      // Validaciones de registro
      if (password.length < 8) {
        setMsg({ type: "error", text: "La contraseña debe tener al menos 8 caracteres." });
        setLoading(false);
        return;
      }
      if (password !== passwordConfirm) {
        setMsg({ type: "error", text: "Las contraseñas no coinciden." });
        setLoading(false);
        return;
      }
      if (!acceptedTerms) {
        setMsg({ type: "error", text: "Debes aceptar la Política de Privacidad y los Términos de Uso." });
        setLoading(false);
        return;
      }
      const { data, error } = await supabase.auth.signUp({ email, password });
      if (error) {
        setMsg({ type: "error", text: authErrorES(error.message) });
      } else if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
        // Supabase no devuelve error en email duplicado por anti-enumeración:
        // detectamos el caso por identities vacío.
        setMsg({ type: "error", text: "Este email ya está registrado. Intenta iniciar sesión." });
      } else {
        // Confirmación por OTP dentro de la app (antes el email llevaba un enlace web
        // a la PWA vieja de Vercel, que en iOS abría Safari en vez de la app).
        setMode("confirm");
        setPassword("");
        setPasswordConfirm("");
        setCode("");
        setMsg({ type: "ok", text: "Te enviamos un código de 6 dígitos a tu email." });
      }
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    // Web / dev: flujo OAuth por navegador (fallback).
    if (!window.Capacitor?.isNativePlatform()) {
      await supabase.auth.signInWithOAuth({
        provider: "google",
        options: { redirectTo: window.location.origin },
      });
      return;
    }
    // iOS nativo: login nativo de Google → idToken → Supabase (sin abrir navegador
    // ni mostrar la URL de Supabase).
    try {
      if (!GOOGLE_IOS_CLIENT_ID) {
        setMsg({ type: "error", text: "Falta configurar Google (VITE_GOOGLE_IOS_CLIENT_ID)." });
        return;
      }
      if (!googleInitialized) {
        await SocialLogin.initialize({
          google: { iOSClientId: GOOGLE_IOS_CLIENT_ID, webClientId: GOOGLE_WEB_CLIENT_ID },
        });
        googleInitialized = true;
      }
      const res = await SocialLogin.login({
        provider: "google",
        options: { scopes: ["email", "profile"] },
      });
      const idToken = res?.result?.idToken;
      if (!idToken) {
        setMsg({ type: "error", text: "No se pudo obtener el token de Google." });
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({ provider: "google", token: idToken });
      if (error) setMsg({ type: "error", text: error.message });
      // Si todo OK, onAuthStateChange entra a la app.
    } catch (e) {
      // Si el usuario cancela el diálogo nativo, no mostramos error.
      const m = e?.message || "";
      if (m && !/cancel/i.test(m)) setMsg({ type: "error", text: m });
    }
  };

  const handleApple = async () => {
    // Web / dev: flujo OAuth por navegador (requiere config OAuth de Apple; en dev normalmente no se usa).
    if (!window.Capacitor?.isNativePlatform()) {
      await supabase.auth.signInWithOAuth({
        provider: "apple",
        options: { redirectTo: window.location.origin },
      });
      return;
    }
    // iOS nativo: Sign in with Apple → identityToken → Supabase (sin navegador).
    try {
      if (!appleInitialized) {
        await SocialLogin.initialize({ apple: {} });
        appleInitialized = true;
      }
      const res = await SocialLogin.login({
        provider: "apple",
        options: { scopes: ["name", "email"] },
      });
      const idToken = res?.result?.idToken;
      if (!idToken) {
        setMsg({ type: "error", text: "No se pudo obtener el token de Apple." });
        return;
      }
      const { error } = await supabase.auth.signInWithIdToken({ provider: "apple", token: idToken });
      if (error) setMsg({ type: "error", text: error.message });
      // Si todo OK, onAuthStateChange entra a la app.
    } catch (e) {
      // Si el usuario cierra/cancela la hoja nativa, no mostramos error.
      // Apple reporta la cancelación como "AuthorizationError error 1001" (sin la palabra "cancel").
      const m = e?.message || "";
      const code = String(e?.code ?? "");
      const cancelado = /cancel/i.test(m) || /\b1001\b/.test(m) || code === "1001";
      if (m && !cancelado) setMsg({ type: "error", text: m });
    }
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 flex items-center justify-center px-4">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-violet-200 dark:shadow-none mx-auto mb-4">💊</div>
          <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
          <p className="text-sm text-gray-400">Tu control de medicamentos diario</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6">
          {(mode === "login" || mode === "register") && (
            <div className="flex bg-gray-100 dark:bg-gray-700 rounded-xl p-1 mb-5">
              <button onClick={() => switchMode("login")} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "login" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Entrar</button>
              <button onClick={() => switchMode("register")} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-all ${mode === "register" ? "bg-white text-gray-800 shadow-sm" : "text-gray-400"}`}>Registrarse</button>
            </div>
          )}
          {mode === "forgot" && (
            <div className="mb-5">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Recuperar contraseña</h2>
              <p className="text-xs text-gray-500">Ingresa tu email y te enviaremos un código para restablecerla.</p>
            </div>
          )}
          {mode === "reset" && (
            <div className="mb-5">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Nueva contraseña</h2>
              <p className="text-xs text-gray-500">Escribe el código que enviamos a <span className="font-bold text-gray-700 dark:text-gray-300">{email}</span> y tu nueva contraseña.</p>
            </div>
          )}
          {mode === "confirm" && (
            <div className="mb-5">
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-1">Confirma tu cuenta</h2>
              <p className="text-xs text-gray-500">Escribe el código de 6 dígitos que enviamos a <span className="font-bold text-gray-700 dark:text-gray-300">{email}</span>.</p>
            </div>
          )}
          <div className="space-y-3 mb-4">
            {mode !== "reset" && mode !== "confirm" && (
              <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="Email" className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
            )}
            {(mode === "reset" || mode === "confirm") && (
              <input
                value={code}
                onChange={e => setCode(e.target.value.replace(/\D/g, "").slice(0, 10))}
                inputMode="numeric"
                autoComplete="one-time-code"
                placeholder="Código"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-center text-lg font-bold tracking-[0.4em] placeholder:tracking-normal placeholder:font-normal placeholder:text-base focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300"
              />
            )}
            {(mode === "login" || mode === "register" || mode === "reset") && (
              <div className="relative">
                <input
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  type={showPassword ? "text" : "password"}
                  placeholder={mode === "reset" ? "Nueva contraseña" : "Contraseña"}
                  className="w-full pr-11 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(s => !s)}
                  aria-label={showPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-gray-600 dark:text-gray-300"
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                    </svg>
                  )}
                </button>
              </div>
            )}
            {(mode === "register" || mode === "reset") && (
              <input
                value={passwordConfirm}
                onChange={e => setPasswordConfirm(e.target.value)}
                type={showPassword ? "text" : "password"}
                placeholder="Confirmar contraseña"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300"
              />
            )}
            {mode === "register" && (
              <label className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={e => setAcceptedTerms(e.target.checked)}
                  className="mt-0.5 w-4 h-4 accent-violet-500 flex-shrink-0"
                />
                <span>
                  Acepto la{" "}
                  <a href={PRIVACY_URL} onClick={linkDoc("privacidad")} target="_blank" rel="noreferrer" className="font-bold text-violet-600 hover:text-violet-700 underline">Política de Privacidad</a>
                  {" "}y los{" "}
                  <a href={TERMS_URL} onClick={linkDoc("terminos")} target="_blank" rel="noreferrer" className="font-bold text-violet-600 hover:text-violet-700 underline">Términos de Uso</a>.
                </span>
              </label>
            )}
            {mode === "login" && (
              <button type="button" onClick={() => switchMode("forgot")} className="block text-xs font-bold text-violet-600 hover:text-violet-700 text-right w-full">
                ¿Olvidaste tu contraseña?
              </button>
            )}
            {mode === "reset" && (
              <button type="button" onClick={handleForgotPassword} disabled={loading} className="block text-xs font-bold text-violet-600 hover:text-violet-700 text-right w-full">
                Reenviar código
              </button>
            )}
            {mode === "confirm" && (
              <button type="button" onClick={handleResendSignup} disabled={loading} className="block text-xs font-bold text-violet-600 hover:text-violet-700 text-right w-full">
                Reenviar código
              </button>
            )}
          </div>
          {msg && (
            <div className={`text-xs font-medium px-3 py-2 rounded-xl mb-3 ${msg.type === "error" ? "bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-300" : "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-300"}`}>
              {msg.text}
            </div>
          )}
          <button onClick={handleEmail} disabled={loading} className="w-full bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold py-3 rounded-xl shadow-lg shadow-violet-200 dark:shadow-none transition-all mb-3" style={{ fontWeight: 800 }}>
            {loading ? "..." : mode === "login" ? "Entrar" : mode === "register" ? "Crear cuenta" : mode === "forgot" ? "Enviar código" : mode === "confirm" ? "Confirmar cuenta" : "Cambiar contraseña"}
          </button>
          {(mode === "forgot" || mode === "reset" || mode === "confirm") && (
            <button type="button" onClick={() => switchMode("login")} className="w-full text-xs font-bold text-gray-500 hover:text-gray-700 dark:text-gray-200 mb-3">
              ← Volver al inicio de sesión
            </button>
          )}
          {(mode === "login" || mode === "register") && (
            <>
          <div className="flex items-center gap-3 mb-3">
            <div className="flex-1 h-px bg-gray-200" />
            <span className="text-xs text-gray-400">o</span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>
          <button onClick={handleApple} className="w-full flex items-center justify-center gap-2 bg-black text-white font-bold py-3 rounded-xl hover:bg-gray-900 transition-all text-sm mb-2">
            <svg width="16" height="16" viewBox="0 0 384 512" fill="currentColor"><path d="M318.7 268.7c-.2-36.7 16.4-64.4 50-84.8-18.8-26.9-47.2-41.7-84.7-44.6-35.5-2.8-74.3 20.7-88.5 20.7-15 0-49.4-19.7-76.4-19.7C63.3 141.2 4 184.8 4 273.5q0 39.3 14.4 81.2c12.8 36.7 59 126.7 107.2 125.2 25.2-.6 43-17.9 75.8-17.9 31.8 0 48.3 17.9 76.4 17.9 48.6-.7 90.4-82.5 102.6-119.3-65.2-30.7-61.7-90-61.7-91.9zm-56.6-164.2c27.3-32.4 24.8-61.9 24-72.5-24.1 1.4-52 16.4-67.9 34.9-17.5 19.8-27.8 44.3-25.6 71.9 26.1 2 49.9-11.4 69.5-34.3z" /></svg>
            Continuar con Apple
          </button>
          <button onClick={handleGoogle} className="w-full flex items-center justify-center gap-2 bg-white border border-gray-200 text-gray-700 font-bold py-3 rounded-xl hover:bg-gray-50 transition-all text-sm">
            <svg width="18" height="18" viewBox="0 0 48 48"><path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 33.1 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 20-8 20-20 0-1.3-.1-2.7-.4-4z" /><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 15.1 18.9 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" /><path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.4 35.6 26.8 36 24 36c-5.2 0-9.6-2.9-11.3-7.1l-6.5 5C9.6 39.6 16.3 44 24 44z" /><path fill="#1976D2" d="M43.6 20H24v8h11.3c-.9 2.4-2.5 4.4-4.6 5.8l6.2 5.2C40.8 35.5 44 30.2 44 24c0-1.3-.1-2.7-.4-4z" /></svg>
            Continuar con Google
          </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
