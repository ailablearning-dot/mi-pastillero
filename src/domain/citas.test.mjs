// Pruebas de domain/citas.js. Sin framework:
//   node src/domain/citas.test.mjs
//
// Lo que más se prueba aquí es `momentoDelAviso`: de ella sale la hora a la que suena el
// recordatorio de una cita, y un error se manifiesta como un aviso que NO llega — que es
// exactamente lo que nadie nota hasta que ya se perdió la consulta.

import {
  TIPOS_CITA, getTipoCita, tipoCitaLabel, emojiCita,
  citaDateTime, fechaDe, horaDe, tieneHora, diffDias, HORA_REFERENCIA_SIN_HORA,
  esProxima, esPasada, partirCitas,
  AVISOS, AVISO_POR_DEFECTO, AVISO_MAX_HORAS, avisarHorasAntes, avisoLabel, momentoDelAviso,
  fechaCitaLabel, horaCitaLabel, cuentaRegresivaLabel, resumenCita,
} from "./citas.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(52)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

// Todas las pruebas comparan contra un "hoy" FIJO. Nada aquí llama a hoyStr(): si las pruebas
// dependieran del día en que se corren, empezarían a fallar solas un martes cualquiera.
const HOY = "2026-08-17";   // lunes

console.log("── el calendario de prueba es correcto ──");
const DOW = ["Dom","Lun","Mar","Mié","Jue","Vie","Sáb"];
const diaDe = f => DOW[new Date(f + "T12:00:00").getDay()];
eq("2026-08-17 es lunes",  diaDe("2026-08-17"), "Lun");
eq("2026-08-20 es jueves", diaDe("2026-08-20"), "Jue");
eq("2027-03-05 es viernes",diaDe("2027-03-05"), "Vie");

console.log("\n── los tipos coinciden con el check de la migración 008 ──");
// Si alguien añade un tipo aquí y olvida la migración, el insert falla en producción con un
// error de constraint. Esta lista es COPIA de `citas_tipo_valido` en 008_medicos_y_citas.sql:
// las dos tienen que moverse juntas.
const TIPOS_EN_LA_BD = ["consulta","estudio","laboratorio","vacuna","seguimiento","renovacion","otro"];
eq("mismos ids y en el mismo orden", TIPOS_CITA.map(t => t.id), TIPOS_EN_LA_BD);
eq("ninguna id lleva acento", TIPOS_CITA.every(t => /^[a-z]+$/.test(t.id)), true);
eq("todas tienen label, emoji y color",
   TIPOS_CITA.every(t => t.label && t.emoji && t.color), true);
eq("renovacion se LEE con acento", tipoCitaLabel({ tipo: "renovacion" }), "Renovación de medicamentos");
eq("un tipo desconocido cae a consulta", getTipoCita({ tipo: "telemedicina" }).id, "consulta");
eq("sin tipo cae a consulta",           getTipoCita({}).id, "consulta");
eq("acepta el id suelto",               getTipoCita("vacuna").id, "vacuna");
eq("emoji de laboratorio",              emojiCita({ tipo: "laboratorio" }), "🧪");

console.log("\n── fecha y hora ──");
eq("hora de Postgres se recorta a HH:MM", horaDe({ hora: "09:00:00" }), "09:00");
eq("sin hora devuelve null",             horaDe({ hora: null }), null);
eq("tieneHora false si es null",         tieneHora({ fecha: "2026-08-20", hora: null }), false);
eq("fecha tolera timestamp completo",    fechaDe({ fecha: "2026-08-20T00:00:00Z" }), "2026-08-20");
eq("citaDateTime respeta la hora local",
   citaDateTime({ fecha: "2026-08-20", hora: "14:30:00" }).getHours(), 14);
eq("citaDateTime NO se va a UTC (el día es el mismo)",
   citaDateTime({ fecha: "2026-08-20", hora: "23:30" }).getDate(), 20);
eq("sin hora usa la referencia de las 9",
   citaDateTime({ fecha: "2026-08-20", hora: null }).getHours(), Number(HORA_REFERENCIA_SIN_HORA.slice(0, 2)));
eq("diffDias hacia adelante", diffDias(HOY, "2026-08-20"), 3);
eq("diffDias hacia atrás",    diffDias(HOY, "2026-08-14"), -3);
eq("diffDias mismo día",      diffDias(HOY, HOY), 0);
eq("diffDias cruzando el mes", diffDias(HOY, "2026-09-02"), 16);

console.log("\n── próximas vs pasadas: el corte es por DÍA, no por hora ──");
// Este es el caso que motiva el corte por día: son las 10 de la mañana, la cita era a las 9 y la
// persona está en la sala de espera. Verla saltar a "pasadas" mientras sigue en ella es absurdo.
const hoyTemprano = { id: "a", fecha: HOY, hora: "07:00" };
eq("una cita de HOY a una hora ya pasada sigue siendo próxima", esProxima(hoyTemprano, HOY), true);
eq("y por tanto no es pasada",                                  esPasada(hoyTemprano, HOY), false);
eq("la de ayer sí es pasada",  esPasada({ fecha: "2026-08-16" }, HOY), true);
eq("la de mañana es próxima",  esProxima({ fecha: "2026-08-18" }, HOY), true);

console.log("\n── orden de las listas ──");
const lote = [
  { id: "pasada-vieja",  fecha: "2026-08-10", hora: "10:00" },
  { id: "futura-lejana", fecha: "2026-09-02", hora: "08:00" },
  { id: "hoy-tarde",     fecha: HOY,          hora: "18:00" },
  { id: "hoy-sin-hora",  fecha: HOY,          hora: null    },
  { id: "pasada-ayer",   fecha: "2026-08-16", hora: "12:00" },
  { id: "hoy-manana",    fecha: HOY,          hora: "09:00" },
];
const copiaOriginal = lote.map(c => c.id);
const { proximas, pasadas } = partirCitas(lote, HOY);
eq("próximas de la más cercana a la más lejana",
   proximas.map(c => c.id), ["hoy-sin-hora", "hoy-manana", "hoy-tarde", "futura-lejana"]);
eq("pasadas de la más reciente hacia atrás",
   pasadas.map(c => c.id), ["pasada-ayer", "pasada-vieja"]);
eq("las citas sin hora van primeras en su día", proximas[0].id, "hoy-sin-hora");
eq("no muta el array que recibe", lote.map(c => c.id), copiaOriginal);
eq("aguanta una lista vacía",   partirCitas([], HOY), { proximas: [], pasadas: [] });
eq("aguanta null",              partirCitas(null, HOY), { proximas: [], pasadas: [] });

console.log("\n── el aviso: cuántas horas antes ──");
eq("null = sin aviso (el usuario lo apagó)", avisarHorasAntes({ avisar_horas_antes: null }), null);
eq("undefined = valor por defecto",          avisarHorasAntes({}), AVISO_POR_DEFECTO);
eq("el defecto es el día antes",             AVISO_POR_DEFECTO, 24);
eq("acepta el 0 (a la hora) y NO lo trata como falso",
   avisarHorasAntes({ avisar_horas_antes: 0 }), 0);
eq("un número que llega como texto se convierte",
   avisarHorasAntes({ avisar_horas_antes: "2" }), 2);
eq("una basura no numérica se trata como sin aviso",
   avisarHorasAntes({ avisar_horas_antes: "ayer" }), null);
eq("un negativo también",  avisarHorasAntes({ avisar_horas_antes: -3 }), null);
eq("etiqueta de 24",       avisoLabel(24), "El día antes");
eq("etiqueta de 0",        avisoLabel(0), "A la hora");
eq("etiqueta de null",     avisoLabel(null), "Sin aviso");
eq("hay 5 opciones rápidas", AVISOS.length, 5);

// Avisos PERSONALIZADOS: el formulario deja escribir uno propio, así que la etiqueta tiene que
// saber leer cualquier número. Antes caía al último preset y un aviso de 4 h se mostraba como
// "Sin aviso" en la tarjeta — es decir, mentía diciendo que no había aviso cuando sí lo había.
eq("4 horas personalizadas", avisoLabel(4), "4 horas antes");
eq("2 días se leen en días", avisoLabel(48), "2 días antes");
eq("72 h = 3 días",          avisoLabel(72), "3 días antes");
eq("un múltiplo de 24 no dice 'horas'", avisoLabel(96), "4 días antes");
eq("36 h no es múltiplo: se queda en horas", avisoLabel(36), "36 horas antes");
eq("el tope de la BD",       avisoLabel(AVISO_MAX_HORAS), "7 días antes");
eq("undefined = sin aviso",  avisoLabel(undefined), "Sin aviso");
eq("una basura = sin aviso", avisoLabel("ayer"), "Sin aviso");
eq("el máximo coincide con el check de la 008", AVISO_MAX_HORAS, 168);


console.log("\n── el aviso: a qué hora suena ──");
const iso = (d) => d && `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")} ${String(d.getHours()).padStart(2,"0")}:${String(d.getMinutes()).padStart(2,"0")}`;
const cita9 = { fecha: "2026-08-20", hora: "09:00:00" };
eq("el día antes → misma hora, un día antes", iso(momentoDelAviso({ ...cita9, avisar_horas_antes: 24 })), "2026-08-19 09:00");
eq("2 horas antes",                           iso(momentoDelAviso({ ...cita9, avisar_horas_antes: 2 })),  "2026-08-20 07:00");
eq("1 hora antes",                            iso(momentoDelAviso({ ...cita9, avisar_horas_antes: 1 })),  "2026-08-20 08:00");
eq("a la hora = el instante de la cita",      iso(momentoDelAviso({ ...cita9, avisar_horas_antes: 0 })),  "2026-08-20 09:00");
eq("sin aviso devuelve null",                 momentoDelAviso({ ...cita9, avisar_horas_antes: null }), null);
eq("sin fecha devuelve null",                 momentoDelAviso({ fecha: null, avisar_horas_antes: 24 }), null);

// LA REGRESIÓN QUE JUSTIFICA HORA_REFERENCIA_SIN_HORA: si una cita sin hora se anclara a las
// 00:00, "el día antes" sonaría a MEDIANOCHE del día anterior. Nadie quiere eso.
eq("cita sin hora, aviso el día antes → 9 de la mañana, no medianoche",
   iso(momentoDelAviso({ fecha: "2026-08-20", hora: null, avisar_horas_antes: 24 })), "2026-08-19 09:00");
eq("cita sin hora, aviso a la hora → 9 de la mañana del día",
   iso(momentoDelAviso({ fecha: "2026-08-20", hora: null, avisar_horas_antes: 0 })), "2026-08-20 09:00");

// Cruzar la medianoche hacia atrás: una cita a las 8:00 con aviso de 12 h cae en el día anterior.
eq("un aviso que cruza la medianoche cae en el día anterior",
   iso(momentoDelAviso({ fecha: "2026-08-20", hora: "08:00", avisar_horas_antes: 12 })), "2026-08-19 20:00");
// Y hacia atrás cruzando el cambio de mes.
eq("cruza el cambio de mes",
   iso(momentoDelAviso({ fecha: "2026-09-01", hora: "08:00", avisar_horas_antes: 24 })), "2026-08-31 08:00");

// El momento puede quedar en el pasado: la cita es hoy a las 18:00 y el aviso era el día antes.
// Devolverlo es correcto — filtrarlo es trabajo del programador, no del dominio.
eq("devuelve un instante pasado sin quejarse",
   iso(momentoDelAviso({ fecha: HOY, hora: "18:00", avisar_horas_antes: 24 })), "2026-08-16 18:00");

// Avisos personalizados (los que se escriben a mano en el formulario).
eq("4 horas antes de una cita de las 14:00",
   iso(momentoDelAviso({ fecha: "2026-08-20", hora: "14:00", avisar_horas_antes: 4 })), "2026-08-20 10:00");
eq("2 días antes cae dos días atrás a la misma hora",
   iso(momentoDelAviso({ fecha: "2026-08-20", hora: "09:00", avisar_horas_antes: 48 })), "2026-08-18 09:00");

console.log("\n── etiquetas legibles ──");
eq("hoy",     fechaCitaLabel({ fecha: HOY }, HOY), "Hoy");
eq("mañana",  fechaCitaLabel({ fecha: "2026-08-18" }, HOY), "Mañana");
eq("ayer",    fechaCitaLabel({ fecha: "2026-08-16" }, HOY), "Ayer");
eq("una fecha del mismo año va sin año",
   fechaCitaLabel({ fecha: "2026-08-20" }, HOY), "Jue 20 de agosto");
eq("otro año sí lo lleva",
   fechaCitaLabel({ fecha: "2027-03-05" }, HOY), "Vie 5 de marzo de 2027");
eq("un año anterior también",
   fechaCitaLabel({ fecha: "2025-11-14" }, HOY), "Vie 14 de noviembre de 2025");
eq("sin fecha no revienta", fechaCitaLabel({}, HOY), "");

eq("hora en 12 h",        horaCitaLabel({ hora: "14:30:00" }), "2:30 PM");
eq("medianoche",          horaCitaLabel({ hora: "00:15" }), "12:15 AM");
eq("mediodía",            horaCitaLabel({ hora: "12:00" }), "12:00 PM");
eq("sin hora no dice que falte un dato", horaCitaLabel({ hora: null }), "Sin hora fija");

eq("cuenta regresiva a futuro", cuentaRegresivaLabel({ fecha: "2026-08-20" }, HOY), "En 3 días");
eq("cuenta regresiva hoy",      cuentaRegresivaLabel({ fecha: HOY }, HOY), "Hoy");
eq("cuenta regresiva mañana",   cuentaRegresivaLabel({ fecha: "2026-08-18" }, HOY), "Mañana");
eq("cuenta regresiva ayer",     cuentaRegresivaLabel({ fecha: "2026-08-16" }, HOY), "Ayer");
eq("cuenta regresiva al pasado",cuentaRegresivaLabel({ fecha: "2026-08-10" }, HOY), "Hace 7 días");

console.log("\n── resumen de una línea ──");
const dra = { nombre: "Dra. Ruiz" };
eq("tipo + médico",        resumenCita({ tipo: "consulta" }, dra), "Consulta con Dra. Ruiz");
eq("el motivo manda sobre el tipo",
   resumenCita({ tipo: "consulta", motivo: "Revisión de la presión" }, dra), "Revisión de la presión con Dra. Ruiz");
eq("sin médico se queda en la cabeza", resumenCita({ tipo: "laboratorio" }, null), "Laboratorio");
eq("un motivo en blanco no cuenta",    resumenCita({ tipo: "vacuna", motivo: "   " }, null), "Vacuna");
eq("un médico sin nombre no cuenta",   resumenCita({ tipo: "vacuna" }, { nombre: "  " }), "Vacuna");

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
