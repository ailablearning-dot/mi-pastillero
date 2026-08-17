// Pruebas de domain/dosage.js. Sin framework a propósito: se corre con
//   node src/domain/dosage.test.mjs
// Los casos vienen de lo que reportó una usuaria real (Karen), no de la imaginación.

import {
  formatCantidad, cantidadPara, doseLabel, parseCantidad, limpiarCantidadPorHora, cantidadesPara,
} from "./dosage.js";
import { verboPara, participioPara, usaCantidad, unidadPara, emojiSugerido, getTipo, TIPOS } from "./medTypes.js";

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

console.log("\n── el caso de las 2 pomadas: no hay cantidad, hay nota ──");
const pomada = { tipo: "pomada", dosis: "0.05 %", cantidad: 2, nota: "rodilla derecha, capa delgada" };
eq("no inventa cantidad",      doseLabel(pomada, "08:00"), "0.05 %");
eq("usaCantidad = false",      usaCantidad(pomada), false);
eq("el verbo es 'aplicar'",    verboPara(pomada), "aplicar");
eq("el participio 'aplicado'", participioPara(pomada), "aplicado");

console.log("\n── la unidad la manda el tipo ──");
eq("jarabe → cucharadas", doseLabel({ tipo: "jarabe", dosis: "120 mg", cantidad: 1.5 }, "08:00"), "120 mg · una y media cucharadas");
eq("gotas → gotas",       doseLabel({ tipo: "gotas", cantidad: 3 }, "08:00"), "3 gotas");
eq("inyección → dosis",   doseLabel({ tipo: "inyeccion", dosis: "10 UI", cantidad: 1 }, "08:00"), "10 UI · 1 dosis");
eq("inhalador → disparos",doseLabel({ tipo: "inhalador", cantidad: 2 }, "08:00"), "2 disparos");

console.log("\n── verbos por tipo ──");
eq("inyección", verboPara({ tipo: "inyeccion" }), "inyectar");
eq("gotas",     verboPara({ tipo: "gotas" }), "poner");
eq("inhalador", verboPara({ tipo: "inhalador" }), "inhalar");
eq("parche",    verboPara({ tipo: "parche" }), "aplicar");

console.log("\n── fracciones solo donde tienen sentido ──");
eq("pastilla se parte",   cantidadesPara({ tipo: "pastilla" }).includes(0.5), true);
eq("cápsula NO se parte", cantidadesPara({ tipo: "capsula" }).includes(0.5), false);
eq("cápsula: solo enteros", cantidadesPara({ tipo: "capsula" }), [1, 2, 3, 4]);

console.log("\n── compatibilidad: los medicamentos SIN tipo se comportan como antes ──");
eq("cae a pastilla",        getTipo({}).id, "pastilla");
eq("verbo histórico",       verboPara({}), "tomar");
eq("sí admite cantidad",    usaCantidad({}), true);
eq("unidad histórica",      unidadPara({}), "pastilla");
eq("tipo desconocido cae a pastilla", getTipo({ tipo: "inventado" }).id, "pastilla");
eq("etiqueta como antes",   doseLabel({ dosis: "750 mg", cantidad: 2 }, "10:00"), "750 mg · 2 pastillas");

console.log("\n── integridad de la tabla de tipos ──");
eq("no hay ids repetidos", new Set(TIPOS.map(t => t.id)).size, TIPOS.length);
eq("todos tienen verbo y participio", TIPOS.every(t => t.verbo && t.participio), true);
eq("todos los que usan cantidad tienen unidad", TIPOS.every(t => !t.cantidad || !!t.unidad), true);
eq("todos tienen emoji sugerido", TIPOS.every(t => !!emojiSugerido(t.id)), true);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
