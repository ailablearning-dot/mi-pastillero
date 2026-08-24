import { useState, useEffect } from "react";
import { ArrowLeft, ChevronLeft, ChevronRight, Share2 } from 'lucide-react';
import { Share } from '@capacitor/share';
import { Filesystem, Directory } from '@capacitor/filesystem';
import * as XLSX from 'xlsx';
import { MONTHS_ES, fmtTime, fechaLarga, formatTimingDiff, getTimingInfo, getDaysInMonth } from "../domain/dates";
import { getHoras } from "../domain/schedule";
import { supabase } from "../lib/supabase";

export default function ReportesScreen({ session, paciente, pills, onBack }) {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [historial, setHistorial] = useState([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [toast, setToast] = useState(null);

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(null), 2500); };

  // Cargar historial del mes seleccionado
  useEffect(() => {
    if (!session || !paciente) return;
    (async () => {
      setLoading(true);
      const firstDay = `${year}-${String(month+1).padStart(2,"0")}-01`;
      const lastDay = `${year}-${String(month+1).padStart(2,"0")}-${String(getDaysInMonth(year, month)).padStart(2,"0")}`;
      const { data } = await supabase
        .from("medicamentos")
        .select("*")
        .eq("user_id", session.user.id)
        .eq("paciente_id", paciente.id)
        .eq("tomado", true)
        .gte("fecha", firstDay)
        .lte("fecha", lastDay)
        .order("fecha", { ascending: false })
        .order("hora", { ascending: false });
      setHistorial(data || []);
      setLoading(false);
    })();
  }, [session, paciente, year, month]);

  const prevMonth = () => {
    if (month === 0) { setMonth(11); setYear(year - 1); }
    else setMonth(month - 1);
  };
  const nextMonth = () => {
    if (month === 11) { setMonth(0); setYear(year + 1); }
    else setMonth(month + 1);
  };

  // Resolver nombre y dosis de cada registro buscando la pastilla actual
  const enrichRow = (row) => {
    const pill = pills.find(p => p.nombre === row.nombre) || pills.find(p => p.id === row.nombre);
    const timing = getTimingInfo(row.hora_programada, row.hora);
    return {
      fecha: row.fecha,
      hora_programada: row.hora_programada || "—",
      hora_tomada: fmtTime(row.hora) || "—",
      nombre: pill?.nombre || row.nombre,
      emoji: pill?.emoji || "💊",
      dosis: pill?.dosis || "—",
      retraso: !timing ? "—"
        : timing.kind === 'on-time' ? "A tiempo"
        : timing.kind === 'late' ? `+${formatTimingDiff(timing.diffMin)}`
        : `-${formatTimingDiff(timing.diffMin)}`,
    };
  };

  const exportarExcel = async () => {
    setExporting(true);
    try {
      // Hoja 1: Medicamentos (ficha del paciente)
      const hojaMedicamentos = [
        // "Paciente" y no "Persona" A PROPÓSITO: en la UI se dice persona porque quien cuida a su
        // mamá no gestiona pacientes, pero esta hoja la lee un médico y ahí la palabra correcta es
        // la clínica. Es el único sitio donde sobrevive.
        ["Paciente", paciente.nombre],
        ["Reporte generado", new Date().toLocaleString("es-ES")],
        [],
        ["Medicamento", "Dosis", "Frecuencia", "Horarios"],
        ...pills.map(p => {
          const horas = getHoras(p.hora_toma, p.frecuencia);
          return [
            `${p.emoji} ${p.nombre}`,
            p.dosis || "—",
            p.frecuencia || "—",
            horas.length ? horas.join(", ") : "—",
          ];
        }),
      ];

      // Hoja 2: Historial
      const enriched = historial.map(enrichRow);
      const hojaHistorial = [
        ["Paciente", paciente.nombre],
        ["Período", `${MONTHS_ES[month]} ${year}`],
        ["Total dosis tomadas", enriched.length],
        [],
        ["Fecha", "Hora programada", "Hora tomada", "Medicamento", "Dosis", "Cumplimiento"],
        ...enriched.map(r => [
          r.fecha,
          r.hora_programada,
          r.hora_tomada,
          `${r.emoji} ${r.nombre}`,
          r.dosis,
          r.retraso,
        ]),
      ];

      const wb = XLSX.utils.book_new();
      const ws1 = XLSX.utils.aoa_to_sheet(hojaMedicamentos);
      ws1['!cols'] = [{ wch: 28 }, { wch: 18 }, { wch: 24 }, { wch: 30 }];
      XLSX.utils.book_append_sheet(wb, ws1, "Medicamentos");

      const ws2 = XLSX.utils.aoa_to_sheet(hojaHistorial);
      ws2['!cols'] = [{ wch: 12 }, { wch: 16 }, { wch: 12 }, { wch: 28 }, { wch: 14 }, { wch: 18 }];
      XLSX.utils.book_append_sheet(wb, ws2, "Historial");

      const safeNombre = paciente.nombre.replace(/[^a-zA-Z0-9_-]/g, "_");
      const fname = `mi-pastillero_${safeNombre}_${year}-${String(month+1).padStart(2,"0")}.xlsx`;

      if (window.Capacitor?.isNativePlatform()) {
        // Generar como base64 y guardar en filesystem, luego compartir
        const base64 = XLSX.write(wb, { bookType: 'xlsx', type: 'base64' });
        const result = await Filesystem.writeFile({
          path: fname,
          data: base64,
          directory: Directory.Cache,
        });
        await Share.share({
          title: `Reporte ${paciente.nombre} — ${MONTHS_ES[month]} ${year}`,
          url: result.uri,
          dialogTitle: 'Compartir reporte',
        });
      } else {
        // Web: descarga directa
        XLSX.writeFile(wb, fname);
      }
      showToast("Reporte generado ✓");
    } catch (e) {
      // Cancelar la hoja de compartir NO es un error: @capacitor/share rechaza con "Share canceled".
      // Solo avisamos si de verdad falló (generar el Excel, escribir el archivo, etc.).
      const msg = String(e?.message || "");
      if (!/cancel/i.test(msg)) {
        console.error("[exportarExcel]", e);
        showToast("Error: " + (msg || "no se pudo exportar"));
      }
    } finally {
      setExporting(false);
    }
  };

  if (!paciente) return null;

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      {toast && <div className="fixed left-1/2 -translate-x-1/2 z-50 bg-gray-900 dark:bg-gray-700 text-white dark:text-gray-100 px-5 py-3 rounded-2xl text-sm font-bold shadow-xl" style={{ top: "calc(env(safe-area-inset-top, 0px) + 12px)" }}>{toast}</div>}
      <div className="max-w-md mx-auto px-4 pb-6">
        <div className="flex items-center gap-3 mb-5">
          {onBack && (<button onClick={onBack} className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-gray-400"><ArrowLeft size={18} /></button>)}
          <div className="flex-1">
            <h1 className="text-lg text-gray-800 dark:text-gray-100 leading-tight" style={{ fontWeight: 900 }}>Reportes</h1>
            <p className="text-xs text-violet-600 font-bold">{paciente.emoji} {paciente.nombre}</p>
          </div>
          <button
            onClick={exportarExcel}
            disabled={exporting || (pills.length === 0 && historial.length === 0)}
            title="Exportar a Excel"
            className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg shadow-violet-200 dark:shadow-none flex items-center justify-center text-white disabled:opacity-50 active:scale-95 transition-all"
          >
            <Share2 size={18} />
          </button>
        </div>

        {/* Sección 1: Ficha de medicamentos */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-4">
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 mb-3">💊 Medicamentos actuales</h2>
          {pills.length === 0 ? (
            <p className="text-sm text-gray-400">Esta persona no tiene medicamentos registrados.</p>
          ) : (
            <div className="space-y-2">
              {pills.map(p => {
                const horas = getHoras(p.hora_toma, p.frecuencia);
                return (
                  <div key={p.id} className="border border-gray-100 dark:border-gray-700 rounded-2xl p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xl">{p.emoji}</span>
                      <p className="flex-1 font-bold text-sm text-gray-800 dark:text-gray-100">{p.nombre}</p>
                    </div>
                    <div className="text-xs text-gray-500 mt-1 space-y-0.5">
                      {p.dosis && <p><span className="font-bold text-gray-600 dark:text-gray-300">Dosis:</span> {p.dosis}</p>}
                      <p><span className="font-bold text-gray-600 dark:text-gray-300">Frecuencia:</span> {p.frecuencia || "—"}</p>
                      <p><span className="font-bold text-gray-600 dark:text-gray-300">Horarios:</span> {horas.length ? horas.join(", ") : "—"}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sección 2: Historial */}
        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">📋 Historial de dosis</h2>
          </div>
          <div className="flex items-center justify-between mb-3 bg-gray-50 dark:bg-gray-700/50 rounded-xl p-2">
            <button onClick={prevMonth} className="w-8 h-8 rounded-lg bg-white text-gray-500 flex items-center justify-center"><ChevronLeft size={16} /></button>
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">{MONTHS_ES[month]} {year}</p>
            <button onClick={nextMonth} className="w-8 h-8 rounded-lg bg-white text-gray-500 flex items-center justify-center"><ChevronRight size={16} /></button>
          </div>
          {loading ? (
            <p className="text-sm text-gray-400 text-center py-6">Cargando...</p>
          ) : historial.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6">Sin registros en este mes.</p>
          ) : (
            <>
              <p className="text-xs text-gray-500 mb-2">{historial.length} dosis registradas</p>
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {historial.map(row => {
                  const r = enrichRow(row);
                  const timing = getTimingInfo(row.hora_programada, row.hora);
                  return (
                    <div key={row.id} className="text-xs border border-gray-100 dark:border-gray-700 rounded-xl p-2.5">
                      <div className="flex items-center justify-between mb-1">
                        {/* En pantalla se lee, no se procesa: "2026-08-23" es formato de base de datos. En el
                            Excel de abajo la fecha SÍ se queda en ISO, que es lo que ordena y lo que Excel
                            reconoce como fecha. */}
                        <span className="font-bold text-gray-800 dark:text-gray-100">{fechaLarga(r.fecha)}</span>
                        {timing && (
                          <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                            timing.kind === 'on-time' ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                            : timing.kind === 'late' ? 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'
                            : 'bg-sky-100 dark:bg-sky-900/40 text-sky-700 dark:text-sky-300'
                          }`}>{r.retraso}</span>
                        )}
                      </div>
                      <p className="text-gray-600 dark:text-gray-300">
                        <span className="text-base">{r.emoji}</span> {r.nombre}
                        {r.dosis !== "—" && <span className="text-gray-400"> · {r.dosis}</span>}
                      </p>
                      <p className="text-gray-400 mt-0.5">Programada {r.hora_programada} · Tomada {r.hora_tomada}</p>
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>

      </div>
    </div>
  );
}

// Modal de confirmación de una dosis puntual (al tocar la notificación o una
// pastilla en la lista): Tomado / Aplazar / No tomado, con hora editable.
