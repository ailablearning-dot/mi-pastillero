// Reglas de horarios y recurrencia de los medicamentos. Puras: no tocan red, storage ni React.
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

  // Frecuencias diarias: aparecen todos los días (dentro de la ventana)
  if (["Una vez al día","Dos veces al día","Tres veces al día",
       "Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas",
       "Solo cuando necesite"].includes(freq)) return true;
  if (/^Cada \d+ horas?$/.test(freq)) return true;

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
