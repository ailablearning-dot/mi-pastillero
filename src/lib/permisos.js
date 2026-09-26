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
// Los Ajustes a secas. Es a donde manda la tarjeta de fabricante: el menú exacto está protegido por
// el sistema y no se puede abrir desde una app (ver el comentario del lado nativo).
export const abrirAjustes           = () => esAndroid() && Permisos.abrirAjustes().catch(() => {});
// Un toque, con diálogo del sistema encima de la app. Si el permiso restringido no estuviera,
// el lado nativo cae solo a la ficha de ajustes; aquí no hay que saberlo.
export const pedirExencionBateria   = () => esAndroid() && Permisos.pedirExencionBateria().catch(() => {});
export const abrirAjustesNoMolestar = () => esAndroid() && Permisos.abrirAjustesNoMolestar().catch(() => {});
export const abrirAjustesDeSonido   = () => esAndroid() && Permisos.abrirAjustesDeSonido().catch(() => {});

// Retira los avisos de la persiana. Va por NUESTRO plugin y no por el de notificaciones porque el
// de éste no funciona en Android: sus tres métodos de retirada se llaman sin error y no retiran
// nada (comprobado en el A06 el 2026-09-26). Ver PermisosPlugin.limpiarAvisos.
export const limpiarAvisosNativo     = () => esAndroid() && Permisos.limpiarAvisos().catch(() => {});

// ── Las marcas que apagan apps ────────────────────────────────────────────────────────────────
//
// Vive aquí, en una tabla, y no repartido por la pantalla: estas rutas cambian con cada versión de
// MIUI o de One UI, y hay que poder corregirlas sin tocar la interfaz.
//
// ⚠️ SOLO SAMSUNG ESTÁ VERIFICADA EN UN TELÉFONO DE VERDAD (ver su comentario). Las otras cuatro
// salen de la documentación de cada fabricante y de dontkillmyapp.com, y el Samsung enseñó por qué
// eso no basta: de los tres pasos que había escrito de oídas, LOS TRES estaban mal — uno sobraba,
// otro mandaba a un menú que en ese teléfono no existe, y el tercero nombraba una lista que se
// llama de otra forma. No hay razón para pensar que Xiaomi, Huawei, Oppo o Vivo salieran mejor.
//
// Se quedan porque una pista imperfecta sigue siendo mejor que el silencio, pero NO se dan por
// buenas: en cuanto haya un teléfono de esa marca a mano, se comprueban igual que este.
//
// Y una lección que vale para todas: la instrucción útil es PREVENTIVA («añádela a la lista de las
// que no se duermen»), no reactiva («quítala de la lista si aparece»). Cuando la app ya aparece en
// la lista de dormidas, la persona ya se saltó una toma.
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
  // ❌ SAMSUNG SE QUITÓ, Y LA RAZÓN MERECE QUEDARSE ESCRITA.
  //
  // Llegó a tener cuatro pasos verificados uno a uno en un Galaxy A06 (One UI 6.1), después de
  // descubrir que los tres que había escritos desde la documentación estaban mal. Los cuatro
  // buenos terminaban en: «Aplicaciones sin autosuspensión → Añadir aplicaciones → Mi Pastillero».
  //
  // El 2026-09-25, con el teléfono delante, ese último paso resultó IMPOSIBLE: en el selector de
  // «Añadir aplicaciones» Mi Pastillero no se ofrece. Y no es un fallo de la búsqueda —«Calcul»
  // encuentra Calculadora, «mi» encuentra Gaming Hub y Reminder, o sea que busca dentro del
  // nombre—, ni de que la app estuviera abierta (se cerró del todo y siguió sin salir), ni de la
  // exención de batería (se quitó y se volvió a probar: igual). Samsung sencillamente no la lista.
  //
  // No se sabe por qué, y se deja de averiguarlo: da igual. Una instrucción que la persona NO
  // PUEDE completar es peor que no dar ninguna — la deja convencida de que hizo algo mal.
  //
  // Lo que sí protege a los Samsung ya está hecho por otro lado: la exención de batería, que
  // concede el botón de la segunda fila, y la notificación a pantalla completa, que se salta el
  // estilo "Sólo ícono" de su pantalla de bloqueo.
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
