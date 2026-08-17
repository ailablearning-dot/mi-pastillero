// Formateo de fechas y horas. Funciones puras, sin estado.

export const DAYS_ES = ["Lun","Mar","Mié","Jue","Vie","Sáb","Dom"];
export const MONTHS_ES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

export function getDaysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
export function getFirstDay(y, m) { const d = new Date(y, m, 1).getDay(); return d === 0 ? 6 : d - 1; }
export function fmtDate(y, m, d) { return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`; }
export function fmtTime(iso) { return iso?.slice(0,5) || ""; }

export const fmt12h = t => {
  const [h, m] = t.split(":").map(Number);
  const period = h < 12 ? "AM" : "PM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
};

// Formatea un delta en minutos como "8 min", "1h", "1h 5m", "7h 34m", etc.
// Pensado para etiquetas tipo "X tarde" / "X antes" — más legible que "454 min".
export function formatTimingDiff(diffMin) {
  if (diffMin < 60) return `${diffMin} min`;
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  return m === 0 ? `${h}h` : `${h}h ${m}m`;
}

// Compara hora programada (HH:MM) vs hora real (string libre, ej "10:34:22" o "10:34").
// Devuelve { kind: 'on-time' | 'late' | 'early', diffMin } o null si no parseable.
// Tolerancia: ±5 min se considera "a tiempo". Maneja wrap de medianoche.
export function getTimingInfo(scheduledHHMM, actualTimeStr) {
  if (!scheduledHHMM || !actualTimeStr) return null;
  const ms = scheduledHHMM.match(/(\d{1,2}):(\d{2})/);
  const ma = actualTimeStr.match(/(\d{1,2}):(\d{2})/);
  if (!ms || !ma) return null;
  const scheduled = (+ms[1]) * 60 + (+ms[2]);
  const actual = (+ma[1]) * 60 + (+ma[2]);
  let diff = actual - scheduled;
  if (diff > 720) diff -= 1440;
  if (diff < -720) diff += 1440;
  if (Math.abs(diff) <= 5) return { kind: 'on-time', diffMin: Math.abs(diff) };
  if (diff > 0) return { kind: 'late', diffMin: diff };
  return { kind: 'early', diffMin: -diff };
}
