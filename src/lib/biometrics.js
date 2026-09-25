import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { safeStorage } from "./storage";

// --- Biometric helpers ---
// En Capacitor nativo (iOS/Android) usa el plugin NativeBiometric (LAContext / BiometricPrompt).
// En web (PWA, navegador) usa WebAuthn como fallback.
export const isNative = () => !!window.Capacitor?.isNativePlatform();

// CÓMO SE LLAMA ESTO EN CADA TELÉFONO.
//
// "Face ID" es una marca de Apple. En un Android no existe, y ver ese nombre en la pantalla de un
// Samsung no es un detalle de purista: al usuario le dice que la app no es de su teléfono, o
// peor, que está mal hecha. Y aparecería tal cual en las capturas de la ficha de Play.
//
// En iOS se conserva "Face ID" porque es lo que la gente espera leer y lo que dice su propio
// sistema. En Android se nombra lo que el fabricante ofrezca, sin marca.
export const nombreBiometria = () =>
  window.Capacitor?.getPlatform?.() === "android" ? "huella o rostro" : "Face ID";

// ⚠️ EN NATIVO ESTO NO DECIDE NADA, y durante un tiempo decidió de más.
//
// Decía `if (isNative()) return true`, confiando en que "el plugin ya lo comprobará en runtime".
// El resultado en el Galaxy A06 de José: la app ofrecía "Activar huella o rostro" en un teléfono
// donde es IMPOSIBLE, y al tocarlo no pasaba nada. Ofrecer algo que no funciona no es un detalle
// cosmético en una app de salud: es lo que hace pensar que el resto tampoco funciona.
//
// Sigue existiendo para la web, donde la pregunta sí se responde sin llamar a nadie. En nativo hay
// que usar `biometriaDisponible()`, que es asíncrona porque hay que preguntarle al sistema.
export const biometricSupported = () => {
  if (isNative()) return true;
  return typeof window !== "undefined" &&
    window.PublicKeyCredential !== undefined &&
    navigator.credentials !== undefined;
};

// ¿Puede ESTE teléfono, ahora mismo, desbloquear la app con biometría?
//
// Lo que devuelve el plugin en un A06 recién sacado de la caja:
//   {"isAvailable":false,"deviceIsSecure":false,"strongBiometryIsAvailable":false,"errorCode":3}
//
// Y las dos razones por las que un Android dice que no, que no son la misma:
//
//  · `deviceIsSecure: false` — el teléfono no tiene bloqueo seguro. Con "Deslizar" no se puede dar
//    de alta ninguna huella ni ningún rostro, así que no hay nada que usar. Es lo más común en un
//    teléfono barato recién comprado, y justo el perfil de nuestro público.
//
//  · `strongBiometryIsAvailable: false` con el hardware presente — el sensor existe pero Android
//    lo considera DÉBIL. En el A06, el reconocimiento facial es Clase 1 (`oemStrength: 255` en
//    `dumpsys biometric`) y Android NO permite proteger una app con él; solo serviría la huella,
//    que es Clase 3. Por eso "rostro" puede no cumplirse aunque el teléfono presuma de tenerlo.
//
// En web no se pregunta a nadie: se responde con lo que hay en el navegador.
export const biometriaDisponible = async () => {
  if (!isNative()) return { disponible: biometricSupported(), motivo: null };
  try {
    const a = await NativeBiometric.isAvailable();
    if (a?.isAvailable) return { disponible: true, motivo: null };
    return { disponible: false, motivo: a?.deviceIsSecure === false ? "sin_bloqueo" : "sin_alta" };
  } catch (e) {
    // Si ni siquiera se puede preguntar, se asume que no. Callar es mejor que prometer.
    console.warn("[biometria]", e);
    return { disponible: false, motivo: "desconocido" };
  }
};

export const registerBiometric = async (userId, email) => {
  if (isNative()) {
    const avail = await NativeBiometric.isAvailable();
    if (!avail.isAvailable) {
      const err = new Error("Biometría no disponible en este dispositivo");
      err.name = "BiometricNotAvailable";
      throw err;
    }
    // Forzamos un verifyIdentity como confirmación al activar. Si el usuario cancela,
    // el plugin lanza un error con name="NotAllowedError" (lo mapeamos para mantener compatibilidad).
    try {
      await NativeBiometric.verifyIdentity({
        reason: `Activa ${nombreBiometria()} para Mi Pastillero`,
        title: `Activar ${nombreBiometria()}`,
        subtitle: "Confirma tu identidad",
      });
    } catch (e) {
      // Antes TODO fallo se disfrazaba de "Cancelado", y arriba se callan los cancelados: un
      // error de verdad salía por pantalla como si no hubiera pasado nada. Cancelar de verdad
      // tiene código 10 (o 13, que es "hace falta interacción"); lo demás es un fallo y hay que
      // dejar que se vea.
      const cancelado = e?.code === "10" || e?.code === 10 || e?.code === "13" || e?.code === 13;
      const err = new Error(cancelado ? "Cancelado" : (e?.message || "No se pudo activar"));
      err.name = cancelado ? "NotAllowedError" : "BiometricFailed";
      err.bioCode = e?.code;
      throw err;
    }
    await safeStorage.set("bio_enabled", "true");
    return;
  }
  // Web: WebAuthn
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  const cred = await navigator.credentials.create({
    publicKey: {
      challenge,
      rp: { name: "Mi Pastillero", id: window.location.hostname },
      user: { id: new TextEncoder().encode(userId), name: email, displayName: "Mi Pastillero" },
      pubKeyCredParams: [{ type: "public-key", alg: -7 }, { type: "public-key", alg: -257 }],
      authenticatorSelection: { authenticatorAttachment: "platform", userVerification: "required", residentKey: "preferred" },
      timeout: 60000,
    },
  });
  localStorage.setItem("bio_cred_id", btoa(String.fromCharCode(...new Uint8Array(cred.rawId))));
  await safeStorage.set("bio_enabled", "true");
};

export const authenticateBiometric = async () => {
  if (isNative()) {
    try {
      await NativeBiometric.verifyIdentity({
        reason: "Desbloquea Mi Pastillero",
        title: "Mi Pastillero",
        subtitle: "Verifica tu identidad para continuar",
      });
    } catch (e) {
      const err = new Error("Cancelado");
      err.name = "NotAllowedError";
      err.bioCode = e?.code; // preservamos el código nativo (p.ej. "13" = interacción requerida)
      throw err;
    }
    return;
  }
  // Web: WebAuthn
  const idStr = localStorage.getItem("bio_cred_id");
  if (!idStr) throw new Error("no-credential");
  const credId = Uint8Array.from(atob(idStr), c => c.charCodeAt(0));
  const challenge = crypto.getRandomValues(new Uint8Array(32));
  await navigator.credentials.get({
    publicKey: {
      challenge,
      rpId: window.location.hostname,
      allowCredentials: [{ type: "public-key", id: credId }],
      userVerification: "required",
      timeout: 60000,
    },
  });
};
