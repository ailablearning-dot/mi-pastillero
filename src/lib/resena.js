// La petición de valoración en la App Store. CUÁNDO se pide vive en `domain/resena.js`, con
// pruebas; aquí solo está el efecto: llamar a iOS y recordar que ya se hizo.
import { InAppReview } from '@capacitor-community/in-app-review';
import { safeStorage } from './storage';

// La marca va en Preferences y no en localStorage porque tiene que sobrevivir a cerrar la app.
// Que MUERA al desinstalar es correcto y no hace falta protegerse: Apple limita la hoja a tres
// veces al año por usuario por su cuenta, así que reinstalar no abre ninguna puerta a insistir.
const RESENA_KEY = "resena_pedida";

export const yaSePidioResena = async () => (await safeStorage.get(RESENA_KEY)) === "1";

// Pide la hoja del sistema. Devuelve si se llegó a pedir de verdad, que es lo único que se puede
// saber: `requestReview` resuelve igual haya salido la hoja o no —Apple decide y no lo cuenta—,
// así que "pedida" aquí significa "se lo pedimos a iOS", no "la persona la vio".
//
// Solo se anota si la llamada NO reventó. Anotar un intento que falló dejaría a esta instalación
// sin pedirla nunca por un fallo de un segundo; no anotarlo solo cuesta reintentar el día que
// vuelva a cerrar un día completo, y eso no molesta a nadie.
export async function pedirResena() {
  if (!window.Capacitor?.isNativePlatform()) return false;
  try {
    await InAppReview.requestReview();
  } catch (_) {
    return false;
  }
  await safeStorage.set(RESENA_KEY, "1");
  return true;
}
