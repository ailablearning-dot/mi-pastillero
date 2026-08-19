import { useState, useEffect } from "react";
import { Check, Sparkles, X } from 'lucide-react';
import { TERMS_URL, PRIVACY_URL, linkDoc } from "../lib/config";
import { getPackages, buyPackage, restore } from "../purchases";

// Ayudantes privados del paywall: nombre legible del paquete y % de ahorro frente al mensual.
// Etiqueta en español para cada tipo de paquete de RevenueCat.
function packageLabel(pkg) {
  const t = pkg?.packageType || "";
  if (t === "WEEKLY") return { nombre: "Semanal", periodo: "por semana" };
  if (t === "MONTHLY") return { nombre: "Mensual", periodo: "por mes" };
  if (t === "ANNUAL") return { nombre: "Anual", periodo: "por año" };
  return { nombre: pkg?.identifier || "Plan", periodo: "" };
}

// % de ahorro de un plan frente a pagar el mismo tiempo al precio semanal.
// Se calcula en vivo con los precios reales de RevenueCat (funciona en cualquier
// moneda/país). Devuelve null si no aplica: sin plan semanal, es el propio semanal,
// faltan precios, o no hay ahorro real.
function savingsPct(pkgs, pkg) {
  const weekly = pkgs.find(p => p.packageType === "WEEKLY")?.product?.price;
  const price = pkg?.product?.price;
  if (!weekly || !price || pkg?.packageType === "WEEKLY") return null;
  const perWeek =
    pkg.packageType === "MONTHLY" ? (price * 12) / 52 :
    pkg.packageType === "ANNUAL" ? price / 52 : null;
  if (!perWeek) return null;
  const pct = Math.round((1 - perWeek / weekly) * 100);
  return pct > 0 ? pct : null;
}

// Pantalla de paywall: 3 planes + prueba de 7 días + restaurar + Términos/Privacidad.
// Recibe onPurchased() (cuando queda con suscripción activa). El texto de renovación
// automática y precio es requisito de Apple (guía 3.1.2).
// `motivo` es lo que la persona acaba de tocar: {titulo, detalle} de src/domain/plan.js. El
// paywall es SIEMPRE el mismo —entra por una puerta, ve la casa entera— pero el encabezado nombra
// su problema: a quien viene de "quiero agendar mi consulta", hablarle de multipaciente es no
// escucharlo.
//
// `onCerrar` solo existe en el modelo nuevo, donde el paywall es una hoja que se puede cerrar para
// seguir usando la parte gratis. Sin él se comporta como el muro de siempre, sin salida.
export default function Paywall({ onPurchased, motivo, onCerrar }) {
  const [pkgs, setPkgs] = useState(null);
  const [selected, setSelected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const list = await getPackages();
      // Orden fijo: semanal → mensual → anual (RevenueCat los devuelve en otro orden).
      const ORDEN = { WEEKLY: 0, MONTHLY: 1, ANNUAL: 2 };
      list.sort((a, b) => (ORDEN[a.packageType] ?? 99) - (ORDEN[b.packageType] ?? 99));
      setPkgs(list);
      // Preselecciona el anual (mejor valor) si existe.
      const annual = list.find(p => p.packageType === "ANNUAL");
      setSelected(annual || list[0] || null);
    })();
  }, []);

  const comprar = async () => {
    if (!selected) return;
    setBusy(true); setError(null);
    try {
      const ok = await buyPackage(selected);
      if (ok) onPurchased();
    } catch (e) {
      if (!e?.userCancelled && e?.code !== "1") setError("No se pudo completar la compra. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  const restaurar = async () => {
    setBusy(true); setError(null);
    try {
      const ok = await restore();
      if (ok) onPurchased();
      else setError("No encontramos una suscripción activa para restaurar.");
    } catch (e) {
      setError("No se pudo restaurar. Inténtalo de nuevo.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 px-4 pb-8">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto">
        {/* Solo en el modelo nuevo: sin esto el paywall es un muro y la parte gratis queda
            inalcanzable. Con él, la persona mira, decide que no, y sigue usando la app. */}
        {onCerrar && (
          <div className="flex justify-end -mt-1 mb-1">
            <button onClick={onCerrar} aria-label="Cerrar"
              className="w-9 h-9 rounded-xl bg-white/70 dark:bg-gray-800/70 flex items-center justify-center text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
        )}
        <div className="text-center mb-6 mt-2">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-3xl shadow-lg shadow-violet-200 dark:shadow-none mx-auto mb-3">💊</div>
          <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>{motivo?.titulo || "Prueba 7 días gratis"}</h1>
          <p className="text-sm text-gray-400">{motivo?.detalle || "Cuida tu salud y la de tu familia sin límites"}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-4">
          {["Recordatorios que suenan a tiempo","Pacientes ilimitados para toda la familia","Reportes en Excel para tu médico","Historial completo y respaldo en la nube"].map(b => (
            <div key={b} className="flex items-center gap-2 py-1.5">
              <div className="w-5 h-5 rounded-full bg-violet-100 dark:bg-violet-950/50 flex items-center justify-center flex-shrink-0"><Check size={13} className="text-violet-600 dark:text-violet-300" /></div>
              <span className="text-sm text-gray-700 dark:text-gray-200">{b}</span>
            </div>
          ))}
        </div>

        {pkgs === null ? (
          <p className="text-center text-sm text-gray-400 py-6">Cargando planes…</p>
        ) : pkgs.length === 0 ? (
          <p className="text-center text-sm text-gray-400 py-6">Los planes no están disponibles en este momento.</p>
        ) : (
          <div className="space-y-2 mb-4">
            {pkgs.map(pkg => {
              const { nombre, periodo } = packageLabel(pkg);
              const isSel = selected?.identifier === pkg.identifier;
              const best = pkg.packageType === "ANNUAL";
              const ahorro = savingsPct(pkgs, pkg);
              return (
                <button key={pkg.identifier} onClick={() => setSelected(pkg)}
                  className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border-2 transition-all ${isSel ? "border-violet-400 bg-violet-50 dark:bg-violet-950/30" : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"}`}>
                  <div className="text-left">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-gray-800 dark:text-gray-100">{nombre}</span>
                      {best && <span className="text-[10px] font-black text-white bg-gradient-to-r from-violet-500 to-indigo-500 px-2 py-0.5 rounded-full">MEJOR VALOR</span>}
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-400">{periodo}</span>
                      {ahorro && <span className="text-[10px] font-black text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-1.5 py-0.5 rounded-full">Ahorra {ahorro}%</span>}
                    </div>
                  </div>
                  <span className="text-base font-black text-gray-800 dark:text-gray-100">{pkg.product?.priceString}</span>
                </button>
              );
            })}
          </div>
        )}

        {error && <p className="text-xs text-red-500 text-center mb-3">{error}</p>}

        <button onClick={comprar} disabled={busy || !selected} className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white font-bold shadow-lg shadow-violet-200 dark:shadow-none disabled:opacity-60 flex items-center justify-center gap-2" style={{ fontWeight: 800 }}>
          <Sparkles size={18} /> {busy ? "Un momento…" : "Empezar 7 días gratis"}
        </button>

        <button onClick={restaurar} disabled={busy} className="w-full py-3 mt-2 text-sm text-gray-400 hover:opacity-80">
          ¿Ya eres suscriptor? <span className="font-bold text-violet-600">Restaurar compras</span>
        </button>

        <p className="text-[11px] text-gray-400 text-center leading-relaxed mt-3">
          Prueba de 7 días gratis. Después se cobra el plan elegido a tu Apple ID y se renueva automáticamente. Cancélala cuando quieras en Ajustes de tu iPhone → Suscripciones, al menos 24&nbsp;h antes de que termine el periodo.
        </p>
        <p className="text-[11px] text-center mt-2">
          <a href={TERMS_URL} onClick={linkDoc("terminos")} target="_blank" rel="noreferrer" className="text-violet-500 font-bold underline">Términos</a>
          <span className="text-gray-400"> · </span>
          <a href={PRIVACY_URL} onClick={linkDoc("privacidad")} target="_blank" rel="noreferrer" className="text-violet-500 font-bold underline">Privacidad</a>
        </p>
      </div>
    </div>
  );
}

// Modal para cuando 2+ dosis coinciden en el mismo minuto (mismo o distintos pacientes).
// Se abre al tocar la notificación agrupada. Lista TODAS las dosis de ese horario (cross-
// paciente) y permite decidir por cada una: Tomar / Posponer / No tomar. Es auto-contenido:
// escribe en `medicamentos` con el paciente_id de CADA dosis (no depende del paciente activo).
