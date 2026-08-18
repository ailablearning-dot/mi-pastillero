// Pruebas de domain/schedule.js. Sin framework:
//   node src/domain/schedule.test.mjs
//
// `isPillDueOnDay` decide si un medicamento "toca" un día dado, y de ella dependen el home, el
// calendario, los reportes Y la programación de notificaciones. Es la función de más riesgo del
// proyecto: si se equivoca, alguien no recibe un recordatorio. Por eso los casos de regresión de
// las frecuencias que YA existían valen tanto como los de la funcionalidad nueva.

import { isPillDueOnDay, getHoras, FREQ_DIAS_SEMANA, DOW_NOMBRES, pautaLabel, diasLabel, estaSuspendido } from "./schedule.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(48)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

// Agosto 2026: el 17 es lunes. Semana completa lunes 17 → domingo 23.
const SEMANA = {
  Lunes: "2026-08-17", Martes: "2026-08-18", "Miércoles": "2026-08-19", Jueves: "2026-08-20",
  Viernes: "2026-08-21", "Sábado": "2026-08-22", Domingo: "2026-08-23",
};
// Comprobación del andamio: si esto falla, las fechas de prueba están mal y todo lo demás miente.
console.log("── el calendario de prueba es correcto ──");
for (const [nombre, fecha] of Object.entries(SEMANA)) {
  eq(`${fecha} es ${nombre}`, DOW_NOMBRES[new Date(fecha + "T12:00:00").getDay()], nombre);
}

const diasQueToca = (pill) =>
  Object.entries(SEMANA).filter(([, f]) => isPillDueOnDay(pill, f)).map(([d]) => d);

console.log("\n── el caso de Karen: L-J una dosis, V-D otra ──");
const lunesAJueves = { frecuencia: FREQ_DIAS_SEMANA, dias_semana: ["Lunes","Martes","Miércoles","Jueves"], fecha_inicio: "2026-08-01" };
const viernesADomingo = { frecuencia: FREQ_DIAS_SEMANA, dias_semana: ["Viernes","Sábado","Domingo"], fecha_inicio: "2026-08-01" };
eq("bloque L-J toca exactamente esos 4", diasQueToca(lunesAJueves), ["Lunes","Martes","Miércoles","Jueves"]);
eq("bloque V-D toca exactamente esos 3", diasQueToca(viernesADomingo), ["Viernes","Sábado","Domingo"]);
eq("entre los dos cubren la semana",
   [...diasQueToca(lunesAJueves), ...diasQueToca(viernesADomingo)].length, 7);

console.log("\n── los días se COMBINAN con cualquier frecuencia diaria ──");
// Antes "días específicos" era una opción del desplegable de frecuencia, excluyente de "dos veces
// al día": "dos veces al día, de lunes a jueves" NO se podía expresar. Ahora son independientes.
const dosVecesLaJ = { frecuencia: "Dos veces al día", dias_semana: ["Lunes","Martes","Miércoles","Jueves"], fecha_inicio: "2026-08-01" };
eq("dos veces al día + L-J", diasQueToca(dosVecesLaJ), ["Lunes","Martes","Miércoles","Jueves"]);
eq("y sigue teniendo 2 tomas", getHoras("08:00", "Dos veces al día").length, 2);
eq("cada 8 horas + fin de semana",
   diasQueToca({ frecuencia: "Cada 8 horas", dias_semana: ["Sábado","Domingo"], fecha_inicio: "2026-08-01" }), ["Sábado","Domingo"]);
eq("cada 8 horas mantiene 3 tomas", getHoras("06:00", "Cada 8 horas").length, 3);
eq("una vez al día + un solo día",
   diasQueToca({ frecuencia: "Una vez al día", dias_semana: ["Viernes"], fecha_inicio: "2026-08-01" }), ["Viernes"]);
eq("sin dias_semana sigue siendo todos los días",
   diasQueToca({ frecuencia: "Dos veces al día", fecha_inicio: "2026-08-01" }).length, 7);
eq("dias_semana vacío = todos los días",
   diasQueToca({ frecuencia: "Una vez al día", dias_semana: [], fecha_inicio: "2026-08-01" }).length, 7);
// Las de intervalo definen sus propios días: dias_semana NO debe pisarlas.
eq("semanal ignora dias_semana",
   diasQueToca({ frecuencia: "Semanal", dia_semana: "Miércoles", dias_semana: ["Lunes"], fecha_inicio: "2026-08-01" }), ["Miércoles"]);

console.log("\n── días específicos: bordes ──");
eq("un solo día", diasQueToca({ frecuencia: FREQ_DIAS_SEMANA, dias_semana: ["Miércoles"], fecha_inicio: "2026-08-01" }), ["Miércoles"]);
eq("fin de semana", diasQueToca({ frecuencia: FREQ_DIAS_SEMANA, dias_semana: ["Sábado","Domingo"], fecha_inicio: "2026-08-01" }), ["Sábado","Domingo"]);
eq("domingo (getDay=0, el que más se rompe)",
   isPillDueOnDay({ frecuencia: FREQ_DIAS_SEMANA, dias_semana: ["Domingo"], fecha_inicio: "2026-08-01" }, SEMANA.Domingo), true);
eq("sin días marcados → toca todos (nunca desaparecer)",
   diasQueToca({ frecuencia: FREQ_DIAS_SEMANA, dias_semana: [], fecha_inicio: "2026-08-01" }).length, 7);
eq("dias_semana nulo → toca todos",
   diasQueToca({ frecuencia: FREQ_DIAS_SEMANA, dias_semana: null, fecha_inicio: "2026-08-01" }).length, 7);

console.log("\n── días específicos respeta la ventana del tratamiento ──");
eq("antes de fecha_inicio no toca",
   isPillDueOnDay({ frecuencia: FREQ_DIAS_SEMANA, dias_semana: ["Lunes"], fecha_inicio: "2026-09-01" }, SEMANA.Lunes), false);
eq("después del fin no toca",
   isPillDueOnDay({ frecuencia: FREQ_DIAS_SEMANA, dias_semana: ["Lunes"], fecha_inicio: "2026-08-01", duracion_tipo: "dias", duracion_valor: 7 }, SEMANA.Lunes), false);

console.log("\n── REGRESIÓN: las frecuencias que ya existían ──");
eq("una vez al día toca los 7",   diasQueToca({ frecuencia: "Una vez al día", fecha_inicio: "2026-08-01" }).length, 7);
eq("cada 8 horas toca los 7",     diasQueToca({ frecuencia: "Cada 8 horas", fecha_inicio: "2026-08-01" }).length, 7);
eq("semanal sigue siendo 1 día",  diasQueToca({ frecuencia: "Semanal", dia_semana: "Miércoles", fecha_inicio: "2026-08-01" }), ["Miércoles"]);
eq("semanal sin dia_semana cae a lunes",
   diasQueToca({ frecuencia: "Semanal", fecha_inicio: "2026-08-01" }), ["Lunes"]);
eq("cada tercer día desde el lunes",
   diasQueToca({ frecuencia: "Cada tercer día", fecha_inicio: SEMANA.Lunes }), ["Lunes","Jueves","Domingo"]);
eq("cada mes solo el día indicado",
   isPillDueOnDay({ frecuencia: "Cada mes", dia_del_mes: 17, fecha_inicio: "2026-08-01" }, SEMANA.Lunes), true);
eq("cada mes NO en otro día",
   isPillDueOnDay({ frecuencia: "Cada mes", dia_del_mes: 17, fecha_inicio: "2026-08-01" }, SEMANA.Martes), false);
eq("sin frecuencia toca siempre", isPillDueOnDay({}, SEMANA.Lunes), true);

console.log("\n── la etiqueta de la pauta muestra frecuencia Y días ──");
// La lista mostraba solo la frecuencia: un medicamento de lunes a jueves se veía idéntico a uno
// de todos los días. El dato que los distingue quedaba invisible.
eq("contiguos se leen como rango", diasLabel(["Lunes","Martes","Miércoles","Jueves"]), "Lun a Jue");
eq("sueltos se listan",            diasLabel(["Lunes","Miércoles","Viernes"]), "Lun, Mié, Vie");
eq("dos días no son rango",        diasLabel(["Lunes","Martes"]), "Lun, Mar");
eq("los 7 días no se mencionan",   diasLabel(["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"]), null);
eq("vacío o nulo → nada",          diasLabel([]), null);
eq("desordenados salen en orden",  diasLabel(["Jueves","Lunes","Miércoles","Martes"]), "Lun a Jue");
eq("frecuencia + días",
   pautaLabel({ frecuencia: "Cada 12 horas", dias_semana: ["Lunes","Martes","Miércoles","Jueves"] }), "Cada 12 horas · Lun a Jue");
eq("sin días, solo frecuencia",    pautaLabel({ frecuencia: "Una vez al día" }), "Una vez al día");
eq("la frecuencia vieja se traduce",
   pautaLabel({ frecuencia: FREQ_DIAS_SEMANA, dias_semana: ["Viernes","Sábado","Domingo"] }), "Una vez al día · Vie a Dom");

console.log("\n── suspender no borra el pasado ──");
// Si un medicamento suspendido desapareciera de TODOS los días, el calendario recalcularía los
// días ya cumplidos como si nunca se hubiera tomado. Por eso el corte es por fecha.
const suspendido = { frecuencia: "Una vez al día", fecha_inicio: "2026-08-01", suspendido_en: "2026-08-20" };
eq("antes de suspenderlo SÍ tocaba",  isPillDueOnDay(suspendido, SEMANA.Lunes), true);
eq("el día que se suspende ya no",    isPillDueOnDay(suspendido, SEMANA.Jueves), false);
eq("después tampoco",                 isPillDueOnDay(suspendido, SEMANA.Domingo), false);
eq("solo toca lo anterior",           diasQueToca(suspendido), ["Lunes","Martes","Miércoles"]);
eq("sin suspender toca todo",         diasQueToca({ frecuencia: "Una vez al día", fecha_inicio: "2026-08-01" }).length, 7);
eq("estaSuspendido con fecha",        estaSuspendido(suspendido), true);
eq("estaSuspendido sin fecha",        estaSuspendido({}), false);
eq("sin frecuencia también respeta la suspensión",
   isPillDueOnDay({ suspendido_en: "2026-08-20" }, SEMANA.Domingo), false);
eq("sin frecuencia y sin suspender sí toca",
   isPillDueOnDay({}, SEMANA.Domingo), true);
eq("tolera timestamp completo",
   isPillDueOnDay({ frecuencia: "Una vez al día", fecha_inicio: "2026-08-01", suspendido_en: "2026-08-20T00:00:00Z" }, SEMANA.Domingo), false);

console.log("\n── REGRESIÓN: getHoras ──");
eq("una vez al día",   getHoras("08:00", "Una vez al día"), ["08:00"]);
eq("cada 12 horas",    getHoras("10:00", "Cada 12 horas"), ["10:00","22:00"]);
eq("tres veces al día",getHoras("08:00", "Tres veces al día"), ["08:00","16:00","00:00"]);
eq("cada 6 horas",     getHoras("06:00", "Cada 6 horas"), ["06:00","12:00","18:00","00:00"]);
eq("días específicos = una toma al día", getHoras("08:00", FREQ_DIAS_SEMANA), ["08:00"]);
eq("sin hora base → vacío", getHoras(null, "Una vez al día"), []);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
