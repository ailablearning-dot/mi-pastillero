// Reglas de horarios y recurrencia de los medicamentos. Puras: no tocan red, storage ni React.

import { fmtDate, fmt12h } from "./dates.js";
//
// Ojo al tocar esto: de aquí salen las horas de cada dosis y los días en que un
// medicamento "toca". Un cambio aquí se propaga al home, al calendario, a los
// reportes y a la programación de notificaciones locales.

// Expande la hora base según la frecuencia. Devuelve ["08:00", "20:00", ...].
export const getHoras = (hora_base, frecuencia) => {
  if (!hora_base) return [];
  const [h, m] = hora_base.slice(0,5).split(":").map(Number);
  const base = h * 60 + m;
  const fmt = (mins) => `${String(Math.floor((mins % 1440) / 60)).padStart(2,"0")}:${String(mins % 60).padStart(2,"0")}`;
  if (frecuencia === "Dos veces al día" || frecuencia === "Cada 12 horas") return [fmt(base), fmt(base + 720)];
  if (frecuencia === "Tres veces al día" || frecuencia === "Cada 8 horas") return [fmt(base), fmt(base + 480), fmt(base + 960)];
  if (frecuencia === "Cada 6 horas") return [fmt(base), fmt(base + 360), fmt(base + 720), fmt(base + 1080)];
  if (frecuencia === "Cada 4 horas") { const t = []; for (let i = 0; i < 6; i++) t.push(fmt(base + i * 240)); return t; }
  const mh = frecuencia?.match(/^Cada (\d+) horas?$/);
  if (mh) { const iv = parseInt(mh[1]) * 60; const t = []; for (let i = base; i < 1440; i += iv) t.push(fmt(i)); return t; }
  return [hora_base.slice(0,5)];
};

// De una lista de bloques horarios, el más cercano a "ahora".
// Las horas antes de las 6 a. m. cuentan como del día siguiente (madrugada).
export const getNearestBlock = (slots) => {
  const now = new Date();
  const nowMins = now.getHours() * 60 + now.getMinutes();
  const toMins = t => { const [h, m] = t.split(":").map(Number); return h < 6 ? (h + 24) * 60 + m : h * 60 + m; };
  return [...slots].sort((a, b) => Math.abs(toMins(a) - nowMins) - Math.abs(toMins(b) - nowMins))[0];
};

export const DOW_MAP = { Lunes: 1, Martes: 2, "Miércoles": 3, Jueves: 4, Viernes: 5, "Sábado": 6, Domingo: 0 };

// Orden de la semana empezando en lunes, y su abreviatura. El orden importa: los días se guardan
// como el usuario los tocó y aquí se normalizan para leerlos bien.
const SEMANA = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];
const ABREV = { Lunes: "Lun", Martes: "Mar", "Miércoles": "Mié", Jueves: "Jue", Viernes: "Vie", "Sábado": "Sáb", Domingo: "Dom" };

// "Lun a Jue" / "Lun, Mié, Vie". Los días contiguos se leen como rango, que es como los dice una
// receta ("de lunes a jueves"), no como una lista.
export const diasLabel = (dias) => {
  if (!Array.isArray(dias) || dias.length === 0 || dias.length === 7) return null;
  const idx = SEMANA.map((d, i) => (dias.includes(d) ? i : -1)).filter(i => i >= 0);
  const contiguos = idx.length > 2 && idx[idx.length - 1] - idx[0] === idx.length - 1;
  if (contiguos) return `${ABREV[SEMANA[idx[0]]]} a ${ABREV[SEMANA[idx[idx.length - 1]]]}`;
  return idx.map(i => ABREV[SEMANA[i]]).join(", ");
};

// Un medicamento suspendido no se borra: deja de recordarse y de contar, pero sigue en la lista.
export const estaSuspendido = (pill) => !!pill?.suspendido_en;

// La pauta completa en una línea: "Cada 12 horas · Lun a Jue".
// Sin esto la lista mostraba solo la frecuencia y un medicamento de lunes a jueves se veía igual
// que uno de todos los días — el dato que lo distingue quedaba invisible.
export const pautaLabel = (pill) => {
  // La frecuencia vieja "Días específicos…" ya no existe como tal: los días son un filtro aparte.
  const freq = pill?.frecuencia === FREQ_DIAS_SEMANA ? "Una vez al día" : pill?.frecuencia;
  const dias = diasLabel(pill?.dias_semana);
  return [freq, dias].filter(Boolean).join(" · ");
};

// El inverso de DOW_MAP, indexado por getDay() de JS (0 = domingo).
export const DOW_NOMBRES = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

// Frecuencia que permite elegir VARIOS días de la semana. "Semanal" solo admitía uno
// (`dia_semana`), y una pauta de lunes a jueves obligaba a crear cuatro medicamentos.
export const FREQ_DIAS_SEMANA = "Días específicos de la semana";

// Devuelve la fecha de inicio del tratamiento (ancla) como Date al mediodía local,
// o null si no hay dato. Usa fecha_inicio; si falta, created_at (compatibilidad).
export function pillAnchor(pill) {
  if (pill.fecha_inicio) return new Date(pill.fecha_inicio + "T12:00:00");
  if (pill.created_at) {
    const c = new Date(pill.created_at);
    return new Date(c.getFullYear(), c.getMonth(), c.getDate(), 12, 0, 0, 0);
  }
  return null;
}

// Fecha final (exclusiva) del tratamiento según duración, o null si es indefinido.
export function pillEnd(pill, anchor) {
  if (!anchor || !pill.duracion_tipo || !pill.duracion_valor) return null;
  const end = new Date(anchor);
  const n = Number(pill.duracion_valor);
  if (pill.duracion_tipo === "dias") end.setDate(end.getDate() + n);
  else if (pill.duracion_tipo === "semanas") end.setDate(end.getDate() + n * 7);
  else if (pill.duracion_tipo === "meses") end.setMonth(end.getMonth() + n);
  else return null;
  return end; // el día `end` ya NO pertenece al tratamiento
}

export function isPillDueOnDay(pill, dateStr) {
  // Suspendido: deja de tocar a partir de esa fecha. Va lo PRIMERO, incluso antes del atajo de
  // "sin frecuencia", o un medicamento sin frecuencia seguiría sonando después de suspenderlo.
  //
  // Se trata como un fin de tratamiento y NO como "no existe", a propósito: si desapareciera de
  // todos los días, el calendario recalcularía los días PASADOS como si nunca se hubiera tomado y
  // se perdería el cumplimiento ya registrado.
  if (pill.suspendido_en && dateStr >= String(pill.suspendido_en).slice(0, 10)) return false;

  const freq = pill.frecuencia;
  if (!freq) return true;

  const date = new Date(dateStr + "T12:00:00");
  const anchor = pillAnchor(pill);

  // Ventana del tratamiento: no aparece antes del inicio ni después del fin.
  if (anchor) {
    if (date < anchor) return false;                 // aún no empieza
    const end = pillEnd(pill, anchor);
    if (end && date >= end) return false;            // tratamiento terminado
  }

  // ¿Está este día entre los elegidos? `dias_semana` es un filtro INDEPENDIENTE de la frecuencia:
  // la frecuencia dice cuántas veces al día, los días dicen en qué días. Antes iban en el mismo
  // desplegable y eran excluyentes, así que "dos veces al día, de lunes a jueves" no se podía
  // expresar. Vacío o ausente = todos los días.
  const enDiasElegidos = () => {
    const dias = pill.dias_semana;
    if (!Array.isArray(dias) || dias.length === 0) return true;
    return dias.includes(DOW_NOMBRES[date.getDay()]);
  };

  // Frecuencias diarias: todos los días de la ventana, filtrados por los días elegidos.
  if (["Una vez al día","Dos veces al día","Tres veces al día",
       "Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas",
       "Solo cuando necesite"].includes(freq)) return enDiasElegidos();
  if (/^Cada \d+ horas?$/.test(freq)) return enDiasElegidos();

  const dom = date.getDate();

  if (freq === "Semanal") {
    return date.getDay() === (DOW_MAP[pill.dia_semana] ?? 1);
  }

  if (freq === FREQ_DIAS_SEMANA) {
    const dias = pill.dias_semana;
    // Sin días marcados caemos a "todos los días" en vez de a "ninguno". A propósito: un
    // medicamento que DESAPARECE de la lista es peligroso, uno que recuerda de más solo molesta.
    // Es el mismo criterio que en el programador de notificaciones. El formulario exige al menos
    // un día, así que esto solo protege de datos viejos o corruptos.
    if (!Array.isArray(dias) || dias.length === 0) return true;
    return dias.includes(DOW_NOMBRES[date.getDay()]);
  }

  if (freq === "Cada mes") {
    return dom === (pill.dia_del_mes || 1);
  }

  if (freq === "Cada 3 meses") {
    if (dom !== (pill.dia_del_mes || 1)) return false;
    if (!anchor) return true;
    const monthDiff = (date.getFullYear() - anchor.getFullYear()) * 12 + (date.getMonth() - anchor.getMonth());
    return monthDiff % 3 === 0;
  }

  // Frecuencias por intervalo de días: se cuentan desde el inicio del tratamiento.
  if (!anchor) return true;
  const ref = new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate());
  const target = new Date(date.getFullYear(), date.getMonth(), dom);
  const diffDays = Math.round((target - ref) / 86400000);
  if (diffDays < 0) return false;

  if (freq === "Cada 15 días") return diffDays % 15 === 0;
  if (freq === "Cada tercer día") return diffDays % 3 === 0;

  const mDias = freq.match(/^Cada (\d+) días?$/);
  if (mDias) return diffDays % parseInt(mDias[1]) === 0;

  return true;
}


// ─────────────────────────────────────────────────────────────
// La próxima dosis que toca
// ─────────────────────────────────────────────────────────────
// Existe para poder decirle a alguien que acaba de dar de alta su primer medicamento CUÁNDO se le
// va a avisar. El prototipo lo pone como la confirmación del primer minuto ("Te avisamos mañana a
// las 8:00"), y es la promesa de la app cumplida antes de pedir nada a cambio.
//
// Es la misma búsqueda que hace el programador de notificaciones, pero quedándose solo con la
// primera. Se recorren días completos y no horas sueltas porque una frecuencia puede saltarse
// días enteros (cada tercer día, días concretos de la semana, un tratamiento que aún no empieza).
export function proximaDosis(pills, ahora = new Date(), diasMax = 8) {
  let mejor = null;
  for (let d = 0; d < diasMax; d++) {
    const dia = new Date(ahora);
    dia.setDate(dia.getDate() + d);
    const dateStr = fmtDate(dia.getFullYear(), dia.getMonth(), dia.getDate());
    for (const pill of pills || []) {
      if (!isPillDueOnDay(pill, dateStr)) continue;
      for (const hora of getHoras(pill.hora_toma, pill.frecuencia)) {
        const [hh, mm] = hora.split(":").map(Number);
        const at = new Date(dia);
        at.setHours(hh, mm, 0, 0);
        if (at <= ahora) continue;            // ya pasó
        if (!mejor || at < mejor.at) mejor = { pill, dateStr, hora, at };
      }
    }
  }
  return mejor;
}

// "hoy a las 8:00 PM" / "mañana a las 8:00 AM" / "el jueves a las 8:00 AM".
// Se lee dentro de una frase ("Te avisamos …"), así que va en minúscula y sin fecha numérica:
// a quien acaba de dar de alta su medicamento le sirve el día, no el 21 de agosto.
export const proximaDosisLabel = (at, ahora = new Date()) => {
  if (!at) return "";
  const soloDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dias = Math.round((soloDia(at) - soloDia(ahora)) / 86400000);
  const hora = fmt12h(`${String(at.getHours()).padStart(2, "0")}:${String(at.getMinutes()).padStart(2, "0")}`);
  if (dias <= 0) return `hoy a las ${hora}`;
  if (dias === 1) return `mañana a las ${hora}`;
  // A más de una semana ya no se dice el día de la semana: "el martes" dentro de 9 días confunde.
  if (dias >= 7) return `en ${dias} días a las ${hora}`;
  return `el ${DOW_NOMBRES[at.getDay()].toLowerCase()} a las ${hora}`;
};

// El texto de la confirmación del primer alta.
//
// Con UN medicamento basta con decir cuándo suena. Con VARIOS, decir solo la hora del más cercano
// se lee como "solo ese está cubierto" —lo preguntó el usuario al ver la pantalla con dos— así que
// se dice explícitamente que se avisa de cada uno y se nombra el primero como referencia.
//
// Nota sobre los que caen a la MISMA hora: el programador ya los agrupa en un solo aviso (ver la
// notificación 'grupo' en src/lib/notifications.js), así que no hay que prometer un aviso por
// medicamento, sino un aviso a la hora de cada uno. La frase está elegida para ser cierta en los
// dos casos.
export const confirmacionRecordatorio = (cuantos, at, ahora = new Date()) => {
  const cuando = proximaDosisLabel(at, ahora);
  if (!cuando) return "";
  return cuantos > 1
    ? `Te avisamos a la hora de cada uno. El primero, ${cuando}.`
    : `Te avisamos ${cuando}`;
};

// ── ¿Es un duplicado EXACTO de algo que ya existe? ────────────────────────────────────────
//
// La regla es deliberadamente estrecha, y el borde importa:
//
//   · Mismo nombre y dosis a HORA DISTINTA → se permite. Es el único apaño que hay hoy para una
//     pauta irregular: "Aspirina a las 9:00 y a las 15:00" no lo expresa ninguna frecuencia, porque
//     todas son intervalos regulares desde una hora base ("Dos veces al día" desde las 9 da 9 y 21;
//     "Cada 6 horas" da cuatro tomas). Bloquear eso sería quitar la única salida.
//   · Dosis o cantidad DISTINTAS a la misma hora → se permite. Combinar presentaciones para llegar
//     a la dosis prescrita (100 mg + 25 mg para 125) es una pauta real y frecuente.
//   · Todo igual —nombre, dosis, cantidad, frecuencia Y hora— → se bloquea. No expresa nada: solo
//     avisa dos veces y cuenta doble en la adherencia.
//
// Los suspendidos NO cuentan: si alguien retomó un tratamiento, no hay que estorbarle.
const clave = (p) => [
  String(p?.nombre || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, ""),
  String(p?.dosis || "").trim().toLowerCase(),
  String(p?.cantidad ?? ""),
  String(p?.frecuencia || ""),
  String(p?.hora_toma || "").slice(0, 5),
].join("|");

export const esDuplicadoExacto = (nueva, existentes = [], idQueSeEdita = null) =>
  (existentes || []).some(p =>
    p && p.id !== idQueSeEdita && !estaSuspendido(p) && clave(p) === clave(nueva));
