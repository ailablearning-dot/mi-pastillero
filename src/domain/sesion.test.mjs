// Pruebas de domain/sesion.js. Sin framework:
//   node src/domain/sesion.test.mjs
//
// Lo que se prueba de verdad aquí es la clasificación de fallos, y no es cosmética: decide si la
// app REINTENTA en silencio o si grita. Confundir "no está activado en el dashboard" con "no hay
// red" hace que un error de configuración se reintente para siempre sin que nadie se entere.

import { esAnonimo, esPermanente, clasificarFalloAnon, clasificarFalloConversion, textoDatosASalvo } from "./sesion.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(52)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

console.log("── quién es anónimo y quién no ──");
eq("anónimo",                 esAnonimo({ user: { is_anonymous: true } }), true);
eq("permanente no es anónimo",esAnonimo({ user: { is_anonymous: false } }), false);
// Una sesión vieja, de antes de que existiera lo anónimo, NO trae el campo. Tratarla como
// anónima le quitaría a un usuario de pago su cuenta de verdad, así que ausente = permanente.
eq("sin el campo = NO anónimo (sesiones viejas)", esAnonimo({ user: {} }), false);
eq("sin sesión no revienta",  esAnonimo(null), false);
eq("permanente",              esPermanente({ user: { is_anonymous: false } }), true);
eq("permanente sin el campo", esPermanente({ user: { id: "x" } }), true);
eq("anónimo NO es permanente",esPermanente({ user: { is_anonymous: true } }), false);
eq("sin sesión no es permanente", esPermanente(null), false);
eq("los dos no pueden ser ciertos a la vez",
   [esAnonimo({ user: { is_anonymous: true } }), esPermanente({ user: { is_anonymous: true } })], [true, false]);

console.log("\n── el fallo que NO se puede reintentar: falta el interruptor ──");
// Éste es el caso que motiva toda la función. Es exactamente el error que devolvió dev antes de
// activarlo, copiado tal cual de la respuesta real.
const desactivado = { code: "anonymous_provider_disabled", status: 422, message: "Anonymous sign-ins are disabled" };
eq("se reconoce por el código",  clasificarFalloAnon(desactivado).tipo, "config");
eq("y NO se reintenta",          clasificarFalloAnon(desactivado).reintentable, false);
eq("también se reconoce solo por el mensaje",
   clasificarFalloAnon({ message: "Anonymous sign-ins are disabled", status: 422 }).tipo, "config");

console.log("\n── los fallos que SÍ se reintentan ──");
eq("sin red (status 0)",      clasificarFalloAnon({ status: 0, message: "Failed to fetch" }).tipo, "sin-red");
eq("el error envuelto de la librería",
   clasificarFalloAnon({ name: "AuthRetryableFetchError", message: "" }).tipo, "sin-red");
eq("un error sin status ninguno", clasificarFalloAnon({ message: "network error" }).tipo, "sin-red");
eq("sin red es reintentable", clasificarFalloAnon({ status: 0 }).reintentable, true);

eq("límite de peticiones (429)", clasificarFalloAnon({ status: 429 }).tipo, "limite");
eq("límite por código",          clasificarFalloAnon({ code: "over_request_rate_limit", status: 429 }).tipo, "limite");
eq("el límite sí se reintenta",  clasificarFalloAnon({ status: 429 }).reintentable, true);

eq("un 500 del servidor",     clasificarFalloAnon({ status: 500, message: "boom" }).tipo, "desconocido");
eq("y se reintenta",          clasificarFalloAnon({ status: 500 }).reintentable, true);
eq("un 4xx raro también",     clasificarFalloAnon({ status: 418, message: "?" }).reintentable, true);

console.log("\n── bordes ──");
eq("sin error no revienta",   clasificarFalloAnon(null).reintentable, true);
eq("todos traen mensaje",
   ["config","limite","sin-red","desconocido"].every(t =>
     [desactivado, { status: 429 }, { status: 0 }, { status: 500, message: "x" }]
       .some(e => clasificarFalloAnon(e).tipo === t && clasificarFalloAnon(e).mensaje.length > 0)), true);
// El de configuración es el ÚNICO no reintentable: si algún día deja de serlo, el arranque
// entraría en un bucle infinito contra un interruptor apagado.
eq("solo 'config' es no-reintentable",
   [{ status: 0 }, { status: 429 }, { status: 500 }, desactivado].map(e => clasificarFalloAnon(e).reintentable),
   [true, true, true, false]);

console.log("\n── convertir la sesión anónima en cuenta ──");
// El caso que NO se puede callar: si el correo ya tiene cuenta, vincularlo fundiría dos
// identidades. Supabase lo rechaza y hace bien; lo peligroso sería "arreglarlo" creando una
// cuenta nueva, porque ahí el usuario pierde todo justo en el momento en que paga.
const enUso = { code: "email_exists", status: 422, message: "A user with this email address has already been registered" };
eq("correo ya registrado se detecta",     clasificarFalloConversion(enUso).tipo, "correo-en-uso");
eq("y NO se reintenta a ciegas",          clasificarFalloConversion(enUso).reintentable, false);
eq("también por el mensaje solo",
   clasificarFalloConversion({ message: "User already registered", status: 422 }).tipo, "correo-en-uso");
eq("el mensaje propone una salida",       clasificarFalloConversion(enUso).mensaje.includes("Usa otro"), true);

// El equivalente con Apple/Google: ese Apple ID ya está en otra cuenta. Mismo peligro que el
// correo repetido, y tampoco se puede "arreglar" por debajo.
const idEnUso = { code: "identity_already_exists", status: 422, message: "Identity is already linked to another user" };
eq("identidad de Apple/Google ya en uso", clasificarFalloConversion(idEnUso).tipo, "identidad-en-uso");
eq("y tampoco se reintenta",              clasificarFalloConversion(idEnUso).reintentable, false);
eq("correo mal escrito",  clasificarFalloConversion({ code: "validation_failed", message: "Unable to validate email address: invalid format" }).tipo, "correo-invalido");
eq("enlazado manual apagado", clasificarFalloConversion({ code: "manual_linking_disabled", status: 422 }).tipo, "config");
eq("límite de envíos",    clasificarFalloConversion({ status: 429 }).tipo, "limite");
eq("y ese sí se reintenta", clasificarFalloConversion({ status: 429 }).reintentable, true);
eq("sin red",             clasificarFalloConversion({ status: 0 }).tipo, "sin-red");
eq("un 500 es reintentable", clasificarFalloConversion({ status: 500, message: "boom" }).reintentable, true);
// Los tres no-reintentables son los que dependen de que la persona cambie algo (o de una
// configuración): insistir con el mismo correo no arregla ninguno.
eq("solo tres NO se reintentan",
   ["correo-en-uso","correo-invalido","config"].map(t => [enUso, { code: "validation_failed" }, { code: "manual_linking_disabled" }]
     .map(e => clasificarFalloConversion(e).reintentable)).flat().slice(0,3), [false,false,false]);

console.log("\n── el aviso que quita el miedo a empezar de cero ──");
eq("con varios medicamentos", textoDatosASalvo(3), "Tus 3 medicamentos ya están guardados. No pierdes nada: la cuenta se une a lo que ya tienes.");
eq("con uno, en singular y sin número", textoDatosASalvo(1), "Tu medicamento ya está guardado. No pierdes nada: la cuenta se une a lo que ya tienes.");
eq("sin ninguno no inventa",  textoDatosASalvo(0), "No pierdes nada: la cuenta se une a lo que ya tienes.");

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
