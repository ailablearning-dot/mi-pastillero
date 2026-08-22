// Reglas sobre la SESIÓN del usuario. Puras: sin red, sin Supabase, sin React.
//
// Viven aquí y no en `lib/` porque son decisiones, no efectos: qué significa cada fallo y qué se
// hace con él. Los efectos (llamar a Supabase) están en src/lib/anonAuth.js.

// ¿Esta sesión es de alguien que aún no ha creado cuenta?
export const esAnonimo = (session) => session?.user?.is_anonymous === true;

// ¿Ya es una cuenta de verdad, con la que podría volver a entrar desde otro teléfono?
export const esPermanente = (session) => !!session?.user && session.user.is_anonymous !== true;

// ¿Son la MISMA identidad, a efectos de la app?
//
// No basta con comparar el id de usuario. Al vincular una cuenta a una sesión anónima el id es el
// mismo A PROPÓSITO —de eso va todo el modelo— pero el usuario pasa de anónimo a permanente y
// gana un correo. Un guard que solo mire el id descarta esa sesión nueva por "no ha cambiado
// nada", y la app se queda creyendo que sigue siendo anónima hasta que se reinicia: el aviso de
// "termina de crear tu cuenta" se queda puesto después de haberla creado. Visto en device.
//
// Se comparan las tres cosas de las que depende lo que se le enseña: quién es, si ya tiene cuenta
// y con qué correo. Un refresco normal de token no cambia ninguna, así que se sigue evitando el
// re-render inútil que causaba el "doble refresco" del home.
export const mismaIdentidad = (a, b) =>
  a?.user?.id === b?.user?.id &&
  esAnonimo(a) === esAnonimo(b) &&
  (a?.user?.email || "") === (b?.user?.email || "");

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

// La pista técnica que se enseña en pequeño cuando no sabemos qué pasó. Corta, y SIN el mensaje
// del servidor: ese puede llevar el correo de la persona dentro y no tiene por qué acabar en una
// captura de pantalla. Solo el código, el nombre del error o el status.
const pista = (error) => {
  const code = error?.code || error?.error_code || "";
  if (code) return String(code);
  if (error?.name) return String(error.name);
  const status = Number(error?.status);
  return Number.isFinite(status) && status > 0 ? `status ${status}` : "sin código";
};

// Clasifica por qué falló vincular el correo. La distinción que importa no es técnica sino de qué
// se le dice a la persona: hay un caso —el correo ya tiene cuenta— en el que NO se puede seguir
// sin perder datos, y callarlo sería lo peor que puede hacer esta pantalla.
export const clasificarFalloConversion = (error) => {
  const code = error?.code || error?.error_code || "";
  // SIN `|| 0`: hace falta distinguir "status 0" (la petición salió y no volvió nada → es red) de
  // "no hay status" (NaN → no sabemos qué fue). Ese `|| 0` los igualaba, y por eso cualquier error
  // sin código HTTP se anunciaba como falta de internet.
  const status = Number(error?.status);
  const msg = String(error?.message || "");

  // El correo ya pertenece a otra cuenta. Vincularlo fundiría dos identidades, así que Supabase
  // lo rechaza — y hace bien. Aquí NO se puede continuar solo: hay que decírselo.
  if (code === "email_exists" || code === "user_already_exists" || /already (been )?registered|already exists/i.test(msg))
    return { tipo: "correo-en-uso", reintentable: false,
             mensaje: "Ese correo ya tiene una cuenta. Usa otro, o toca \"Ya tengo cuenta\" para entrar con ella." };

  // Con Apple o Google, el equivalente: ese Apple ID / cuenta de Google ya está en otra cuenta de
  // la app. Mismo peligro y misma respuesta — no se puede unir sin decidir con cuál se queda.
  if (code === "identity_already_exists" || /identity is already linked|already linked to/i.test(msg))
    return { tipo: "identidad-en-uso", reintentable: false,
             mensaje: "Esa cuenta de Apple o Google ya está en uso. Usa otra, o toca \"Ya tengo cuenta\" para entrar con ella." };

  if (code === "validation_failed" || /invalid.*email|email.*invalid/i.test(msg))
    return { tipo: "correo-invalido", reintentable: false, mensaje: "Revisa el correo, parece que tiene un error." };

  // El enlazado manual apagado en el dashboard. Es configuración, no algo del usuario.
  if (code === "manual_linking_disabled")
    return { tipo: "config", reintentable: false,
             mensaje: "No se puede crear la cuenta ahora mismo. Escríbenos y lo resolvemos." };

  if (status === 429 || code === "over_email_send_rate_limit" || /rate limit/i.test(msg))
    return { tipo: "limite", reintentable: true, mensaje: "Demasiados intentos. Espera un minuto y vuelve a probar." };

  // Sin conexión SOLO con evidencia de que la petición no llegó: `status: 0` (salió y no volvió
  // nada), el error envuelto de la librería, o un fallo explícito de fetch.
  //
  // ⚠️ Antes esta línea empezaba por `!status`, y eso convertía en "revisa tu internet" CUALQUIER
  // error que no trajera código HTTP. Se vio en device con wifi y señal completas: el vínculo con
  // Apple falló por otra causa y la app mandó a revisar la conexión. Mentir así no solo confunde a
  // quien lo lee — tapa el error real y hace imposible diagnosticarlo.
  if (status === 0 || error?.name === "AuthRetryableFetchError" || /fetch|network|failed to fetch/i.test(msg))
    return { tipo: "sin-red", reintentable: true, mensaje: "Sin conexión. Revisa tu internet y vuelve a intentarlo.",
             detalle: pista(error) };

  // Lo que no se reconoce se dice como lo que es, y se acompaña de la pista técnica: es la única
  // forma de diagnosticar un fallo que solo pasa en el device, sin un Mac enchufado.
  return { tipo: "desconocido", reintentable: true, mensaje: "No se pudo crear la cuenta. Inténtalo otra vez.",
           detalle: pista(error) };
};

// Cómo se dice, en la propia app, con qué cuenta estás dentro.
//
// Existe porque faltaba: la app nunca decía que tenías cuenta ni cuál. Visto en device — "ya no veo
// la opción de crear cuenta, ¿eso ya no se necesita?" y "me aparece eliminar cuenta cuando aún no la
// he creado". Las dos cosas eran correctas (tenía cuenta, creada por él con Apple un rato antes),
// pero sin nada en pantalla que lo dijera, la conclusión razonable era que no la tenía.
//
// ⚠️ CUENTA Y PLAN NO SON LO MISMO, y confundirlos es lo que provoca esa duda: la cuenta es QUIÉN
// ERES y el plan es QUÉ PAGASTE. Se puede tener cuenta y estar en el plan gratis — de hecho es lo
// normal en este modelo, donde la cuenta solo sirve para que los datos sobrevivan a un teléfono
// nuevo. Este texto habla de la cuenta y NUNCA menciona el plan.
export const comoEntraste = (session) => {
  if (!session?.user || session.user.is_anonymous === true) return null;
  const email = String(session.user.email || "").trim();
  const p = session.user.app_metadata?.provider
         || session.user.identities?.[0]?.provider
         || "";
  const via = { apple: "Apple", google: "Google", email: "tu correo" }[p] || null;
  return { email: email || null, via };
};
