// La ficha de emergencia dibujada como IMAGEN, para compartirla.
//
// Por qué imagen y no las otras dos opciones, que se probaron o se consideraron:
//
//  · TEXTO PLANO (lo que había): se ve pobre para un documento médico y —lo grave— quien lo recibe
//    LO PUEDE EDITAR antes de reenviarlo. Alguien podría cambiar una alergia. Un documento que se
//    edita no es un documento. Dicho en device: "se ve súper simple es un texto, y además se puede
//    editar".
//  · PDF: no se edita y se imprime bien, pero exige una librería nueva en el bundle y, en WhatsApp
//    —que es por donde esto va a viajar—, llega como un archivo que hay que abrir.
//  · IMAGEN (esto): no se edita, se VE dentro de la conversación sin abrir nada, se guarda en Fotos,
//    se imprime desde la hoja de compartir, y se dibuja con Canvas, que ya viene en el navegador.
//
// Se dibuja a 2x (1080 px de ancho) para que no se vea borrosa en una pantalla Retina ni al
// imprimirla.
//
// ⚠️ El orden visual NO es el orden de captura: es el orden en que se necesita en una urgencia.
// Quien atiende busca, en este orden, (1) de quién es esto, (2) qué le puede matar, (3) qué tiene,
// (4) qué toma, (5) a quién avisar. De ahí que la cabecera sea un bloque rojo sólido y no una
// tarjeta pálida —una miniatura en WhatsApp tiene que leerse como una alerta médica sin abrirla— y
// que el TELÉFONO se dibuje en grande: es el único dato de la ficha sobre el que se ACTÚA.

import { alergiasOrdenadas, alergiaLabel, medicamentosActivos, contactoLabel,
         condicionesLimpias } from "../domain/emergencia";

const W = 1080;              // ancho final en píxeles
const M = 56;                // margen exterior
const PAD = 40;              // margen interior de cada tarjeta
const ANCHO_UTIL = W - M * 2;

// Los mismos colores de la pantalla, y por la misma razón: el color dice de qué habla cada bloque.
// Cada acento lleva su versión clara para el chip del icono; no se calculan con opacidad porque el
// PNG se comparte sobre fondos que no controlamos y un color translúcido cambiaría de tono.
const C = {
  fondo: "#F6F6FA", tarjeta: "#FFFFFF", borde: "#EAE8F0", linea: "#F1F0F5",
  tinta: "#111827", tinta2: "#6B7280", tinta3: "#9CA3AF",
  rose: "#E11D48", roseHondo: "#9F1239", roseClaro: "#FFE4E8", roseBanda: "#FFF1F2",
  sky: "#0284C7", skyClaro: "#E0F2FE",
  violet: "#7C3AED", violetClaro: "#EDE9FE",
  emerald: "#047857", emeraldClaro: "#D1FAE5",
  cabecera: "#BE123C",
};

const FUENTE = "-apple-system, BlinkMacSystemFont, system-ui, 'Segoe UI', sans-serif";
const font = (px, peso = 400) => `${peso} ${px}px ${FUENTE}`;

// Interletraje a mano, dibujando carácter por carácter. `ctx.letterSpacing` existe pero no en todas
// las versiones de WKWebView, y aquí no se puede degradar en silencio: sin él los rótulos en
// mayúsculas se apelmazan y es justo lo que se está corrigiendo.
function conEspaciado(ctx, texto, x, y, ls) {
  let cx = x;
  for (const ch of String(texto)) { ctx.fillText(ch, cx, y); cx += ctx.measureText(ch).width + ls; }
  return cx - x - ls;
}
const anchoEspaciado = (ctx, texto, ls) =>
  [...String(texto)].reduce((a, ch) => a + ctx.measureText(ch).width + ls, 0) - ls;

// Parte un texto en líneas que caben en `max`. Sin esto, un nombre de medicamento largo o una
// condición explicada se salen de la imagen y se pierde justo el dato que importaba.
function partir(ctx, texto, max) {
  const palabras = String(texto || "").split(/\s+/).filter(Boolean);
  if (!palabras.length) return [""];
  const lineas = [];
  let linea = palabras[0];
  for (let i = 1; i < palabras.length; i++) {
    const prueba = `${linea} ${palabras[i]}`;
    if (ctx.measureText(prueba).width <= max) linea = prueba;
    else { lineas.push(linea); linea = palabras[i]; }
  }
  lineas.push(linea);
  return lineas;
}

function rect(ctx, x, y, w, h, r, relleno, trazo) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
  if (relleno) { ctx.fillStyle = relleno; ctx.fill(); }
  if (trazo) { ctx.strokeStyle = trazo; ctx.lineWidth = 2; ctx.stroke(); }
}

// Los iconos, dibujados a mano en Canvas. No se usan los de la app (lucide es React, no pinta en un
// lienzo) ni emojis: un emoji se dibuja distinto en cada sistema y, en un documento médico, se ve
// barato. Son cuatro trazos simples que aguantan el tamaño al que se ven.
const GLIFOS = {
  // Triángulo de alerta: alergias.
  alerta(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.46);
    ctx.lineTo(cx + s * 0.5, cy + s * 0.4);
    ctx.lineTo(cx - s * 0.5, cy + s * 0.4);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx, cy - s * 0.14); ctx.lineTo(cx, cy + s * 0.1); ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + s * 0.26, ctx.lineWidth * 0.6, 0, Math.PI * 2); ctx.fill();
  },
  // Línea de pulso: condiciones.
  pulso(ctx, cx, cy, s) {
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.5, cy);
    ctx.lineTo(cx - s * 0.22, cy);
    ctx.lineTo(cx - s * 0.08, cy - s * 0.34);
    ctx.lineTo(cx + s * 0.08, cy + s * 0.34);
    ctx.lineTo(cx + s * 0.22, cy);
    ctx.lineTo(cx + s * 0.5, cy);
    ctx.stroke();
  },
  // Cápsula inclinada: medicamentos.
  capsula(ctx, cx, cy, s) {
    ctx.save();
    ctx.translate(cx, cy); ctx.rotate(-Math.PI / 4);
    // Ancha a propósito: con el trazo a 4.5 px un óvalo estrecho no deja hueco interior y la línea
    // del medio se funde con el contorno — se leía como una etiqueta, no como una pastilla.
    const w = s * 0.56, h = s * 1.04;
    ctx.beginPath();
    ctx.moveTo(-w / 2, -h / 2 + w / 2);
    ctx.arcTo(-w / 2, -h / 2, 0, -h / 2, w / 2);
    ctx.arcTo(w / 2, -h / 2, w / 2, 0, w / 2);
    ctx.lineTo(w / 2, h / 2 - w / 2);
    ctx.arcTo(w / 2, h / 2, 0, h / 2, w / 2);
    ctx.arcTo(-w / 2, h / 2, -w / 2, 0, w / 2);
    ctx.closePath(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.lineTo(w / 2, 0); ctx.stroke();
    ctx.restore();
  },
  // Teléfono: a quién llamar.
  telefono(ctx, cx, cy, s) {
    const w = s * 0.58, h = s * 0.96;
    rect(ctx, cx - w / 2, cy - h / 2, w, h, s * 0.14, null, null);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(cx - s * 0.1, cy - h / 2 + s * 0.14);
    ctx.lineTo(cx + s * 0.1, cy - h / 2 + s * 0.14); ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy + h / 2 - s * 0.17, ctx.lineWidth * 0.65, 0, Math.PI * 2); ctx.fill();
  },
};

// Arma las secciones a partir del MISMO dominio que pinta la pantalla. Así la imagen no puede
// desincronizarse de lo que la persona vio: si un suspendido no se pinta, tampoco se comparte.
function secciones(paciente, pills) {
  const out = [];
  const al = alergiasOrdenadas(paciente?.alergias);
  if (al.length) out.push({
    titulo: "ALERGIAS", color: C.rose, claro: C.roseClaro, glifo: "alerta",
    items: al.map(a => {
      const g = String(a.gravedad || "").toLowerCase();
      return { texto: alergiaLabel(a), etiqueta: a.gravedad || null, grave: g === "grave" };
    }),
  });
  const cond = condicionesLimpias(paciente?.condiciones);
  if (cond.length) out.push({
    titulo: "CONDICIONES", color: C.sky, claro: C.skyClaro, glifo: "pulso",
    items: cond.map(c => ({ texto: c })),
  });
  const meds = medicamentosActivos(pills);
  if (meds.length) out.push({
    titulo: "MEDICAMENTOS QUE TOMA", color: C.violet, claro: C.violetClaro, glifo: "capsula",
    items: meds.map(m => ({ texto: m.nombre, detalle: m.detalle, motivo: m.motivo })),
  });
  // El contacto no es una fila más: se compone aparte para que el TELÉFONO salga grande. Es lo
  // único de la ficha sobre lo que se actúa, y en la versión anterior se leía igual que una alergia.
  const nom = String(paciente?.contacto_nombre || "").trim();
  const tel = String(paciente?.contacto_telefono || "").trim();
  if (contactoLabel(paciente)) {
    const rel = String(paciente?.contacto_relacion || "").trim();
    out.push({
      titulo: "A QUIÉN LLAMAR", color: C.emerald, claro: C.emeraldClaro, glifo: "telefono",
      items: [{ tipo: "contacto", quien: rel ? `${nom} — ${rel}` : nom, telefono: tel }],
    });
  }
  return out;
}

// Alturas de cada pieza. Nombradas porque se usan dos veces: al medir y al dibujar, y si se separan
// la imagen sale con la mitad del último bloque cortada.
const AL_ITEM = 48, AL_DET = 38, CHIP = 76, TRAS_CHIP = 34, GAP_ITEM = 30, GAP_SEC = 26;

// Devuelve la imagen como base64 (sin el prefijo data:) y su nombre de archivo.
export function fichaComoImagen(paciente, pills, hoyTexto) {
  const secs = secciones(paciente, pills);
  const nombre = String(paciente?.nombre || "").trim();
  // "Yo" no se escribe: es el nombre que la app pone al primer paciente y, en algo que se manda a
  // otra persona, no dice nada. Cualquier otro nombre SÍ va — compartir la ficha de "Mamá" sin
  // decirlo sería el error grave aquí.
  const titular = nombre && nombre.toLowerCase() !== "yo" ? nombre : null;

  // PRIMERA PASADA: medir. Se necesita el alto antes de crear el lienzo, y el alto depende de
  // cuántas líneas ocupe cada texto.
  const md = document.createElement("canvas").getContext("2d");
  const plano = secs.map(sec => {
    const items = sec.items.map(it => {
      if (it.tipo === "contacto") return { ...it, alto: 36 + 66 };
      md.font = font(22, 800);
      const anchoBadge = it.etiqueta ? anchoEspaciado(md, String(it.etiqueta).toUpperCase(), 1.5) + 34 + 16 : 0;
      md.font = font(34, 700);
      const lineas = partir(md, it.texto, ANCHO_UTIL - PAD * 2 - anchoBadge);
      md.font = font(26, 400);
      const det = it.detalle ? partir(md, it.detalle, ANCHO_UTIL - PAD * 2) : [];
      // El PARA QUÉ se mide aparte porque se dibuja más oscuro y algo más grueso que la dosis. De
      // las dos líneas es la única que entiende quien no sabe leer nombres de fármacos, y en una
      // urgencia esa persona puede ser la primera en llegar.
      md.font = font(26, 600);
      const mot = it.motivo ? partir(md, it.motivo, ANCHO_UTIL - PAD * 2) : [];
      const alto = lineas.length * AL_ITEM + (det.length ? det.length * AL_DET + 4 : 0)
                   + (mot.length ? mot.length * AL_DET : 0)
                   + (it.grave ? 26 : 0);
      return { ...it, lineas, det, mot, anchoBadge, alto };
    });
    const cuerpo = items.reduce((a, b) => a + b.alto, 0) + GAP_ITEM * (items.length - 1);
    return { ...sec, items, alto: PAD + CHIP + TRAS_CHIP + cuerpo + PAD };
  });

  const altoCab = titular ? 244 : 196;
  const H = M + altoCab + GAP_SEC + plano.reduce((a, s) => a + s.alto + GAP_SEC, 0) + 96 + M;

  const canvas = document.createElement("canvas");
  canvas.width = W; canvas.height = Math.round(H);
  const ctx = canvas.getContext("2d");
  ctx.textBaseline = "alphabetic";
  ctx.fillStyle = C.fondo;
  ctx.fillRect(0, 0, W, H);

  // CABECERA en rojo SÓLIDO. Antes era rosa pálido y se leía como una tarjeta más; una miniatura en
  // una conversación tiene que decir "esto es una urgencia" antes de que nadie la abra.
  let y = M;
  rect(ctx, M, y, ANCHO_UTIL, altoCab, 34, C.cabecera, null);
  // El triángulo de alerta al fondo, grande y apenas más claro que el rojo: da peso al bloque sin
  // competir con el texto ni ensuciarlo.
  ctx.save();
  ctx.beginPath(); rect(ctx, M, y, ANCHO_UTIL, altoCab, 34, null, null); ctx.clip();
  ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 12;
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  GLIFOS.alerta(ctx, W - M - 118, y + altoCab / 2, 190);
  ctx.restore();

  // Con nombre: "FICHA DE EMERGENCIA" es el rótulo y el NOMBRE es el titular grande — quien recibe
  // la imagen necesita saber de quién es antes que nada. Sin nombre no hay rótulo: el título grande
  // pasa a ser "FICHA DE EMERGENCIA". Dejarlo solo como rótulo pequeño dejaba la cabecera sin
  // titular y la imagen sin decir qué era.
  if (titular) {
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    ctx.font = font(24, 800);
    conEspaciado(ctx, "FICHA DE EMERGENCIA", M + PAD, y + 74, 3);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = font(58, 900);
    ctx.fillText(titular, M + PAD, y + 148);
  } else {
    ctx.fillStyle = "#FFFFFF";
    ctx.font = font(46, 900);
    ctx.fillText("FICHA DE EMERGENCIA", M + PAD, y + 106);
  }
  ctx.fillStyle = "rgba(255,255,255,0.78)";
  ctx.font = font(27, 500);
  ctx.fillText("Lo que hay que saber en una urgencia", M + PAD, y + (titular ? 198 : 156));
  y += altoCab + GAP_SEC;

  // Cada sección, su tarjeta: chip con icono + rótulo, y debajo las filas separadas por un filete.
  plano.forEach(sec => {
    rect(ctx, M, y, ANCHO_UTIL, sec.alto, 30, C.tarjeta, C.borde);

    rect(ctx, M + PAD, y + PAD, CHIP, CHIP, 22, sec.claro, null);
    ctx.save();
    ctx.strokeStyle = sec.color; ctx.fillStyle = sec.color;
    ctx.lineWidth = 4.5; ctx.lineJoin = "round"; ctx.lineCap = "round";
    GLIFOS[sec.glifo](ctx, M + PAD + CHIP / 2, y + PAD + CHIP / 2, 38);
    ctx.restore();

    ctx.fillStyle = sec.color;
    ctx.font = font(26, 800);
    conEspaciado(ctx, sec.titulo, M + PAD + CHIP + 22, y + PAD + CHIP / 2 + 9, 2.5);

    let iy = y + PAD + CHIP + TRAS_CHIP;
    sec.items.forEach((b, i) => {
      // El filete entre filas. Sin él "Mariscos" y "Soya" se leían como un párrafo de dos líneas.
      if (i > 0) {
        ctx.strokeStyle = C.linea; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(M + PAD, iy - GAP_ITEM / 2);
        ctx.lineTo(W - M - PAD, iy - GAP_ITEM / 2);
        ctx.stroke();
      }

      if (b.tipo === "contacto") {
        ctx.fillStyle = C.tinta2; ctx.font = font(26, 600);
        ctx.fillText(b.quien, M + PAD, iy + 22);
        // El teléfono, en grande. Es el dato que alguien va a marcar con prisa, posiblemente
        // leyéndolo de la pantalla de otro teléfono.
        ctx.fillStyle = C.emerald; ctx.font = font(52, 900);
        ctx.fillText(b.telefono, M + PAD, iy + 88);
        iy += b.alto + GAP_ITEM;
        return;
      }

      // Una alergia GRAVE lleva banda propia y una barra roja a la izquierda: en una imagen sin
      // interacción, el color es lo único que hace saltar lo que puede matar a esta persona.
      let ty = iy;
      if (b.grave) {
        rect(ctx, M + PAD - 18, iy - 6, ANCHO_UTIL - PAD * 2 + 36, b.alto - 4, 16, C.roseBanda, null);
        rect(ctx, M + PAD - 18, iy - 6, 8, b.alto - 4, 4, C.rose, null);
        ty = iy + 13;
      }

      ctx.fillStyle = b.grave ? C.roseHondo : C.tinta;
      ctx.font = font(34, b.grave ? 800 : 700);
      b.lineas.forEach((l, k) => ctx.fillText(l, M + PAD, ty + 34 + k * AL_ITEM));

      if (b.etiqueta) {
        const et = String(b.etiqueta).toUpperCase();
        ctx.font = font(22, 800);
        const w = anchoEspaciado(ctx, et, 1.5) + 34;
        const x = W - M - PAD - w;
        rect(ctx, x, ty + 8, w, 40, 20, b.grave ? C.rose : "#F3F4F6", null);
        ctx.fillStyle = b.grave ? "#FFFFFF" : C.tinta2;
        conEspaciado(ctx, et, x + 17, ty + 35, 1.5);
      }

      const dy = ty + 34 + b.lineas.length * AL_ITEM;
      if (b.det.length) {
        ctx.fillStyle = C.tinta3; ctx.font = font(26, 400);
        b.det.forEach((l, k) => ctx.fillText(l, M + PAD, dy + k * AL_DET - 4));
      }
      if (b.mot?.length) {
        const my = dy + (b.det.length ? b.det.length * AL_DET : 0);
        ctx.fillStyle = C.tinta2; ctx.font = font(26, 600);
        b.mot.forEach((l, k) => ctx.fillText(l, M + PAD, my + k * AL_DET - 4));
      }
      iy += b.alto + GAP_ITEM;
    });
    y += sec.alto + GAP_SEC;
  });

  // PIE con la fecha, centrado y con su filete. Sin fecha, quien la recibe no puede saber si es de
  // hoy o de hace dos años, y con los medicamentos eso cambia lo que decide.
  ctx.strokeStyle = C.borde; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(M + PAD, y + 22); ctx.lineTo(W - M - PAD, y + 22); ctx.stroke();
  ctx.fillStyle = C.tinta3; ctx.font = font(24, 600);
  const pie = hoyTexto ? `Actualizada el ${hoyTexto} · Mi Pastillero` : "Mi Pastillero";
  const wPie = ctx.measureText(pie).width;
  ctx.fillText(pie, (W - wPie) / 2, y + 68);

  const safe = (titular || "ficha").replace(/[^a-zA-Z0-9_-]/g, "_");
  return {
    base64: canvas.toDataURL("image/png").split(",")[1],
    nombre: `ficha-emergencia_${safe}.png`,
    ancho: canvas.width, alto: canvas.height,
  };
}
