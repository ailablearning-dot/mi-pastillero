// Pruebas de domain/dosage.js. Sin framework a propósito: se corre con
//   node src/domain/dosage.test.mjs
// Los casos vienen de lo que reportó una usuaria real (Karen), no de la imaginación.

import {
  formatCantidad, cantidadPara, doseLabel, parseCantidad, limpiarCantidadPorHora,
} from "./dosage.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(44)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

console.log("── mitad / cuarto / completa (el caso que fijó el diseño) ──");
const karen = { dosis: "5 mg", cantidad: 1, cantidad_por_hora: { "08:00": 0.5, "14:00": 0.25, "21:00": 1 } };
eq("mañana",    doseLabel(karen, "08:00"), "5 mg · media pastilla");
eq("medio día", doseLabel(karen, "14:00"), "5 mg · un cuarto de pastilla");
eq("noche",     doseLabel(karen, "21:00"), "5 mg · 1 pastilla");

console.log("\n── 1 en la mañana, 2 en la noche ──");
const metf = { dosis: "750 mg", cantidad: 1, cantidad_por_hora: { "22:00": 2 } };
eq("sin override → cantidad general", doseLabel(metf, "10:00"), "750 mg · 1 pastilla");
eq("con override",                    doseLabel(metf, "22:00"), "750 mg · 2 pastillas");

console.log("\n── formateo ──");
eq("0.75",        formatCantidad(0.75), "tres cuartos de pastilla");
eq("1.5",         formatCantidad(1.5),  "una y media pastillas");
eq("3",           formatCantidad(3),    "3 pastillas");
eq("1 singular",  formatCantidad(1),    "1 pastilla");
eq("otra unidad", formatCantidad(0.5, "cápsula"), "media cápsula");

console.log("\n── compatibilidad con los medicamentos que YA existen ──");
eq("sin campos nuevos",     doseLabel({ dosis: "20 mg" }, "08:00"), "20 mg");
eq("sin dosis ni cantidad", doseLabel({}, "08:00"), "");
eq("cantidad sin dosis",    doseLabel({ cantidad: 2 }, "08:00"), "2 pastillas");

console.log("\n── entradas basura ──");
eq("null",          parseCantidad(null), null);
eq("vacío",         parseCantidad(""), null);
eq("cero",          parseCantidad(0), null);
eq("negativo",      parseCantidad(-1), null);
eq("coma decimal",  parseCantidad("0,5"), 0.5);
eq("texto",         parseCantidad("abc"), null);
eq("hora HH:MM:SS", cantidadPara(metf, "22:00:00"), 2);

console.log("\n── limpieza de horas fantasma al cambiar la pauta ──");
eq("quita la hora que ya no existe",
   limpiarCantidadPorHora({ "10:00": 1, "22:00": 2 }, ["10:00", "18:00"]), { "10:00": 1 });
eq("si no queda nada → null",
   limpiarCantidadPorHora({ "22:00": 2 }, ["08:00"]), null);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
