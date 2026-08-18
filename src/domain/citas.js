// Reglas de las citas médicas. Puras: no tocan red, storage ni React.
//
// De aquí salen cuatro cosas que se usan en sitios distintos y conviene que digan lo mismo:
// el catálogo de tipos, el corte entre próximas y pasadas, CUÁNDO debe sonar el aviso, y los
// textos legibles. El momento del aviso lo consume el programador de notificaciones
// (src/lib/citaNotifs.js), así que un error aquí es un aviso que no suena.

import { DAYS_ES, MONTHS_ES, fmtDate, fmt12h } from "./dates.js";

// ─────────────────────────────────────────────────────────────
// Tipos de cita
// ─────────────────────────────────────────────────────────────
// Los `id` van SIN ACENTO y son exactamente los que acepta el check de la migración 008
// (`citas_tipo_valido`). El acento vive solo en `label`: lo que se guarda no debe depender de
// la codificación, y lo que se lee sí debe estar bien escrito.
//
// `color` apunta a los ids de COLORS en catalogs.js para que la pantalla de citas pinte con la
// misma paleta que el resto de la app en vez de inventarse una.
export const TIPOS_CITA = [
  { id: "consulta",    label: "Consulta",                   emoji: "🩺", color: "violet"  },
  { id: "estudio",     label: "Estudio",                    emoji: "🔬", color: "blue"    },
  { id: "laboratorio", label: "Laboratorio",                emoji: "🧪", color: "purple"  },
  { id: "vacuna",      label: "Vacuna",                     emoji: "💉", color: "emerald" },
  { id: "seguimiento", label: "Seguimiento",                emoji: "📋", color: "amber"   },
  { id: "renovacion",  label: "Renovación de medicamentos", emoji: "💊", color: "rose"    },
  { id: "otro",        label: "Otro",                       emoji: "📅", color: "orange"  },
];

const TIPO_POR_ID = Object.fromEntries(TIPOS_CITA.map(t => [t.id, t]));

export const TIPO_CITA_POR_DEFECTO = "consulta";

// Acepta la cita entera o el id suelto, igual que getTipo en medTypes.js. Un tipo desconocido
// (dato viejo, o de una versión futura que este binario no conoce) cae a "consulta" en vez de
// romper la pantalla: una cita mal etiquetada se sigue pudiendo leer, una pantalla en blanco no.
export const getTipoCita = (citaOrId) => {
  const id = typeof citaOrId === "string" ? citaOrId : citaOrId?.tipo;
  return TIPO_POR_ID[id] || TIPO_POR_ID[TIPO_CITA_POR_DEFECTO];
};

export const tipoCitaLabel = (cita) => getTipoCita(cita).label;
export const emojiCita     = (cita) => getTipoCita(cita).emoji;
export const colorCita     = (cita) => getTipoCita(cita).color;

// ─────────────────────────────────────────────────────────────
// Fecha y hora de una cita
// ─────────────────────────────────────────────────────────────

// Hay citas SIN hora fija ("ese día"): un estudio al que se llega en ayunas cuando abren, una
// vacuna de campaña. Para calcular el aviso hace falta igualmente un instante, y las 00:00 son la
// peor opción posible: "el día antes" acabaría sonando a medianoche. Se usan las 9 de la mañana
// como referencia — hora en la que una persona ya está despierta y el aviso todavía sirve.
export const HORA_REFERENCIA_SIN_HORA = "09:00";

// `fecha` es un date de Postgres ("YYYY-MM-DD"), pero se recorta por si algún día llega como
// timestamp completo: comparar "2026-08-20" con "2026-08-20T00:00:00Z" como texto daría falso.
export const fechaDe = (cita) => String(cita?.fecha || "").slice(0, 10);

// `hora` es un time de Postgres, que llega como "09:00:00". Se normaliza a "HH:MM".
export const horaDe = (cita) => (cita?.hora ? String(cita.hora).slice(0, 5) : null);

export const tieneHora = (cita) => !!horaDe(cita);

const minutosDe = (hhmm) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };

// El instante real de la cita, en hora LOCAL. Se construye con el constructor de componentes y no
// parseando un ISO: `new Date("2026-08-20T09:00")` depende del motor, y con "Z" se iría al UTC.
export const citaDateTime = (cita) => {
  const f = fechaDe(cita);
  if (!f) return null;
  const [y, m, d] = f.split("-").map(Number);
  const [hh, mm] = (horaDe(cita) || HORA_REFERENCIA_SIN_HORA).split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
};

// Fecha de hoy como "YYYY-MM-DD". Es el valor por defecto de todo lo que compara contra hoy; las
// pruebas pasan la fecha a mano para no depender del día en que se corran.
export const hoyStr = () => { const d = new Date(); return fmtDate(d.getFullYear(), d.getMonth(), d.getDate()); };

// Días enteros entre dos fechas. Se ancla al MEDIODÍA a propósito: a las 00:00 un cambio de
// horario de verano mueve el día entero y el cálculo se va por uno. Mismo truco que schedule.js.
const alMediodia = (fechaStr) => new Date(String(fechaStr).slice(0, 10) + "T12:00:00");
export const diffDias = (desdeStr, hastaStr) =>
  Math.round((alMediodia(hastaStr) - alMediodia(desdeStr)) / 86400000);

// ─────────────────────────────────────────────────────────────
// Próximas vs pasadas
// ─────────────────────────────────────────────────────────────
// El corte es por DÍA, no por la hora exacta. Una cita de hoy a las 9:00 sigue siendo "próxima"
// a las 10:00: puede que la persona esté justo en ella, o que se haya retrasado, y verla saltar a
// "pasadas" mientras está en la sala de espera es desconcertante. Pasa a pasadas al cambiar el día.

export const esProxima = (cita, hoy = hoyStr()) => fechaDe(cita) >= hoy;
export const esPasada  = (cita, hoy = hoyStr()) => !esProxima(cita, hoy);

// Dentro de un mismo día, las citas SIN hora van primero: no están ancladas a un momento, así que
// se leen como "lo de este día". Es la convención de los calendarios para los eventos de día
// completo, y evita tener que inventarles una hora para ordenarlas.
const ordenAsc = (a, b) => {
  const fa = fechaDe(a), fb = fechaDe(b);
  if (fa !== fb) return fa < fb ? -1 : 1;
  const ha = tieneHora(a) ? minutosDe(horaDe(a)) : -1;
  const hb = tieneHora(b) ? minutosDe(horaDe(b)) : -1;
  return ha - hb;
};

// Las dos listas que necesita la pantalla, ya ordenadas como se leen:
// las próximas de la más cercana a la más lejana, y las pasadas de la más reciente hacia atrás.
// No muta el array que recibe.
export const partirCitas = (citas, hoy = hoyStr()) => {
  const todas = Array.isArray(citas) ? citas : [];
  return {
    proximas: todas.filter(c => esProxima(c, hoy)).sort(ordenAsc),
    pasadas:  todas.filter(c => esPasada(c, hoy)).sort((a, b) => ordenAsc(b, a)),
  };
};

// ─────────────────────────────────────────────────────────────
// El aviso
// ─────────────────────────────────────────────────────────────
// UNO solo por cita, no una lista: cada aviso gasta una de las ~64 notificaciones locales que
// iOS mantiene por app, y ese presupuesto ya se comparte con las dosis (ver NOTIF_CAP en
// src/lib/notifications.js). Dos avisos por cita saldrían del bolsillo de los recordatorios de
// medicamentos, que son los que no se pueden perder.

export const AVISOS = [
  { horas: 24,   label: "El día antes" },
  { horas: 2,    label: "2 horas antes" },
  { horas: 1,    label: "1 hora antes" },
  { horas: 0,    label: "A la hora" },
  { horas: null, label: "Sin aviso" },
];

export const AVISO_POR_DEFECTO = 24;

// Normaliza el campo a "número de horas" o null (= sin aviso). La distinción importa:
//   null      → el usuario eligió no ser avisado. Se respeta.
//   undefined → el dato no viene (una cita recién creada en local que aún no vuelve de la BD,
//               donde la columna tiene DEFAULT 24). Cae al valor por defecto.
// Confundirlos deja a alguien sin aviso o le da uno que apagó, así que se decide en un solo sitio.
export const avisarHorasAntes = (cita) => {
  const v = cita?.avisar_horas_antes;
  if (v === null) return null;
  if (v === undefined) return AVISO_POR_DEFECTO;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Etiqueta de un aviso. Acepta CUALQUIER número de horas, no solo los presets: el formulario
// permite escribir uno propio ("avísame 4 horas antes", "2 días antes") porque las cinco opciones
// rápidas no cubren a quien tiene que salir con tiempo o preparar un estudio la víspera.
export const avisoLabel = (horas) => {
  if (horas === null || horas === undefined) return "Sin aviso";
  const preset = AVISOS.find(a => a.horas === horas);
  if (preset) return preset.label;
  const n = Number(horas);
  if (!Number.isFinite(n) || n < 0) return "Sin aviso";
  if (n === 0) return "A la hora";
  // Los múltiplos exactos de 24 se leen en días: "48 horas antes" obliga a dividir mentalmente.
  if (n % 24 === 0) { const d = n / 24; return d === 1 ? "El día antes" : `${d} días antes`; }
  return n === 1 ? "1 hora antes" : `${n} horas antes`;
};

// Tope del aviso, en horas. Es el mismo que el check `citas_aviso_valido` de la migración 008:
// si aquí se dejara pasar más, la BD lo rechazaría y la cita no se guardaría.
export const AVISO_MAX_HORAS = 168;   // una semana

// El SEGUNDO aviso, que es opcional y arranca apagado.
//
// Ojo a la diferencia con el primero: aquí `undefined` NO cae a un valor por defecto. El primer
// aviso existe salvo que lo apagues; el segundo no existe salvo que lo enciendas. Darle un
// defecto haría que todas las citas del mundo empezaran a sonar dos veces sin que nadie lo pida,
// y encima duplicaría el gasto del presupuesto de notificaciones de iOS.
export const avisarHorasAntes2 = (cita) => {
  const v = cita?.avisar2_horas_antes;
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : null;
};

// Todos los momentos en que esta cita debe avisar, del más temprano al más tardío.
// Devuelve [] si no lleva ninguno. Cada entrada trae `cual`, que es el espacio de nombres del id
// de la notificación: sin eso los dos avisos de una misma cita compartirían id y el segundo
// pisaría al primero.
//
// Deduplica: si alguien pone los dos avisos iguales, suena UNA vez. Dos notificaciones idénticas
// en el mismo instante no informan de nada y gastan dos huecos del presupuesto.
export const momentosDeAviso = (cita) => {
  const at = citaDateTime(cita);
  if (!at) return [];
  const base = at.getTime();
  const salida = [];
  const vistos = new Set();
  for (const [cual, horas] of [["aviso", avisarHorasAntes(cita)], ["aviso2", avisarHorasAntes2(cita)]]) {
    if (horas === null) continue;
    if (vistos.has(horas)) continue;
    vistos.add(horas);
    salida.push({ cual, horas, at: new Date(base - horas * 3600000) });
  }
  return salida.sort((a, b) => a.at - b.at);
};

// Cuándo debe sonar el PRIMER aviso de esta cita, o null si no lleva.
// PUEDE devolver un instante YA PASADO (una cita de ayer, o una creada hoy para dentro de un rato
// con aviso "el día antes"). Filtrar eso es del programador, no de aquí: esta función responde
// "cuándo tocaría", y quien agenda decide si todavía tiene sentido.
export const momentoDelAviso = (cita) => {
  const horas = avisarHorasAntes(cita);
  if (horas === null) return null;
  const at = citaDateTime(cita);
  if (!at) return null;
  return new Date(at.getTime() - horas * 3600000);
};

// ─────────────────────────────────────────────────────────────
// Etiquetas legibles
// ─────────────────────────────────────────────────────────────

// "Hoy" / "Mañana" / "Ayer" / "Jue 20 de agosto". El año solo aparece cuando NO es el año en
// curso: ponerlo siempre es ruido, y omitirlo siempre hace que una cita de hace dos años parezca
// de este. Es el mismo criterio que usa el historial.
export const fechaCitaLabel = (cita, hoy = hoyStr()) => {
  const f = fechaDe(cita);
  if (!f) return "";
  const diff = diffDias(hoy, f);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  const d = alMediodia(f);
  const dow = DAYS_ES[(d.getDay() + 6) % 7];            // DAYS_ES empieza en lunes, getDay() en domingo
  const base = `${dow} ${d.getDate()} de ${MONTHS_ES[d.getMonth()].toLowerCase()}`;
  const mismoAno = d.getFullYear() === alMediodia(hoy).getFullYear();
  return mismoAno ? base : `${base} de ${d.getFullYear()}`;
};

// "9:00 AM", o el texto de las citas sin hora fija. No dice "Sin hora" a secas: eso suena a dato
// que falta, cuando en realidad es una cita que legítimamente no la tiene.
export const horaCitaLabel = (cita) =>
  tieneHora(cita) ? fmt12h(horaDe(cita)) : "Sin hora fija";

// "En 3 días" / "Hace 2 días". Para la tarjeta de la lista, donde lo que se busca de un vistazo
// es cuánto falta, no la fecha exacta.
export const cuentaRegresivaLabel = (cita, hoy = hoyStr()) => {
  const f = fechaDe(cita);
  if (!f) return "";
  const diff = diffDias(hoy, f);
  if (diff === 0) return "Hoy";
  if (diff === 1) return "Mañana";
  if (diff === -1) return "Ayer";
  return diff > 0 ? `En ${diff} días` : `Hace ${-diff} días`;
};

// Una línea que describe la cita: "Consulta con Dr. Pérez". Sirve para la tarjeta y para el
// cuerpo de la notificación, que deben decir lo mismo. El médico se pasa ya resuelto — este
// módulo es puro y no sabe buscar en el catálogo.
export const resumenCita = (cita, medico = null) => {
  const tipo = tipoCitaLabel(cita);
  const motivo = cita?.motivo?.trim();
  const quien = medico?.nombre?.trim();
  const cabeza = motivo || tipo;
  return quien ? `${cabeza} con ${quien}` : cabeza;
};
