import { useState } from "react";
import { ArrowLeft, AlertTriangle, Pencil, Plus, X, Check, Phone } from 'lucide-react';
import { alergiasOrdenadas, alergiaLabel, medicamentosActivos, contactoLabel,
         condicionesLimpias, fichaSinCapturar, GRAVEDADES } from "../domain/emergencia";

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
export default function FichaEmergenciaScreen({ paciente, pills, onGuardar, onBack }) {
  const [editando, setEditando] = useState(false);

  const alergias = alergiasOrdenadas(paciente?.alergias);
  const condiciones = condicionesLimpias(paciente?.condiciones);
  const medicamentos = medicamentosActivos(pills);
  const contacto = contactoLabel(paciente);
  const vacia = fichaSinCapturar(paciente);

  if (editando) {
    return <FichaEmergenciaForm
      paciente={paciente}
      onGuardar={async (datos) => { await onGuardar(datos); setEditando(false); }}
      onCancel={() => setEditando(false)} />;
  }

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'max(calc(env(safe-area-inset-top) + 16px), 60px)' }}
         className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto px-4 pb-6">

        <div className="flex items-center gap-3 mb-3">
          {onBack && (
            <button onClick={onBack} aria-label="Volver"
              className="w-9 h-9 rounded-xl bg-white/70 dark:bg-gray-800/70 flex items-center justify-center text-gray-400 shrink-0">
              <ArrowLeft size={18} />
            </button>
          )}
          <h1 className="text-lg text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>En caso de emergencia</h1>
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
            <p className="text-xs text-rose-600 dark:text-rose-400">Lo que hay que saber para atenderle</p>
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
          <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5 mb-3">
            <Seccion titulo="Alergias" vacio="Sin alergias registradas">
              {alergias.map((a, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${String(a.gravedad).toLowerCase() === "grave" ? "bg-rose-500" : "bg-gray-300 dark:bg-gray-600"}`} />
                  <p className="text-sm text-gray-700 dark:text-gray-200 flex-1">
                    {alergiaLabel(a)}
                    {a.gravedad && (
                      <span className={`ml-2 text-[10px] px-1.5 py-0.5 rounded-full uppercase ${String(a.gravedad).toLowerCase() === "grave"
                        ? "bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-300"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-300"}`} style={{ fontWeight: 900 }}>
                        {a.gravedad}
                      </span>
                    )}
                  </p>
                </div>
              ))}
            </Seccion>

            <Seccion titulo="Condiciones actuales" vacio="Sin condiciones registradas">
              {condiciones.map((c, i) => (
                <div key={i} className="flex items-start gap-2 py-1">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-gray-300 dark:bg-gray-600" />
                  <p className="text-sm text-gray-700 dark:text-gray-200">{c}</p>
                </div>
              ))}
            </Seccion>

            {/* "Se llena solo" va escrito en la pantalla a propósito: es el argumento de por qué
                esta ficha sí se mantiene al día, y el que hace que valga la pena llenar el resto. */}
            <Seccion titulo="Medicamentos activos" nota="se llena solo" vacio="Ninguno todavía">
              {medicamentos.map(m => (
                <div key={m.id} className="flex items-start gap-2 py-1">
                  <span className="w-2 h-2 rounded-full mt-1.5 shrink-0 bg-violet-400" />
                  <p className="text-sm text-gray-700 dark:text-gray-200">
                    <span style={{ fontWeight: 700 }}>{m.nombre}</span>{m.detalle ? ` — ${m.detalle}` : ""}
                  </p>
                </div>
              ))}
            </Seccion>

            <Seccion titulo="A quién llamar" vacio="Sin contacto registrado">
              {contacto && (
                <a href={paciente?.contacto_telefono ? `tel:${String(paciente.contacto_telefono).replace(/\s/g, "")}` : undefined}
                   className="flex items-start gap-2 py-1">
                  <Phone size={13} className="text-violet-500 mt-1 shrink-0" />
                  <p className="text-sm text-gray-700 dark:text-gray-200">{contacto}</p>
                </a>
              )}
            </Seccion>
          </div>
        )}

        {!vacia && (
          <button onClick={() => setEditando(true)}
            className="w-full py-3 rounded-2xl bg-white dark:bg-gray-800 shadow-sm text-sm text-violet-600 dark:text-violet-300 flex items-center justify-center gap-2" style={{ fontWeight: 800 }}>
            <Pencil size={14} /> Editar mi ficha
          </button>
        )}

        {/* Del prototipo, y no es decoración: dice en voz alta que esto NO es la parte de pago. */}
        <p className="text-center mt-4">
          <span className="inline-flex items-center gap-1 text-[11px] text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/40 px-3 py-1 rounded-full" style={{ fontWeight: 800 }}>
            <Check size={11} /> Gratis para siempre
          </span>
        </p>
      </div>
    </div>
  );
}

// Un bloque con su título. Cuando está vacío lo DICE en gris en vez de desaparecer: una sección que
// falta se lee como "no tiene alergias", y eso en una urgencia es una afirmación peligrosa. "Sin
// alergias registradas" dice la verdad — que no se han anotado.
function Seccion({ titulo, nota, vacio, children }) {
  const hayAlgo = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <div className="mb-3 last:mb-0">
      <p className="text-[11px] uppercase tracking-wide text-gray-400 mb-1" style={{ fontWeight: 900 }}>
        {titulo}{nota && <span className="text-violet-500 normal-case tracking-normal"> · {nota}</span>}
      </p>
      {hayAlgo ? children : <p className="text-xs text-gray-400 italic py-1">{vacio}</p>}
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
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
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
