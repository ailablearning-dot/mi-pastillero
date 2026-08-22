import { Pill, HeartPulse, Stethoscope, Settings, Lock } from 'lucide-react';

// Barra de pestañas inferior. Sustituye a la navegación anterior, que escondía cosas: la vista de
// mes era un botón dentro del encabezado del home y los Reportes estaban enterrados dentro de
// Ajustes — una función de pago que nadie encontraba.
//
// Las pestañas viven en esta lista a propósito: agregar "Mi salud" o "Citas" cuando existan es
// añadir una línea, no tocar el enrutamiento. `bloqueada` deja la pestaña visible con candado, que
// es como se enseñará lo que aún no está incluido en el plan del usuario.
// Cuatro, como el prototipo (Hoy · Mi salud · Citas · Ajustes). Antes eran cinco, con Calendario y
// Reportes como pestañas propias, y salieron de aquí por una razón que conviene no olvidar:
//
//   · El HISTORIAL es el mismo eje que Hoy —mi día, mis días—, así que vive DENTRO de Hoy, en una
//     tarjeta a todo lo ancho al final de las dosis ("Mi historial · Ves los últimos 7 días"). No
//     es el botón escondido en el encabezado que tenía la 1.1: es una fila tan visible como el
//     resto, y de paso dice el límite del plan gratis donde se nota.
//   · Los REPORTES son una salida del historial, no un destino: se llega a ellos desde ahí.
//
// Con cinco pestañas ninguna cabía con su nombre entero en un iPhone estrecho, y dos de ellas —
// Calendario y Reportes— eran dos formas de mirar lo mismo compitiendo entre sí.
export const TABS = [
  { id: "hoy",     label: "Hoy",      icon: Pill },
  { id: "salud",   label: "Mi salud", icon: HeartPulse },
  { id: "citas",   label: "Citas",    icon: Stethoscope },
  { id: "ajustes", label: "Ajustes",  icon: Settings },
];

export const esTab = (id) => TABS.some(t => t.id === id);

// `bloqueadas` son los ids que van con candado. Se pasan desde fuera y no se calculan aquí: qué
// es de pago lo decide src/domain/plan.js, y la barra solo lo pinta.
//
// Una pestaña bloqueada se VE, con su candado. No se esconde a propósito: así se sabe desde el
// primer día que existe y que es de pago, en vez de descubrirlo chocando contra un muro.
export default function TabBar({ activa, onCambiar, bloqueadas = [] }) {
  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40 flex bg-white/95 dark:bg-gray-900/95 border-t border-gray-100 dark:border-gray-800"
      style={{ backdropFilter: "blur(12px)", paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Secciones"
    >
      {TABS.map(t => {
        const Icono = t.icon;
        const activo = activa === t.id;
        const bloqueada = bloqueadas.includes(t.id);
        return (
          <button
            key={t.id}
            onClick={() => onCambiar(t.id, bloqueada)}
            aria-current={activo ? "page" : undefined}
            className={`flex-1 flex flex-col items-center gap-0.5 pt-2.5 pb-2 relative transition-colors ${
              activo ? "text-violet-600 dark:text-violet-400" : "text-gray-400 dark:text-gray-500"
            }`}
          >
            {bloqueada && (
              <span className="absolute top-1 right-1/2 -translate-x-[-14px] w-3.5 h-3.5 rounded-full bg-violet-100 dark:bg-violet-950 flex items-center justify-center">
                <Lock size={8} className="text-violet-500" />
              </span>
            )}
            <Icono size={20} strokeWidth={activo ? 2.4 : 2} />
            <span className="text-[10px] font-bold leading-none">{t.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
