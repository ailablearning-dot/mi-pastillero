import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { ArrowLeft, ChevronDown } from 'lucide-react';
import { EMOJIS, EMOJI_TO_COLOR, emojiToColor, FRECUENCIAS } from "../domain/catalogs";
import { AVISO_DIAS_POR_DEFECTO, parseExistencias, esRecuento } from "../domain/inventario";
import MedicoCombobox from "./MedicoCombobox";
import { fmtDate, fmt12h } from "../domain/dates";
import { getHoras, FREQ_DIAS_SEMANA, esDuplicadoExacto } from "../domain/schedule";
import { TIPOS, TIPO_POR_DEFECTO, getTipo, usaCantidad, llevaControlDeCaja, unidadPara, emojiSugerido, presentePara } from "../domain/medTypes";
import { cantidadesPara, formatCantidad, limpiarCantidadPorHora, parseCantidad, esCantidadLibre } from "../domain/dosage";
import { SONIDOS } from "../lib/notifications";

const DIAS = ["Lunes","Martes","Miércoles","Jueves","Viernes","Sábado","Domingo"];

// `existentes` son los medicamentos que ya tiene esa persona. Sirve para una sola cosa: no dejar
// guardar un duplicado EXACTO. La regla y su razón viven en `domain/schedule.js` — sobre todo el
// borde, porque el mismo medicamento a OTRA hora es el único apaño que hay para una pauta irregular
// y bloquearlo sería peor que el problema.
export default function PillForm({ pill, title = "Nuevo medicamento", showBackButton = true, existentes = [], onSave, onCancel, medicos = [], resolverMedico = null, quedanAhora = null, enfocarCaja = false }) {
  const [nombre, setNombre] = useState(pill?.nombre || "");
  const [dosis, setDosis] = useState(pill?.dosis || "");
  const [emoji, setEmoji] = useState(pill?.emoji || "💊");
  // El color se deriva automáticamente del emoji (ver EMOJI_TO_COLOR).
  // Sin hora por defecto en el alta, por lo mismo que la frecuencia: las 8:00 eran una suposición,
  // y quien toma su medicamento por la noche y no la cambia se lleva un aviso a las ocho de la
  // mañana. El error no se ve —el formulario se guarda tan contento— y se paga con una dosis
  // perdida al día siguiente. Al EDITAR se conserva la suya.
  const [hora, setHora] = useState(pill?.hora_toma || "");

  // El tipo va PRIMERO en el formulario porque manda en el resto: si se pide cantidad, en qué
  // unidad, y si tiene sentido ofrecer fracciones. Sin tipo se asume pastilla, que es lo que la
  // app daba por hecho antes.
  const [tipo, setTipo] = useState(pill?.tipo || "pastilla");
  const [cantidad, setCantidad] = useState(parseCantidad(pill?.cantidad) ?? 1);
  const [porHora, setPorHora] = useState(pill?.cantidad_por_hora || {});
  // Arrancan TODOS marcados a propósito: si al usuario se le pasa quitar alguno, el medicamento
  // aparece de más — molesto. Si arrancaran vacíos o con unos pocos, aparecería de MENOS, y eso es
  // una dosis que no se toma. Ante la duda, sobra.
  const [diasSemana, setDiasSemana] = useState(
    pill?.dias_semana?.length ? pill.dias_semana : [...DIAS]);
  // Por defecto TODOS los días: es el caso de la inmensa mayoría y no debe costar ni un toque.
  const [soloAlgunosDias, setSoloAlgunosDias] = useState(!!pill?.dias_semana?.length);
  const [nota, setNota] = useState(pill?.nota || "");
  // LA CAJA. Se guarda como texto mientras se teclea para poder distinguir "vacío" de 0 — que es
  // un valor real y el más urgente ("conté y no me queda ninguna").
  // Al EDITAR se enseña LO QUE QUEDA, no el corte guardado. El campo dice "¿cuántas tienes
  // ahora?", y el corte es lo que había el día que se contó: enseñar 30 mientras el home dice 4 es
  // contradictorio, y lo fue en device. Si no se sabe lo que queda —la consulta del trozo viejo
  // falló— se cae al corte, que es el único dato fiable que hay.
  const [existencias, setExistencias] = useState(() => {
    if (quedanAhora !== null && quedanAhora !== undefined) return String(quedanAhora);
    return pill?.existencias === null || pill?.existencias === undefined ? "" : String(pill.existencias);
  });
  const [avisoDias, setAvisoDias] = useState(
    pill?.aviso_dias == null ? String(AVISO_DIAS_POR_DEFECTO) : String(pill.aviso_dias));
  const [paraQue, setParaQue] = useState(pill?.para_que || "");
  // ¿Este medicamento ya trae algo en los campos plegados? Si lo trae, "Más opciones" arranca
  // ABIERTO: esconder detrás de un toque un dato que alguien escribió es la forma de perderlo —
  // se edita, no se ve, y al guardar parece que nunca estuvo.
  const hayAvanzado = !!pill && (
    !!pill.nota || !!pill.para_que || !!pill.medico_id ||
    !!pill.dias_semana?.length || !!pill.duracion_tipo ||
    (pill.tipo && pill.tipo !== TIPO_POR_DEFECTO) ||
    (pill.cantidad != null && Number(pill.cantidad) !== 1) ||
    !!pill.cantidad_por_hora
  );
  const [masOpciones, setMasOpciones] = useState(hayAvanzado);
  // Cuando se llega desde el chip de "te quedan N", el formulario se abre por arriba y la caja
  // queda a un scroll: la puerta corta dejaba de serlo. Se lleva la vista al campo y se selecciona
  // el número, que es exactamente lo que se viene a cambiar.
  const cajaRef = useRef(null);
  useEffect(() => {
    if (!enfocarCaja) return;
    const t = setTimeout(() => {
      cajaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      cajaRef.current?.focus();
      cajaRef.current?.select?.();
    }, 260); // deja que el formulario acabe de montarse y de colocarse
    return () => clearTimeout(t);
  }, [enfocarCaja]);
  // El médico se escribe libre y el catálogo se va llenando solo, igual que en las citas. Un
  // desplegable obligaría a dar de alta al médico ANTES de poder guardar el medicamento, que es
  // justo el momento en que nadie quiere rellenar una ficha.
  // Al EDITAR, la fila de la pastilla solo trae `medico_id`: el nombre hay que buscarlo en el
  // catálogo. Sin esto el campo salía vacío al abrir un medicamento que sí tenía médico, y
  // guardar de nuevo lo habría desvinculado en silencio.
  const [medico, setMedico] = useState(() => {
    const m = pill?.medico_id ? (medicos || []).find(x => x.id === pill.medico_id) : null;
    return { nombre: m?.nombre || "", medicoId: pill?.medico_id || null, especialidad: m?.especialidad || "" };
  });
  // Si el usuario elige un emoji a mano, el tipo deja de pisárselo.
  const [emojiTocado, setEmojiTocado] = useState(!!pill?.emoji);
  // La cantidad arranca PLEGADA: la gran mayoría toma 1 y no debería ver ocho botones para eso.
  const [cantAbierta, setCantAbierta] = useState(false);
  // Y si el medicamento traía una cantidad que no está en las opciones rápidas (un 4 de antes),
  // se abre el campo libre para que se vea de dónde sale, en vez de una selección que no cuadra.
  const [cantLibre, setCantLibre] = useState(esCantidadLibre({ tipo: pill?.tipo }, pill?.cantidad));

  // Al dar de alta NO hay frecuencia por defecto. Antes traía "Una vez al día" puesta, y quien
  // toma su medicamento tres veces al día y no baja a cambiarla se lleva a casa un horario
  // equivocado sin que nada se lo diga — una dosis al día en vez de tres. Es el peor fallo
  // silencioso que puede tener un formulario de medicación. Al EDITAR se conserva la suya.
  const existFreq = pill?.frecuencia || "";
  const mDias = existFreq.match(/^Cada (\d+) días?$/);
  const mHoras = existFreq.match(/^Cada (\d+) horas?$/);
  // Compatibilidad: lo guardado con la frecuencia "Días específicos…" (que ya no existe en el
  // desplegable) se lee como "Una vez al día" con los días acotados, que es lo mismo.
  //
  // Y OJO con el orden: las opciones de la lista se comprueban ANTES que los patrones
  // personalizados. "Cada 12 horas" también encaja en /^Cada (\d+) horas?$/, así que sin esto un
  // medicamento guardado con la opción "Cada 12 horas" se reabría como "Personalizar intervalo de
  // horas… 12" — el mismo horario, pero al usuario le parecía que la app le había cambiado la pauta.
  const [freqSel, setFreqSel] = useState(
    existFreq === FREQ_DIAS_SEMANA ? "Una vez al día"
    : FRECUENCIAS.includes(existFreq) ? existFreq
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

  // ── LLEVAR AL CAMPO QUE FALTA ─────────────────────────────────────────────────────────────
  // Un mensaje de error al pie no basta: el campo que falta puede estar media pantalla más
  // arriba, y desde que la frecuencia y la hora no traen valor por defecto, faltar es lo normal
  // la primera vez. Peor todavía con la fecha y los días de la semana, que viven DENTRO de "Más
  // opciones": si está plegado, el campo ni siquiera existe en el DOM y no hay nada que enfocar.
  const refNombre = useRef(null), refFreq = useRef(null), refHora = useRef(null);
  const refFecha = useRef(null), refHoras = useRef(null), refDias = useRef(null);
  const refSemana = useRef(null);

  // Devuelve `false` para poder escribir `if (...) return falta(...)` en una línea.
  const falta = (mensaje, ref, plegado = false) => {
    setError(mensaje);
    if (plegado) setMasOpciones(true);
    // Se espera un poco a que React monte lo que acabamos de abrir: si "Más opciones" estaba
    // plegado, el campo todavía no existe en el DOM cuando esta función termina.
    //
    // ⚠️ Y se espera con un TEMPORIZADOR, no con `requestAnimationFrame`. Los frames no se
    // ejecutan mientras la página está oculta (`visibilityState: "hidden"`), lo que en la práctica
    // no pasa al tocar "Guardar" pero sí hace la función imposible de verificar fuera de la app.
    setTimeout(() => {
      const el = ref?.current;
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // `preventScroll` porque del desplazamiento ya se encargó la línea de arriba; sin él, iOS
      // hace el suyo por encima y el campo acaba pegado al teclado.
      try { el.focus({ preventScroll: true }); } catch { el.focus(); }
    }, 50);
    return false;
  };
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
  // La caja solo para lo que se cuenta por unidades sueltas — pastillas y cápsulas. NO es lo mismo
  // que `pideCantidad`: un jarabe lleva cantidad y aun así "¿cuántas cucharadas te quedan?" no se
  // sabe contestar mirando el frasco.
  const tieneCaja = llevaControlDeCaja({ tipo });
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

  // El id del médico a guardar. Si se eligió uno de la lista, ese; si se escribió un nombre nuevo,
  // se da de alta en el catálogo (lo mismo que hacen las citas, con la misma función). Sin
  // `resolverMedico` —una pantalla que no lo recibe— no se inventa nada: se guarda sin médico
  // antes que guardar un vínculo a medias.
  const resolverMedicoId = async () => {
    if (medico.medicoId) return medico.medicoId;
    if (!medico.nombre?.trim() || !resolverMedico) return null;
    const m = await resolverMedico(medico.nombre, medico.especialidad);
    return m?.id || null;
  };

  // Lo que se guarda de LA CAJA. El detalle que importa: la fecha y la hora del corte solo se
  // mueven cuando CAMBIA el número. Si se movieran en cada guardado, editar el nombre del
  // medicamento reiniciaría la cuenta y las tomas ya restadas volverían a aparecer — el número
  // subiría solo y nadie entendería por qué.
  const caja = () => {
    const n = tieneCaja ? parseExistencias(existencias) : null;
    if (n === null) return { existencias: null, existencias_fecha: null, existencias_hora: null, aviso_dias: null };
    const umbral = avisoDias === "" ? null : Math.max(0, Math.min(90, Number(avisoDias) || 0));
    const recontado = esRecuento(n, quedanAhora, pill?.existencias) || !pill?.existencias_fecha;
    // SIN recuento no se toca NADA del corte, y el número tampoco. Es la trampa que apareció en
    // device y que costó encontrar: como el campo ahora enseña lo que QUEDA (2) y no el corte (3),
    // guardar el valor del campo con la fecha vieja habría dejado "quedaban 2 desde el día que se
    // contaron 3" — y la toma que ya se había restado se habría restado otra vez, bajando a 1 sin
    // que nadie contara nada. Guardar sin tocar el campo tiene que ser un no-op exacto.
    if (!recontado) {
      return {
        existencias: parseExistencias(pill.existencias),
        existencias_fecha: pill.existencias_fecha,
        existencias_hora: pill.existencias_hora,
        aviso_dias: umbral,
      };
    }
    const ahora = new Date();
    return {
      existencias: n,
      existencias_fecha: hoyStr,
      existencias_hora: ahora.toLocaleTimeString("es-ES"),
      aviso_dias: umbral,
    };
  };

  const handleSave = async () => {
    if (savingRef.current) return; // ya se está guardando: ignora el doble tap
    if (!nombre.trim()) return falta("Escribe el nombre del medicamento.", refNombre);
    // Va ANTES que la fecha porque es la que se olvida: la fecha viene rellena y esta no.
    if (!freqSel) return falta("Elige cada cuándo se toma. Es lo que decide a qué horas te avisamos.", refFreq);
    if (!hora) return falta("Elige a qué hora se toma. Es la hora a la que te vamos a avisar.", refHora);
    if (!fechaInicio) return falta("Selecciona la fecha de inicio del tratamiento.", refFecha, true);
    if (showDiasSemana && soloAlgunosDias && diasOrdenados.length === 0)
      return falta("Marca al menos un día de la semana.", refSemana, true);
    // ⚠️ El intervalo personalizado se guardaba VACÍO. `<input type="number">` devuelve "" al
    // borrarlo, y `Cada ${""} horas` da la cadena "Cada  horas", que ningún regex del dominio
    // reconoce: `getHoras` cae en "una sola toma" e `isPillDueOnDay` cae en "todos los días". O sea
    // que quien pedía "cada 8 horas" se quedaba con una toma al día, y quien pedía "cada 3 días"
    // recibía avisos a diario. Hay DOS filas así en producción, de dos personas distintas.
    if (freqSel === "__horas__" && !(Number(customHoras) >= 1 && Number(customHoras) <= 23)) {
      return falta("Escribe cada cuántas horas se toma (entre 1 y 23).", refHoras);
    }
    if (freqSel === "__dias__" && !(Number(customDias) >= 2 && Number(customDias) <= 365)) {
      return falta("Escribe cada cuántos días se toma (entre 2 y 365).", refDias);
    }
    // Duplicado EXACTO: mismo nombre, dosis, cantidad, frecuencia Y hora. Se bloquea porque no
    // expresa nada —solo avisa dos veces y cuenta doble en la adherencia— y porque el camino de
    // "Duplicar" lleva justo aquí: abre el formulario relleno y nada obligaba a cambiar la hora.
    // El mensaje enseña la salida en vez de solo cerrar la puerta.
    if (esDuplicadoExacto({ nombre, dosis, cantidad: pideCantidad ? cantidad : null, frecuencia, hora_toma: hora }, existentes, pill?.id)) {
      return falta("Ya tienes este medicamento a esta misma hora. Si es otra toma del día, cambia la hora.", refHora);
    }
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
        para_que: paraQue.trim() || null,
        medico_id: await resolverMedicoId(),
        ...caja(),
      });
    } finally {
      // Si onSave falló (p.ej. sin red) el form sigue abierto → permite reintentar.
      savingRef.current = false;
      setSaving(false);
    }
  };

  // Corrige el desplazamiento HORIZONTAL del formulario en iPhones angostos (8, 17e). Puesto el
  // 2026-05-08 en `684263d`, y sigue haciendo falta.
  //
  // ⚠️ Solo el eje horizontal, y esto costó un rato de encontrar: `window.scrollTo(0, 0)` resetea
  // LOS DOS ejes. Al enfocar un campo, iOS sube la página para dejarlo por encima del teclado — y
  // esto lo tiraba de vuelta arriba, hasta un segundo después de haber abierto el teclado (el
  // temporizador de 1000 ms). El síntoma en device: tocas un campo, sale el teclado, el formulario
  // se queda clavado en "Tipo de medicamento" y no responde durante unos segundos. Parecía un
  // cuelgue y era una pelea entre iOS y este efecto.
  //
  // De ahí `window.scrollTo(0, window.scrollY)`: pone la X a cero y deja la Y donde iOS la haya
  // dejado. Y los temporizadores solo actúan si de verdad hay desvío, en vez de mover la página a
  // ciegas dos veces.
  //
  // ⚠️ Y se corrige UNA VEZ POR FOTOGRAMA, no en cada evento de scroll. Leer `el.scrollLeft` y
  // `window.scrollX` obliga al navegador a recalcular la disposición ahí mismo, de forma síncrona;
  // hacerlo en cada evento de una ráfaga —y abrir el teclado con `resize: "body"` produce una
  // ráfaga— es recalcular este formulario entero decenas de veces seguidas en el hilo principal.
  // En el escritorio no se nota (medido: 0 ms); en un iPhone es justo la forma que tiene la app de
  // parecer colgada un par de segundos y luego responder.
  const scrollRef = useRef(null);
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    let encolado = false;
    const aLaIzquierda = () => {
      encolado = false;
      if (el.scrollLeft !== 0) el.scrollLeft = 0;
      if (window.scrollX !== 0) window.scrollTo(0, window.scrollY);
    };
    const enScroll = () => {
      if (encolado) return;
      encolado = true;
      requestAnimationFrame(aLaIzquierda);
    };
    aLaIzquierda();
    el.addEventListener('scroll', enScroll, { passive: true });
    window.addEventListener('scroll', enScroll, { passive: true });
    const t1 = setTimeout(aLaIzquierda, 300);
    const t2 = setTimeout(aLaIzquierda, 1000);
    // ⚠️ Y los temporizadores se CANCELAN en cuanto la persona toca el formulario. Reportado en
    // device: "el primer clic en el nombre como que no responde, es al segundo o tercero". Eran
    // estos: si hay desvío horizontal, mover la página a los 300 ms y al segundo cae justo encima
    // del toque con el que se abre el teclado, y iOS cancela ese toque. Después de un segundo ya
    // no pasaba — por eso "al segundo o tercero".
    // La corrección inicial ya se hizo arriba de forma síncrona y el listener sigue cubriendo
    // cualquier desvío posterior; estos dos solo cubrían una disposición que llega tarde, y eso
    // deja de importar en cuanto hay alguien interactuando.
    const cancelar = () => { clearTimeout(t1); clearTimeout(t2); };
    el.addEventListener('pointerdown', cancelar, { once: true, passive: true });
    el.addEventListener('touchstart', cancelar, { once: true, passive: true });
    return () => {
      el.removeEventListener('scroll', enScroll);
      window.removeEventListener('scroll', enScroll);
      el.removeEventListener('pointerdown', cancelar);
      el.removeEventListener('touchstart', cancelar);
      clearTimeout(t1); clearTimeout(t2);
    };
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

            {/* EL TIPO VA PRIMERO, y no plegado. Se probó dentro de "Más opciones" y se revirtió:
                es la única respuesta que cambia el VOCABULARIO de todo lo de abajo —"1 pastilla" o
                "1 aplicación", "tomada" o "aplicada"— y además decide si aparece la caja. Quien da
                de alta una pomada vería un formulario con forma de pastilla y no tendría por qué
                adivinar que la palabra que lo arregla está detrás de un toque.
                Es la primera pregunta de verdad: qué clase de cosa es esto. */}
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
              <input ref={refNombre} value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Ej: Metformina" className={cls} />
            </div>


            {/* LA FRECUENCIA VA ANTES QUE LA DOSIS, y sin valor por defecto. Es la respuesta que
                decide a qué horas suena la app, y traerla rellena con "Una vez al día" hacía que
                quien toma tres al día se llevara un horario equivocado sin enterarse. Primero
                cada cuándo, después cuánto. */}
            <div>
              <label className={lbl}>Frecuencia</label>
              <select ref={refFreq} value={freqSel} onChange={e => { setFreqSel(e.target.value); setError(null); }}
                className={`${cls} ${!freqSel ? "text-gray-400" : ""}`}>
                <option value="" disabled>Elige cada cuándo se toma</option>
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

            {/* LA CANTIDAD VA A LA VISTA Y LA DOSIS SE PLIEGA. Estaban al revés, y lo destapó una
                usuaria con unas gotas: escribió "10 gotas" en Dosis —que pide la CONCENTRACIÓN de
                la caja— y más abajo, dentro de "Más opciones", el formulario le volvía a preguntar
                cuánto se pone. Le pareció que la app preguntaba dos veces lo mismo, y tenía razón:
                para gotas, jarabe o inhalador la caja no dice una concentración que nadie sepa
                recitar, así que en ese campo se escribe lo único que sí se sabe, que es la dosis
                que se toma.

                El reparto sale del criterio con el que se rediseñó esta pantalla —sube lo que solo
                se decide AHORA—, y ahí la cantidad gana sin discusión: la concentración está impresa
                en el envase y se puede consultar cuando sea; cuánto te tomas cada vez te lo dijo el
                médico de viva voz y es lo que se olvida. */}
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


            {freqSel === "__horas__" && (
              <div>
                <label className={lbl}>Cada cuántas horas</label>
                <div className="flex items-center gap-3">
                  <input ref={refHoras} type="number" min="1" max="23" value={customHoras} onChange={e => setCustomHoras(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">horas</span>
                </div>
              </div>
            )}

            {freqSel === "__dias__" && (
              <div>
                <label className={lbl}>Cada cuántos días</label>
                <div className="flex items-center gap-3">
                  <input ref={refDias} type="number" min="2" max="365" value={customDias} onChange={e => setCustomDias(e.target.value)} className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">días</span>
                </div>
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

            {/* La hora va ANTES de "¿cambia la cantidad según la hora?", y es un orden que costó
                un reporte en device. Ese bloque LISTA las horas —8:00 AM, 8:00 PM— y esas horas
                salen de este campo: enseñaba el resultado antes que su causa, así que la persona
                configuraba cantidades para unas horas y luego, al fijar la primera, las filas de
                arriba cambiaban solas. La entrada va delante de lo que produce. */}
            <div>
              <label className={lbl}>{["Dos veces al día","Tres veces al día","Cada 4 horas","Cada 6 horas","Cada 8 horas","Cada 12 horas","__horas__"].includes(freqSel) ? "Hora de la primera vez" : "¿A qué hora?"}</label>
              {/* `appearance-none` + `min-w-0` + `block` NO son adorno: sin ellos iOS pinta su propia
                  apariencia nativa sobre el campo —se come el borde de abajo— y le da una anchura
                  intrínseca que se sale del contenedor por la derecha. Visto en device el
                  2026-08-24. En el navegador de escritorio se ve bien igualmente, así que esto
                  solo se puede comprobar en el teléfono. */}
              <input ref={refHora} value={hora} onChange={e => { setHora(e.target.value); setError(null); }}
                type="time" className={`${cls} appearance-none min-w-0 block h-[46px]`} />
              {/* Un `type="time"` VACÍO no pinta nada en iOS —ignora el placeholder— y queda un
                  recuadro mudo que no dice qué hacer con él. Visto en device el 2026-08-24: "no se
                  cierra, y debería decir algo como selecciona la hora". La pista se va en cuanto
                  hay hora: entonces el propio valor explica el campo y el texto sobraría. */}
              {!hora && <p className="text-xs text-gray-400 mt-1">Toca el recuadro para elegir la hora.</p>}
            </div>

            {/* LA CAJA sube al alta —es opcional y aun así va arriba— y hace falta decir por qué,
                para que la lista no crezca sola: solo se puede contestar bien AHORA, con la caja
                en la mano. Plegada no la llenaría casi nadie, y sin este número no hay ni cuenta
                ni aviso: la función entera se quedaría sin arrancar.
                Solo pastillas y cápsulas (`llevaControlDeCaja`): "¿cuántas cucharadas de jarabe te
                quedan?" no es algo que nadie sepa contestar mirando el frasco.
                Los tres textos reparten papeles a propósito: la etiqueta dice QUÉ escribir, el
                ejemplo lo aterriza y la ayuda dice QUÉ GANAS. Un campo opcional se llena cuando se
                sabe lo que da, no cuando se entiende cómo funciona. */}
            {tieneCaja && (
              <div>
                <label className={lbl}>¿Cuántas {unidad}s tienes? <span className="font-normal text-gray-400">(opcional)</span></label>
                <div className="flex items-center gap-3">
                  <input ref={cajaRef} type="number" min="0" step="0.5" inputMode="decimal" value={existencias}
                    onChange={e => setExistencias(e.target.value)} placeholder={`Ej: 30 — las de la caja`}
                    className={cls} />
                </div>
                {/* La ayuda DICE el aviso en vez de callarlo. Preguntar cuántas tienes sin decir
                    para qué deja el campo a medias: el umbral vive en "Más opciones" y quien no lo
                    abra no sabría que hay aviso. Así el valor por defecto se declara, y abrir solo
                    hace falta para cambiarlo. */}
                <p className="text-xs text-gray-400 mt-1.5">{pill
                  ? "Se descuentan solas con cada toma. Corrige el número solo si las volviste a contar."
                  : `Te avisamos cuando te queden para ${avisoDias || AVISO_DIAS_POR_DEFECTO} días.`}</p>
              </div>
            )}

            <div>
              <label className={lbl}>Sonido de alerta</label>
              {/* TODOS a la vista, envueltos. Se probó una sola fila que se desliza para ahorrar
                  espacio y se revirtió en el acto: en un teléfono angosto solo caben cuatro de los
                  ocho, y el propio autor de la app creyó que se habían BORRADO sonidos. Si quien lo
                  construyó no ve que hay más, nadie va a deslizar.
                  Y aquí esconder cuesta de verdad: no son opciones intercambiables como los colores
                  —cada una tiene nombre y significado, y una es "Sin sonido", que hay quien busca a
                  propósito—. Con la lista envuelta, además, añadir sonidos más adelante solo suma
                  una fila en vez de empujar los nuevos fuera de la pantalla.
                  Tampoco un desplegable: costaría la audición, que es la única razón por la que el
                  sonido está a la vista. */}
              <div className="flex flex-wrap gap-2">
                {SONIDOS.map(s => (
                  <button key={s.id} type="button"
                    onClick={() => { setSonido(s.id); playPreview(s.id); }}
                    className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${sonido === s.id ? "bg-violet-500 text-white" : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"}`}>
                    {s.label}
                  </button>
                ))}
              </div>
              {/* Sin esto, la fila parece una lista para leer. Es la razón por la que el sonido
                  está a la vista: poder oírlo ANTES de que suene mañana a las ocho. */}
              <p className="text-xs text-gray-400 mt-1.5">Tócalo para oírlo.</p>
            </div>

            <div>
              <label className={lbl}>Emoji</label>
              {/* Diecinueve emojis en rejilla de seis eran cuatro filas altas. En una sola fila que
                  scrollea ocupan una, y se sigue eligiendo de un toque — que es lo que un
                  desplegable de emojis haría peor: no se ven. */}
              {/* Los diecinueve a la vista. Se probó una fila que se desliza para ahorrar alto y
                  se revirtió: pasó lo mismo que con los sonidos —desde fuera parece que se
                  BORRARON opciones—. La lección: "Más opciones" puede esconder un CAMPO entero,
                  porque su rótulo dice que está ahí; esconder opciones DENTRO de un campo visible
                  es otra cosa, porque el campo se ve completo y nadie sospecha que falta nada. */}
              <div className="grid gap-2" style={{ gridTemplateColumns: 'repeat(6, 1fr)' }}>
                {EMOJIS.map(e => (
                  <button key={e} type="button" onClick={() => { setEmoji(e); setEmojiTocado(true); }} className={`aspect-square rounded-xl text-xl flex items-center justify-center transition-all ${emoji === e ? "border-2 border-violet-400 bg-violet-50 dark:bg-violet-950/40" : "bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"}`}>{e}</button>
                ))}
              </div>
            </div>


            {/* MÁS OPCIONES. El alta pedía quince cosas y el prototipo aprobado pide cinco; esto
                devuelve la pantalla a lo que se contesta de un tirón y deja el resto a un toque.
                Se pliega en vez de partirse en dos pasos porque ESTE MISMO componente es el de
                editar: un asistente está bien para dar de alta una vez y estorba cada vez que
                alguien entra a cambiar una hora, que es lo que más se hace. Y da un sitio donde
                crecer —cada función nueva de un medicamento aterriza aquí— sin empeorar el alta.
                ⚠️ Se abre SOLO si el medicamento ya trae algo dentro: esconder datos que alguien
                escribió es la forma de perderlos. */}
            <div className="pt-1">
              <button type="button" onClick={() => setMasOpciones(v => !v)}
                aria-expanded={masOpciones}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-left active:scale-[0.99] transition-all">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-violet-600 dark:text-violet-300">Más opciones</p>
                  {!masOpciones && (
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mt-0.5 leading-snug">
                      Cantidad por toma, días, duración, aviso de la caja, para qué y médico
                    </p>
                  )}
                </div>
                <ChevronDown size={18} className={`text-gray-400 shrink-0 transition-transform ${masOpciones ? "rotate-180" : ""}`} />
              </button>
            </div>

            {masOpciones && (<>

            <div>
              <label className={lbl}>Dosis <span className="font-normal text-gray-400">(opcional)</span></label>
              <input value={dosis} onChange={e => setDosis(e.target.value)} placeholder="Ej: 500mg" className={cls} />
              {/* "la caja" inducía a error en todo lo que no viene en caja: unas gotas están en
                  frasco y una pomada en tubo, y ese texto empujaba a escribir ahí la dosis que se
                  toma. "El envase" vale para los doce tipos sin necesidad de condicionales. */}
              <p className="text-xs text-gray-400 mt-1">La concentración que dice el envase.</p>
            </div>

            {showDiasSemana && (
              // `tabIndex={-1}` para que se le pueda dar el foco al llevar aquí desde el error:
              // no es un campo, es un grupo de botones, y sin esto `focus()` no haría nada.
              <div ref={refSemana} tabIndex={-1} className="outline-none">
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

            {/* Sin asterisco y sin borde rojo. Marcaba el único obligatorio que ya viene
                relleno —con la fecha de hoy— mientras el que de verdad se olvida, el nombre,
                no llevaba nada. Y el borde pintaba error antes de que nadie se equivocara.
                Lo que falta lo dice `handleSave` con una frase, que es una instrucción y no
                una decoración. */}
            <div>
              <label className={lbl}>Fecha de inicio del tratamiento</label>
              <input ref={refFecha} value={fechaInicio} onChange={e => { setFechaInicio(e.target.value); setError(null); }} type="date" required className={cls} />
            </div>

            <div>
              {/* Al cambiar de unidad se VACÍA el número. Reportado por una usuaria: tenía 30 días,
                  cambió a "Meses" y se quedó "30 meses" —dos años y medio— sin que ella escribiera
                  nada. Un número que tenía sentido en una unidad casi nunca lo tiene en otra, y el
                  que hereda de la anterior nadie lo eligió.
                  Es el mismo criterio con el que la frecuencia y la hora se dejaron sin valor por
                  defecto: en una pauta de medicación, un dato que nadie decidió es peor que un
                  campo vacío, porque el vacío se ve y el heredado no. */}
              <label className={lbl}>Duración del tratamiento</label>
              <div className="grid grid-cols-4 gap-2 mb-2">
                {[["indefinido","Indefinido"],["dias","Días"],["semanas","Semanas"],["meses","Meses"]].map(([val, label]) => (
                  <button key={val} type="button" onClick={() => { setDurTipo(val); setDurValor(""); }}
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

            {/* En palabras del paciente, no del médico. Es lo que alimenta la ficha de emergencia,
                que la lee alguien que no conoce su historia.

                ⚠️ Y por eso se AVISA aquí, donde se escribe. Este campo se teclea dentro de "Más
                opciones" de un formulario de medicamento; que reaparezca en un documento que se le
                enseña al médico —o que se comparte como imagen y se reenvía— sería una sorpresa
                fea. Dicho una vez, la persona decide sola: lo deja en blanco, o escribe "control
                médico" en vez de nombrar su diagnóstico. La salida ya existía (el campo es
                opcional y libre); lo que faltaba era que se viera. */}
            <div>
              <label className={lbl}>¿Para qué lo tomas?</label>
              <input value={paraQue} onChange={e => setParaQue(e.target.value)}
                placeholder="Ej: para la presión alta" className={cls} />
              <p className="text-xs text-gray-400 mt-1">Aparece también en tu ficha de emergencia.</p>
            </div>

            {/* El mismo buscador de las citas: se escribe y va sugiriendo los que ya existen, así
                el catálogo se llena solo. Solo se ofrece donde hay quien lo resuelva. */}
            {resolverMedico && (
              <MedicoCombobox medicos={medicos} nombre={medico.nombre} medicoId={medico.medicoId}
                especialidad={medico.especialidad} onChange={setMedico} cls={cls} lbl={lbl} />
            )}

            {/* El umbral se queda plegado: trae 5 días por defecto y casi nadie lo va a cambiar.
                Y solo tiene sentido si hay algo que contar. */}
            {tieneCaja && existencias !== "" && (
              <div>
                <label className={lbl}>Avísame cuando queden para</label>
                <div className="flex items-center gap-3">
                  <input type="number" min="0" max="90" inputMode="numeric" value={avisoDias}
                    onChange={e => setAvisoDias(e.target.value)}
                    className="w-28 px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300" />
                  <span className="text-sm text-gray-500">días</span>
                </div>
                {/* En días y no en pastillas: "avísame cuando quede 1" da un día de margen a quien
                    toma una al día y ocho horas a quien toma tres. */}
              </div>
            )}

            </>)}
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
