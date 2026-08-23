// Tipos de medicamento. Puro: sin estado, sin red, sin React.
//
// Nace de un comentario de una usuaria real: "semanas pasadas tenía 2 pomadas, en diferentes
// horarios y partes del cuerpo. ¿Ahí qué se le pone? Aplicación de pomada, así no hay como tal
// una cantidad". Tenía razón dos veces: para una pomada NO hay cantidad, y la app entera estaba
// escrita asumiendo que todo se traga ("Hora de tomar", "¿Ha tomado su medicamento?").
//
// Por eso el tipo NO es una etiqueta decorativa: manda en el formulario (si se pide cantidad y en
// qué unidad) y en los textos (qué verbo se usa). Un tipo que solo pinta un icono no arregla nada.
//
// `emoji` es una SUGERENCIA: el usuario puede cambiarlo, y el color se sigue derivando del emoji
// como siempre (emojiToColor), así no le quitamos una decisión que ya tenía.

export const TIPOS = [
  { id: "pastilla",    label: "Pastilla o tableta",  verbo: "tomar", presente: "toma",    participio: "tomado", participioF: "tomada",     cantidad: true,  fraccionable: true,  unidad: "pastilla",    emoji: "💊" },
  { id: "capsula",     label: "Cápsula",             verbo: "tomar", presente: "toma",    participio: "tomado", participioF: "tomada",     cantidad: true,  fraccionable: false, unidad: "cápsula",     emoji: "🔵" },
  { id: "jarabe",      label: "Jarabe",              verbo: "tomar", presente: "toma",    participio: "tomado", participioF: "tomado",     cantidad: true,  fraccionable: true,  unidad: "cucharada",   emoji: "🥄" },
  { id: "gotas",       label: "Gotas",               verbo: "poner", presente: "ponen",    participio: "puesto", participioF: "puestas",     cantidad: true,  fraccionable: false, unidad: "gota",        emoji: "💧" },
  { id: "inyeccion",   label: "Inyección",           verbo: "inyectar", presente: "inyecta", participio: "inyectado", participioF: "inyectada",  cantidad: true,  fraccionable: false, unidad: "dosis",       emoji: "💉" },
  { id: "pomada",      label: "Pomada o crema",      verbo: "aplicar", presente: "aplica",  participio: "aplicado", participioF: "aplicada",   cantidad: false, fraccionable: false, unidad: null,          emoji: "🧴" },
  { id: "inhalador",   label: "Inhalador",           verbo: "inhalar", presente: "inhala",  participio: "inhalado", participioF: "inhalado",   cantidad: true,  fraccionable: false, unidad: "disparo",     emoji: "💨" },
  { id: "parche",      label: "Parche",              verbo: "aplicar", presente: "aplica",  participio: "aplicado", participioF: "aplicado",   cantidad: true,  fraccionable: false, unidad: "parche",      emoji: "🩹" },
  { id: "supositorio", label: "Supositorio u óvulo", verbo: "poner", presente: "pone",    participio: "puesto", participioF: "puesto",     cantidad: true,  fraccionable: false, unidad: "unidad",      emoji: "⚪" },
  { id: "sobre",       label: "Sobre o polvo",       verbo: "tomar", presente: "toma",    participio: "tomado", participioF: "tomado",     cantidad: true,  fraccionable: false, unidad: "sobre",       emoji: "🧂" },
  { id: "ampolleta",   label: "Ampolleta",           verbo: "tomar", presente: "toma",    participio: "tomado", participioF: "tomada",     cantidad: true,  fraccionable: false, unidad: "ampolleta",   emoji: "🧪" },
  { id: "otro",        label: "Otro",                verbo: "tomar", presente: "toma",    participio: "tomado", participioF: "tomado",     cantidad: true,  fraccionable: true,  unidad: "dosis",       emoji: "💊" },
];

const POR_ID = Object.fromEntries(TIPOS.map(t => [t.id, t]));

// Los medicamentos que ya existen no tienen `tipo`. Caen a "pastilla", que es exactamente lo que
// la app asumía antes: mismo verbo, misma cantidad. Así nada cambia de comportamiento al desplegar.
export const TIPO_POR_DEFECTO = "pastilla";

export const getTipo = (pillOrId) => {
  const id = typeof pillOrId === "string" ? pillOrId : pillOrId?.tipo;
  return POR_ID[id] || POR_ID[TIPO_POR_DEFECTO];
};

// "tomar" / "aplicar" / "inyectar" — para "Hora de {verbo}…" en las notificaciones.
export const verboPara = (pill) => getTipo(pill).verbo;

// Tercera persona, para preguntas del tipo "¿Cuánto se {presente} cada vez?". El infinitivo
// NO sirve ahí: "¿cuánto se tomar cada vez?" es justo el error que reportó el usuario.
export const presentePara = (pill) => getTipo(pill).presente || "toma";

// "tomado" / "aplicado" / "puesto" — para "¿Ha {participio} su medicamento?" y las confirmaciones.
export const participioPara = (pill) => getTipo(pill).participio;

// Forma que concuerda con el botón de la dosis ("Tomada", "Aplicada", "Puestas"). El género y el
// número los manda el tipo, no el código: unas gotas se "ponen", una pomada se "aplica".
export const participioFPara = (pill) => getTipo(pill).participioF || getTipo(pill).participio;
export const capitalizar = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

// ¿Este tipo admite una cantidad? Las pomadas no: se untan, no se cuentan.
export const usaCantidad = (pill) => getTipo(pill).cantidad;

// Qué tipos llevan CONTROL DE CAJA. No es lo mismo que `cantidad`, y separarlos importa: casi
// todos los tipos llevan cantidad, pero "¿cuántas cucharadas de jarabe te quedan?" o "¿cuántos
// disparos tiene el inhalador?" no son preguntas que nadie sepa contestar mirando el envase. Solo
// se cuentan las unidades sueltas y contables.
//
// Es además lo que se pidió al plantear la función: "cuando se trate de pastilla".
export const TIPOS_CON_CAJA = ["pastilla", "capsula"];
export const llevaControlDeCaja = (pill) => TIPOS_CON_CAJA.includes(getTipo(pill).id);

// ¿Se puede partir? Solo las pastillas (y el jarabe, en cucharadas). Una cápsula no se parte a la
// mitad, así que no tiene sentido ofrecer ¼ ni ½ para ella.
export const esFraccionable = (pill) => getTipo(pill).fraccionable;

export const unidadPara = (pill) => getTipo(pill).unidad;

export const emojiSugerido = (pillOrId) => getTipo(pillOrId).emoji;
