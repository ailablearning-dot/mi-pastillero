import { useState } from "react";
import { ArrowLeft, AlertTriangle, Pencil, Plus, X, Phone, HeartPulse, Pill, Share2 } from 'lucide-react';
import { Share } from '@capacitor/share';
import { alergiasOrdenadas, alergiaLabel, medicamentosActivos, contactoLabel,
         condicionesLimpias, fichaSinCapturar, GRAVEDADES } from "../domain/emergencia";
import { fichaComoImagen } from "../lib/fichaImagen";
import { Filesystem, Directory } from '@capacitor/filesystem';

// La ficha de emergencia. Del prototipo aprobado, pantalla b2.
//
// Va GRATIS a propósito y eso no es generosidad: poner información médica de emergencia detrás de un
// pago es una bomba de reseñas de una estrella, ocupa casi nada, y es la pantalla que alguien le
// enseña a un familiar — gratis se propaga, de pago no.
//
// ⚠️ El prototipo promete "visible sin desbloquear el teléfono". Eso es un widget de pantalla de
// bloqueo (WidgetKit, extensión nativa, App Group) y NO está construido, así que aquí no se dice.
// Prometerlo sin cumplirlo en la pantalla que existe para una urgencia sería lo peor de las dos
// opciones. Queda como bloque propio en el roadmap.
//
// El orden de las secciones es el del prototipo, y es el orden en que sirven a quien atiende una
// urgencia: alergias primero, medicamentos después, contacto al final. No es el de un expediente.
//
// ⚠️ Se quita la etiqueta "Gratis para siempre" que el prototipo pone al pie, a propósito: en la
// pantalla de tu propia información médica, recordarte que no se cobra es publicidad donde no toca.
// Su sitio es el ÍNDICE de "Mi salud", donde esa fila convive con otras que sí llevan candado y ahí
// el contraste informa. Aquí dentro no informa de nada.
export default function FichaEmergenciaScreen({ paciente, pills, onGuardar, onBack }) {
  const [editando, setEditando] = useState(false);
  const [compartiendo, setCompartiendo] = useState(false);

  const alergias = alergiasOrdenadas(paciente?.alergias);
  const condiciones = condicionesLimpias(paciente?.condiciones);
  const medicamentos = medicamentosActivos(pills);
  const contacto = contactoLabel(paciente);
  const vacia = fichaSinCapturar(paciente);

  // Se comparte como IMAGEN, no como texto. El texto se veía pobre para un documento médico y —lo
  // grave— quien lo recibía podía EDITARLO antes de reenviarlo: alguien podría cambiar una alergia.
  // Una imagen no se edita, se ve dentro del chat sin abrir nada, se guarda en Fotos y se imprime
  // desde la misma hoja de compartir. Ver src/lib/fichaImagen.js para el resto del razonamiento.
  const compartir = async () => {
    setCompartiendo(true);
    try {
      const hoy = new Date().toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" });
      const img = fichaComoImagen(paciente, pills, hoy);
      if (window.Capacitor?.isNativePlatform()) {
        // Igual que el Excel de Reportes: se escribe en la caché y se comparte por su ruta. La hoja
        // del sistema es la que decide si va a WhatsApp, a Fotos o a la impresora.
        const archivo = await Filesystem.writeFile({ path: img.nombre, data: img.base64, directory: Directory.Cache });
        await Share.share({
          title: `Ficha de emergencia${paciente?.nombre && paciente.nombre.toLowerCase() !== "yo" ? ` · ${paciente.nombre}` : ""}`,
          url: archivo.uri,
          dialogTitle: "Compartir mi ficha",
        });
      } else {
        // En el navegador no hay hoja de compartir: se descarga, que es lo equivalente.
        const a = document.createElement("a");
        a.href = `data:image/png;base64,${img.base64}`;
        a.download = img.nombre;
        a.click();
      }
    } catch (e) {
      // Cerrar la hoja de compartir NO es un error: @capacitor/share rechaza con "Share canceled".
      const m = String(e?.message || "");
      if (!/cancel/i.test(m)) alert("No se pudo compartir la ficha. Inténtalo de nuevo.");
    } finally {
      setCompartiendo(false);
    }
  };

  if (editando) {
    return <FichaEmergenciaForm
      paciente={paciente}
      onGuardar={async (datos) => { await onGuardar(datos); setEditando(false); }}
      onCancel={() => setEditando(false)} />;
  }

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }}
         className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <div className="max-w-md mx-auto px-4 pb-6">

        {/* LAS ACCIONES VAN AQUÍ, como iconos. Estaban al pie como dos botones grandes y pesaban
            demasiado para una pantalla que se CONSULTA: "se ve feo, súper grande". Compartir en la
            cabecera es además donde iOS lo pone siempre.
            Ojo, esto NO repite el error del calendario en la 1.1 —que era un icono y nadie lo
            encontraba—: aquello era un DESTINO escondido detrás de un icono; esto son acciones sobre
            lo que ya tienes delante, que es justo para lo que sirve una barra de navegación. */}
        <div className="flex items-center gap-2 mb-3">
          {onBack && (
            <button onClick={onBack} aria-label="Volver"
              className="w-9 h-9 rounded-xl bg-white/70 dark:bg-gray-800/70 flex items-center justify-center text-gray-400 shrink-0">
              <ArrowLeft size={18} />
            </button>
          )}
          <h1 className="text-lg text-gray-800 dark:text-gray-100 flex-1 min-w-0" style={{ fontWeight: 900 }}>En caso de emergencia</h1>
          {!vacia && (
            <>
              {/* MISMO botón que el de Reportes: 36 px, degradado violeta, icono blanco, en la fila
                  del encabezado. Es el patrón que la app ya usa para "sacar de aquí lo que estoy
                  viendo", y repetirlo vale más que cualquier variante nueva — quien ya exportó un
                  reporte reconoce este botón sin pensarlo. */}
              <button onClick={compartir} disabled={compartiendo} aria-label="Compartir mi ficha" title="Compartir mi ficha"
                className="w-9 h-9 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-500 shadow-lg shadow-violet-200 dark:shadow-none flex items-center justify-center text-white shrink-0 disabled:opacity-50 active:scale-95 transition-all">
                <Share2 size={18} />
              </button>
              {/* Editar va en gris y sin relleno: se hace una vez, no cada vez que se abre. */}
              <button onClick={() => setEditando(true)} aria-label="Editar mi ficha" title="Editar mi ficha"
                className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-gray-400 dark:text-gray-300 shrink-0 active:scale-95 transition-all">
                <Pencil size={16} />
              </button>
            </>
          )}
        </div>

        {/* La cabecera roja del prototipo. Dice de quién es la ficha, porque cada persona tiene la
            suya y enseñar la del paciente equivocado en una urgencia sería grave. */}
        <div className="flex items-start gap-3 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-2xl px-4 py-3 mb-4">
          <div className="w-7 h-7 rounded-xl bg-rose-100 dark:bg-rose-900/60 text-rose-600 dark:text-rose-300 flex items-center justify-center shrink-0">
            <AlertTriangle size={16} />
          </div>
          <div className="flex-1">
            <p className="text-sm text-rose-800 dark:text-rose-200" style={{ fontWeight: 800 }}>
              {paciente?.emoji ? `${paciente.emoji} ` : ""}{paciente?.nombre || "Esta persona"}
            </p>
            {/* SIN pronombre a propósito. Decía "para atenderle" y chirriaba en la ficha propia —la
                de "Yo"—, pero conjugar según la persona no sirve: el "Yo" se puede renombrar y
                habría que adivinar de quién es cada ficha. Una frase sin sujeto vale para las dos. */}
            <p className="text-xs text-rose-600 dark:text-rose-400">Lo que hay que saber en una urgencia</p>
          </div>
        </div>

        {vacia ? (
          /* Vacía enseña, no regaña. Y nombra el dato concreto que más importa —las alergias— en vez
             de pedir "completa tu ficha", que no dice qué ni para qué. */
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-6 text-center mb-4">
            <AlertTriangle size={28} className="text-rose-400 mx-auto mb-3" />
            <p className="text-sm text-gray-700 dark:text-gray-200 mb-1" style={{ fontWeight: 800 }}>Empieza por tus alergias</p>
            <p className="text-xs text-gray-400 leading-relaxed mb-4">
              Es lo primero que pregunta quien te atiende. Tus medicamentos ya están aquí: esa parte
              se llena sola.
            </p>
            <button onClick={() => setEditando(true)}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-200 dark:shadow-none flex items-center justify-center gap-2"
              style={{ fontWeight: 800 }}>
              <Plus size={16} /> Llenar mi ficha
            </button>
          </div>
        ) : (
          <>
            {/* CADA SECCIÓN, SU BLOQUE. Antes eran cuatro listas dentro de una tarjeta, todas con la
                misma etiqueta gris y la misma viñeta: "parece un txt", y con razón — el ojo no
                encontraba las fronteras ni sabía qué era grave y qué era un dato más.
                El color de cada bloque NO es decoración, es su significado: rojo lo que puede
                matarte, azul lo que hay que tener en cuenta, violeta tus medicinas, verde la acción.
                En una urgencia se busca por color antes que por texto. */}
            <Bloque icono={AlertTriangle} titulo="Alergias" tono="rose" vacio="Sin alergias registradas">
              {alergias.map((a, i) => {
                const grave = String(a.gravedad).toLowerCase() === "grave";
                return (
                  // Una alergia GRAVE se pinta como grave: fondo propio y su etiqueta. Con todas
                  // iguales, "Penicilina — ahogo" se leía con el mismo peso que "Polen".
                  <div key={i} className={`flex items-start gap-2 rounded-xl px-2.5 py-2 ${grave ? "bg-rose-50 dark:bg-rose-950/40" : ""}`}>
                    <p className="text-sm text-gray-800 dark:text-gray-100 flex-1" style={{ fontWeight: grave ? 800 : 600 }}>
                      {alergiaLabel(a)}
                    </p>
                    {a.gravedad && (
                      <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase shrink-0 ${grave
                        ? "bg-rose-600 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"}`} style={{ fontWeight: 900 }}>
                        {a.gravedad}
                      </span>
                    )}
                  </div>
                );
              })}
            </Bloque>

            <Bloque icono={HeartPulse} titulo="Condiciones" tono="sky" vacio="Sin condiciones registradas">
              {condiciones.map((c, i) => (
                <p key={i} className="text-sm text-gray-800 dark:text-gray-100 px-2.5 py-1" style={{ fontWeight: 600 }}>{c}</p>
              ))}
            </Bloque>

            {/* SIN el "· se llena solo" que llevaba. Es comentario sobre la app, no información
                sobre la persona, y esta pantalla se mira en una urgencia. Donde sí convence —y donde
                se queda— es en el estado vacío: "tus medicamentos ya están aquí, esa parte se llena
                sola". Decirlo dos veces es hablar del producto en vez del paciente. */}
            <Bloque icono={Pill} titulo="Medicamentos que toma" tono="violet" vacio="Ninguno todavía">
              {medicamentos.map(m => (
                <div key={m.id} className="px-2.5 py-1">
                  <p className="text-sm text-gray-800 dark:text-gray-100" style={{ fontWeight: 700 }}>{m.nombre}</p>
                  {m.detalle && <p className="text-xs text-gray-400">{m.detalle}</p>}
                  {/* El PARA QUÉ va debajo de la dosis y no al lado del nombre: quien lee esto en
                      una urgencia busca primero qué toma y cuánto. Pero va más oscuro que el
                      detalle porque, de las dos líneas, es la que de verdad orienta a alguien que
                      no sabe leer nombres de fármacos. */}
                  {m.motivo && (
                    <p className="text-xs text-gray-500 dark:text-gray-400" style={{ fontWeight: 600 }}>{m.motivo}</p>
                  )}
                </div>
              ))}
            </Bloque>

            {/* EL CONTACTO ES UN BOTÓN, no una línea de texto. Era un enlace `tel:` disfrazado de
                párrafo: nadie sabía que se podía tocar. En una urgencia lo único que se quiere hacer
                con este dato es LLAMAR, así que se ve como lo que es. */}
            <Bloque icono={Phone} titulo="A quién llamar" tono="emerald" vacio="Sin contacto registrado">
              {contacto && (
                <a href={paciente?.contacto_telefono ? `tel:${String(paciente.contacto_telefono).replace(/\s/g, "")}` : undefined}
                   className="flex items-center gap-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 px-3 py-2.5 active:scale-[0.99] transition-transform">
                  <div className="w-9 h-9 rounded-full bg-emerald-500 text-white flex items-center justify-center shrink-0">
                    <Phone size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-gray-800 dark:text-gray-100 truncate" style={{ fontWeight: 800 }}>
                      {paciente.contacto_nombre}{paciente.contacto_relacion ? ` · ${paciente.contacto_relacion}` : ""}
                    </p>
                    {paciente.contacto_telefono && <p className="text-xs text-emerald-700 dark:text-emerald-400" style={{ fontWeight: 700 }}>{paciente.contacto_telefono}</p>}
                  </div>
                  {paciente.contacto_telefono && (
                    <span className="text-xs text-emerald-700 dark:text-emerald-400 shrink-0" style={{ fontWeight: 800 }}>Llamar</span>
                  )}
                </a>
              )}
            </Bloque>
          </>
        )}

      </div>
    </div>
  );
}

// Un bloque de la ficha: su icono, su título y su contenido, en tarjeta propia.
//
// Sustituye a las cuatro listas que vivían dentro de una sola tarjeta con etiquetas grises. El
// diagnóstico del usuario fue exacto —"parece un txt"— y la causa era que todo tenía el mismo
// tratamiento: sin fronteras entre secciones y sin distinguir lo grave de lo anecdótico.
//
// El TONO no es decoración: cada color dice de qué habla el bloque, y en una urgencia se busca por
// color antes que por texto. Rojo lo que puede matarte, azul lo que hay que tener en cuenta, violeta
// las medicinas —el color de las pastillas en toda la app— y verde la acción de llamar.
const TONOS = {
  rose:    { punto: "bg-rose-100 dark:bg-rose-950/60 text-rose-600 dark:text-rose-300",       titulo: "text-rose-700 dark:text-rose-400" },
  sky:     { punto: "bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300",           titulo: "text-sky-700 dark:text-sky-400" },
  violet:  { punto: "bg-violet-100 dark:bg-violet-950/60 text-violet-600 dark:text-violet-300", titulo: "text-violet-700 dark:text-violet-400" },
  emerald: { punto: "bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-300", titulo: "text-emerald-700 dark:text-emerald-400" },
};

// El bloque vacío LO DICE, no desaparece. Una sección ausente se lee como "no tiene alergias", y esa
// es una afirmación peligrosa en una urgencia: "Sin alergias registradas" dice la verdad, que nadie
// las ha anotado.
function Bloque({ icono: Icono, titulo, tono, vacio, children }) {
  const hayAlgo = Array.isArray(children) ? children.filter(Boolean).length > 0 : !!children;
  const t = TONOS[tono] || TONOS.violet;
  return (
    <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-4 mb-3">
      <div className="flex items-center gap-2.5 mb-2">
        <div className={`w-7 h-7 rounded-xl flex items-center justify-center shrink-0 ${t.punto}`}>
          <Icono size={15} />
        </div>
        <p className={`text-xs uppercase tracking-wider ${t.titulo}`} style={{ fontWeight: 900 }}>{titulo}</p>
      </div>
      {hayAlgo ? <div className="space-y-0.5">{children}</div> : <p className="text-xs text-gray-400 italic px-2.5 py-1">{vacio}</p>}
    </div>
  );
}

// ── El formulario ────────────────────────────────────────────────────────────────────────
//
// Alergias y condiciones se editan como listas: se escribe una y se añade. Un solo campo de texto
// libre habría sido más rápido de construir y habría hecho imposible resaltar las graves, que es
// justo lo que salva el tiempo de quien lee la ficha.
function FichaEmergenciaForm({ paciente, onGuardar, onCancel }) {
  const [alergias, setAlergias] = useState(() => alergiasOrdenadas(paciente?.alergias));
  const [condiciones, setCondiciones] = useState(() => condicionesLimpias(paciente?.condiciones));
  const [nombre, setNombre] = useState(paciente?.contacto_nombre || "");
  const [relacion, setRelacion] = useState(paciente?.contacto_relacion || "");
  const [telefono, setTelefono] = useState(paciente?.contacto_telefono || "");
  const [aNombre, setANombre] = useState("");
  const [aReaccion, setAReaccion] = useState("");
  const [aGravedad, setAGravedad] = useState("");
  const [cNueva, setCNueva] = useState("");
  const [guardando, setGuardando] = useState(false);

  const cls = "w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300";

  const agregarAlergia = () => {
    if (!aNombre.trim()) return;
    setAlergias([...alergias, { nombre: aNombre.trim(), reaccion: aReaccion.trim() || null, gravedad: aGravedad || null }]);
    setANombre(""); setAReaccion(""); setAGravedad("");
  };
  const agregarCondicion = () => {
    if (!cNueva.trim()) return;
    setCondiciones([...condiciones, cNueva.trim()]);
    setCNueva("");
  };

  const guardar = async () => {
    setGuardando(true);
    // Lo que se escribió y no se añadió con el "+" se guarda igual. Perder un dato médico porque
    // faltó un toque sería el peor final posible para esta pantalla.
    const alergiasFinal = aNombre.trim()
      ? [...alergias, { nombre: aNombre.trim(), reaccion: aReaccion.trim() || null, gravedad: aGravedad || null }]
      : alergias;
    const condicionesFinal = cNueva.trim() ? [...condiciones, cNueva.trim()] : condiciones;
    await onGuardar({
      alergias: alergiasFinal.length ? alergiasFinal : null,
      condiciones: condicionesFinal.length ? condicionesFinal : null,
      contacto_nombre: nombre.trim() || null,
      contacto_relacion: relacion.trim() || null,
      contacto_telefono: telefono.trim() || null,
    });
    setGuardando(false);
  };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }}
         className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <div className="max-w-md mx-auto px-4 pb-8">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={onCancel} aria-label="Volver"
            className="w-9 h-9 rounded-xl bg-white/70 dark:bg-gray-800/70 flex items-center justify-center text-gray-400 shrink-0">
            <ArrowLeft size={18} />
          </button>
          <h1 className="text-lg text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>Mi ficha de emergencia</h1>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-3">
          <p className="text-sm text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 800 }}>Alergias</p>
          <p className="text-xs text-gray-400 mb-3">A medicamentos, alimentos o cualquier otra cosa.</p>

          {alergias.map((a, i) => (
            <div key={i} className="flex items-center gap-2 mb-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2">
              <p className="text-sm text-gray-700 dark:text-gray-200 flex-1">
                {alergiaLabel(a)}{a.gravedad ? ` · ${a.gravedad}` : ""}
              </p>
              <button onClick={() => setAlergias(alergias.filter((_, j) => j !== i))} aria-label="Quitar alergia"
                className="w-7 h-7 rounded-lg bg-white dark:bg-gray-700 text-gray-400 hover:text-red-400 flex items-center justify-center shrink-0"><X size={13} /></button>
            </div>
          ))}

          <input value={aNombre} onChange={e => setANombre(e.target.value)} placeholder="Ej: Penicilina" className={cls} />
          <input value={aReaccion} onChange={e => setAReaccion(e.target.value)} placeholder="¿Qué te provoca? Ej: dificultad para respirar" className={`${cls} mt-2`} />
          <div className="flex gap-2 mt-2">
            {GRAVEDADES.map(g => (
              <button key={g} onClick={() => setAGravedad(aGravedad === g ? "" : g)}
                className={`flex-1 py-2 rounded-xl text-xs capitalize border-2 transition-all ${aGravedad === g
                  ? "border-violet-400 bg-violet-50 dark:bg-violet-950/30 text-violet-700 dark:text-violet-300"
                  : "border-gray-200 dark:border-gray-700 text-gray-400"}`} style={{ fontWeight: 800 }}>{g}</button>
            ))}
          </div>
          <button onClick={agregarAlergia} disabled={!aNombre.trim()}
            className="w-full mt-2 py-2 rounded-xl border-2 border-dashed border-violet-300 dark:border-violet-700 text-xs text-violet-600 dark:text-violet-300 disabled:opacity-40 flex items-center justify-center gap-1" style={{ fontWeight: 800 }}>
            <Plus size={13} /> Agregar otra alergia
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-3">
          <p className="text-sm text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 800 }}>Condiciones</p>
          <p className="text-xs text-gray-400 mb-3">Lo que un médico debería saber: diabetes, hipertensión, asma…</p>
          {condiciones.map((c, i) => (
            <div key={i} className="flex items-center gap-2 mb-2 bg-gray-50 dark:bg-gray-700/50 rounded-xl px-3 py-2">
              <p className="text-sm text-gray-700 dark:text-gray-200 flex-1">{c}</p>
              <button onClick={() => setCondiciones(condiciones.filter((_, j) => j !== i))} aria-label="Quitar condición"
                className="w-7 h-7 rounded-lg bg-white dark:bg-gray-700 text-gray-400 hover:text-red-400 flex items-center justify-center shrink-0"><X size={13} /></button>
            </div>
          ))}
          <input value={cNueva} onChange={e => setCNueva(e.target.value)} placeholder="Ej: Hipertensión arterial" className={cls} />
          <button onClick={agregarCondicion} disabled={!cNueva.trim()}
            className="w-full mt-2 py-2 rounded-xl border-2 border-dashed border-violet-300 dark:border-violet-700 text-xs text-violet-600 dark:text-violet-300 disabled:opacity-40 flex items-center justify-center gap-1" style={{ fontWeight: 800 }}>
            <Plus size={13} /> Agregar otra condición
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-4">
          <p className="text-sm text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 800 }}>A quién llamar</p>
          <p className="text-xs text-gray-400 mb-3">Una sola persona: en una urgencia se llama al primero.</p>
          <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="Nombre" className={cls} />
          <input value={relacion} onChange={e => setRelacion(e.target.value)} placeholder="Ej: esposa, hijo, vecina" className={`${cls} mt-2`} />
          <input value={telefono} onChange={e => setTelefono(e.target.value)} type="tel" placeholder="Teléfono" className={`${cls} mt-2`} />
        </div>

        <button onClick={guardar} disabled={guardando}
          className="w-full py-4 rounded-2xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white shadow-lg shadow-violet-200 dark:shadow-none disabled:opacity-60" style={{ fontWeight: 800 }}>
          {guardando ? "Guardando…" : "Guardar mi ficha"}
        </button>
      </div>
    </div>
  );
}
