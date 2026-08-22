// La ficha de emergencia: qué entra en ella y en qué orden. PURO: sin React, sin red, sin storage.
//
// Del prototipo aprobado (pantalla b2). Es la joya del plan gratis y va gratis a propósito: poner
// información médica de emergencia detrás de un pago es feo y trae reseñas de una estrella.
//
// Dos decisiones del prototipo que este archivo hace cumplir:
//
//  1. **Los medicamentos activos SE COMPONEN, no se guardan.** Se derivan de las pastillas que ya
//     capturó, así que la parte más larga de la ficha viene hecha — y los expedientes personales
//     mueren justamente porque nadie los llena. Guardarlos aparte garantizaría que algún día la
//     ficha enseñe un medicamento ya suspendido, y en una urgencia un dato viejo es PEOR que
//     ninguno.
//  2. **Las alergias van primero y las graves arriba.** No es orden alfabético ni de captura: es el
//     orden en que sirven. Quien lee esto tiene segundos.

import { estaSuspendido, pautaLabel } from "./schedule.js";
import { doseLabel } from "./dosage.js";

export const GRAVEDADES = ["leve", "moderada", "grave"];

// Las graves primero; dentro de cada grupo, el orden en que se capturaron. Una alergia sin gravedad
// NO se hunde al final: que no se haya dicho cuán grave es no la vuelve menos importante — se queda
// entre las moderadas.
const PESO = { grave: 0, moderada: 1, leve: 2 };
const peso = (a) => PESO[String(a?.gravedad || "").toLowerCase()] ?? 1;

export const alergiasOrdenadas = (alergias) =>
  (Array.isArray(alergias) ? alergias : [])
    .filter(a => a && String(a.nombre || "").trim())
    .map((a, i) => ({ ...a, _i: i }))
    .sort((a, b) => peso(a) - peso(b) || a._i - b._i)
    .map(({ _i, ...a }) => a);

// Una alergia en una línea: "Penicilina — dificultad para respirar".
// La gravedad NO va aquí: en la pantalla es una etiqueta aparte, para que resalte.
export const alergiaLabel = (a) => {
  const nombre = String(a?.nombre || "").trim();
  const reaccion = String(a?.reaccion || "").trim();
  return reaccion ? `${nombre} — ${reaccion}` : nombre;
};

// Los medicamentos que de verdad está tomando hoy, listos para pintar.
//
// Se excluyen los SUSPENDIDOS: si dejó de tomarlo, enseñárselo a un paramédico es peligroso. Se
// usan las mismas funciones que el resto de la app (`doseLabel`, `pautaLabel`) para que la ficha no
// se desincronice del día que alguien cambie cómo se dice una dosis.
export const medicamentosActivos = (pills) =>
  (Array.isArray(pills) ? pills : [])
    .filter(p => p && !estaSuspendido(p))
    .map(p => ({
      id: p.id,
      nombre: p.nombre,
      detalle: [doseLabel(p, p.hora_toma), pautaLabel(p)].filter(Boolean).join(" — "),
    }));

// El contacto en una línea: "María Pérez — esposa · 55 1234 5678".
// Devuelve null si no hay nombre: una ficha con un teléfono sin dueño no ayuda a nadie.
export const contactoLabel = (paciente) => {
  const nombre = String(paciente?.contacto_nombre || "").trim();
  if (!nombre) return null;
  const rel = String(paciente?.contacto_relacion || "").trim();
  const tel = String(paciente?.contacto_telefono || "").trim();
  return [rel ? `${nombre} — ${rel}` : nombre, tel].filter(Boolean).join(" · ");
};

// Las condiciones, sin huecos ni espacios de sobra. Se conserva el orden de captura: es el que la
// persona eligió al escribirlas, y en una lista corta no hay orden mejor.
export const condicionesLimpias = (condiciones) =>
  (Array.isArray(condiciones) ? condiciones : [])
    .map(c => String(c || "").trim())
    .filter(Boolean);

// ¿Está la ficha vacía de lo que hay que capturar A MANO?
//
// Los medicamentos NO cuentan para esto, y es la parte que importa: se llenan solos, así que si
// contaran, la ficha parecería lista desde el primer medicamento y nadie añadiría nunca sus
// alergias — que es justo el dato por el que existe.
export const fichaSinCapturar = (paciente) =>
  alergiasOrdenadas(paciente?.alergias).length === 0
  && condicionesLimpias(paciente?.condiciones).length === 0
  && !contactoLabel(paciente);

// La ficha como TEXTO, para compartirla.
//
// Texto plano y no PDF, a propósito. El caso real es "mandársela a mi hija por WhatsApp", y un
// mensaje de texto llega a cualquier parte, no pesa, se lee sin abrir nada y se queda en la
// conversación para siempre. Un PDF exige abrirlo, se pierde en la carpeta de descargas y trae una
// dependencia nueva al bundle. Si algún día hace falta imprimirla, entonces sí toca el PDF.
//
// ⚠️ LLEVA FECHA, y no es un adorno: una ficha médica sin fecha es peligrosa. Quien la recibe no
// puede saber si es de hoy o de hace dos años, y con los medicamentos eso cambia la decisión de
// quien la lee. Con fecha, el que la recibe sabe si fiarse.
export const fichaComoTexto = (paciente, pills, hoyTexto) => {
  const L = [];
  // "Yo" no se escribe: es el nombre que la app pone al primer paciente, y en un mensaje enviado a
  // otra persona no dice nada — quien lo recibe ya sabe de quién le llega por la conversación. Con
  // cualquier otro nombre sí va, porque ahí SÍ informa: compartir la ficha de "Mamá" y que no lo
  // diga sería el error grave de esta pantalla.
  const nombre = String(paciente?.nombre || "").trim();
  L.push(nombre && nombre.toLowerCase() !== "yo" ? `FICHA DE EMERGENCIA · ${nombre}` : "FICHA DE EMERGENCIA");

  const al = alergiasOrdenadas(paciente?.alergias);
  if (al.length) {
    L.push("", "ALERGIAS");
    // La gravedad va en MAYÚSCULAS solo cuando es grave: en un texto sin colores, es lo único que
    // hace que salte a la vista lo que puede matar a esta persona.
    al.forEach(a => {
      const g = String(a.gravedad || "").toLowerCase();
      const marca = g === "grave" ? " (GRAVE)" : g ? ` (${g})` : "";
      L.push(`- ${alergiaLabel(a)}${marca}`);
    });
  }

  const cond = condicionesLimpias(paciente?.condiciones);
  if (cond.length) {
    L.push("", "CONDICIONES");
    cond.forEach(c => L.push(`- ${c}`));
  }

  const meds = medicamentosActivos(pills);
  if (meds.length) {
    L.push("", "MEDICAMENTOS QUE TOMA");
    meds.forEach(m => L.push(`- ${m.nombre}${m.detalle ? ` — ${m.detalle}` : ""}`));
  }

  const c = contactoLabel(paciente);
  if (c) L.push("", "A QUIÉN LLAMAR", `- ${c}`);

  if (hoyTexto) L.push("", `Actualizada el ${hoyTexto}`);
  return L.join("\n");
};
