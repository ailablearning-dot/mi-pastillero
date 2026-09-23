import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, BatteryCharging, Check, ChevronRight, AlertTriangle } from 'lucide-react';
import useBackButton from "../hooks/useBackButton";
import { App as CapApp } from "@capacitor/app";
import { estadoPermisos, instruccionesDe, abrirAjustesDeLaApp, abrirAjustesNoMolestar, pedirExencionBateria } from "../lib/permisos";

// "Para que el aviso te llegue siempre" — la pantalla de permisos de Android.
// Del prototipo `docs/prototipos/permisos-android.html`, aprobado el 2026-09-22.
//
// No existe en iOS y no existía en el prototipo del modelo sin muros: allí basta con pedir permiso
// para notificar. En Android el sistema apaga las apps que no usa, y las capas de Xiaomi, Samsung o
// Huawei lo hacen todavía más. Es la causa número uno de recordatorios que no llegan, y esta
// pantalla es lo único que separa una app que avisa de una que a veces avisa.
//
// DOS FILAS, NO TRES. La primera pide DOS permisos de Android de un solo toque —notificar, y que el
// teléfono no apague la app— porque por separado sonaban a lo mismo dicho dos veces: para quien usa
// la app son una sola cosa, "que me avise". El precio es que salen dos diálogos del sistema
// seguidos, y por eso el subtítulo lo avisa ANTES: ver aparecer un segundo cuadro cuando creías
// haber terminado se siente como que algo falló, y ahí es donde la gente abandona.
export default function PermisosScreen({ onListo, onAhoraNo, requestNotifPermission }) {
  const [estado, setEstado] = useState(null);
  const [pidiendo, setPidiendo] = useState(false);

  const releer = useCallback(async () => setEstado(await estadoPermisos()), []);

  useEffect(() => { releer(); }, [releer]);

  // Al VOLVER se relee. Es lo que hace que la pantalla se ponga al día sola cuando la persona
  // concede algo y regresa: sin esto seguiría diciendo "Permitir" después de haber permitido, que
  // es la forma más rápida de que alguien lo intente otra vez y se rinda.
  //
  // ⚠️ HACEN FALTA LOS DOS, y esto se descubrió en el emulador con el fallo delante. El diálogo de
  // la exención de batería es una ventana TRANSLÚCIDA encima de la app: el WebView nunca se oculta,
  // así que `visibilitychange` NO se dispara y la fila se quedaba en "Permitir" con el permiso ya
  // concedido. El evento `resume` de Capacitor sí llega, porque mira la Activity y no el documento.
  // `visibilitychange` se queda para la vuelta desde los ajustes del sistema, que sí ocultan la app.
  useEffect(() => {
    const onVis = () => { if (!document.hidden) releer(); };
    document.addEventListener("visibilitychange", onVis);
    let quitar;
    CapApp.addListener("resume", releer).then(h => { quitar = h; }).catch(() => {});
    return () => {
      document.removeEventListener("visibilitychange", onVis);
      quitar?.remove?.();
    };
  }, [releer]);

  useBackButton(() => onAhoraNo?.());

  // Los dos permisos de la primera fila, en orden: primero el diálogo de la app, después los
  // ajustes del sistema. Si el primero ya estaba, va directo al segundo.
  const pedirAviso = async () => {
    setPidiendo(true);
    try {
      if (!estado?.notificaciones) await requestNotifPermission?.();
      const nuevo = await estadoPermisos();
      setEstado(nuevo);
      if (!nuevo.bateria) pedirExencionBateria();
    } finally { setPidiendo(false); }
  };

  const avisoListo = !!estado?.notificaciones && !!estado?.bateria;
  const marca = instruccionesDe(estado?.fabricante);

  const Fila = ({ icono, titulo, sub, listo, onPedir, tenue }) => (
    <div className={`flex items-center gap-3 rounded-2xl px-4 py-3 mb-2.5 border ${
      listo ? "bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-900"
            : "bg-white dark:bg-gray-800 border-gray-100 dark:border-gray-700"}`}>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
        listo ? "bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300"
              : tenue ? "bg-gray-100 dark:bg-gray-700 text-gray-400"
                      : "bg-violet-50 dark:bg-violet-950/50 text-violet-600 dark:text-violet-300"}`}>
        {icono}
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm text-gray-800 dark:text-gray-100 leading-snug" style={{ fontWeight: 800 }}>{titulo}</p>
        <p className="text-xs text-gray-400 mt-0.5 leading-snug">{sub}</p>
      </div>
      {listo
        ? <span className="text-xs text-emerald-600 dark:text-emerald-400 shrink-0 flex items-center gap-1" style={{ fontWeight: 800 }}><Check size={14} /> Listo</span>
        : <button onClick={onPedir} disabled={pidiendo}
            className="shrink-0 text-xs text-white px-3.5 py-2 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 disabled:opacity-50"
            style={{ fontWeight: 800 }}>Permitir</button>}
    </div>
  );

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(var(--safe-area-inset-top, env(safe-area-inset-top, 0px)) + 16px), 60px)' }}
         className="min-h-screen flex flex-col bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <div className="flex-1 max-w-md w-full mx-auto px-4 pb-4">

        {/* El porqué, UNA vez. Es verdad, se entiende sin saber nada de Android, y justifica las
            dos filas de golpe. Más de esto sería el sermón que la regla de la casa prohíbe. */}
        <div className="text-center pt-3 pb-5">
          <div className="text-4xl">🔔</div>
          <h1 className="text-xl text-gray-800 dark:text-gray-100 mt-3 leading-tight" style={{ fontWeight: 900 }}>
            Para que el aviso<br />te llegue siempre
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 leading-relaxed">
            Tu teléfono apaga las apps que no usa.<br />Así no apagará la tuya.
          </p>
        </div>

        {/* VARIANTE B — tres filas con texto claro. Cada una es una idea distinta:
            mostrar el aviso, que no se apague con el paso de los días, y el sonido. */}
        <Fila
          icono={<Bell size={19} />}
          titulo="Mostrarte el aviso"
          sub={estado?.notificaciones ? "Concedido" : "Para que aparezca en tu pantalla"}
          listo={!!estado?.notificaciones}
          onPedir={pedirAviso}
        />
        <Fila
          icono={<BatteryCharging size={19} />}
          titulo="Avisarte aunque pasen días"
          sub={estado?.bateria ? "Concedido" : "Tu teléfono apaga las apps que no usa"}
          listo={!!estado?.bateria}
          onPedir={pedirAviso}
        />

        {/* Marcada OPCIONAL a propósito: pedir saltarse el No Molestar sin decir que se puede
            declinar se siente invasivo, y es el permiso que más gente rechaza. */}
        <Fila
          icono={<BellOff size={19} />}
          titulo="Sonar aunque esté en silencio"
          sub={estado?.noMolestar ? "Concedido" : "Opcional · para no perderte una dosis"}
          listo={!!estado?.noMolestar}
          onPedir={abrirAjustesNoMolestar}
          tenue
        />

        {/* Solo la marca que toca. En un Pixel o un Motorola no aparece nada, y es deliberado:
            enseñar cinco marcas a quien no las necesita es ruido, y a quien sí, le obliga a
            buscarse entre ellas. */}
        {marca && (
          <div className="mt-4 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-4 py-3">
            <p className="text-sm text-amber-800 dark:text-amber-200 flex items-center gap-2" style={{ fontWeight: 800 }}>
              <AlertTriangle size={16} className="shrink-0" /> Tu {marca.nombre} necesita un paso más
            </p>
            <ol className="mt-2 pl-4 list-decimal text-xs text-amber-700 dark:text-amber-300 leading-relaxed space-y-0.5">
              {marca.pasos.map((p, i) => <li key={i}>{p}</li>)}
            </ol>
            {/* Leer tres pasos y buscarlos a mano en un menú de Xiaomi es donde se pierde a la
                gente — sobre todo a quien tiene 70 años y acaba de salir del médico. */}
            <button onClick={abrirAjustesDeLaApp}
              className="mt-3 w-full text-xs text-white py-2.5 rounded-xl bg-amber-600 flex items-center justify-center gap-1"
              style={{ fontWeight: 800 }}>
              Llévame ahí <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* "Ahora no" existe y no castiga. Un muro aquí sería el mismo error que el registro
          obligatorio que ya se quitó — y quien lo pulse se encuentra el aviso en el inicio. */}
      <div className="max-w-md w-full mx-auto px-4 flex gap-2.5"
           style={{ paddingBottom: 'calc(var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)) + 16px)' }}>
        <button onClick={onAhoraNo}
          className="flex-1 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-500 dark:text-gray-400"
          style={{ fontWeight: 800 }}>Ahora no</button>
        <button onClick={onListo}
          className="flex-1 py-3 rounded-2xl text-sm text-white bg-gradient-to-r from-violet-500 to-indigo-500"
          style={{ fontWeight: 800 }}>Listo</button>
      </div>
    </div>
  );
}
