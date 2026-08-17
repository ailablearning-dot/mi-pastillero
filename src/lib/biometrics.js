import { NativeBiometric } from '@capgo/capacitor-native-biometric';
import { safeStorage } from "./storage";

// --- Biometric helpers ---
// En Capacitor nativo (iOS/Android) usa el plugin NativeBiometric (LAContext / BiometricPrompt).
// En web (PWA, navegador) usa WebAuthn como fallback.
export const isNative = () => !!window.Capacitor?.isNativePlatform();

export const biometricSupported = () => {
  if (isNative()) return true; // El plugin nativo determinará disponibilidad real en runtime
  return typeof window !== "undefined" &&
    window.PublicKeyCredential !== undefined &&
    navigator.credentials !== undefined;
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
        reason: "Activa Face ID / huella para Mi Pastillero",
        title: "Activar Face ID / huella",
        subtitle: "Confirma tu identidad",
      });
    } catch (e) {
      const err = new Error("Cancelado");
      err.name = "NotAllowedError";
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
