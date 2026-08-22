// Pruebas de domain/plan.js. Sin framework:
//   node src/domain/plan.test.mjs
//
// Esto decide qué ve quien no paga. Un fallo por un lado regala la función de pago; por el otro
// le cierra la puerta a alguien que sí pagó. Las dos son caras, así que los bordes van medidos.

import { FUNCIONES, DIAS_HISTORIAL_GRATIS, MOTIVO, BENEFICIO, beneficios, puente, puedeUsar, esPremium, diaVisible, diasEntre, TEXTO_CORTE , debeRestaurarEnSilencio , vuelveDeHaberPagado, tocaPedirLaCuenta } from "./plan.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(52)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

const HOY = "2026-08-19";

console.log("── quién puede usar qué ──");
eq("sin premium, citas NO",            puedeUsar(FUNCIONES.CITAS, false), false);
eq("con premium, citas SÍ",            puedeUsar(FUNCIONES.CITAS, true), true);
eq("sin premium, multipaciente NO",    puedeUsar(FUNCIONES.MULTIPACIENTE, false), false);
eq("sin premium, historial completo NO", puedeUsar(FUNCIONES.HISTORIAL_COMPLETO, false), false);
// La prueba de 7 días llega como hasPremium=true desde RevenueCat, y durante ella se usa todo.
eq("durante la prueba se usa todo",    Object.values(FUNCIONES).every(f => puedeUsar(f, true)), true);
// Una función que no está en el catálogo NO es de pago: por omisión, gratis. Al revés, un despiste
// dejaría de golpe media app bajo llave.
eq("una función desconocida es gratis", puedeUsar("ficha_emergencia", false), true);
eq("y no cuenta como premium",          esPremium("ficha_emergencia"), false);

console.log("\n── todas las funciones tienen su copy ──");
// Sin motivo, el paywall saldría con el encabezado vacío justo en el momento de vender.
eq("cada función tiene título y detalle",
   Object.values(FUNCIONES).every(f => MOTIVO[f]?.titulo && MOTIVO[f]?.detalle), true);
eq("el de citas habla de citas",      MOTIVO[FUNCIONES.CITAS].titulo, "No olvides tus citas");
eq("el del historial dice los días",  MOTIVO[FUNCIONES.HISTORIAL_COMPLETO].detalle.includes("7 días"), true);

console.log("\n── lo que Premium incluye, y en qué orden ──");
// El fallo que esto vigila ya ocurrió: la lista estaba escrita a mano en el paywall, se quedó con
// la del muro duro de la 1.1 y acabó vendiendo como premium algo que hoy es GRATIS. Quien lleva una
// semana usando recordatorios lee eso y deja de creerse el resto de la lista.
const VIEJAS = ["Recordatorios que suenan a tiempo", "Pacientes ilimitados para toda la familia",
                "Reportes en Excel para tu médico", "Historial completo y respaldo en la nube"];
// Y ninguna vuelve a hablar de tener gente "a tu cargo": se leyó como jerarquía en device.
eq("ninguna suena a jerarquía",
   Object.values(BENEFICIO).some(b => /a (tu|su) cargo/i.test(b)), false);
eq("no sobrevive ninguna viñeta del muro viejo",
   Object.values(BENEFICIO).some(b => VIEJAS.includes(b)), false);
// "recordatorio" solo vale hablando de CITAS: avisar de una consulta es de pago, avisar de una
// dosis es gratis y es la mitad de la app.
eq("no se venden los recordatorios de dosis",
   Object.values(BENEFICIO).some(b => /recordatorio/i.test(b) && !/cita/i.test(b)), false);
eq("ni el respaldo en la nube, que también es gratis",
   Object.values(BENEFICIO).some(b => /nube|respaldo/i.test(b)), false);
// Cada función que puede abrir el paywall tiene que aparecer en la lista de lo incluido. Si no,
// alguien toca el candado de citas y en "qué incluye" no ve las citas por ningún lado.
eq("cada puerta cerrada está en la lista",
   [FUNCIONES.CITAS, FUNCIONES.MULTIPACIENTE, FUNCIONES.HISTORIAL_COMPLETO].every(f => BENEFICIO[f]), true);
// El expediente todavía no existe (punto 10/12 del roadmap): prometerlo sería vender humo.
eq("el expediente aún NO se anuncia", !!BENEFICIO[FUNCIONES.EXPEDIENTE], false);

// El orden es el arreglo de fondo: la puerta que se tocó va PRIMERO.
eq("viniendo de citas, citas va primero",
   beneficios(FUNCIONES.CITAS)[0], BENEFICIO[FUNCIONES.CITAS]);
eq("viniendo del avatar, pacientes va primero",
   beneficios(FUNCIONES.MULTIPACIENTE)[0], BENEFICIO[FUNCIONES.MULTIPACIENTE]);
eq("viniendo del historial, historial va primero",
   beneficios(FUNCIONES.HISTORIAL_COMPLETO)[0], BENEFICIO[FUNCIONES.HISTORIAL_COMPLETO]);
// Reordenar no es filtrar: se ve la casa entera, entre por donde entre.
eq("reordena pero no esconde nada",
   beneficios(FUNCIONES.CITAS).length, Object.keys(BENEFICIO).length);
eq("y no repite ninguna",
   new Set(beneficios(FUNCIONES.CITAS)).size, Object.keys(BENEFICIO).length);
// Sin motivo (el paywall del modelo viejo, o abierto desde Ajustes) sigue saliendo la lista entera.
eq("sin puerta, la lista completa igual",
   beneficios(undefined).length, Object.keys(BENEFICIO).length);

console.log("\n── la frase puente ──");
// Es la costura entre el título contextual y la lista. Sin ella el paywall se lee como dos
// pantallas pegadas: arriba habla de citas y abajo, sin transición, de pacientes y reportes.
eq("viniendo de citas, nombra las citas", puente(FUNCIONES.CITAS).includes("citas"), true);
eq("y dice que hay más",                  puente(FUNCIONES.CITAS).includes("mucho más"), true);
eq("cada puerta tiene la suya",
   [FUNCIONES.CITAS, FUNCIONES.MULTIPACIENTE, FUNCIONES.HISTORIAL_COMPLETO]
     .every(f => puente(f).includes("mucho más")), true);
// Y nunca se queda en blanco: sin puerta hay un texto neutro, no un hueco encima de la lista.
eq("sin puerta, no queda hueco",          puente(undefined).length > 0, true);
eq("sin puerta no promete 'más que' nada", puente(undefined).includes("mucho más"), false);

console.log("\n── la ventana del historial gratis ──");
eq("el corte son 7 días",     DIAS_HISTORIAL_GRATIS, 7);
eq("hoy se ve",               diaVisible(HOY, HOY, false), true);
eq("ayer se ve",              diaVisible("2026-08-18", HOY, false), true);
// 6 días atrás es el último visible: hoy + 6 anteriores = 7 días.
eq("hace 6 días se ve (el último)", diaVisible("2026-08-13", HOY, false), true);
eq("hace 7 días YA NO se ve",       diaVisible("2026-08-12", HOY, false), false);
eq("hace un mes no se ve",          diaVisible("2026-07-19", HOY, false), false);
eq("con premium se ve todo",        diaVisible("2020-01-01", HOY, true), true);
// El futuro NUNCA se corta: un tratamiento de la semana que viene no es historial, y velarlo
// sería incomprensible para quien lo acaba de programar.
eq("mañana se ve aunque no pague",  diaVisible("2026-08-20", HOY, false), true);
eq("el mes que viene también",      diaVisible("2026-09-19", HOY, false), true);
eq("sin fecha no revienta",         diaVisible(null, HOY, false), true);
eq("tolera un timestamp completo",  diaVisible("2026-08-12T00:00:00Z", HOY, false), false);

console.log("\n── cuenta de días ──");
eq("mismo día",        diasEntre(HOY, HOY), 0);
eq("un día atrás",     diasEntre("2026-08-18", HOY), 1);
eq("cruzando el mes",  diasEntre("2026-07-31", HOY), 19);
eq("el futuro es negativo", diasEntre("2026-08-20", HOY), -1);

console.log("\n── el corte se explica ──");
// Un calendario que se corta sin decir por qué se lee como un bug de la app, no como un límite
// del plan, y eso trae reseñas malas en vez de compras.
eq("el texto del corte menciona el plan gratis", TEXTO_CORTE.includes("plan gratis"), true);
eq("y dice cuántos días",                        TEXTO_CORTE.includes("7"), true);
// Sin una llamada a la acción el corte solo informa; con ella es la tercera puerta al paywall.
eq("e invita a ver el resto",                    TEXTO_CORTE.includes("Ver todo"), true);



console.log("\n── ¿toca restaurar en silencio? ──");
// El caso que existe para arreglar: reinstalaste, eres anónimo otra vez, y ya pagaste.
const base = { anonimo: true, nativo: true, enLinea: true, yaIntentado: false };
eq("anónimo, nativo, con red y sin intentar", debeRestaurarEnSilencio(base), true);
// Con cuenta permanente el id de Supabase es estable: RevenueCat ya lo reconoció al entrar.
eq("con cuenta permanente, no",  debeRestaurarEnSilencio({ ...base, anonimo: false }), false);
eq("en web, no",                 debeRestaurarEnSilencio({ ...base, nativo: false }), false);
// Sin red la llamada se cuelga y deja el arranque esperando; se reintenta al siguiente.
eq("sin red, no",                debeRestaurarEnSilencio({ ...base, enLinea: false }), false);
// ⚠️ La condición que protege a quien NUNCA compró: restaurar puede pedir la contraseña del Apple
// ID, y pedirla en cada arranque sin motivo sería peor que el problema que se arregla.
eq("si ya se intentó, no",       debeRestaurarEnSilencio({ ...base, yaIntentado: true }), false);
eq("sin nada, no",               debeRestaurarEnSilencio({}), false);



console.log("\n── ¿vuelve de haber pagado? (la pantalla de 'Tu suscripción volvió') ──");
// El caso para el que existe: reinstaló, el rescate le devolvió la suscripción, y sus medicamentos
// están en una cuenta a la que no ha entrado.
const V = { anonimo: true, premium: true, compraLocal: false, cuentaPedida: false };
eq("reinstaló y le volvió la suscripción", vuelveDeHaberPagado(V), true);
eq("y por eso se le pide la cuenta",       tocaPedirLaCuenta(V), true);

// ⚠️ LA PREGUNTA QUE IMPORTA: ¿le sale a quien instala la app por primera vez? NO. Sin suscripción
// activa no hay nada que restaurar, así que `premium` es falso y no se cumple nada.
eq("a quien instala por primera vez, NO",
   vuelveDeHaberPagado({ ...V, premium: false }), false);
eq("ni aunque lleve días usándola gratis",
   tocaPedirLaCuenta({ anonimo: true, premium: false, compraLocal: false, cuentaPedida: false }), false);

// Quien compró AQUÍ tiene sus datos en este teléfono: a esa persona se le habla de crear cuenta,
// no de volver a una. Es la distinción que este módulo existe para hacer.
eq("quien compró en este teléfono, NO",
   vuelveDeHaberPagado({ ...V, compraLocal: true }), false);
// Y eso incluye el arranque siguiente a la compra, que es cuando se confundían las dos.
eq("ni al reabrir la app tras comprar",
   tocaPedirLaCuenta({ ...V, compraLocal: true }), false);

// Con cuenta permanente no hay nada que recuperar: ya está dentro. Cubre a TODOS los usuarios de la
// 1.1, que tenían registro obligatorio.
eq("con cuenta permanente, NO", vuelveDeHaberPagado({ ...V, anonimo: false }), false);

// Sin leer el almacén todavía no se decide: con `false` de arranque le parpadearía la pantalla a
// quien sí compró aquí.
eq("mientras no se ha leído, NO se decide",
   vuelveDeHaberPagado({ ...V, compraLocal: null }), false);
eq("ni si falta saber si ya se pidió",
   tocaPedirLaCuenta({ ...V, cuentaPedida: null }), false);

// Se pide UNA vez. Quien dijo "más tarde" se queda con la puerta del aviso del home, que sigue
// saliendo: `vuelveDeHaberPagado` sigue siendo cierto, lo que se apaga es la petición.
eq("ya se pidió → no se vuelve a pedir", tocaPedirLaCuenta({ ...V, cuentaPedida: true }), false);
eq("pero el aviso del home se queda",    vuelveDeHaberPagado({ ...V, cuentaPedida: true }), true);

eq("sin nada, NO", vuelveDeHaberPagado({}), false);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
