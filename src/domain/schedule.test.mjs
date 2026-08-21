// Pruebas de domain/schedule.js. Sin framework:
//   node src/domain/schedule.test.mjs
//
// `isPillDueOnDay` decide si un medicamento "toca" un día dado, y de ella dependen el home, el
// calendario, los reportes Y la programación de notificaciones. Es la función de más riesgo del
// proyecto: si se equivoca, alguien no recibe un recordatorio. Por eso los casos de regresión de
// las frecuencias que YA existían valen tanto como los de la funcionalidad nueva.

import { isPillDueOnDay, getHoras, FREQ_DIAS_SEMANA, DOW_NOMBRES, pautaLabel, diasLabel, estaSuspendido,
         proximaDosis, proximaDosisLabel, confirmacionRecordatorio, esDuplicadoExacto } from "./schedule.js";

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

console.log("\n── la próxima dosis (la confirmación del primer minuto) ──");
// Es lo que permite decir "Te avisamos mañana a las 8:00" a quien acaba de dar de alta su primer
// medicamento. Si miente, miente justo en el momento en que la persona decide si se queda.
const LUNES_10AM = new Date(2026, 7, 17, 10, 0, 0);   // lunes 17 ago 2026, 10:00
const diario = (hora, extra = {}) => ({ hora_toma: hora, frecuencia: "Una vez al día", fecha_inicio: "2026-01-01", ...extra });
const cuando = (pills, ahora = LUNES_10AM) => {
  const p = proximaDosis(pills, ahora);
  return p ? proximaDosisLabel(p.at, ahora) : null;
};

eq("una de las 20:00 es HOY",        cuando([diario("20:00")]), "hoy a las 8:00 PM");
// Las 08:00 ya pasaron a las 10:00, así que la próxima es la de mañana. Éste es el caso típico:
// alguien da de alta su medicamento a media mañana.
eq("una de las 08:00 ya pasó → mañana", cuando([diario("08:00")]), "mañana a las 8:00 AM");
eq("gana la más cercana de varias",  cuando([diario("22:00"), diario("14:00")]), "hoy a las 2:00 PM");
eq("dos veces al día toma la de la tarde",
   cuando([{ hora_toma: "08:00", frecuencia: "Dos veces al día", fecha_inicio: "2026-01-01" }]), "hoy a las 8:00 PM");

// Una frecuencia puede saltarse días enteros: por eso se recorren días completos y no horas.
eq("solo viernes, desde el lunes → el viernes",
   cuando([diario("09:00", { frecuencia: FREQ_DIAS_SEMANA, dias_semana: ["Viernes"] })]), "el viernes a las 9:00 AM");
eq("un tratamiento que empieza el jueves",
   cuando([diario("07:00", { fecha_inicio: "2026-08-20" })]), "el jueves a las 7:00 AM");
eq("suspendido no tiene próxima dosis",
   cuando([diario("20:00", { suspendido_en: "2026-08-01" })]), null);
eq("sin medicamentos no revienta",   cuando([]), null);
eq("lista nula tampoco",             cuando(null), null);

// A más de una semana el nombre del día confunde ("el martes" dentro de 9 días).
eq("una dosis más allá de 8 días queda fuera de la ventana",
   cuando([diario("08:00", { frecuencia: "Cada 15 días", fecha_inicio: "2026-08-17" })]), null);
eq("la etiqueta a 8 días no usa el nombre del día",
   proximaDosisLabel(new Date(2026, 7, 25, 8, 0), LUNES_10AM), "en 8 días a las 8:00 AM");
eq("sin fecha devuelve vacío",       proximaDosisLabel(null, LUNES_10AM), "");
eq("medianoche se lee bien",         proximaDosisLabel(new Date(2026, 7, 18, 0, 30), LUNES_10AM), "mañana a las 12:30 AM");

console.log("\n── el texto de la confirmación, con uno y con varios ──");
// Con varios medicamentos, decir solo la hora del más cercano se lee como "solo ese está
// cubierto". Lo preguntó el usuario al ver la pantalla con dos medicamentos.
const EN_2H = new Date(2026, 7, 17, 12, 0, 0);
eq("con uno, solo la hora",
   confirmacionRecordatorio(1, EN_2H, LUNES_10AM), "Te avisamos hoy a las 12:00 PM");
eq("con varios, se dice que son todos",
   confirmacionRecordatorio(3, EN_2H, LUNES_10AM), "Te avisamos a la hora de cada uno. El primero, hoy a las 12:00 PM.");
eq("dos ya cuenta como varios",
   confirmacionRecordatorio(2, EN_2H, LUNES_10AM).startsWith("Te avisamos a la hora de cada uno"), true);
eq("sin fecha no promete nada", confirmacionRecordatorio(2, null, LUNES_10AM), "");

console.log("\n── duplicado exacto: qué se bloquea y qué NO ──");
// El borde es todo: bloquear de más quita el único apaño que hay para una pauta irregular.
const base = { id: "a", nombre: "Aspirina", dosis: "100 mg", cantidad: 1, frecuencia: "Una vez al día", hora_toma: "15:00" };
const lista = [base];
eq("todo igual: se bloquea",
   esDuplicadoExacto({ ...base, id: "b" }, lista), true);
eq("otra HORA: se permite (es el apaño de la pauta irregular)",
   esDuplicadoExacto({ ...base, id: "b", hora_toma: "09:00" }, lista), false);
eq("otra DOSIS a la misma hora: se permite (combinar presentaciones)",
   esDuplicadoExacto({ ...base, id: "b", dosis: "25 mg" }, lista), false);
eq("otra CANTIDAD: se permite",
   esDuplicadoExacto({ ...base, id: "b", cantidad: 2 }, lista), false);
eq("otra FRECUENCIA: se permite",
   esDuplicadoExacto({ ...base, id: "b", frecuencia: "Dos veces al día" }, lista), false);
eq("otro NOMBRE: se permite",
   esDuplicadoExacto({ ...base, id: "b", nombre: "Ibuprofeno" }, lista), false);
// Editar el propio medicamento no puede chocar consigo mismo, o no se podría guardar nada.
eq("editándose a sí mismo no choca",
   esDuplicadoExacto(base, lista, "a"), false);
// Acentos y mayúsculas no son diferencias reales: "ASPIRINA" y "aspirina" son el mismo fármaco.
eq("no se escapa por mayúsculas ni acentos",
   esDuplicadoExacto({ ...base, id: "b", nombre: "ASPIRÍNA " }, lista), true);
eq("los segundos de la hora no cuentan",
   esDuplicadoExacto({ ...base, id: "b", hora_toma: "15:00:00" }, lista), true);
// Un tratamiento suspendido no estorba a quien lo retoma.
eq("un suspendido no bloquea",
   esDuplicadoExacto({ ...base, id: "b" }, [{ ...base, suspendido_en: "2026-08-01" }]), false);
eq("lista vacía no revienta", esDuplicadoExacto(base, []), false);
eq("lista nula tampoco",     esDuplicadoExacto(base, null), false);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
