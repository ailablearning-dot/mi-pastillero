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
  // La hoja que avisa ANTES de saltar a la lista del sistema. Ver el comentario de la tercera fila.
  const [avisandoNoMolestar, setAvisandoNoMolestar] = useState(false);

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

  // UNA FILA, UN PERMISO. Con las filas separadas esto ya no puede encadenar: si la primera
  // disparara también el diálogo de la batería, la persona vería dos cuadros sin haber tocado la
  // segunda fila — y esa fila se quedaría ahí, aparentemente sin usar, confundiendo aún más.
  const pedirNotificaciones = async () => {
    setPidiendo(true);
    try { await requestNotifPermission?.(); setEstado(await estadoPermisos()); }
    finally { setPidiendo(false); }
  };

  const pedirBateria = async () => {
    setPidiendo(true);
    try { await pedirExencionBateria(); }
    finally { setPidiendo(false); }
  };

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

        {/* Tres filas, y cada una nombra una forma DISTINTA de que el aviso no llegue: que la app
            no tenga permiso, que el teléfono la apague, o que suene en silencio. Ninguna repite el
            título — "Mostrarte el aviso" lo hacía, y sobraba. */}
        <Fila
          icono={<Bell size={19} />}
          titulo="Permitir los avisos"
          sub={estado?.notificaciones ? "Concedido" : "Sin esto no te podemos avisar"}
          listo={!!estado?.notificaciones}
          onPedir={pedirNotificaciones}
        />
        <Fila
          icono={<BatteryCharging size={19} />}
          titulo="Avisarte aunque pasen días"
          sub={estado?.bateria ? "Concedido" : "Tu teléfono apaga las apps que no usa"}
          listo={!!estado?.bateria}
          onPedir={pedirBateria}
        />

        {/* SOLO CUANDO LO OBLIGATORIO ESTÁ HECHO. Este permiso es opcional y, a diferencia de los
            otros dos, Android NO ofrece diálogo para él: obliga a saltar a una lista con todas las
            apps del teléfono. Enseñárselo a alguien que todavía no ha concedido lo importante es
            arriesgarse a perderlo justo antes de lo que de verdad hace falta.
            Marcado OPCIONAL además: pedir saltarse el No Molestar sin decir que se puede declinar
            se siente invasivo, y es el permiso que más gente rechaza. */}
        {estado?.notificaciones && estado?.bateria && (
          <Fila
            icono={<BellOff size={19} />}
            titulo="Sonar aunque esté en silencio"
            sub={estado?.noMolestar ? "Concedido" : "Opcional · para no perderte una dosis"}
            listo={!!estado?.noMolestar}
            onPedir={() => setAvisandoNoMolestar(true)}
            tenue
          />
        )}

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

      {/* LA HOJA QUE AVISA ANTES DE SALTAR.
          Android no tiene diálogo para este permiso ni destino directo a la ficha de esta app
          (comprobado en Android 16: cae a una lista con Android Auto, Gmail, Play Services…). Si a
          alguien de 60 años lo sueltas ahí sin más, ve diez apps y no sabe qué hacer.
          No se puede evitar el salto, pero sí llegar sabiendo qué se busca — y el icono importa
          tanto como el nombre: en esa lista se reconoce antes por el dibujo que leyendo. */}
      {avisandoNoMolestar && (
        <div className="fixed inset-0 z-50 flex items-end bg-black/40" onClick={() => setAvisandoNoMolestar(false)}>
          <div className="w-full bg-white dark:bg-gray-800 rounded-t-3xl p-5 pb-8" onClick={e => e.stopPropagation()}>
            {/* "Vamos a abrir" ponía a la app de sujeto, y la app no abre nada: lo hace el
                teléfono. Decirlo al revés prepara para lo que va a pasar de verdad — y "lista de
                aplicaciones" dice QUÉ va a ver, que es lo que le falta saber. */}
            <p className="text-base text-gray-800 dark:text-gray-100 mb-1 leading-snug" style={{ fontWeight: 900 }}>
              Tu teléfono te mostrará una lista de aplicaciones
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400 leading-relaxed mb-4">
              {/* "Enciéndelo" no dice CÓMO, y ahí hay dos pasos: tocar el nombre abre su ficha, y
                  el interruptor está dentro. Sin decirlo, la persona toca y cree que ya está. */}
              <span className="text-gray-700 dark:text-gray-200" style={{ fontWeight: 800 }}>Toca su nombre</span> en
              la lista y activa el permiso. Se ve así:
            </p>
            <div className="flex items-center gap-3 rounded-2xl border border-gray-200 dark:border-gray-700 px-4 py-3 mb-5">
              <img src="icon-192.png" alt="" className="w-11 h-11 rounded-full" />
              <div>
                <p className="text-sm text-gray-800 dark:text-gray-100" style={{ fontWeight: 800 }}>Mi Pastillero</p>
                <p className="text-xs text-gray-400">Sin permiso</p>
              </div>
            </div>
            <div className="flex gap-2.5">
              <button onClick={() => setAvisandoNoMolestar(false)}
                className="flex-1 py-3 rounded-2xl bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 text-sm text-gray-500"
                style={{ fontWeight: 800 }}>Cancelar</button>
              <button onClick={() => { setAvisandoNoMolestar(false); abrirAjustesNoMolestar(); }}
                className="flex-1 py-3 rounded-2xl text-sm text-white bg-gradient-to-r from-violet-500 to-indigo-500"
                style={{ fontWeight: 800 }}>Entendido, vamos</button>
            </div>
          </div>
        </div>
      )}

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
