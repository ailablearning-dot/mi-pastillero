import { useState, useEffect } from "react";
import { supabase } from "../lib/supabase";
import { llevaCaja } from "../domain/inventario";

// Las tomas ANTERIORES al mes que la app ya tiene cargado.
//
// Lo que queda en la caja se deriva de las tomas registradas desde el corte, y casi siempre esas
// tomas ya están en `records` —el historial del mes— que además se actualiza de forma optimista al
// marcar. Así el número reacciona al instante sin pedirle nada a la red, y el camino de marcar una
// dosis (el que se recorre veinte veces por semana) no paga ninguna consulta.
//
// El hueco es la caja que se contó ANTES del mes cargado: una caja dura semanas, así que a
// principios de mes el corte suele quedar detrás. Ese trozo sí hay que traerlo, y es lo único que
// hace este hook. Los dos rangos son disjuntos por construcción, así que no hay riesgo de contar
// una toma dos veces.
//
// No se hace la consulta si nadie lleva control de caja, que es el caso de todos los usuarios de
// hoy: quien no usa la función no paga nada.
export default function useInventario({ session, pacienteActivoId, pills, year, month, netTick }) {
  const [previas, setPrevias] = useState({});   // nombre → [tomas]
  const [cargadas, setCargadas] = useState(false); // ¿la consulta del trozo viejo terminó bien?

  const conCaja = (pills || []).filter(llevaCaja);
  const primerDiaMes = `${year}-${String(month + 1).padStart(2, "0")}-01`;
  const corteMasViejo = conCaja.map(p => p.existencias_fecha).sort()[0] || null;
  // Clave estable: el efecto depende de QUÉ cortes hay, no de la identidad del array `pills`, que
  // cambia en cada recarga y dispararía la consulta sin motivo.
  const clave = conCaja.map(p => `${p.id}:${p.existencias_fecha}`).join("|");
  const hacenFaltaPrevias = !!corteMasViejo && corteMasViejo < primerDiaMes;

  useEffect(() => {
    if (!session || !pacienteActivoId || !hacenFaltaPrevias) { setPrevias({}); setCargadas(false); return; }
    setCargadas(false);
    let vivo = true;
    (async () => {
      const { data, error } = await supabase.from("medicamentos")
        .select("nombre,fecha,hora,hora_programada,tomado")
        .eq("user_id", session.user.id)
        .eq("paciente_id", pacienteActivoId)
        .eq("tomado", true)
        .gte("fecha", corteMasViejo)
        .lt("fecha", primerDiaMes);
      if (!vivo || error) return; // sin red nos quedamos sin el trozo viejo; ver el aviso de abajo
      const porNombre = {};
      for (const r of data || []) (porNombre[r.nombre] = porNombre[r.nombre] || []).push(r);
      setPrevias(porNombre);
      setCargadas(true);
    })();
    return () => { vivo = false; };
  }, [session, pacienteActivoId, clave, primerDiaMes, hacenFaltaPrevias, corteMasViejo, netTick]);

  // ⚠️ Si la consulta falla (sin red) el trozo viejo queda vacío y el número saldría MÁS ALTO de lo
  // real. `listo` lo dice para que la pantalla pueda callarse en vez de enseñar una cifra optimista:
  // en una app de medicación, no dar número es mejor que dar uno que miente.
  //
  // Es una bandera propia y NO "¿hay tomas previas?": un mes en el que de verdad no se tomó nada
  // devuelve el mismo objeto vacío que un fallo de red, y confundirlos dejaría la caja muda para
  // siempre en el primer caso.
  const listo = !hacenFaltaPrevias || cargadas;
  return { previas, listo };
}
