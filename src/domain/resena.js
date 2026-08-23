// Cuándo pedir la valoración en la App Store.
//
// La regla, y es lo único que importa de este módulo: **se pide por LOGRO, no por calendario.**
// "A los N días de instalar" es el criterio equivocado con los números de esta app — de 16 cuentas,
// 11 nunca agregaron un medicamento. A esas personas el día 5 les llega una petición de valorar
// algo que no han usado, y de ahí sale una estrella, o peor: les recuerda que la app existe justo
// para desinstalarla.
//
// Es el mismo error que ya se corrigió con la prueba de 7 días, que dejó de arrancar en el segundo
// cero y arranca al chocar con una necesidad real.
//
// Y se DERIVA de las dosis que ya están registradas, no de un contador que haya que ir subiendo.
// Así vale retroactivamente para quien lleva semanas usando la app desde antes de que este código
// existiera, y no hay ninguna cuenta que pueda desincronizarse.
//
// ⚠️ Lo que hay que aceptar de entrada: la hoja es del sistema, Apple decide si la enseña (máximo
// 3 veces al año) y **no hay forma de saber si salió ni si dejaron reseña**. No hay segunda
// oportunidad ni medición, así que la condición es deliberadamente conservadora: más vale no
// pedirla que pedirla en mal momento.

export const DIAS_PARA_PEDIR = 5;

// Días DISTINTOS en los que se tomó al menos una dosis. Cuenta `tomado === true` y no "hay
// registro": un día entero marcado como NO tomado no es un día de éxito, y pedir estrellas después
// de eso es pedirlas justo después de un fallo.
export function diasConDosisTomada(records) {
  return Object.values(records || {})
    .filter(dia => Object.values(dia || {}).some(r => r?.tomado === true))
    .length;
}

// ¿Se acaba de cerrar el día entero, y bien? Todas las dosis previstas registradas Y todas tomadas.
// Que esté completo NO basta: un día "registrado" puede serlo a base de "no lo he tomado", y ese es
// exactamente el momento en el que no se pide nada.
export function diaCerradoBien(registrosDelDia, clavesDelDia) {
  if (!clavesDelDia?.length) return false;
  return clavesDelDia.every(k => registrosDelDia?.[k]?.tomado === true);
}

// La decisión. `yaSePidio` llega como null mientras no se ha leído del almacén: en ese caso NO se
// decide todavía. El caso seguro es callarse — pedirla dos veces gasta un tiro que no se puede
// medir, y Apple ya limita por su cuenta.
export function tocaPedirResena({ diaCompleto, diasBuenos, yaSePidio }) {
  if (yaSePidio !== false) return false;
  if (!diaCompleto) return false;
  return diasBuenos >= DIAS_PARA_PEDIR;
}
