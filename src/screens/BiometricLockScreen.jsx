import { useState, useEffect } from "react";
import { Fingerprint } from 'lucide-react';
import { authenticateBiometric } from "../lib/biometrics";

export default function BiometricLockScreen({ onUnlock, onUsePassword }) {
  const [error, setError] = useState(null);
  const [trying, setTrying] = useState(false);

  const tryAuth = async (isRetry = false) => {
    setTrying(true);
    setError(null);
    try {
      await authenticateBiometric();
      onUnlock();
    } catch (e) {
      // "User interaction required" (código 13): el Face ID se pidió antes de que la app estuviera
      // del todo activa. Reintentar UNA vez tras un instante lo resuelve sin molestar al usuario
      // (evita el segundo prompt fallido que se veía como "doble" al arrancar).
      if (!isRetry && String(e?.bioCode) === "13") {
        setTimeout(() => tryAuth(true), 350);
        return;
      }
      if (e.name !== "NotAllowedError") setError("No se pudo verificar. Intenta de nuevo.");
    } finally {
      setTrying(false);
    }
  };

  useEffect(() => { tryAuth(); }, []);

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 8px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 flex flex-col items-center justify-center px-4">
      <div className="text-center mb-10">
        <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-violet-200 dark:shadow-none mx-auto mb-4">💊</div>
        <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>Mi Pastillero</h1>
        <p className="text-sm text-gray-400">Verifica tu identidad para continuar</p>
      </div>
      <button onClick={tryAuth} disabled={trying}
        className="w-full max-w-xs flex items-center justify-center gap-3 py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-base font-bold shadow-lg shadow-violet-200 dark:shadow-none mb-4 disabled:opacity-60 transition-all"
        style={{ fontWeight: 800 }}>
        <Fingerprint size={24} />
        {trying ? "Verificando..." : "Desbloquear"}
      </button>
      {error && <p className="text-xs text-red-500 mb-4">{error}</p>}
      <button onClick={onUsePassword} className="text-xs text-gray-400 underline underline-offset-2 cursor-pointer">
        Usar contraseña
      </button>
    </div>
  );
}

// Traduce los mensajes de error de Supabase Auth (vienen en inglés) a español.
