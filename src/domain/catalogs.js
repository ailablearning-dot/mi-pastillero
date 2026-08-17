// Catálogos y constantes de presentación. Sin estado, sin dependencias.

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

export const EMOJIS = ["💊","🔴","🟡","🔵","🟢","🟣","🟠","⚪","🫀","🧬","💉","🩺"];

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
};

export const emojiToColor = (emoji) => EMOJI_TO_COLOR[emoji] || "violet";

export function getColor(colorId) { return COLORS.find(c => c.id === colorId) || COLORS[0]; }

export const FRECUENCIAS = [
  "Una vez al día","Dos veces al día","Tres veces al día",
  "Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas",
  "Cada tercer día","Semanal","Cada 15 días","Cada mes","Cada 3 meses",
  "Solo cuando necesite",
];
