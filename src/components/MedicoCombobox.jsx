import { useState, useMemo } from "react";
import { Stethoscope, X } from 'lucide-react';

// Campo de médico: se ESCRIBE libre y va sugiriendo los que ya existen.
//
// No es un desplegable a propósito. Un selector obligaría a dar de alta al médico ANTES de poder
// anotar la cita, que es justo el momento en que nadie quiere rellenar una ficha: se sale del
// consultorio con la siguiente fecha en un papel y se quiere apuntar en diez segundos. Aquí se
// escribe el nombre y el catálogo se va llenando solo (ver getOrCreateMedico en useCitas).
//
// Las sugerencias van INLINE y no en un desplegable flotante: dentro de un formulario con scroll,
// un panel absoluto se recorta o se descoloca al abrirse el teclado de iOS. Empujar el contenido
// es menos vistoso y no falla.

// Para SUGERIR sí se ignoran los acentos: quien escribe "perez" con prisa debe encontrar a
// "Pérez" y reutilizarlo. Lo que NO ignora acentos es la deduplicación en la BD, y es correcto
// que sean distintas: aquí decide una persona mirando la lista, allí decidiría un índice a ciegas.
const sinAcentos = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();

export default function MedicoCombobox({ medicos = [], nombre, medicoId, especialidad, onChange, cls, lbl }) {
  const [abierto, setAbierto] = useState(false);

  const sugerencias = useMemo(() => {
    const q = sinAcentos(nombre);
    // Con el campo VACÍO no se sugiere nada. Antes se enseñaban los seis primeros nada más
    // enfocar y, en cuanto el catálogo crece, eso tapa media pantalla con una lista que no
    // responde a nada de lo que la persona ha hecho. La lista es una respuesta a lo que escribes.
    if (!q) return [];
    // Se busca también por ESPECIALIDAD, no solo por nombre. El catálogo se llena con lo que la
    // gente escribe de verdad —"Consultorio 12 clínica San José", "Técnico marcapasos imss"—, y
    // de esos no te acuerdas por el nombre: te acuerdas de que era el cardiólogo.
    const enNombre = (m) => sinAcentos(m.nombre).includes(q);
    const enEspecialidad = (m) => sinAcentos(m.especialidad).includes(q);
    const coincide = medicos.filter(m => enNombre(m) || enEspecialidad(m));

    // Orden: primero aquellos en los que alguna PALABRA del nombre empieza por lo escrito (al
    // teclear "mar" se busca a "Martínez", no a quien lleve esas letras en medio), luego el resto
    // de coincidencias por nombre, y al final las que solo coinciden por especialidad.
    //
    // Por palabra y no por el principio del nombre entero: casi todos empiezan por "Dr" o "Dra",
    // así que comparar contra el inicio del nombre completo no ordenaba prácticamente nada.
    const porPalabra = (m) => sinAcentos(m.nombre).split(/\s+/).some(w => w.startsWith(q));
    const rango = (m) => (porPalabra(m) ? 0 : enNombre(m) ? 1 : 2);
    return coincide.sort((a, b) => rango(a) - rango(b)).slice(0, 6);
  }, [medicos, nombre]);

  // ¿Lo escrito coincide exactamente con alguno del catálogo? Si no, es un médico nuevo y
  // preguntamos la especialidad — una sola vez, la primera. Al reutilizarlo ya no vuelve a salir.
  const yaExiste = medicos.some(m => sinAcentos(m.nombre) === sinAcentos(nombre));
  const esNuevo = !!nombre?.trim() && !yaExiste;

  const elegir = (m) => {
    onChange({ medicoId: m.id, nombre: m.nombre, especialidad: m.especialidad || "" });
    setAbierto(false);
  };

  const escribir = (v) => {
    // Al escribir se suelta el vínculo con el registro: lo que mande es el texto. Si acaba
    // coincidiendo con uno existente, useCitas lo reutiliza al guardar.
    onChange({ medicoId: null, nombre: v, especialidad });
    setAbierto(true);
  };

  return (
    <div>
      <label className={lbl}>Médico <span className="font-normal text-gray-400">(opcional)</span></label>
      <div className="relative">
        <input
          value={nombre || ""}
          onChange={e => escribir(e.target.value)}
          onFocus={() => setAbierto(true)}
          placeholder="Ej: Dra. Ruiz"
          maxLength={80}
          className={`${cls} pr-9`}
        />
        {!!nombre && (
          <button
            type="button"
            onClick={() => { onChange({ medicoId: null, nombre: "", especialidad: "" }); setAbierto(false); }}
            aria-label="Quitar médico"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 rounded-lg flex items-center justify-center text-gray-400 hover:text-gray-600"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {abierto && sugerencias.length > 0 && (
        // Altura acotada: aunque el filtro deje varios, la lista nunca puede comerse la pantalla.
        <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden max-h-56 overflow-y-auto">
          {sugerencias.map(m => (
            <button
              key={m.id}
              type="button"
              onClick={() => elegir(m)}
              className="w-full flex items-center gap-2 px-3 py-2.5 text-left bg-white dark:bg-gray-800 hover:bg-violet-50 dark:hover:bg-violet-950/40 border-b border-gray-100 dark:border-gray-700 last:border-0"
            >
              <Stethoscope size={14} className="text-violet-400 shrink-0" />
              <span className="text-sm text-gray-800 dark:text-gray-100 truncate">{m.nombre}</span>
              {m.especialidad && <span className="text-xs text-gray-400 truncate ml-auto">{m.especialidad}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Con el campo vacío ya no hay lista, así que el texto tiene que contar las dos cosas:
          que se puede buscar escribiendo (si no, nadie descubre que el catálogo existe) y que
          dejarlo en blanco es una opción legítima. */}
      {!nombre?.trim() && (
        <p className="text-[11px] text-gray-400 mt-1">
          {medicos.length > 0
            ? `Escribe para buscar entre tus ${medicos.length} médicos guardados, o déjalo en blanco si no lo sabes.`
            : "¿No sabes quién te atenderá? Déjalo en blanco: muchas citas se dan por especialidad, no por médico."}
        </p>
      )}

      {/* La especialidad se muestra SIEMPRE que haya un nombre, no solo cuando el médico es nuevo.
          Antes se enseñaba una única vez —en la creación— y después desaparecía para siempre:
          quien la escribía no tenía dónde comprobar si se había guardado ni cómo corregirla.
          Reportado por una usuaria, que la escribió dos veces sin saber si servía de algo.
          ⚠️ Y no bastaba con mostrarla: si el médico ya existía, `getOrCreateMedico` devolvía el
          registro de siempre y DESCARTABA en silencio lo que se acabara de teclear. Las dos mitades
          se arreglan juntas o no se arregla ninguna. */}
      {!!nombre?.trim() && (
        <div className="mt-2">
          <label className={lbl}>Especialidad <span className="font-normal text-gray-400">(opcional)</span></label>
          <input
            value={especialidad || ""}
            onChange={e => onChange({ medicoId, nombre, especialidad: e.target.value })}
            placeholder="Ej: Cardiología"
            maxLength={60}
            className={cls}
          />
          <p className="text-[11px] text-gray-400 mt-1">
            {esNuevo ? "Se guardará como médico nuevo y podrás reutilizarlo." : "Se actualizará en este médico."}
          </p>
        </div>
      )}
    </div>
  );
}
