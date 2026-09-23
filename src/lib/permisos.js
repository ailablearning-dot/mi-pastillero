// Los permisos que Android necesita para que un recordatorio llegue de verdad.
//
// En iOS esto no existe: basta con pedir permiso para notificar. En Android el sistema apaga las
// apps que no usa, y encima cada fabricante añade su propia capa de ahorro — Xiaomi, Samsung,
// Huawei, Oppo y Vivo son la causa número uno de recordatorios que no llegan.
//
// El estado lo consulta el plugin nativo `Permisos` (android/app/src/main/java/.../PermisosPlugin.java),
// porque nada de esto se puede saber desde JavaScript.

import { registerPlugin, Capacitor } from "@capacitor/core";

const Permisos = registerPlugin("Permisos");

export const esAndroid = () => Capacitor.getPlatform?.() === "android";

// En iOS y en web no hay nada que pedir: se devuelve todo concedido para que la pantalla ni
// siquiera se plantee aparecer.
const TODO_BIEN = { notificaciones: true, bateria: true, noMolestar: true, fabricante: "", modelo: "" };

export async function estadoPermisos() {
  if (!esAndroid()) return TODO_BIEN;
  try {
    return await Permisos.estado();
  } catch (e) {
    // Si el plugin falla no se bloquea a nadie: se asume lo mejor y la app sigue. Un fallo aquí no
    // puede impedir usar el pastillero.
    console.warn("[permisos]", e);
    return TODO_BIEN;
  }
}

export const abrirAjustesDeLaApp    = () => esAndroid() && Permisos.abrirAjustesDeLaApp().catch(() => {});
// Un toque, con diálogo del sistema encima de la app. Si el permiso restringido no estuviera,
// el lado nativo cae solo a la ficha de ajustes; aquí no hay que saberlo.
export const pedirExencionBateria   = () => esAndroid() && Permisos.pedirExencionBateria().catch(() => {});
export const abrirAjustesNoMolestar = () => esAndroid() && Permisos.abrirAjustesNoMolestar().catch(() => {});
export const abrirAjustesDeSonido   = () => esAndroid() && Permisos.abrirAjustesDeSonido().catch(() => {});

// ── Las marcas que apagan apps ────────────────────────────────────────────────────────────────
//
// Vive aquí, en una tabla, y no repartido por la pantalla: estas rutas cambian con cada versión de
// MIUI o de One UI, y hay que poder corregirlas sin tocar la interfaz.
//
// ⚠️ Cada entrada hay que verificarla en un teléfono de esa marca. Las de aquí están escritas desde
// la documentación de cada fabricante, NO comprobadas en device — salvo la que se pruebe.
// Una instrucción equivocada es peor que ninguna: manda a la persona a un menú que no existe y la
// convence de que la app está rota.
const MARCAS = {
  xiaomi: {
    nombre: "Xiaomi",
    pasos: [
      "Ajustes → Aplicaciones → Mi Pastillero",
      "Ahorro de batería → Sin restricciones",
      "Inicio automático → Activar",
    ],
  },
  redmi:   { alias: "xiaomi" },
  poco:    { alias: "xiaomi" },
  samsung: {
    nombre: "Samsung",
    pasos: [
      "Ajustes → Aplicaciones → Mi Pastillero",
      "Batería → Sin restricciones",
      "Quitarla de «Aplicaciones en suspensión»",
    ],
  },
  huawei: {
    nombre: "Huawei",
    pasos: [
      "Ajustes → Batería → Inicio de aplicaciones",
      "Mi Pastillero → Gestionar manualmente",
      "Activar las tres opciones",
    ],
  },
  honor: { alias: "huawei" },
  oppo: {
    nombre: "Oppo",
    pasos: [
      "Ajustes → Batería → Mi Pastillero",
      "Permitir actividad en segundo plano",
      "Inicio automático → Activar",
    ],
  },
  realme: { alias: "oppo" },
  vivo: {
    nombre: "Vivo",
    pasos: [
      "Ajustes → Batería → Consumo en segundo plano",
      "Mi Pastillero → Permitir",
      "Inicio automático → Activar",
    ],
  },
};

// Devuelve las instrucciones de ESA marca, o null si el teléfono no necesita ninguna.
//
// En un Pixel o un Motorola no aparece nada, y eso es deliberado: enseñar una lista de cinco marcas
// a quien no la necesita es ruido, y a quien sí la necesita le obliga a buscarse.
export function instruccionesDe(fabricante) {
  const clave = String(fabricante || "").toLowerCase().trim();
  let m = MARCAS[clave];
  if (m?.alias) m = MARCAS[m.alias];
  return m?.nombre ? m : null;
}

// ¿Falta algo de lo obligatorio? Es lo que decide si el inicio enseña el aviso.
//
// El No Molestar NO cuenta: es opcional a propósito, y avisar por él sería regañar a quien ya
// decidió que no lo quiere.
export const faltaAlgoImportante = (estado) =>
  !!estado && (!estado.notificaciones || !estado.bateria);
