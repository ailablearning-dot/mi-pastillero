// Una dosis POSPUESTA: "esta la aplacé, me avisan a las 11:10".
//
// ⚠️ NO es un estado de la base de datos, y no debe serlo. `medicamentos.tomado` es un booleano
// —tomada o no tomada— y meter ahí un tercer valor contaminaría la adherencia, el calendario y el
// Excel del médico. Peor todavía: una dosis pospuesta que luego SÍ se toma contaría dos veces.
// Posponer no dice nada sobre si el medicamento entró en el cuerpo, que es lo único que registra
// el historial. Es información del momento, no del expediente.
//
// Por eso vive solo en el teléfono, caduca sola y no viaja a ningún sitio.
//
// Y se DERIVA, no se caza: lo único que se guarda es el instante del aviso, y de ahí sale todo lo
// demás comparando con el reloj. Así sobrevive a cerrar la app —que es justo el caso de uso:
// pospones a las 10:00 y vuelves a mirar a las 10:20— y no hay ninguna bandera que alguien tenga
// que acordarse de limpiar. Cuando pasa la hora, la marca deja de valer sin que nadie haga nada.

// Las marcas se guardan en un solo objeto { clave: marca }. La clave lleva la FECHA porque
// `doseKey` (pastilla_hora) se repite todos los días: sin ella, posponer la dosis de las 10:00 de
// hoy pintaría también la de mañana.
export const claveMarca = (dateStr, doseKey) => `${dateStr}_${doseKey}`;

// Una marca es { hasta: <ms epoch>, hora: "HH:MM" }. Los dos salen del MISMO instante en el mismo
// momento de escribirlos, así que no pueden contradecirse: `hasta` decide, `hora` se enseña.
export const nuevaMarca = (hastaMs, hora) => ({ hasta: hastaMs, hora });

// ¿Sigue viva? Una marca cuya hora ya pasó no es "pospuesta": el aviso ya sonó y la dosis volvió a
// estar simplemente pendiente. Sin fecha o con basura, NO está pospuesta — el caso seguro es no
// pintar nada, nunca prometer un aviso que no sabemos si existe.
export function estaPospuesta(marca, ahoraMs) {
  if (!marca || typeof marca.hasta !== "number") return false;
  return marca.hasta > ahoraMs;
}

// Lo que decide si la fila del home enseña la insignia. Va aquí y no en la pantalla porque la
// condición tiene una mitad que es fácil olvidar: **una dosis ya registrada nunca es pospuesta**.
// Si se marca como tomada antes de que suene el aviso, manda el registro.
export function pospuestaVisible(registro, marca, ahoraMs) {
  if (registro) return false;
  return estaPospuesta(marca, ahoraMs);
}

export function posponerHasta(mapa, dateStr, doseKey, hastaMs, hora) {
  return { ...(mapa || {}), [claveMarca(dateStr, doseKey)]: nuevaMarca(hastaMs, hora) };
}

// Se llama al registrar la dosis (tomada o no) y al deshacer el registro: en los dos casos la
// posposición dejó de significar algo. Es el mismo momento en que se cancela la notificación.
export function quitarPosposicion(mapa, dateStr, doseKey) {
  const clave = claveMarca(dateStr, doseKey);
  if (!mapa || !(clave in mapa)) return mapa || {};
  const { [clave]: _, ...resto } = mapa;
  return resto;
}

// Poda las vencidas al leer y al escribir. Sin esto el objeto crece para siempre en el teléfono:
// una marca por dosis pospuesta, y ninguna se borraría nunca.
export function limpiarVencidas(mapa, ahoraMs) {
  const vivas = {};
  for (const [clave, marca] of Object.entries(mapa || {})) {
    if (estaPospuesta(marca, ahoraMs)) vivas[clave] = marca;
  }
  return vivas;
}
