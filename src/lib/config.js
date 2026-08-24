// Configuración, entorno y documentos legales.

// Interruptor maestro de las suscripciones. Mientras está en false, el paywall NO
// bloquea a nadie (las testers siguen usando la app libre). Se pone en true cuando
// RevenueCat + los productos estén configurados y probados en Sandbox.
export const SUBSCRIPTIONS_ENABLED = true;

// Interruptor de la SESIÓN ANÓNIMA (entrar sin registro). Mientras está en false la app arranca
// como siempre, con la pantalla de acceso: nada cambia para nadie. Se enciende cuando el resto
// del modelo sin muros esté construido, porque encenderlo solo no sirve de nada — hoy el paywall
// duro sigue justo detrás del login y un usuario anónimo chocaría con él igual.
//
// Requiere DOS interruptores en el dashboard de Supabase (Authentication → Providers), ya
// activados en dev y prod el 2026-08-18:
//   · "Anonymous sign-ins" — para poder crear la sesión.
//   · "Manual linking"     — para poder CONVERTIRLA en cuenta al comprar. Sin este, el usuario
//                            entraría sin registro pero nunca podría pagar sin perder sus datos.
export const ANON_SESSION_ENABLED = false;

// URLs legales (GitHub Pages). Se enlazan desde el registro y el paywall
// (Apple 3.1.2 exige enlazar Términos y Privacidad en el paywall).
export const TERMS_URL = "https://ailablearning-dot.github.io/mi-pastillero/terminos.html";
export const PRIVACY_URL = "https://ailablearning-dot.github.io/mi-pastillero/privacidad.html";
export const SUPPORT_URL = "https://ailablearning-dot.github.io/mi-pastillero/soporte.html";

// Documentos legales / de ayuda. En NATIVO se abren desde el propio bundle (public/legal/*.html,
// copiados por Vite): cargan siempre, al instante y hasta sin conexión. Antes se abrían por red
// (GitHub Pages) y en datos móviles se quedaban EN BLANCO hasta morir con "el servidor no
// responde" —reproducido en device: 26 s de pantalla vacía—, tanto desde la app como pegando la
// URL a mano en el navegador; en Wi-Fi cargaban al instante. La causa está en la ruta del
// operador hacia GitHub Pages, así que la única forma de garantizarlo es no depender de la red.
// Las URLs públicas se conservan: son las de la ficha de App Store Connect y las que usa la web.
export const LEGAL_DOCS = {
  soporte:    { file: "legal/soporte.html",    title: "Ayuda y soporte",        url: SUPPORT_URL },
  terminos:   { file: "legal/terminos.html",   title: "Términos de uso",        url: TERMS_URL },
  privacidad: { file: "legal/privacidad.html", title: "Política de privacidad", url: PRIVACY_URL },
};

// Visor a pantalla completa con el documento local. Se construye sobre el DOM (no en React) para
// poder llamarlo desde cualquier pantalla —Ajustes, registro, paywall— sin pasar props por todas.
export const openDoc = (kind) => {
  const doc = LEGAL_DOCS[kind];
  if (!doc) return;
  if (!window.Capacitor?.isNativePlatform()) { window.open(doc.url, "_blank", "noopener"); return; } // web: pestaña nueva
  if (document.getElementById("legal-viewer")) return; // ya está abierto
  const wrap = document.createElement("div");
  wrap.id = "legal-viewer";
  wrap.className = "fixed inset-0 flex flex-col bg-white dark:bg-gray-900";
  wrap.style.zIndex = "100";
  const bar = document.createElement("div");
  bar.className = "flex items-center justify-between px-4 pb-3 border-b border-gray-100 dark:border-gray-800";
  bar.style.paddingTop = "calc(env(safe-area-inset-top, 0px) + 12px)";
  const title = document.createElement("span");
  title.className = "text-sm font-bold text-gray-800 dark:text-gray-100";
  title.textContent = doc.title;
  const close = document.createElement("button");
  close.className = "text-sm font-bold text-violet-600";
  close.textContent = "Listo";
  close.onclick = () => wrap.remove();
  const frame = document.createElement("iframe");
  frame.src = doc.file;
  frame.title = doc.title;
  frame.className = "w-full";
  frame.style.cssText = "flex:1;border:0;padding-bottom:env(safe-area-inset-bottom, 0px)";
  bar.append(title, close);
  wrap.append(bar, frame);
  document.body.append(wrap);
};

// Para los <a>: en nativo interceptamos el enlace (el href se conserva para la web y por a11y).
export const linkDoc = (kind) => (e) => {
  if (window.Capacitor?.isNativePlatform()) { e.preventDefault(); openDoc(kind); }
};

// Correo de contacto y versión visible (se muestran en Ajustes). Subir APP_VERSION
// a mano cuando cambie MARKETING_VERSION en Xcode.
export const CONTACT_EMAIL = "soporte@pastillero.jimbera.com";
export const APP_VERSION = "1.1.0";

export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
export const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_KEY;

// Referencia del proyecto de PRODUCCIÓN. Sirve para una sola cosa: saber si esta compilación
// apunta a otro sitio.
//
// El riesgo real que cubre es publicar en la tienda una compilación que apunte a DEV. No daría
// ningún error —la app funcionaría perfecta— pero los usuarios entrarían a una base vacía y
// pensarían que perdieron todos sus medicamentos. Es un fallo silencioso y caro, así que el
// entorno se hace VISIBLE en Ajustes en cuanto no es producción.
const PROD_REF = "kbsxjdtdleauzvbtbrqi";
export const ES_PROD = String(SUPABASE_URL || "").includes(PROD_REF);
// Etiqueta corta para el pie de Ajustes. Vacía en producción: ahí no debe verse nada.
export const ENTORNO_LABEL = ES_PROD ? "" : "DEV";

// Client IDs de Google OAuth (públicos, no secretos). Se configuran en .env cuando
// se creen las credenciales en Google Cloud Console. Solo se usan en iOS nativo.
export const GOOGLE_IOS_CLIENT_ID = import.meta.env.VITE_GOOGLE_IOS_CLIENT_ID;
export const GOOGLE_WEB_CLIENT_ID = import.meta.env.VITE_GOOGLE_WEB_CLIENT_ID;
