import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { ArrowLeft } from 'lucide-react';
import { EMOJIS, EMOJI_TO_COLOR, emojiToColor, FRECUENCIAS } from "../domain/catalogs";
import { fmtDate, fmt12h } from "../domain/dates";
import { getHoras, FREQ_DIAS_SEMANA } from "../domain/schedule";
import { TIPOS, getTipo, usaCantidad, unidadPara, emojiSugerido, presentePara } from "../domain/medTypes";
import { cantidadesPara, formatCantidad, limpiarCantidadPorHora, parseCantidad, esCantidadLibre } from "../domain/dosage";
import { SONIDOS } from "../lib/notifications";

const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

export default function PillForm({ pill, title = "Nuevo medicamento", showBackButton = true, onSave, onCancel }) {
  const [nombre, setNombre] = useState(pill?.nombre || "");
  const [dosis, setDosis] = useState(pill?.dosis || "");
  const [emoji, setEmoji] = useState(pill?.emoji || "💊");
  // El color se deriva automáticamente del emoji (ver EMOJI_TO_COLOR).
  const [hora, setHora] = useState(pill?.hora_toma || "08:00");

  // El tipo va PRIMERO en el formulario porque manda en el resto: si se pide cantidad, en qué
  // unidad, y si tiene sentido ofrecer fracciones. Sin tipo se asume pastilla, que es lo que la
  // app daba por hecho antes.
  const [tipo, setTipo] = useState(pill?.tipo || "pastilla");
  const [cantidad, setCantidad] = useState(parseCantidad(pill?.cantidad) ?? 1);
  const [porHora, setPorHora] = useState(pill?.cantidad_por_hora || {});
  const [diasSemana, setDiasSemana] = useState(
    pill?.dias_semana?.length ? pill.dias_semana : ["Lunes","Martes","Miércoles","Jueves"]);
  // Por defecto TODOS los días: es el caso de la inmensa mayoría y no debe costar ni un toque.
  const [soloAlgunosDias, setSoloAlgunosDias] = useState(!!pill?.dias_semana?.length);
  const [nota, setNota] = useState(pill?.nota || "");
  // Si el usuario elige un emoji a mano, el tipo deja de pisárselo.
  const [emojiTocado, setEmojiTocado] = useState(!!pill?.emoji);
  // La cantidad arranca PLEGADA: la gran mayoría toma 1 y no debería ver ocho botones para eso.
  const [cantAbierta, setCantAbierta] = useState(false);
  // Y si el medicamento traía una cantidad que no está en las opciones rápidas (un 4 de antes),
  // se abre el campo libre para que se vea de dónde sale, en vez de una selección que no cuadra.
  const [cantLibre, setCantLibre] = useState(esCantidadLibre({ tipo: pill?.tipo }, pill?.cantidad));

  const existFreq = pill?.frecuencia || FRECUENCIAS[0];
  const mDias = existFreq.match(/^Cada (\d+) días?$/);
  const mHoras = existFreq.match(/^Cada (\d+) horas?$/);
  // Compatibilidad: lo guardado con la frecuencia "Días específicos…" (que ya no existe en el
  // desplegable) se lee como "Una vez al día" con los días acotados, que es lo mismo.
  const [freqSel, setFreqSel] = useState(
    existFreq === FREQ_DIAS_SEMANA ? "Una vez al día"
    : mDias ? "__dias__" : mHoras ? "__horas__" : existFreq);
  const [customDias, setCustomDias] = useState(mDias ? parseInt(mDias[1]) : 2);
  const [customHoras, setCustomHoras] = useState(mHoras ? parseInt(mHoras[1]) : 2);

  const [diaSemana, setDiaSemana] = useState(pill?.dia_semana || "Lunes");
  const [diaDelMes, setDiaDelMes] = useState(pill?.dia_del_mes || 1);

  const [durTipo, setDurTipo] = useState(pill?.duracion_tipo || "indefinido");
  const [durValor, setDurValor] = useState(pill?.duracion_valor || 30);
  const [sonido, setSonido] = useState(pill?.sonido || 'ding');
  const hoyStr = (() => { const d = new Date(); return fmtDate(d.getFullYear(), d.getMonth(), d.getDate()); })();
  const [fechaInicio, setFechaInicio] = useState((pill?.fecha_inicio || "").slice(0, 10) || hoyStr);
  const [error, setError] = useState(null);
  const savingRef = useRef(false); // guardia síncrona anti doble-submit (el estado no basta: dos taps en el mismo tick lo ven en false)
  const [saving, setSaving] = useState(false);

  const frecuencia = freqSel === "__dias__" ? `Cada ${customDias} días`
    : freqSel === "__horas__" ? `Cada ${customHoras} horas`
    : freqSel;

  const showDiaSemana = freqSel === "Semanal";
  const showDiaDelMes = ["Cada mes", "Cada 3 meses"].includes(freqSel);
  // Frecuencias que se repiten DENTRO de un día: a estas sí se les puede limitar los días.
  // Las de intervalo (cada tercer día, semanal, cada mes) ya definen sus propios días.
  const FREQ_DIARIAS = ["Una vez al día","Dos veces al día","Tres veces al día",
    "Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas","Solo cuando necesite","__horas__"];
  const showDiasSemana = FREQ_DIARIAS.includes(freqSel);

  const tipoActual = getTipo(tipo);
  const pideCantidad = usaCantidad({ tipo });
  const unidad = unidadPara({ tipo }) || "dosis";
  const opciones = cantidadesPara({ tipo });
  // Las horas de cada toma se CALCULAN de la hora base y la frecuencia; no se guardan.
  const horas = getHoras(hora, frecuencia);
  // Solo tiene sentido preguntar "¿cuánto a cada hora?" si hay más de una toma al día.
  const showPorHora = pideCantidad && horas.length > 1;

  const setCantidadDeHora = (h, v) => setPorHora(prev => {
    const next = { ...prev };
    if (v === null) delete next[h]; else next[h] = v;
    return next;
  });

  const toggleDia = (d) => setDiasSemana(prev =>
    prev.includes(d) ? prev.filter(x => x !== d) : [...prev, d]);
  // Guardados en orden de semana, no en el orden en que los tocó: así se leen bien en la lista.
  const diasOrdenados = DIAS.filter(d => diasSemana.includes(d));

  const handleSave = async () => {
    if (savingRef.current) return; // ya se está guardando: ignora el doble tap
    if (!nombre.trim()) { setError("Escribe el nombre del medicamento."); return; }
    if (!fechaInicio) { setError("Selecciona la fecha de inicio del tratamiento."); return; }
    if (showDiasSemana && soloAlgunosDias && diasOrdenados.length === 0) { setError("Marca al menos un día de la semana."); return; }
    setError(null);
    savingRef.current = true;
    setSaving(true);
    try {
      await onSave({
        nombre, dosis, frecuencia, emoji, color: emojiToColor(emoji), sonido,
        hora_toma: hora,
        tipo,
        nota: nota.trim() || null,
        // Si el tipo no admite cantidad (una pomada), no se guarda ninguna: guardar un 1 invisible
        // haría que mañana apareciera "1 pomada" en pantalla si alguien cambia una condición.
        cantidad: pideCantidad ? cantidad : null,
        // Se purgan las horas que ya no existen tras cambiar hora base o frecuencia. Sin esto,
        // mover la toma de la noche dejaba una cantidad huérfana que reaparecía sola.
        cantidad_por_hora: (pideCantidad && showPorHora)
          ? limpiarCantidadPorHora(porHora, horas)
          : null,
        dias_semana: (showDiasSemana && soloAlgunosDias) ? diasOrdenados : null,
        dia_semana: showDiaSemana ? diaSemana : null,
        dia_del_mes: showDiaDelMes ? Number(diaDelMes) : null,
        fecha_inicio: fechaInicio,
        duracion_tipo: durTipo !== "indefinido" ? durTipo : null,
        duracion_valor: durTipo !== "indefinido" ? Number(durValor) : null,
      });
    } finally {
      // Si onSave falló (p.ej. sin red) el form sigue abierto → permite reintentar.
      savingRef.current = false;
      setSaving(false);
    }
  };

  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollLeft = 0;
    window.scrollTo(0, 0);
    const fix = () => {
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      if (window.scrollX !== 0) window.scrollTo(0, 0);
    };
    el.addEventListener('scroll', fix, { passive: true });
    window.addEventListener('scroll', fix, { passive: true });
    const t1 = setTimeout(() => { el.scrollLeft = 0; window.scrollTo(0, 0); }, 300);
    const t2 = setTimeout(() => { el.scrollLeft = 0; window.scrollTo(0, 0); }, 1000);
    return () => { el.removeEventListener('scroll', fix); window.removeEventListener('scroll', fix); clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const previewAudioRef = useRef(null);
  useEffect(() => () => {
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
  }, []);

  const playPreview = (nombre) => {
    if (previewAudioRef.current) { previewAudioRef.current.pause(); previewAudioRef.current = null; }
    if (nombre === 'ninguno') return; // "Sin sonido": nada que reproducir
    const audio = new Audio(`/sounds/${nombre}.mp3`);
    previewAudioRef.current = audio;
    audio.play().catch(() => {});
  };

  const cls = "w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300";
  const lbl = "text-xs font-bold text-gray-500 mb-1 block";

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div
        className="w-full flex flex-col bg-white dark:bg-gray-900 overflow-hidden"
        style={{ fontFamily: "'Nunito', sans-serif", touchAction: 'pan-y', height: '100%' }}
      >
        <div
          className="flex-shrink-0 flex items-center gap-3 px-5 bg-white dark:bg-gray-900 border-b border-gray-100 dark:border-gray-700"
          style={{ paddingTop: 'calc(env(safe-area-inset-top) + 12px)', paddingBottom: '12px' }}
        >
          {showBackButton && (
            <button onClick={onCancel} className="w-9 h-9 rounded-xl bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-400 dark:text-gray-300"><ArrowLeft size={18} /></button>
          )}
          <h2 className="text-base font-bold text-gray-800 dark:text-gray-100">{title}</h2>
        </div>
        <div
          ref={scrollRef}
          className="flex-1 min-h-0 overflow-y-auto px-5"
          style={{ overscrollBehavior: 'contain', touchAction: 'pan-y', overflowX: 'hidden' }}
        >
          <div className="py-4 space-y-4 overflow-x-hidden">
            <div>
              <label className={lbl}>Tipo de medicamento</label>
              <select
                value={tipo}
                onChange={e => {
                  const t = e.target.value;
                  setTipo(t);
                  // El tipo SUGIERE el emoji; si el usuario ya eligió uno a mano, no se lo pisamos.
                  if (!emojiTocado) setEmoji(emojiSugerido(t));
                }}
                className={cls}
              >
                {TIPOS.map(t => <option key={t.id} value={t.id}>{t.emoji}  {t.label}</option>)}
              </select>
            </div>
            <div>
              <label className={lbl}>Nombre del medicamento</label>
              <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Metformina" className={cls} />
            </div>
            <div>
              <label className={lbl}>Dosis</label>
              <input value={dosis} onChange={e => setDosis(e.target.value)} placeholder="Ej: 500mg" className={cls} />
              <p className="text-xs text-gray-400 mt-1">La concentración que dice la caja.</p>
            </div>

            {pideCantidad && (
              <div>
                <label className={lbl}>¿Cuánto se {presentePara({ tipo })} cada vez?</label>
                {!cantAbierta ? (
                  /* Plegado: solo la cantidad elegida. Nueve botones a la vista llenaban la
                     pantalla para resolver el caso más común, que es "1". */
                  <button
                    type="button"
                    onClick={() => setCantAbierta(true)}
                    className={`${cls} flex items-center justify-between text-left`}
                  >
                    <span className="font-bold">{formatCantidad(cantidad, unidad) || `1 ${unidad}`}</span>
                    <span className="text-xs font-bold text-violet-500">Cambiar</span>
                  </button>
                ) : (
                  <>
                    <div className="flex flex-wrap gap-2">
                      {opciones.map(n => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => { setCantidad(n); setCantLibre(false); setCantAbierta(false); }}
                          className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                            cantidad === n && !cantLibre
                              ? "bg-violet-500 border-violet-500 text-white"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                          }`}
                        >
                          {formatCantidad(n, unidad)}
                        </button>
                      ))}
                      {/* La salida de emergencia: con esto la lista de arriba puede quedarse corta
                          sin bloquear a nadie, y no hace falta configurar nada para permitir un 6. */}
                      <button
                        type="button"
                        onClick={() => setCantLibre(true)}
                        className={`px-3 py-2 rounded-xl text-sm font-bold border transition-all ${
                          cantLibre
                            ? "bg-violet-500 border-violet-500 text-white"
                            : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300"
                        }`}
                      >
                        Otra cantidad…
                      </button>
                    </div>
                    {cantLibre && (
                      <div className="flex items-center gap-3 mt-2">
                        <input
                          type="number" min="0.25" max="99" step="0.25" inputMode="decimal"
                          value={cantidad}
                          onChange={e => setCantidad(parseCantidad(e.target.value) ?? 1)}
                          className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300"
                        />
                        <span className="text-sm text-gray-500">{unidad}{cantidad === 1 ? "" : "s"}</span>
                      </div>
                    )}
                    <button type="button" onClick={() => setCantAbierta(false)} className="text-xs font-bold text-gray-400 mt-2">Listo</button>
                  </>
                )}
              </div>
            )}

            {/* Para pomadas y parches no hay cantidad que contar, pero sí importa el dónde y el
                cómo. Se muestra siempre porque también sirve para "en ayunas" o "con comida". */}
            <div>
              <label className={lbl}>Nota {!pideCantidad && <span className="text-violet-500">— cómo aplicarlo</span>}</label>
              <input
                value={nota}
                onChange={e => setNota(e.target.value)}
                placeholder={pideCantidad ? "Ej: en ayunas" : "Ej: rodilla derecha, capa delgada"}
                className={cls}
              />
            </div>
            <div>
              <label className={lbl}>Frecuencia</label>
              <select value={freqSel} onChange={e => setFreqSel(e.target.value)} className={cls}>
                <optgroup label="Varias veces al día">
                  <option value="Una vez al día">Una vez al día</option>
                  <option value="Dos veces al día">Dos veces al día</option>
                  <option value="Tres veces al día">Tres veces al día</option>
                  <option value="Cada 4 horas">Cada 4 horas</option>
                  <option value="Cada 6 horas">Cada 6 horas</option>
                  <option value="Cada 8 horas">Cada 8 horas</option>
                  <option value="Cada 12 horas">Cada 12 horas</option>
                  <option value="__horas__">Personalizar intervalo de horas…</option>
                </optgroup>
                <optgroup label="Por días">
                  <option value="Cada tercer día">Cada tercer día</option>
                  <option value="Semanal">Semanal (un solo día)</option>
                  <option value="Cada 15 días">Cada 15 días</option>
                  <option value="Cada mes">Cada mes</option>
                  <option value="Cada 3 meses">Cada 3 meses</option>
                  <option value="__dias__">Personalizar intervalo de días…</option>
                </optgroup>
                <option value="Solo cuando necesite">Solo cuando necesite</option>
              </select>
            </div>

            {freqSel === "__horas__" && (
              <div>
                <label className={lbl}>Cada cuántas horas</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="1" max="23" value={customHoras} onChange={e => setCustomHoras(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">horas</span>
                </div>
              </div>
            )}

            {freqSel === "__dias__" && (
              <div>
                <label className={lbl}>Cada cuántos días</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="2" max="365" value={customDias} onChange={e => setCustomDias(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">días</span>
                </div>
              </div>
            )}

            {showDiasSemana && (
              <div>
                <label className={lbl}>¿Qué días?</label>
                {/* Antes esto era una opción del desplegable de Frecuencia, y por eso nadie la
                    encontraba — y encima era excluyente de "dos veces al día". Ahora es un control
                    propio, siempre visible, que se combina con cualquier frecuencia diaria. */}
                <div className="flex gap-2 mb-2">
                  {[["Todos los días", false], ["Solo algunos días", true]].map(([texto, val]) => (
                    <button
                      key={texto}
                      type="button"
                      onClick={() => setSoloAlgunosDias(val)}
                      className={`flex-1 py-2.5 rounded-xl text-sm font-bold border transition-all ${
                        soloAlgunosDias === val
                          ? "bg-violet-500 border-violet-500 text-white"
                          : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-300"
                      }`}
                    >
                      {texto}
                    </button>
                  ))}
                </div>
                {soloAlgunosDias && (
                  <>
                    <div className="flex gap-1.5">
                      {DIAS.map(d => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => toggleDia(d)}
                          aria-pressed={diasSemana.includes(d)}
                          aria-label={d}
                          className={`flex-1 aspect-square rounded-xl text-sm font-bold border transition-all ${
                            diasSemana.includes(d)
                              ? "bg-violet-500 border-violet-500 text-white"
                              : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-400"
                          }`}
                        >
                          {d[0]}
                        </button>
                      ))}
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      {diasOrdenados.length === 0
                        ? "Marca al menos un día."
                        : `Toca ${diasOrdenados.length === 7 ? "todos los días" : diasOrdenados.join(", ")}.`}
                    </p>
                    {/* El caso que motivó todo esto: si además cambia la CANTIDAD según el día, se
                        resuelve con dos medicamentos, y Duplicar hace la segunda en tres toques. */}
                    <p className="text-xs text-gray-400 mt-1">
                      ¿Otra cantidad el resto de la semana? Guarda este y usa <span className="font-bold text-violet-500">Duplicar</span> en Ajustes para el otro grupo de días.
                    </p>
                  </>
                )}
              </div>
            )}

            {showPorHora && (
              <div>
                <label className={lbl}>¿Cambia la cantidad según la hora?</label>
                <div className="space-y-2">
                  {horas.map(h => {
                    const v = parseCantidad(porHora[h]);
                    return (
                      <div key={h} className="flex items-center gap-2">
                        <span className="w-20 flex-shrink-0 text-sm font-bold text-gray-600 dark:text-gray-300">{fmt12h(h)}</span>
                        <select
                          value={v === null ? "" : String(v)}
                          onChange={e => setCantidadDeHora(h, e.target.value === "" ? null : Number(e.target.value))}
                          className={cls}
                        >
                          <option value="">Igual que arriba ({formatCantidad(cantidad, unidad)})</option>
                          {opciones.map(n => <option key={n} value={String(n)}>{formatCantidad(n, unidad)}</option>)}
                        </select>
                      </div>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1.5">Déjalo en "igual que arriba" si no cambia.</p>
              </div>
            )}

            {showDiaSemana && (
              <div>
                <label className={lbl}>Día de la semana</label>
                <select value={diaSemana} onChange={e => setDiaSemana(e.target.value)} className={cls}>
                  {["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"].map(d => <option key={d} value={d}>{d}</option>)}
                </select>
              </div>
            )}

            {showDiaDelMes && (
              <div>
                <label className={lbl}>
                  Día del mes
                  {freqSel === "Cada 15 días" && <span className="font-normal text-gray-400 ml-1">(la siguiente será 15 días después)</span>}
                </label>
                <select value={diaDelMes} onChange={e => setDiaDelMes(Number(e.target.value))} className={cls}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map(d => <option key={d} value={d}>Día {d}</option>)}
                </select>
              </div>
            )}

            <div>
              <label className={lbl}>{["Dos veces al día","Tres veces al día","Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas","__horas__"].includes(freqSel) ? "Hora de la primera vez" : "¿A qué hora?"}</label>
              <input value={hora} onChange={e => setHora(e.target.value)} type="time" className={cls} />
            </div>

            <div>
              <label className={lbl}>Fecha de inicio del tratamiento <span className="text-red-500">*</span></label>
              <input value={fechaInicio} onChange={e => { setFechaInicio(e.target.value); setError(null); }} type="date" required className={`${cls} ${!fechaInicio ? "border-red-300 dark:border-red-500" : ""}`} />
            </div>

            <div>
              <label className={lbl}>Duración del tratamiento</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[["indefinido","Indefinido"],["dias","Días"],["semanas","Semanas"],["meses","Meses"]].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => setDurTipo(val)}
                    className={`py-2 rounded-xl text-xs font-bold transition-all ${durTipo === val ? "bg-violet-500 text-white shadow-sm" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 hover:bg-gray-200"}`}>
                    {label}
                  </button>
                ))}
              </div>
              {durTipo !== "indefinido" && (
                <div className="flex items-center gap-3">
                  <input type="number" min="1" value={durValor} onChange={e => setDurValor(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">{durTipo}</span>
                </div>
              )}
            </div>

            <div>
              <label className={lbl}>Sonido de alerta</label>
              <div className="flex flex-wrap gap-2">
                {SONIDOS.map(s => (
                  <button key={s.id} type="button" onClick={() => { setSonido(s.id); playPreview(s.id); }}
                    className={`px-2.5 py-1 rounded-lg text-sm font-bold transition-all ${sonido === s.id ? "bg-violet-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className={lbl}>Emoji</label>
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                {EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => { setEmoji(e); setEmojiTocado(true); }} className={`aspect-square rounded-xl text-xl flex items-center justify-center transition-all ${emoji === e ? "border-2 border-violet-400 bg-violet-50" : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"}`}>{e}</button>
                ))}
              </div>
            </div>
          </div>
        </div>
        <div
          className="flex-shrink-0 px-5 pt-3 bg-white dark:bg-gray-900 border-t border-gray-100 dark:border-gray-700"
          style={{ paddingBottom: 'max(16px, env(safe-area-inset-bottom))' }}
        >
          {error && (
            <div className="text-xs font-medium text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-xl mb-2">{error}</div>
          )}
          <div className="flex gap-2">
            <button onClick={onCancel} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-500 hover:bg-gray-50">Cancelar</button>
            <button onClick={handleSave} disabled={saving} className="flex-1 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200 dark:shadow-none disabled:opacity-60">{saving ? "Guardando…" : "Guardar"}</button>
          </div>
        </div>
      </div>
    </>
  );
}
