// Pruebas de domain/plan.js. Sin framework:
//   node src/domain/plan.test.mjs
//
// Esto decide qué ve quien no paga. Un fallo por un lado regala la función de pago; por el otro
// le cierra la puerta a alguien que sí pagó. Las dos son caras, así que los bordes van medidos.

import { FUNCIONES, DIAS_HISTORIAL_GRATIS, MOTIVO, puedeUsar, esPremium, diaVisible, diasEntre, TEXTO_CORTE } from "./plan.js";

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

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
