// Catálogos y constantes de presentación. Sin estado.

import { FREQ_DIAS_SEMANA } from "./schedule.js";

// Emojis para avatares de pacientes
export const PACIENTE_EMOJIS = ["👤","👨","👩","👴","👵","👦","👧","👶","🧑","👨‍🦰","👩‍🦰","👨‍🦱","👩‍🦱","👨‍🦳","👩‍🦳","🐶","🐱"];

export const COLORS = [
  { id: "violet", bg: "bg-violet-100", text: "text-violet-700", ring: "ring-violet-300", accent: "bg-violet-500" },
  { id: "rose", bg: "bg-rose-100", text: "text-rose-700", ring: "ring-rose-300", accent: "bg-rose-500" },
  { id: "amber", bg: "bg-amber-100", text: "text-amber-700", ring: "ring-amber-300", accent: "bg-amber-500" },
  { id: "blue", bg: "bg-blue-100", text: "text-blue-700", ring: "ring-blue-300", accent: "bg-blue-500" },
  { id: "emerald", bg: "bg-emerald-100", text: "text-emerald-700", ring: "ring-emerald-300", accent: "bg-emerald-500" },
  { id: "purple", bg: "bg-purple-100", text: "text-purple-700", ring: "ring-purple-300", accent: "bg-purple-500" },
  { id: "pink", bg: "bg-pink-100", text: "text-pink-700", ring: "ring-pink-300", accent: "bg-pink-500" },
  { id: "orange", bg: "bg-orange-100", text: "text-orange-700", ring: "ring-orange-300", accent: "bg-orange-500" },
];

// Los siete últimos entraron con los tipos de medicamento (pomada, gotas, jarabe…): antes solo
// había emojis de pastilla, así que una crema no tenía cómo distinguirse en la lista.
// Lo que se OFRECE en el selector. Ojo: no es la lista de emojis válidos — el mapa de colores de
// abajo conserva más, porque un medicamento guardado hace meses puede llevar uno que ya no se
// ofrece y tiene que seguir pintándose con su color. Quitar de aquí es dejar de ofrecer, no
// invalidar.
export const EMOJIS = ["💊","🔴","🟡","🔵","🟢","🟣","🟠","⚪","🫀","🧬","💉","🩺","🧴","💧","🥄","💨","🧂"];

// El color de una pastilla se deriva automáticamente de su emoji.
// Los emojis "círculo de color" mapean a su color obvio; los símbolos temáticos
// a un color coherente (corazón→rose, ADN→purple, jeringa→blue, estetoscopio→emerald).
export const EMOJI_TO_COLOR = {
  "💊": "violet",
  "🔴": "rose",
  "🟡": "amber",
  "🔵": "blue",
  "🟢": "emerald",
  "🟣": "purple",
  "🟠": "orange",
  "⚪": "violet",
  "🫀": "rose",
  "🧬": "purple",
  "💉": "blue",
  "🩺": "emerald",
  // Emojis de los tipos nuevos. Sin estos caerían todos a violeta por el respaldo de
  // emojiToColor, y una pomada se vería igual que una pastilla en la lista.
  "🧴": "rose",
  "💧": "blue",
  "🥄": "amber",
  "💨": "emerald",
  "🩹": "orange",
  "🧂": "amber",
  "🧪": "purple",
};

export const emojiToColor = (emoji) => EMOJI_TO_COLOR[emoji] || "violet";

export function getColor(colorId) { return COLORS.find(c => c.id === colorId) || COLORS[0]; }

// La cadena de "días específicos" se importa en vez de repetirse: es la misma que compara
// isPillDueOnDay, y dos literales iguales escritos en dos archivos acaban divergiendo.
export const FRECUENCIAS = [
  "Una vez al día","Dos veces al día","Tres veces al día",
  "Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas",
  "Cada tercer día", FREQ_DIAS_SEMANA, "Semanal","Cada 15 días","Cada mes","Cada 3 meses",
  "Solo cuando necesite",
];
