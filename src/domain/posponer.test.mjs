// Pruebas de domain/posponer.js. Sin framework:
//   node src/domain/posponer.test.mjs
//
// Lo que vigilan: que la insignia no mienta. Enseñar "pospuesta" en una dosis que ya se tomó, o
// dejarla puesta cuando el aviso ya sonó, es peor que no enseñar nada — en una app de medicación
// una etiqueta obsoleta se lee como un permiso para no tomarse la pastilla todavía.

import { claveMarca, nuevaMarca, estaPospuesta, pospuestaVisible, posponerHasta, quitarPosposicion, limpiarVencidas } from "./posponer.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(52)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

const AHORA = 1_000_000;
const DENTRO = AHORA + 600_000;   // +10 min
const ANTES  = AHORA - 600_000;   // -10 min
const HOY = "2026-08-23";
const DOSE = "abc_10:00";

console.log("── la clave lleva la fecha ──");
// Sin fecha, posponer la dosis de las 10:00 de hoy pintaría la de mañana y la de pasado.
eq("clave = fecha + dosis",      claveMarca(HOY, DOSE), "2026-08-23_abc_10:00");
eq("otro día, otra clave",       claveMarca("2026-08-24", DOSE) !== claveMarca(HOY, DOSE), true);

console.log("\n── viva o vencida ──");
eq("aviso en el futuro → pospuesta",  estaPospuesta(nuevaMarca(DENTRO, "10:10"), AHORA), true);
eq("aviso ya pasado → NO",            estaPospuesta(nuevaMarca(ANTES, "09:50"), AHORA), false);
// El borde exacto cuenta como vencida: en el instante en que suena, la dosis vuelve a estar
// simplemente pendiente. Que la insignia sobreviva al aviso es justo el fallo que hay que evitar.
eq("justo en la hora → vencida",      estaPospuesta(nuevaMarca(AHORA, "10:00"), AHORA), false);

console.log("\n── el caso seguro es NO pintar nada ──");
// Prometer un aviso que no sabemos si existe es el mismo error que la banda verde de
// "Recordatorio activado" cuando el permiso no se concedió.
eq("sin marca, NO",              estaPospuesta(undefined, AHORA), false);
eq("marca nula, NO",             estaPospuesta(null, AHORA), false);
eq("marca sin hora, NO",         estaPospuesta({}, AHORA), false);
eq("marca con basura, NO",       estaPospuesta({ hasta: "mañana" }, AHORA), false);

console.log("\n── una dosis registrada NUNCA es pospuesta ──");
const VIVA = nuevaMarca(DENTRO, "10:10");
eq("pendiente + marca viva → sí",   pospuestaVisible(undefined, VIVA, AHORA), true);
eq("ya tomada → manda el registro", pospuestaVisible({ tomado: true }, VIVA, AHORA), false);
eq("marcada como no tomada → idem", pospuestaVisible({ tomado: false }, VIVA, AHORA), false);
// Se pospone y, antes de que suene, se marca sin conexión: la marca local sigue ahí y aun así
// manda el registro.
eq("registro sin subir → manda igual", pospuestaVisible({ tomado: true, pending: true }, VIVA, AHORA), false);
eq("pendiente + marca vencida → no", pospuestaVisible(undefined, nuevaMarca(ANTES, "09:50"), AHORA), false);

console.log("\n── poner y quitar ──");
const M1 = posponerHasta({}, HOY, DOSE, DENTRO, "10:10");
eq("queda guardada bajo su clave", M1["2026-08-23_abc_10:00"], { hasta: DENTRO, hora: "10:10" });
// Re-posponer reemplaza, no acumula — igual que el id estable de la notificación.
const M2 = posponerHasta(M1, HOY, DOSE, DENTRO + 60_000, "10:11");
eq("re-posponer reemplaza",        Object.keys(M2).length, 1);
eq("y se queda la última hora",    M2["2026-08-23_abc_10:00"].hora, "10:11");
eq("no muta el mapa anterior",     M1["2026-08-23_abc_10:00"].hora, "10:10");

const M3 = posponerHasta(M2, HOY, "otra_15:00", DENTRO, "10:10");
eq("otra dosis convive",           Object.keys(quitarPosposicion(M3, HOY, DOSE)), ["2026-08-23_otra_15:00"]);
eq("quitar lo que no está no rompe", quitarPosposicion({}, HOY, DOSE), {});
eq("quitar de un mapa nulo tampoco", quitarPosposicion(null, HOY, DOSE), {});

console.log("\n── se podan solas ──");
// Sin poda el objeto crece para siempre en el teléfono: una entrada por dosis pospuesta y ninguna
// se borraría nunca.
const MEZCLA = { viva: nuevaMarca(DENTRO, "10:10"), vieja: nuevaMarca(ANTES, "09:50"), rota: {} };
eq("solo sobreviven las vivas",    Object.keys(limpiarVencidas(MEZCLA, AHORA)), ["viva"]);
eq("mapa vacío se aguanta",        limpiarVencidas({}, AHORA), {});
eq("mapa nulo también",            limpiarVencidas(null, AHORA), {});

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
