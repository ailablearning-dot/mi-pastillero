// Reglas sobre la SESIÓN del usuario. Puras: sin red, sin Supabase, sin React.
//
// Viven aquí y no en `lib/` porque son decisiones, no efectos: qué significa cada fallo y qué se
// hace con él. Los efectos (llamar a Supabase) están en src/lib/anonAuth.js.

// ¿Esta sesión es de alguien que aún no ha creado cuenta?
export const esAnonimo = (session) => session?.user?.is_anonymous === true;

// ¿Ya es una cuenta de verdad, con la que podría volver a entrar desde otro teléfono?
export const esPermanente = (session) => !!session?.user && session.user.is_anonymous !== true;

// Clasifica por qué falló crear la sesión anónima.
//
// La distinción que importa es entre "esto se arregla reintentando" y "esto no se arregla solo".
// Un fallo de configuración reintentado mil veces sigue fallando; si se trata como un problema de
// red se queda en silencio para siempre, que es justo como se pierden días de depuración.
export const clasificarFalloAnon = (error) => {
  const code = error?.code || error?.error_code || "";
  const status = Number(error?.status || 0);
  const msg = String(error?.message || "");

  // No está activado en el dashboard. NO es reintentable: hay que tocar un interruptor.
  if (code === "anonymous_provider_disabled" || /anonymous sign-ins are disabled/i.test(msg))
    return { tipo: "config", reintentable: false,
             mensaje: "El inicio de sesión anónimo está desactivado en Supabase (Authentication → Providers)." };

  // Supabase limita a 30 por hora y por IP. Se reintenta, pero con calma.
  if (status === 429 || code === "over_request_rate_limit")
    return { tipo: "limite", reintentable: true,
             mensaje: "Demasiados intentos. Se reintentará más tarde." };

  // Sin red: `status: 0`, o el error envuelto de la librería, o un fallo de fetch.
  if (!status || error?.name === "AuthRetryableFetchError" || /fetch|network|failed to fetch/i.test(msg))
    return { tipo: "sin-red", reintentable: true,
             mensaje: "Sin conexión al crear la sesión. Se reintentará." };

  // 5xx y 4xx raros: reintentables, pero se registran para poder verlos.
  return { tipo: "desconocido", reintentable: true, mensaje: msg || "Fallo desconocido al crear la sesión." };
};
