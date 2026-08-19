import { WifiOff } from 'lucide-react';

// Pantalla honesta de "sin conexión", con su botón de reintentar.
//
// Existe en dos momentos del arranque y por eso vive aparte: al crear la sesión anónima (la app
// necesita internet UNA vez para prepararse) y al verificar la suscripción. Los dos casos
// terminaban antes en un "Cargando…" gris eterno o en un paywall roto: la persona no sabe qué
// pasa, no puede hacer nada, y se va.
//
// Las dos se recuperan solas al volver la red; el botón está para quien no quiere esperar.
export default function PantallaSinConexion({ mensaje, onReintentar }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-8 text-center gap-4 bg-gray-50 dark:bg-gray-900">
      <div className="w-16 h-16 rounded-3xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
        <WifiOff size={28} className="text-gray-400" />
      </div>
      <h2 className="text-lg font-bold text-gray-800 dark:text-gray-100">Sin conexión</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 max-w-xs">{mensaje}</p>
      <button
        onClick={onReintentar}
        className="mt-2 px-6 py-3 rounded-2xl bg-violet-500 text-white text-sm font-bold active:scale-95 transition-all"
      >
        Reintentar
      </button>
    </div>
  );
}
