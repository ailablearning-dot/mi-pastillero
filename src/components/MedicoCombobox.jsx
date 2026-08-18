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
    if (!q) return medicos.slice(0, 6);
    return medicos.filter(m => sinAcentos(m.nombre).includes(q)).slice(0, 6);
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
      <label className={lbl}>Médico</label>
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
        <div className="mt-2 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
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

      {esNuevo && (
        <div className="mt-2">
          <label className={lbl}>Especialidad <span className="font-normal text-gray-400">(opcional)</span></label>
          <input
            value={especialidad || ""}
            onChange={e => onChange({ medicoId: null, nombre, especialidad: e.target.value })}
            placeholder="Ej: Cardiología"
            maxLength={60}
            className={cls}
          />
          <p className="text-[11px] text-gray-400 mt-1">Se guardará como médico nuevo y podrás reutilizarlo.</p>
        </div>
      )}
    </div>
  );
}
