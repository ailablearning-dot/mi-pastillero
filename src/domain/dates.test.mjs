// Pruebas de domain/dates.js. Sin framework:
//   node src/domain/dates.test.mjs
//
// Lo que vigilan de verdad es `fechaLarga`, y una sola cosa: que no se corra un día. Escribir
// `new Date("2026-08-23")` la interpreta como medianoche UTC, que en México son las 18:00 del día
// ANTERIOR — y una fecha corrida en el reporte que se le enseña al médico no es un detalle
// cosmético. Por eso se ancla a mediodía LOCAL, y por eso esto está medido.

import { fechaLarga, fmt12h, fmtTime, formatTimingDiff, getTimingInfo, fmtDate } from "./dates.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(52)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

console.log("── la fecha larga NO se corre de día ──");
// El día del mes tiene que ser el mismo que dice la cadena, en cualquier huso horario.
for (const [iso, dia] of [["2026-08-23", "23"], ["2026-01-01", "1"], ["2026-12-31", "31"], ["2026-03-01", "1"]]) {
  eq(`${iso} conserva el día ${dia}`, fechaLarga(iso).includes(` ${dia} de `), true);
}
eq("y trae el mes en palabras",  fechaLarga("2026-08-23").includes("agosto"), true);
eq("y el día de la semana",      fechaLarga("2026-08-23").startsWith("domingo"), true);
// Lo que no parezca una fecha se devuelve tal cual, en vez de inventar un "Invalid Date".
eq("una cadena rara pasa entera", fechaLarga("2026-8-3"), "2026-8-3");
eq("vacío, vacío",                fechaLarga(""), "");
eq("nulo, vacío",                 fechaLarga(null), "");
// Una marca de tiempo completa se recorta a su día.
eq("acepta fecha con hora",       fechaLarga("2026-08-23T20:00:00").includes(" 23 de "), true);

console.log("\n── el resto, que ya se usaba sin pruebas ──");
eq("fmtDate arma el ISO",   fmtDate(2026, 7, 23), "2026-08-23");  // mes 0-based
eq("fmt12h de la mañana",   fmt12h("08:00"), "8:00 AM");
eq("fmt12h del mediodía",   fmt12h("12:30"), "12:30 PM");
eq("fmt12h de medianoche",  fmt12h("00:15"), "12:15 AM");
eq("fmtTime recorta",       fmtTime("08:04:22"), "08:04");
eq("fmtTime sin valor",     fmtTime(null), "");
eq("diferencia en minutos", formatTimingDiff(8), "8 min");
eq("diferencia en horas",   formatTimingDiff(60), "1h");
eq("horas y minutos",       formatTimingDiff(454), "7h 34m");
// ±5 minutos cuentan como "a tiempo": marcar la dosis mientras suena no debería salir tarde.
eq("a tiempo dentro de 5",  getTimingInfo("08:00", "08:04"), { kind: "on-time", diffMin: 4 });
eq("tarde a partir de 6",   getTimingInfo("08:00", "08:06"), { kind: "late", diffMin: 6 });
eq("antes también cuenta",  getTimingInfo("15:00", "12:24"), { kind: "early", diffMin: 156 });
// Una toma pasada la medianoche de una dosis de la noche NO son 23 horas de retraso.
eq("cruza la medianoche",   getTimingInfo("23:50", "00:10"), { kind: "late", diffMin: 20 });

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
