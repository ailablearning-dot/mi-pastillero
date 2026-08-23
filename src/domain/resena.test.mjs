// Pruebas de domain/resena.js. Sin framework:
//   node src/domain/resena.test.mjs
//
// Lo que vigilan: que no se pida en mal momento. Es un tiro único —Apple no dice si la hoja salió
// ni si dejaron reseña— así que todos los bordes están medidos hacia el lado de callarse.

import { DIAS_PARA_PEDIR, diasConDosisTomada, diaCerradoBien, tocaPedirResena } from "./resena.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(52)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

const tomada = { tomado: true };
const noTomada = { tomado: false };

console.log("── días buenos: se cuentan los de ÉXITO ──");
eq("un día con una toma cuenta",   diasConDosisTomada({ "2026-08-01": { a: tomada } }), 1);
// El día entero marcado como NO tomado no es un día de éxito. Pedir estrellas ahí es pedirlas
// justo después de un fallo, que es el patrón que produce reseñas de una estrella.
eq("un día solo de NO tomadas, no", diasConDosisTomada({ "2026-08-01": { a: noTomada } }), 0);
eq("mezcla: basta una tomada",      diasConDosisTomada({ "2026-08-01": { a: noTomada, b: tomada } }), 1);
eq("cuenta DÍAS, no dosis",         diasConDosisTomada({ "2026-08-01": { a: tomada, b: tomada, c: tomada } }), 1);
eq("varios días",                   diasConDosisTomada({ "2026-08-01": { a: tomada }, "2026-08-02": { a: tomada } }), 2);
eq("un día vacío no cuenta",        diasConDosisTomada({ "2026-08-01": {} }), 0);
eq("sin registros, cero",           diasConDosisTomada({}), 0);
eq("nulo, cero",                    diasConDosisTomada(null), 0);

console.log("\n── el día se cierra BIEN, o no se cierra ──");
eq("todas tomadas → sí",     diaCerradoBien({ a: tomada, b: tomada }, ["a", "b"]), true);
eq("falta una por marcar → no", diaCerradoBien({ a: tomada }, ["a", "b"]), false);
// "Registrado" no es "cumplido": un día se puede cerrar entero a base de "no lo he tomado", y ese
// es exactamente el momento en el que no se pide nada.
eq("una NO tomada → no",     diaCerradoBien({ a: tomada, b: noTomada }, ["a", "b"]), false);
eq("todas no tomadas → no",  diaCerradoBien({ a: noTomada, b: noTomada }, ["a", "b"]), false);
// Un día sin dosis previstas no es un logro, es un día sin medicación.
eq("día sin dosis → no",     diaCerradoBien({}, []), false);
eq("sin registros → no",     diaCerradoBien(undefined, ["a"]), false);

console.log("\n── la decisión ──");
const BASE = { diaCompleto: true, diasBuenos: DIAS_PARA_PEDIR, yaSePidio: false };
eq("día cerrado + 5 días → se pide", tocaPedirResena(BASE), true);
eq("con más de 5 también",           tocaPedirResena({ ...BASE, diasBuenos: 12 }), true);
eq("con 4 todavía no",               tocaPedirResena({ ...BASE, diasBuenos: DIAS_PARA_PEDIR - 1 }), false);
// Aunque lleve meses usándola: el momento importa tanto como el mérito. Se pide al cerrar un día,
// nunca a media mañana con dosis pendientes.
eq("sin cerrar el día, no",          tocaPedirResena({ ...BASE, diaCompleto: false }), false);
eq("ya se pidió → nunca más",        tocaPedirResena({ ...BASE, yaSePidio: true }), false);
// Mientras no se ha leído el almacén, NO se decide. El caso seguro es callarse: pedirla dos veces
// gasta un tiro que no se puede medir.
eq("aún no se sabe → no se decide",  tocaPedirResena({ ...BASE, yaSePidio: null }), false);
eq("sin datos, no",                  tocaPedirResena({}), false);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
