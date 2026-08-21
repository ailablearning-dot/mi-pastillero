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
import { tokenDeApple, tokenDeGoogle } from "./socialLogin";

export { esAnonimo, esPermanente } from "../domain/sesion.js";

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
    // Mismo motivo que en el vinculado social: el `is_anonymous` vive dentro del token y hay que
    // pedir uno nuevo para que la app se entere de que ya no es una sesión anónima.
    await supabase.auth.refreshSession().catch(() => { /* la próxima renovación lo corrige */ });
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

// ── Quien VUELVE: entrar en vez de vincular ──────────────────────────────────────────
//
// Es el flujo estándar, no un invento nuestro. Cuando vincular falla porque esa identidad (o ese
// correo) ya pertenece a otra cuenta, esa cuenta es de ESTA MISMA PERSONA: acaba de autenticarse
// con Apple o Google delante de nosotros. Así que no se enseña un error ni se la manda a buscar
// otro botón — se entra.
//
//   · Supabase, en su guía de anónimos: "Maneja el error (porque el correo pertenece a un usuario
//     existente)" → "Inicia sesión en la cuenta existente" → "Reasigna las entidades ligadas al
//     usuario anónimo".
//   · Firebase dice lo mismo de `credential-already-in-use`: recupérate iniciando sesión con la
//     credencial que viene en el error.
//
// Antes de esto, la app convertía una condición RECUPERABLE en un callejón: "Esa cuenta de Apple o
// Google ya está en uso", y a buscar el enlace de abajo. Visto en device el 2026-08-21.

// Lo que se lleva consigo el anónimo al entrar en su cuenta de siempre.
//
// Se lee ANTES de cambiar de sesión a propósito: con RLS activo, una vez dentro de la otra cuenta
// estas filas ya no son visibles ni actualizables (las políticas son `auth.uid() = user_id`). Por
// eso el paso que Supabase llama "reasignar" aquí es leer-antes y reinsertar-después. Mismo
// resultado y sin clave de servicio.
//
// Solo `pastillas` y `medicamentos`. NO los pacientes: el anónimo trae un "Yo" recién creado y
// duplicarlo en una cuenta que ya tiene el suyo sería empeorar el remedio. Las pastillas se
// reasignan al paciente por defecto del destino.
const leerLoCapturado = async (userId) => {
  try {
    const [pastillas, tomas] = await Promise.all([
      supabase.from("pastillas").select("*").eq("user_id", userId),
      supabase.from("medicamentos").select("*").eq("user_id", userId),
    ]);
    return { pastillas: pastillas.data || [], tomas: tomas.data || [] };
  } catch (e) { return { pastillas: [], tomas: [] }; }
};

// El paciente al que colgar lo que llega. Puede NO EXISTIR todavía, y ahí estaba el fallo: en una
// cuenta recién creada el "Yo" lo da de alta `usePacientes` un instante DESPUÉS de que cambie la
// sesión, y este arrastre corre antes. Como `paciente_id` es NOT NULL, el insert se rechazaba y el
// `catch` se lo comía en silencio: la persona perdía lo que había teclado y nadie se enteraba.
// Reproducido en el navegador el 2026-08-21 entrando con una cuenta de correo recién creada.
//
// Se crea igual que en `usePacientes` —`es_default` + el índice único de la migración 004—, así que
// si las dos carreras coinciden, una pierde y re-lee. Ese hook ya está escrito para eso.
const asegurarPacienteDestino = async (userId) => {
  const { data } = await supabase.from("pacientes").select("id, es_default")
    .eq("user_id", userId).order("es_default", { ascending: false });
  if (data?.length) return data[0].id;
  const { data: nuevo } = await supabase.from("pacientes")
    .insert({ user_id: userId, nombre: "Yo", emoji: "👤", orden: 0, es_default: true }).select().single();
  if (nuevo) return nuevo.id;
  const { data: otra } = await supabase.from("pacientes").select("id").eq("user_id", userId).limit(1);
  return otra?.[0]?.id || null;
};

// Y se reinserta en la cuenta a la que se acaba de entrar.
//
// NUNCA hace fallar la entrada: si esto revienta, la persona ya está dentro de su cuenta con todos
// sus datos de siempre, que es lo que vino a hacer. Perder el medicamento que acababa de teclear es
// malo; dejarla fuera de su propia cuenta por intentar salvarlo sería peor.
const reinsertar = async (capturado, nuevoUserId) => {
  const { pastillas, tomas } = capturado;
  if (!pastillas.length && !tomas.length) return 0;
  try {
    const pacienteDestino = await asegurarPacienteDestino(nuevoUserId);
    if (!pacienteDestino) return 0;   // sin destino no hay dónde colgarlas; mejor no inventar filas

    const limpiar = (fila) => {
      const { id, created_at, ...resto } = fila;   // id nuevo, fecha de alta nueva
      return { ...resto, user_id: nuevoUserId, paciente_id: pacienteDestino };
    };
    if (pastillas.length) await supabase.from("pastillas").insert(pastillas.map(limpiar));
    if (tomas.length)     await supabase.from("medicamentos").insert(tomas.map(limpiar));
    return pastillas.length;
  } catch (e) { return 0; }
};

// Envuelve CUALQUIER forma de entrar —Apple, Google o correo y contraseña— para que lo capturado
// en la sesión anónima viaje a la cuenta a la que se entra.
//
// Existe porque el arreglo se quedó a medias: la conversión desde "Crear mi cuenta" ya se llevaba
// los datos, pero entrar desde la pantalla de acceso NO, y los dos caminos llevan al mismo sitio.
// La app tenía incluso un aviso ámbar advirtiendo de esa pérdida — y un aviso que explica una
// pérdida evitable es una pérdida evitable con buena educación. Se arregló el comportamiento y el
// aviso se borró.
//
// `entrar` es una función que devuelve lo que devuelve supabase-js: { data, error }.
export const entrarConservandoLoCapturado = async (entrar) => {
  const { data: antes } = await supabase.auth.getSession();
  // `is_anonymous` viaja dentro del JWT de la sesión en curso; no hace falta preguntar al servidor.
  const anonId = antes?.session?.user?.is_anonymous ? antes.session.user.id : null;
  const capturado = anonId ? await leerLoCapturado(anonId) : { pastillas: [], tomas: [] };

  const res = await entrar();
  const nuevoId = res?.data?.user?.id || res?.data?.session?.user?.id || null;
  // Si falló, o si entró en la MISMA cuenta (no hubo cambio), no hay nada que mover.
  if (res?.error || !nuevoId || nuevoId === anonId) return { ...(res || {}), traidos: 0 };

  return { ...res, traidos: await reinsertar(capturado, nuevoId) };
};

// Entra en la cuenta que ya existe con la MISMA credencial que se acaba de obtener, y se lleva lo
// capturado. Devuelve `{ ok, entro: true, traidos }` para que la pantalla pueda decir la verdad:
// no creó una cuenta, volvió a la suya.
const entrarConLaMismaCredencial = async (provider, token, userIdAnonimo) => {
  const capturado = userIdAnonimo ? await leerLoCapturado(userIdAnonimo) : { pastillas: [], tomas: [] };
  const { data, error } = await supabase.auth.signInWithIdToken({ provider, token });
  if (error) {
    // ⚠️ El caso a vigilar en device: si Apple/Google marcan su token como de un solo uso, aquí
    // llegaría un token ya gastado por `linkIdentity`. La salida es volver a intentarlo —el
    // siguiente toque pide un token nuevo—, así que se dice eso y no un error técnico.
    return { ok: false, fallo: { tipo: "reintentar", reintentable: true,
             mensaje: "No pudimos entrar a tu cuenta. Vuelve a intentarlo.", detalle: error?.code || error?.name } };
  }
  const traidos = await reinsertar(capturado, data?.user?.id);
  return { ok: true, entro: true, traidos, fallo: null };
};

// ── Vincular con Apple o Google ──────────────────────────────────────────────────────
//
// Es la vía que de verdad usa la gente: 10 de las 16 cuentas actuales entraron con Apple. Y es la
// única que permite exigir la cuenta al comprar sin dejar a nadie fuera, porque no depende de que
// llegue un correo — es un toque con Face ID.
//
// `linkIdentity` con `token` usa el camino de ID token nativo (sin navegador), igual que
// `signInWithIdToken` en el login normal. Vincula al usuario anónimo que YA existe: el id no
// cambia y no se migra ni una fila.
const vincularConToken = async (provider, obtenerToken) => {
  if (!window.Capacitor?.isNativePlatform())
    return { ok: false, fallo: { tipo: "config", reintentable: false, mensaje: "Disponible solo en la app de iPhone." } };
  const { token, motivo } = await obtenerToken();
  // Cancelar no es un fallo que haya que enseñar: la persona cerró el diálogo a propósito.
  if (!token) return { ok: false, cancelado: !motivo, fallo: motivo ? { tipo: "desconocido", reintentable: true, mensaje: motivo } : null };
  // De quién son los datos que quizá haya que llevarse: se guarda ANTES de tocar la sesión.
  const userIdAnonimo = (await supabase.auth.getSession()).data?.session?.user?.id || null;
  try {
    const { error } = await supabase.auth.linkIdentity({ provider, token });
    if (error) {
      const fallo = clasificarFalloConversion(error);
      // La identidad —o el correo— ya pertenece a otra cuenta. Esa cuenta es de esta misma persona:
      // acaba de autenticarse con Apple o Google delante de nosotros. Se ENTRA, no se enseña un
      // error. Ver el bloque "Quien VUELVE" más abajo para el por qué y las fuentes.
      if (fallo.tipo === "identidad-en-uso" || fallo.tipo === "correo-en-uso")
        return await entrarConLaMismaCredencial(provider, token, userIdAnonimo);
      return { ok: false, fallo };
    }
    // ⚠️ IMPRESCINDIBLE. `linkIdentity` vincula la identidad en el SERVIDOR, pero el token que
    // tiene la app en la mano sigue diciendo `is_anonymous: true` — ese dato viaja dentro del JWT
    // y no cambia solo. Sin refrescar, la app sigue creyendo que es un anónimo: el aviso de
    // "termina de crear tu cuenta" se queda puesto para siempre aunque la cuenta ya exista.
    await supabase.auth.refreshSession().catch(() => { /* la próxima renovación lo corrige */ });
    return { ok: true, fallo: null };
  } catch (e) { return { ok: false, fallo: clasificarFalloConversion(e) }; }
};

export const vincularApple  = () => vincularConToken("apple",  tokenDeApple);
export const vincularGoogle = () => vincularConToken("google", tokenDeGoogle);
