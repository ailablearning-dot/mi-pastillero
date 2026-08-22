import { AlertTriangle, Pill, ChevronRight, BarChart3, FileSpreadsheet, Lock } from 'lucide-react';
import { estaSuspendido } from "../domain/schedule";
import { DIAS_HISTORIAL_GRATIS } from "../domain/plan";
import { fichaSinCapturar } from "../domain/emergencia";

// "Mi salud": el índice de lo que la persona ES, no de lo que hizo. Del prototipo, pantalla d1.
//
// La distinción con "Hoy" no es cosmética: en Hoy se ACTÚA —se marcan dosis, veinte veces por
// semana— y aquí se CONSULTA. Por eso el historial acabó viviendo en esta pestaña y no al final de
// Hoy, donde estuvo un rato: son conceptos distintos, y con varios medicamentos quedaba detrás de
// un scroll.
//
// ⚠️ NO se pintan los módulos de las olas 2 y 3 que el prototipo lista (signos vitales, consultas,
// médicos, documentos). Ahí van con la etiqueta "OLA 2" / "OLA 3", que es una anotación PARA
// NOSOTROS, no para quien usa la app. Una lista de siete filas que no llevan a ningún sitio no
// enseña nada y decepciona; se añaden cuando existan. Ojo: esto NO contradice la regla de "lo
// premium se ve velado, nunca escondido" — esa regla habla de funciones que EXISTEN y no están
// incluidas en el plan, no de las que aún no se han construido.
export default function MiSaludScreen({ paciente, pills, historialCompleto, onFichaEmergencia, onMisMedicamentos, onHistorial, onReportes }) {
  const activos = (pills || []).filter(p => !estaSuspendido(p)).length;
  const suspendidos = (pills || []).length - activos;
  const sinLlenar = fichaSinCapturar(paciente);

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }}
         className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto px-4 pb-6">

        <div className="mb-4">
          <h1 className="text-2xl text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>Mi salud</h1>
          <p className="text-xs text-gray-400">
            {paciente?.emoji ? `${paciente.emoji} ` : ""}{paciente?.nombre || "Tu información médica"}
          </p>
        </div>

        {/* La ficha va ARRIBA y en rojo, separada del resto. No es una fila más de una lista: es la
            única que se usa el día que algo va mal, y el prototipo la pone aparte por eso.
            ⚠️ SIN etiqueta "GRATIS", y esto corrige un argumento mío: la defendí aquí diciendo que
            contrastaba con las filas de pago, y con premium NINGUNA fila lleva candado, así que no
            contrasta con nada. Aun con candados, nadie se pregunta si su información de urgencias
            cuesta dinero. Es la misma regla que la sacó de dentro de la ficha: en una pantalla
            médica, hablar de precios es publicidad donde no toca. El prototipo la pone; se descarta
            a conciencia. */}
        <button onClick={onFichaEmergencia}
          className="w-full flex items-center gap-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl px-4 py-3 mb-5 text-left">
          <div className="w-9 h-9 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
            <AlertTriangle size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-rose-800 dark:text-rose-200" style={{ fontWeight: 800 }}>En caso de emergencia</p>
            <p className="text-xs text-rose-600 dark:text-rose-400 truncate">
              {sinLlenar ? "Sin llenar · alergias y a quién llamar" : "Alergias, condiciones y contacto"}
            </p>
          </div>
          <ChevronRight size={16} className="text-rose-300 dark:text-rose-700 shrink-0" />
        </button>

        <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-2" style={{ fontWeight: 900 }}>Mi expediente</p>

        {/* El conteo dice "3 activos · 2 suspendidos" y no solo el total: los suspendidos siguen
            contando para "¿qué tomabas antes?", que es la pregunta que el médico hace y el paciente
            no recuerda. Verlos ahí es la razón de que no se borren. */}
        <button onClick={onMisMedicamentos}
          className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm px-4 py-3 text-left">
          <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
            <Pill size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm text-gray-800 dark:text-gray-100" style={{ fontWeight: 800 }}>Mis medicamentos</p>
            <p className="text-xs text-gray-400">
              {activos === 0 && suspendidos === 0
                ? "Ninguno todavía"
                : `${activos} ${activos === 1 ? "activo" : "activos"}${suspendidos ? ` · ${suspendidos} ${suspendidos === 1 ? "suspendido" : "suspendidos"}` : ""}`}
            </p>
          </div>
          <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
        </button>

        {/* MI HISTORIAL. Estuvo un rato como tarjeta al final de Hoy y de ahí salió por dos razones
            del usuario, las dos buenas: "historial es parte de hoy y son conceptos diferentes", y
            con varios medicamentos "se tiene que navegar hasta el final para encontrarlo". Aquí está
            arriba, siempre a la vista, y en la pestaña donde vive el resto de su información
            médica — su adherencia es justo lo que le enseña al médico. */}
        {onHistorial && (
          <button onClick={onHistorial}
            className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm px-4 py-3 text-left mt-2">
            <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
              <BarChart3 size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 dark:text-gray-100" style={{ fontWeight: 800 }}>Mi historial</p>
              <p className="text-xs text-gray-400">{historialCompleto ? "Todos tus días, y el reporte" : `Tus últimos ${DIAS_HISTORIAL_GRATIS} días`}</p>
            </div>
            <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
          </button>
        )}

        {/* EL REPORTE. Estuvo dentro del historial y acabó al final de ese scroll: "solo se ve al
            navegar, puede no encontrarlo alguien". Sube aquí, donde se ve sin bajar nada y donde va
            a buscar quien necesita "algo para el médico" — que es literalmente su nombre.
            Se descartó el icono de compartir en la cabecera del historial, que sería lo idiomático
            en iOS: es exactamente el error del que venimos. El calendario era un icono del
            encabezado y de ahí salió a ser pestaña porque nadie lo encontraba.
            Su candado es el MISMO que el del historial completo (`historialCompleto`), no otro: son
            la misma función de pago vista desde dos sitios. */}
        {onReportes && (
          <button onClick={onReportes}
            className="w-full flex items-center gap-3 bg-white dark:bg-gray-800 rounded-2xl shadow-sm px-4 py-3 text-left mt-2">
            <div className="w-9 h-9 rounded-xl bg-violet-50 dark:bg-violet-950/40 text-violet-600 dark:text-violet-300 flex items-center justify-center shrink-0">
              <FileSpreadsheet size={18} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm text-gray-800 dark:text-gray-100" style={{ fontWeight: 800 }}>Reporte para mi médico</p>
              <p className="text-xs text-gray-400">Tu adherencia y el historial, en Excel</p>
            </div>
            {historialCompleto
              ? <ChevronRight size={16} className="text-gray-300 dark:text-gray-600 shrink-0" />
              : <Lock size={14} className="text-violet-400 shrink-0" />}
          </button>
        )}
      </div>
    </div>
  );
}
