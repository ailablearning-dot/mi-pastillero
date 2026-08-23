// Pruebas de domain/inventario.js. Sin framework:
//   node src/domain/inventario.test.mjs
//
// Lo que vigilan: que el número no mienta. Un contador equivocado no se ve equivocado —dice "te
// quedan 3" con la misma cara con la que diría 12— así que los casos que se miden son justo los
// que descuadran a un contador: deshacer, las fracciones, la cantidad distinta por hora y el
// borde del propio día del corte.

import {
  AVISO_DIAS_POR_DEFECTO, llevaCaja, tomaPosteriorAlCorte, consumidoDesdeElCorte,
  unidadesQueQuedan, consumoDelDia, seAcabaEl, diasQueAlcanzan, estaPorAcabarse, tomasDeRecords, esRecuento,
} from "./inventario.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(52)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

const HOY = "2026-08-23";
// Una al día a las 8:00, empezada mucho antes, con 30 contadas hoy a las 12:00.
const CAJA = {
  id: "p1", tipo: "pastilla", cantidad: 1, hora_toma: "08:00", frecuencia: "Una vez al día",
  fecha_inicio: "2026-01-01",
  existencias: 30, existencias_fecha: HOY, existencias_hora: "12:00:00", aviso_dias: 5,
};
const toma = (fecha, hora, hora_programada = "08:00", tomado = true) => ({ fecha, hora, hora_programada, tomado });

console.log("── quién lleva caja ──");
eq("con existencias y fecha, sí",   llevaCaja(CAJA), true);
eq("sin contar nunca, no",          llevaCaja({ ...CAJA, existencias: null }), false);
eq("con existencias pero sin corte, no", llevaCaja({ ...CAJA, existencias_fecha: null }), false);
// Solo lo que se cuenta por unidades sueltas. Una pomada no lleva cantidad siquiera; un jarabe y
// un inhalador SÍ la llevan, y aun así "¿cuántas cucharadas te quedan?" no se sabe contestar.
eq("una pomada, no",                llevaCaja({ ...CAJA, tipo: "pomada" }), false);
eq("una cápsula, sí",               llevaCaja({ ...CAJA, tipo: "capsula" }), true);
eq("un jarabe, NO (lleva cantidad)", llevaCaja({ ...CAJA, tipo: "jarabe" }), false);
eq("un inhalador, NO",              llevaCaja({ ...CAJA, tipo: "inhalador" }), false);
eq("unas gotas, NO",                llevaCaja({ ...CAJA, tipo: "gotas" }), false);
// Sin tipo son pastillas: es lo que asumía la app antes de que existieran los tipos.
eq("sin tipo, sí (es pastilla)",    llevaCaja({ ...CAJA, tipo: undefined }), true);
eq("cero contadas SÍ lleva caja",   llevaCaja({ ...CAJA, existencias: 0 }), true);

console.log("\n── el corte lleva hora, y por eso no se resta de más ──");
// El caso que justifica la hora: se cuenta a mediodía con la toma de la mañana ya hecha.
eq("toma de la mañana del día del corte, NO cuenta", tomaPosteriorAlCorte(toma(HOY, "08:04:00"), HOY, "12:00:00"), false);
eq("toma de la tarde del día del corte, SÍ cuenta",  tomaPosteriorAlCorte(toma(HOY, "20:10:00"), HOY, "12:00:00"), true);
eq("día posterior, siempre",         tomaPosteriorAlCorte(toma("2026-08-24", "08:00:00"), HOY, "12:00:00"), true);
eq("día anterior, nunca",            tomaPosteriorAlCorte(toma("2026-08-22", "23:59:00"), HOY, "12:00:00"), false);
// Una fila vieja sin hora de corte cuenta el día entero: es el comportamiento seguro, no un fallo.
eq("sin hora de corte, el día cuenta", tomaPosteriorAlCorte(toma(HOY, "08:00:00"), HOY, null), true);
eq("sin fecha de corte, nada",       tomaPosteriorAlCorte(toma(HOY, "20:00:00"), null, null), false);

console.log("\n── lo que se resta ──");
eq("nada tomado → 30",   unidadesQueQuedan(CAJA, []), 30);
eq("dos tomas después → 28",
   unidadesQueQuedan(CAJA, [toma("2026-08-24", "08:02:00"), toma("2026-08-25", "08:05:00")]), 28);
// Una dosis marcada como NO tomada no salió de la caja.
eq("una no tomada no resta",
   unidadesQueQuedan(CAJA, [toma("2026-08-24", "08:02:00", "08:00", false)]), 30);
// EL CASO DEL CONTADOR: deshacer. Aquí la fila desaparece y el número vuelve solo.
eq("al deshacer, vuelve a 30", unidadesQueQuedan(CAJA, []), 30);
// Fracciones: media pastilla resta media.
eq("media pastilla resta 0.5",
   unidadesQueQuedan({ ...CAJA, cantidad: 0.5 }, [toma("2026-08-24", "08:02:00")]), 29.5);
// Cantidad distinta por hora: 1 en la mañana, 2 en la noche.
const DOS_VECES = { ...CAJA, frecuencia: "Dos veces al día", cantidad_por_hora: { "20:00": 2 } };
eq("respeta la cantidad de cada hora",
   unidadesQueQuedan(DOS_VECES, [toma("2026-08-24", "08:01:00", "08:00"), toma("2026-08-24", "20:01:00", "20:00")]), 27);
eq("nunca baja de cero",
   unidadesQueQuedan({ ...CAJA, existencias: 1 }, [toma("2026-08-24", "08:00:00"), toma("2026-08-25", "08:00:00")]), 0);
eq("sin caja, null",     unidadesQueQuedan({ ...CAJA, existencias: null }, []), null);
eq("consumo suelto",     consumidoDesdeElCorte(CAJA, [toma("2026-08-24", "08:00:00")]), 1);

console.log("\n── lo que consume un día ──");
eq("un día que toca, 1",       consumoDelDia(CAJA, "2026-08-24"), 1);
eq("dos veces al día, 3",      consumoDelDia(DOS_VECES, "2026-08-24"), 3);
// Los días que no toca no consumen: una pauta de días alternos dura el doble.
const ALTERNO = { ...CAJA, frecuencia: "Cada tercer día", fecha_inicio: "2026-08-24" };
eq("día que toca",             consumoDelDia(ALTERNO, "2026-08-24"), 1);
eq("día que NO toca",          consumoDelDia(ALTERNO, "2026-08-25"), 0);

console.log("\n── cuántos días alcanzan y cuándo se acaba ──");
// Se cuenta desde MAÑANA: parte de hoy puede estar tomada ya y sus unidades ya se restaron.
eq("5 unidades, 1 al día → 5 días", diasQueAlcanzan(CAJA, 5, HOY), 5);
eq("y se acaban al sexto día",      seAcabaEl(CAJA, 5, HOY), "2026-08-29");
eq("15 unidades a 3 al día → 5 días", diasQueAlcanzan(DOS_VECES, 15, HOY), 5);
// La misma cuenta con una pauta de días alternos: la caja dura el doble de días.
eq("días alternos estiran la caja", diasQueAlcanzan(ALTERNO, 5, HOY), 5 * 1);
eq("y su fin cae más lejos",        seAcabaEl(ALTERNO, 2, HOY) > seAcabaEl(CAJA, 2, HOY), true);
eq("sin nada, 0 días",              diasQueAlcanzan(CAJA, 0, HOY), 0);
eq("sin nada no hay fecha de fin",  seAcabaEl(CAJA, 0, HOY), null);
eq("media unidad no llega a un día", diasQueAlcanzan(CAJA, 0.5, HOY), 0);

console.log("\n── cuándo se avisa ──");
eq("con 5 días de margen y quedan 5 → avisa", estaPorAcabarse(CAJA, 5, HOY), true);
eq("con 6 todavía no",                        estaPorAcabarse(CAJA, 6, HOY), false);
eq("a cero siempre avisa",                    estaPorAcabarse(CAJA, 0, HOY), true);
// Quien no pidió aviso no quiere una banda ámbar en su pantalla principal.
eq("sin umbral, nunca avisa",   estaPorAcabarse({ ...CAJA, aviso_dias: null }, 1, HOY), false);
eq("sin caja, nunca avisa",     estaPorAcabarse({ ...CAJA, existencias: null }, 0, HOY), false);
// La razón de que el umbral vaya en días: mismas unidades, pautas distintas, avisos distintos.
eq("3 al día: 5 unidades ya avisa",  estaPorAcabarse(DOS_VECES, 5, HOY), true);
eq("1 al día: 5 unidades avisa justo", estaPorAcabarse(CAJA, 5, HOY), true);
eq("1 al día: 10 unidades no avisa",   estaPorAcabarse(CAJA, 10, HOY), false);
eq("el defecto son 5 días",     AVISO_DIAS_POR_DEFECTO, 5);

console.log("\n── las tomas salen del historial ya cargado ──");
const RECS = {
  "2026-08-24": { "p1_08:00": { time: "08:02:11", tomado: true }, "otra_09:00": { time: "09:00:00", tomado: true } },
  "2026-08-25": { "p1_08:00": { time: "08:30:00", tomado: false } },
};
eq("solo las de este medicamento", tomasDeRecords(CAJA, RECS).length, 2);
eq("con su fecha, hora y programada",
   tomasDeRecords(CAJA, RECS)[0], { fecha: "2026-08-24", hora: "08:02:11", hora_programada: "08:00", tomado: true });
// Un id creado sin conexión puede llevar guiones bajos: se recorta por longitud, no por split.
eq("id con guión bajo no rompe",
   tomasDeRecords({ ...CAJA, id: "local_9_x" }, { "2026-08-24": { "local_9_x_08:00": { time: "08:00:00", tomado: true } } })[0].hora_programada, "08:00");
eq("sin historial, vacío", tomasDeRecords(CAJA, null), []);
// Y encadenado: el número sale de lo que la pantalla ya tiene.
eq("quedan derivadas del historial", unidadesQueQuedan(CAJA, tomasDeRecords(CAJA, RECS)), 29);

console.log("\n── qué cuenta como volver a contar ──");
// El caso que salió en device: el campo enseñaba el CORTE (5) mientras el home decía 4. Con el
// campo ya corrigiendo a 4, guardar sin tocar nada tiene que ser un no-op.
eq("guardar sin tocar no es recuento", esRecuento(4, 4, 30), false);
eq("cambiarlo sí lo es",               esRecuento(30, 4, 30), true);
// Si no se sabe lo que queda (la consulta del trozo viejo falló), se compara contra el corte.
eq("sin saber lo que queda, vale el corte", esRecuento(30, null, 30), false);
eq("y un número distinto sí cuenta",        esRecuento(12, null, 30), true);
// Volver a contar y que salga CERO es un recuento como cualquier otro, y el más urgente.
eq("contar cero es recuento",          esRecuento(0, 4, 30), true);
eq("vaciar el campo no es recuento",   esRecuento("", 4, 30), false);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
