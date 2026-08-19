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


// ─────────────────────────────────────────────────────────────
// Convertir una sesión anónima en una cuenta de verdad
// ─────────────────────────────────────────────────────────────
// Es el momento más delicado del modelo sin muros. Se hace VINCULANDO un correo al usuario
// anónimo que ya existe (`updateUser({email})`), NO creando una cuenta nueva: así el id de usuario
// no cambia y los datos siguen siendo suyos. Si alguien "arregla" esto creando una cuenta y
// migrando filas, el usuario pierde todo justo en el momento en que paga.

// Clasifica por qué falló vincular el correo. La distinción que importa no es técnica sino de qué
// se le dice a la persona: hay un caso —el correo ya tiene cuenta— en el que NO se puede seguir
// sin perder datos, y callarlo sería lo peor que puede hacer esta pantalla.
export const clasificarFalloConversion = (error) => {
  const code = error?.code || error?.error_code || "";
  const status = Number(error?.status || 0);
  const msg = String(error?.message || "");

  // El correo ya pertenece a otra cuenta. Vincularlo fundiría dos identidades, así que Supabase
  // lo rechaza — y hace bien. Aquí NO se puede continuar solo: hay que decírselo.
  if (code === "email_exists" || code === "user_already_exists" || /already (been )?registered|already exists/i.test(msg))
    return { tipo: "correo-en-uso", reintentable: false,
             mensaje: "Ese correo ya tiene una cuenta. Usa otro, o entra con esa cuenta desde Ajustes." };

  // Con Apple o Google, el equivalente: ese Apple ID / cuenta de Google ya está en otra cuenta de
  // la app. Mismo peligro y misma respuesta — no se puede unir sin decidir con cuál se queda.
  if (code === "identity_already_exists" || /identity is already linked|already linked to/i.test(msg))
    return { tipo: "identidad-en-uso", reintentable: false,
             mensaje: "Esa cuenta de Apple o Google ya está en uso. Usa otra, o entra con ella desde Ajustes." };

  if (code === "validation_failed" || /invalid.*email|email.*invalid/i.test(msg))
    return { tipo: "correo-invalido", reintentable: false, mensaje: "Revisa el correo, parece que tiene un error." };

  // El enlazado manual apagado en el dashboard. Es configuración, no algo del usuario.
  if (code === "manual_linking_disabled")
    return { tipo: "config", reintentable: false,
             mensaje: "No se puede crear la cuenta ahora mismo. Escríbenos y lo resolvemos." };

  if (status === 429 || code === "over_email_send_rate_limit" || /rate limit/i.test(msg))
    return { tipo: "limite", reintentable: true, mensaje: "Demasiados intentos. Espera un minuto y vuelve a probar." };

  if (!status || error?.name === "AuthRetryableFetchError" || /fetch|network|failed to fetch/i.test(msg))
    return { tipo: "sin-red", reintentable: true, mensaje: "Sin conexión. Revisa tu internet y vuelve a intentarlo." };

  return { tipo: "desconocido", reintentable: true, mensaje: "No se pudo crear la cuenta. Inténtalo otra vez." };
};

// El aviso que quita el miedo a empezar de cero. Es cierto técnicamente —la identidad se une al
// usuario que ya existe, no se migra nada— y por eso se puede prometer sin letra pequeña.
export const textoDatosASalvo = (cuantosMedicamentos) => {
  const cola = "No pierdes nada: la cuenta se une a lo que ya tienes.";
  if (!cuantosMedicamentos) return cola;
  // "Tus 1 medicamento" no se dice en español; con uno va en singular y sin número.
  if (cuantosMedicamentos === 1) return `Tu medicamento ya está guardado. ${cola}`;
  return `Tus ${cuantosMedicamentos} medicamentos ya están guardados. ${cola}`;
};
