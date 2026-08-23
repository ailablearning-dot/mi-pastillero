// Cuántas quedan en la caja, y cuándo se acaban.
//
// Lo pidió Karen probando la app. Va gratis: es motor de hábito, como los recordatorios.
// El razonamiento de diseño completo está en `docs/prototipos/inventario-caja.html`.
//
// ⚠️ SE DERIVA, NO SE DESCUENTA. No hay ningún contador que baje con cada toma. Se guarda un
// CORTE —"a esta hora de este día había 30"— y lo que queda sale de restar las tomas registradas
// después. La diferencia solo se nota cuando algo va mal, que es cuando importa:
//
//   · Al DESHACER un registro, un contador tendría que volver a subir, y habría que acordarse de
//     subirlo en cada sitio donde se puede deshacer. Aquí la fila deja de existir y el número
//     vuelve solo.
//   · SIN CONEXIÓN, un contador obliga a elegir entre restar al marcar (y mentir si la subida
//     falla) o al subir (y mentir hasta entonces). Derivado, el número siempre concuerda con lo
//     que se ve en el historial, porque sale del mismo sitio.
//   · Hoy se marca una dosis desde TRES sitios (la hoja de la dosis, la de grupo y la
//     notificación). Un contador necesita que los tres resten bien, y cualquiera que se añada
//     mañana también. Aquí solo hay un sitio donde se calcula.
//
// Y lo que lo vuelve grave: un contador equivocado no se ve equivocado. Dice "te quedan 3" con la
// misma cara con la que diría 12. En una app de medicación un número que miente en silencio es
// peor que no dar ningún número.
//
// Es la misma lección que "esta persona vuelve de haber pagado", que costó dos intentos.

import { getHoras, isPillDueOnDay } from "./schedule.js";
import { cantidadPara } from "./dosage.js";
import { llevaControlDeCaja } from "./medTypes.js";
import { fmtDate } from "./dates.js";

// El umbral del aviso va en DÍAS y no en unidades. "Avísame cuando quede 1" da un día de margen a
// quien toma una al día y ocho horas a quien toma tres: el mismo número, dos avisos, y el segundo
// llega tarde para ir a la farmacia. Los días son la unidad en la que se actúa.
export const AVISO_DIAS_POR_DEFECTO = 5;

// Hasta dónde se camina buscando el día en que se acaba. Un año es de sobra para cualquier caja y
// pone techo al bucle si una pauta rarísima no consume nunca.
const DIAS_MAX = 366;

// Las existencias tienen su propio parser y NO usan el de las dosis, aunque se parezcan. El de
// las dosis rechaza el cero a propósito —una toma de cero pastillas no existe— y aquí el cero es
// un estado real, el más urgente de todos: "conté y no me queda ninguna". Reusarlo haría
// desaparecer la caja justo cuando hay que avisar.
export const parseExistencias = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
};

// ¿Este medicamento lleva control de caja? Hacen falta las dos cosas: que se haya contado alguna
// vez y que el TIPO se cuente por unidades sueltas (pastillas y cápsulas, ver `TIPOS_CON_CAJA`).
// "¿Cuántas cucharadas de jarabe te quedan?" no es una pregunta que nadie sepa contestar mirando
// el frasco, y "¿cuántas pomadas?" directamente no significa nada.
export const llevaCaja = (pill) =>
  llevaControlDeCaja(pill) && parseExistencias(pill?.existencias) !== null && !!pill?.existencias_fecha;

// ¿Esta toma es posterior al corte? El corte lleva HORA porque la pregunta que se le hace a la
// persona es "¿cuántas tienes ahora?", y puede contestarla a media tarde con la toma de la mañana
// ya hecha. Solo con la fecha habría que adivinar si las tomas de ese día cuentan, y cualquiera de
// las dos respuestas se equivoca en un comprimido según cuándo contó.
//
// Se compara la hora REAL de la toma (`hora`), no la programada: es el momento en que ocurrió.
export function tomaPosteriorAlCorte(toma, fechaCorte, horaCorte) {
  if (!toma?.fecha || !fechaCorte) return false;
  const f = String(toma.fecha).slice(0, 10);
  if (f > fechaCorte) return true;
  if (f < fechaCorte) return false;
  // Mismo día: decide la hora. Sin hora de corte se cuenta el día entero, que es el
  // comportamiento de una fila vieja anterior a esta función.
  if (!horaCorte) return true;
  return String(toma.hora || "").slice(0, 8) > String(horaCorte).slice(0, 8);
}

// Lo consumido desde el corte. `tomas` son las de ESTE medicamento y solo las tomadas de verdad
// (`tomado === true`): una dosis marcada como NO tomada no salió de la caja.
export function consumidoDesdeElCorte(pill, tomas) {
  return (tomas || [])
    .filter(t => t?.tomado === true && tomaPosteriorAlCorte(t, pill?.existencias_fecha, pill?.existencias_hora))
    .reduce((suma, t) => suma + (cantidadPara(pill, String(t.hora_programada || "").slice(0, 5)) ?? 1), 0);
}

// Lo que queda AHORA. null si este medicamento no lleva control de caja.
// Nunca baja de 0: un negativo solo puede venir de que la persona tomó más de lo que dijo tener, y
// "te quedan -2" no informa de nada.
export function unidadesQueQuedan(pill, tomas) {
  if (!llevaCaja(pill)) return null;
  const quedan = parseExistencias(pill.existencias) - consumidoDesdeElCorte(pill, tomas);
  return Math.max(0, Math.round(quedan * 100) / 100);
}

const sumarDias = (dateStr, n) => {
  const [y, m, d] = dateStr.split("-").map(Number);
  const dt = new Date(y, m - 1, d + n);
  return fmtDate(dt.getFullYear(), dt.getMonth(), dt.getDate());
};

// Lo que consume este medicamento en un día concreto, según su pauta. 0 los días que no toca.
export function consumoDelDia(pill, dateStr) {
  if (!isPillDueOnDay(pill, dateStr)) return 0;
  const horas = getHoras(pill.hora_toma, pill.frecuencia);
  return (horas.length ? horas : ["00:00"]).reduce((s, h) => s + (cantidadPara(pill, h) ?? 1), 0);
}

// El primer día que NO se va a poder completar con lo que queda. null si no lleva caja, si no
// queda nada o si no se acaba dentro del horizonte.
//
// ⚠️ Se empieza a contar MAÑANA, no hoy. Parte de hoy puede estar ya tomada y esas unidades ya se
// restaron al calcular `quedan`; volver a contarlas aquí las restaría dos veces. El efecto es que
// la estimación se queda corta en menos de un día, o sea que avisa un pelo ANTES — que es el lado
// seguro para un aviso de "ve a la farmacia".
export function seAcabaEl(pill, quedan, hoyStr) {
  if (!llevaCaja(pill) || !(quedan > 0)) return null;
  let restante = quedan;
  for (let i = 1; i <= DIAS_MAX; i++) {
    const dia = sumarDias(hoyStr, i);
    const consumo = consumoDelDia(pill, dia);
    if (consumo <= 0) continue;
    if (restante < consumo) return dia;   // ese día ya no alcanza
    restante -= consumo;
  }
  return null;
}

// Cuántos días completos de tomas cubre lo que queda. 0 = ya no alcanza para mañana.
export function diasQueAlcanzan(pill, quedan, hoyStr) {
  if (!llevaCaja(pill)) return null;
  if (!(quedan > 0)) return 0;
  let restante = quedan, dias = 0;
  for (let i = 1; i <= DIAS_MAX; i++) {
    const consumo = consumoDelDia(pill, sumarDias(hoyStr, i));
    if (consumo <= 0) continue;
    if (restante < consumo) return dias;
    restante -= consumo;
    dias++;
  }
  return dias;
}

// ¿Toca avisar? Sin umbral no se avisa: quien no lo pidió no quiere una banda ámbar en su pantalla
// principal. Con 0 unidades sí se avisa siempre que lleve caja — es el caso más urgente de todos.
export function estaPorAcabarse(pill, quedan, hoyStr) {
  if (!llevaCaja(pill) || pill.aviso_dias == null) return false;
  if (!(quedan > 0)) return true;
  return diasQueAlcanzan(pill, quedan, hoyStr) <= Number(pill.aviso_dias);
}

// Las tomas de UN medicamento sacadas de `records`, que es el historial del mes que la app ya
// tiene cargado y va actualizando de forma optimista al marcar. Sirve para que el número reaccione
// al instante sin pedir nada a la red: el camino de marcar una dosis se recorre veinte veces por
// semana y no puede pagar una consulta más.
//
// La clave de cada registro es `${pill.id}_${hora}`. Se recorta por longitud y no por split("_")
// porque un id creado sin conexión puede llevar guiones bajos.
export function tomasDeRecords(pill, records) {
  const prefijo = `${pill?.id}_`;
  const out = [];
  for (const [fecha, dia] of Object.entries(records || {})) {
    for (const [clave, r] of Object.entries(dia || {})) {
      if (!clave.startsWith(prefijo)) continue;
      out.push({ fecha, hora: r?.time, hora_programada: clave.slice(prefijo.length), tomado: r?.tomado });
    }
  }
  return out;
}

// ¿Lo que se acaba de escribir en el formulario es un RECUENTO —"las volví a contar y tengo
// otras"— o es el mismo número que la app ya estaba enseñando?
//
// Importa porque solo un recuento mueve el corte. Si el corte se moviera al guardar sin haber
// contado, las tomas ya restadas dejarían de contarse y el número subiría solo.
//
// Y se compara contra LO QUE QUEDA, no contra el corte guardado. Es el fallo que apareció en
// device: el campo enseñaba el corte (5) bajo la etiqueta "¿cuántas tienes ahora?" mientras el
// home decía 4. Con el campo ya corregido para enseñar lo que queda, guardar sin tocar nada tiene
// que ser un no-op — y lo es solo si la comparación es contra ese mismo número.
export function esRecuento(nuevo, quedanAhora, existenciasGuardadas) {
  const n = parseExistencias(nuevo);
  if (n === null) return false;
  const referencia = quedanAhora === null || quedanAhora === undefined
    ? parseExistencias(existenciasGuardadas)
    : parseExistencias(quedanAhora);
  return n !== referencia;
}
