// Envoltura de RevenueCat (@revenuecat/purchases-capacitor) para las suscripciones.
// RevenueCat maneja la validación de recibos y el estado de la suscripción/prueba;
// aquí solo exponemos lo que la app necesita: init, ver planes, comprar, restaurar,
// y "¿está suscrito?".
//
// Solo funciona en NATIVO iOS. En web (o sin API key configurada) todo es no-op,
// para no romper el dev server ni el flujo de las testers.
//
// Config requerida:
//   - .env → VITE_REVENUECAT_IOS_KEY (Public SDK Key de RevenueCat; es pública).
//   - En RevenueCat: entitlement "premium" + offering "default" con los 3 paquetes.
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';

const RC_IOS_KEY = import.meta.env.VITE_REVENUECAT_IOS_KEY;
const ENTITLEMENT_ID = 'premium'; // debe coincidir con el entitlement en RevenueCat
const OFFERING_ID = 'default';    // offering en RevenueCat

const isNative = () => !!window.Capacitor?.isNativePlatform();

let configured = false;

// Configura RevenueCat una sola vez. Sin API key o en web → no hace nada.
export async function initPurchases() {
  if (!isNative() || !RC_IOS_KEY || configured) return;
  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
    await Purchases.configure({ apiKey: RC_IOS_KEY });
    configured = true;
  } catch (e) {
    console.warn('RevenueCat configure falló', e);
  }
}

// ¿Está listo para operar? (nativo + configurado con API key)
export function purchasesReady() {
  return configured;
}

// Asocia la suscripción a la cuenta del usuario, para reconocerla en otro
// dispositivo o tras reinstalar. Se llama tras iniciar sesión.
export async function identifyUser(userId) {
  if (!configured || !userId) return;
  try { await Purchases.logIn({ appUserID: userId }); } catch (e) { /* noop */ }
}

export async function logoutPurchases() {
  if (!configured) return;
  try { await Purchases.logOut(); } catch (e) { /* noop */ }
}

// ¿El usuario tiene la suscripción activa? (incluye el periodo de prueba de 7 días)
export async function isPremium() {
  if (!configured) return false;
  try {
    const { customerInfo } = await Purchases.getCustomerInfo();
    return !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
  } catch (e) {
    return false;
  }
}

// Paquetes disponibles (semanal/mensual/anual) del offering "default".
export async function getPackages() {
  if (!configured) return [];
  try {
    const offerings = await Purchases.getOfferings();
    const current = offerings?.current || offerings?.all?.[OFFERING_ID];
    return current?.availablePackages || [];
  } catch (e) {
    return [];
  }
}

// Compra un paquete. Devuelve true si queda con entitlement activo.
// Lanza si el usuario cancela o hay error (el paywall lo maneja).
export async function buyPackage(pkg) {
  if (!configured) throw new Error('purchases_not_ready');
  const { customerInfo } = await Purchases.purchasePackage({ aPackage: pkg });
  return !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
}

// Restaura compras previas. Devuelve true si recupera entitlement activo.
export async function restore() {
  if (!configured) return false;
  const { customerInfo } = await Purchases.restorePurchases();
  return !!customerInfo?.entitlements?.active?.[ENTITLEMENT_ID];
}
