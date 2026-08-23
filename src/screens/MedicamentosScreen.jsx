import { useState, useRef } from "react";
import { ArrowLeft, Pencil, X, Plus, Copy, PauseCircle, PlayCircle, Trash2 } from 'lucide-react';
import { getColor } from "../domain/catalogs";
import { doseLabel } from "../domain/dosage";
import { pautaLabel, estaSuspendido } from "../domain/schedule";
import { supabase } from "../lib/supabase";
import { newPillId, insertPill, deletePill } from "../lib/offlineQueue";
import PillForm from "../components/PillForm";

// Pantalla propia para la lista de medicamentos. Antes era un ACORDEÓN dentro de Ajustes, y se
// había quedado pequeño el sitio: con el alta, la edición, el duplicado y el borrado es la parte
// más grande de esa pantalla — más que "Gestionar personas", que sí tenía la suya.
// `pillInicial` abre la pantalla YA en el formulario de ese medicamento. Llega de "Editar este
// medicamento" en la hoja de la dosis: quien viene de ahí ya eligió cuál, y hacerle buscarlo de
// nuevo en la lista sería devolverle el trabajo que acababa de hacer.
export default function MedicamentosScreen({ session, pacienteId, pills, cajas = {}, medicos = [], resolverMedico = null, pillInicial = null, onUpdate, onBack }) {
  const [list, setList] = useState(pills);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(pillInicial);
  // ¿Se entró para editar UN medicamento concreto? Entonces esta pantalla no es una lista, es el
  // editor de esa pastilla: al guardar (o al cancelar) hay que devolver a la pantalla de la que
  // venía —normalmente Hoy—, no dejar a la persona en una lista que nunca pidió.
  const editorDeUnoSolo = useRef(!!pillInicial);
  const salirSiVinePorUno = () => {
    if (!editorDeUnoSolo.current) return false;
    editorDeUnoSolo.current = false;
    onBack();
    return true;
  };
  const [duplicating, setDuplicating] = useState(null); // medicamento del que se parte al duplicar
  // Borrar un medicamento es irreversible y con un solo toque era demasiado fácil equivocarse.
  const [porBorrar, setPorBorrar] = useState(null);

  // OPTIMISTA + cola: el medicamento aparece al instante y se sincroniza después (ver `insertPill`).
  const addPill = async (data) => {
    const saved = { ...data, id: newPillId(), user_id: session.user.id, paciente_id: pacienteId, orden: list.length };
    const nl = [...list, { ...saved, _pending: true }];
    setList(nl); onUpdate(nl);
    setShowForm(false);
    setDuplicating(null); // si venía de Duplicar, hay que cerrarlo también o el form no se va
    const res = await insertPill(saved);
    const nl2 = res === "rechazada"
      ? nl.filter(p => p.id !== saved.id)
      : nl.map(p => (p.id === saved.id ? { ...p, _pending: res !== "ok" } : p));
    setList(nl2); onUpdate(nl2);
    if (res === "rechazada") alert("No se pudo guardar el medicamento. Inténtalo de nuevo.");
  };

  // Editar y borrar NO llevan cola, pero sí dejan de dar por bueno lo que no se guardó: antes
  // actualizaban la pantalla aunque la petición fallara (el medicamento reaparecía al recargar).
  const editPill = async (data) => {
    const { data: saved, error } = await supabase.from("pastillas").update(data).eq("id", editing.id).select().single();
    if (error || !saved) { alert("No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo."); return; }
    const nl = list.map(p => p.id === editing.id ? saved : p); setList(nl); onUpdate(nl);
    setEditing(null);
    salirSiVinePorUno();
  };

  // Suspender NO borra: el medicamento deja de recordarse y de contar para el día, pero se queda
  // en la lista con su fecha. Es la respuesta a "¿qué medicamento tomabas antes?", que el paciente
  // no recuerda y el médico pregunta. Reactivar es limpiar la fecha.
  const cambiarSuspension = async (pill, suspender) => {
    const hoy = new Date();
    const valor = suspender
      ? `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}-${String(hoy.getDate()).padStart(2, "0")}`
      : null;
    const { data: saved, error } = await supabase.from("pastillas").update({ suspendido_en: valor }).eq("id", pill.id).select().single();
    if (error || !saved) { alert("No se pudo guardar el cambio. Revisa tu conexión e inténtalo de nuevo."); return; }
    const nl = list.map(p => (p.id === pill.id ? saved : p));
    setList(nl); onUpdate(nl);
  };

  // OPTIMISTA, como el alta y el marcado: desaparece de la pantalla YA y se sincroniza después.
  // Antes esperaba a la BD y sin conexión se quedaba 15 s (el tope de timeoutFetch) antes de
  // fallar: el botón parecía muerto y el medicamento seguía ahí.
  const removePill = async (id) => {
    const nl = list.filter(p => p.id !== id);
    setList(nl); onUpdate(nl);
    setPorBorrar(null);
    await deletePill(id); // si falla queda en cola y se reintenta al reconectar
  };

  if (showForm || editing || duplicating) {
    // Al duplicar se pasa una COPIA sin `id`: el formulario la trata como nueva (guarda con addPill
    // y genera su propio id) pero llega con todo lleno. Sin quitar el id sobrescribiría el original.
    //
    // El nombre se copia TAL CUAL. Antes se le añadía " (2)" y hacía daño por los dos lados: para lo
    // que de verdad sirve duplicar —la segunda toma del día, "Aspirina" a las 9:00 y a las 15:00—
    // había que borrar el sufijo a mano; y de paso el nombre distinto colaba un duplicado funcional
    // por delante del guardia de `esDuplicadoExacto`. Sin sufijo, duplicar es "crear la otra toma" y
    // si no se cambia la hora, el formulario lo frena diciendo exactamente eso.
    const base = duplicating
      // Al DUPLICAR se vacía la caja: el duplicado es otra fila —normalmente otra toma del mismo
      // medicamento— y heredar la cuenta haría que dos filas descontaran de la misma caja física,
      // cada una por su cuenta. Que la persona vuelva a contar es mejor que un número doble.
      ? { ...duplicating, id: undefined, _pending: undefined, existencias: null, existencias_fecha: null, existencias_hora: null }
      : editing;
    return (
      <PillForm
        medicos={medicos} resolverMedico={resolverMedico}
        quedanAhora={base?.id ? (cajas[base.id]?.quedan ?? null) : null}
        title={editing ? "Editar medicamento" : duplicating ? "Duplicar medicamento" : "Nuevo medicamento"}
        pill={base}
        existentes={list}
        onSave={editing ? editPill : addPill}
        onCancel={() => {
          if (salirSiVinePorUno()) return;
          setShowForm(false); setEditing(null); setDuplicating(null);
        }}
      />
    );
  }

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }} className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 px-4 pb-6">
      <div className="max-w-md mx-auto">
        <div className="flex items-center gap-3 mb-6">
          <button onClick={onBack} className="w-9 h-9 rounded-xl bg-white dark:bg-gray-800 shadow-sm flex items-center justify-center text-gray-400"><ArrowLeft size={18} /></button>
          <h1 className="text-lg text-gray-800 dark:text-gray-100" style={{ fontWeight: 900 }}>Mis medicamentos</h1>
        </div>

        {(() => {
          const activos = list.filter(p => !estaSuspendido(p));
          const suspendidos = list.filter(estaSuspendido);
          const fila = (pill) => {
            const c = getColor(pill.color);
            const susp = estaSuspendido(pill);
            // Los cuatro botones comparten clase. Ojo con la variante oscura: la tarjeta de un
            // medicamento ACTIVO conserva su color pastel claro también en modo oscuro, así que
            // ahí los botones tienen que seguir siendo claros — un gris oscuro encima se ve sucio.
            // La tarjeta de un SUSPENDIDO sí se oscurece, y ahí la variante sí corresponde.
            const btn = `w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 shrink-0 ${susp ? "bg-white/60 dark:bg-gray-700/60" : "bg-white/60"}`;
            return (
              <div key={pill.id} className={`flex items-center gap-2 p-4 rounded-2xl ${susp ? "bg-gray-100 dark:bg-gray-800" : c.bg}`}>
                <span className={`text-2xl ${susp ? "opacity-40" : ""}`}>{pill.emoji}</span>
                <div className="flex-1 min-w-0">
                  <p className={`font-bold text-sm ${susp ? "text-gray-500 dark:text-gray-400" : c.text}`}>{pill.nombre}</p>
                  <p className="text-xs text-gray-400">
                    {susp
                      ? `Suspendido el ${new Date(String(pill.suspendido_en).slice(0,10) + "T12:00:00").toLocaleDateString("es-MX", { day: "numeric", month: "long", year: "numeric" })}`
                      : <>{doseLabel(pill) && `${doseLabel(pill)} · `}{pautaLabel(pill)}{pill.hora_toma && ` · ${pill.hora_toma}`}{pill._pending && " · guardado en el teléfono"}</>}
                  </p>
                  {/* LA CAJA. Solo si se contó alguna vez, y nunca en un suspendido: ese ya no
                      consume, así que su cuenta se quedó congelada y enseñarla confunde.
                      Las unidades van primero porque es lo que se ve al abrir la caja; los días son
                      lo accionable y por eso van pegados. */}
                  {!susp && cajas[pill.id] && (
                    <p className={`text-xs font-bold mt-0.5 ${cajas[pill.id].avisa ? "text-amber-600 dark:text-amber-400" : "text-gray-400"}`}>
                      {cajas[pill.id].quedan > 0
                        ? <>Te {cajas[pill.id].quedan === 1 ? "queda" : "quedan"} {cajas[pill.id].quedan} · para {cajas[pill.id].dias} {cajas[pill.id].dias === 1 ? "día" : "días"}</>
                        : "Se acabaron"}
                    </p>
                  )}
                </div>
                <button onClick={() => cambiarSuspension(pill, !susp)} aria-label={susp ? `Reactivar ${pill.nombre}` : `Suspender ${pill.nombre}`}
                  className={`${btn} hover:text-violet-500`}>
                  {susp ? <PlayCircle size={14} /> : <PauseCircle size={14} />}
                </button>
                {!susp && (
                  <button onClick={() => setDuplicating(pill)} aria-label={`Duplicar ${pill.nombre}`} className={`${btn} hover:text-violet-400`}><Copy size={14} /></button>
                )}
                <button onClick={() => setEditing(pill)} aria-label={`Editar ${pill.nombre}`} className={`${btn} hover:text-violet-400`}><Pencil size={14} /></button>
                <button onClick={() => setPorBorrar(pill)} aria-label={`Eliminar ${pill.nombre}`} className={`${btn} hover:text-red-400`}><X size={14} /></button>
              </div>
            );
          };
          return (
            <>
              <div className="space-y-3 mb-3">{activos.map(fila)}</div>
              {/* La lista de suspendidos es la respuesta a "¿qué tomabas antes?": no es relleno,
                  es el dato que el paciente no recuerda cuando el médico pregunta. */}
              {suspendidos.length > 0 && (
                <>
                  <p className="text-xs font-bold text-gray-400 uppercase tracking-wide mt-5 mb-2">
                    Suspendidos ({suspendidos.length})
                  </p>
                  <div className="space-y-3 mb-3">{suspendidos.map(fila)}</div>
                </>
              )}
            </>
          );
        })()}

        <button onClick={() => setShowForm(true)} className="w-full py-3 rounded-2xl border-2 border-dashed border-violet-300 dark:border-violet-700 text-sm font-bold text-violet-600 dark:text-violet-300 hover:border-violet-400 hover:bg-violet-50 dark:hover:bg-violet-950/30 transition-all flex items-center justify-center gap-1">
          <Plus size={16} /> Agregar medicamento
        </button>

        {porBorrar && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-6" onClick={() => setPorBorrar(null)}>
            <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-xl p-6 w-full max-w-xs" onClick={e => e.stopPropagation()}>
              <div className="w-12 h-12 rounded-2xl bg-red-50 dark:bg-red-950/40 flex items-center justify-center mx-auto mb-3"><Trash2 className="text-red-400" size={22} /></div>
              <h2 className="text-base font-bold text-gray-800 dark:text-gray-100 text-center mb-1">¿Eliminar {porBorrar.nombre}?</h2>
              <p className="text-xs text-gray-500 text-center mb-2">
                Se borra el medicamento y sus recordatorios. Esto no se puede deshacer.
              </p>
              {/* La alternativa suele ser la que el usuario quería de verdad: casi nadie borra un
                  medicamento porque se equivocó al crearlo, sino porque se lo retiraron. */}
              <p className="text-xs text-violet-500 text-center mb-5">
                ¿Solo dejaste de tomarlo? Mejor <span className="font-bold">suspéndelo</span>: se guarda por si tu médico pregunta.
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPorBorrar(null)} className="flex-1 py-3 rounded-xl border border-gray-200 dark:border-gray-700 text-sm font-bold text-gray-500">Cancelar</button>
                <button onClick={() => removePill(porBorrar.id)} className="flex-1 py-3 rounded-xl bg-red-500 text-white text-sm font-bold">Eliminar</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
