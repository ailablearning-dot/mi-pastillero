// Los medicamentos del paciente activo.
//
// CACHÉ-PRIMERO y por buenos motivos, todos aprendidos a golpes:
//  - Sin conexión la app tiene que enseñar los medicamentos REALES, no "Configura tus
//    medicamentos", y no perderlos al reabrir o reactivar la app offline.
//  - Lo que aún NO ha subido se repone desde la cola de altas: si nos quedáramos solo con lo que
//    devuelve la BD, el medicamento recién creado desaparecería de la lista.
//  - Y lo borrado sin conexión se FILTRA: sigue existiendo en la BD hasta que la cola se drene, así
//    que sin esto el medicamento que el usuario acaba de borrar reaparece en la siguiente carga.
//  - Solo se hace `setPills` si de verdad cambió respecto al caché. Sin esa comparación había un
//    re-render que reejecutaba loadRecords y producía el "doble refresco" del home tras el Face ID.

import { useState, useEffect } from "react";
import { safeStorage } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { withTimeout, readPillQueue, readPillDeletes } from "../lib/offlineQueue";

export default function usePills(session, pacienteActivoId, netTick) {
  const [pills, setPills] = useState(null);

  // Cargar pastillas del paciente activo. Se cachean localmente para que SIN conexión la app
  // muestre los medicamentos reales (no "Configura tus medicamentos") y no se borren al reabrir /
  // reactivar la app offline. Con timeout para no colgarse si la red no responde.
  useEffect(() => {
    if (!session || !pacienteActivoId) return;
    const cacheKey = `pills_cache_${pacienteActivoId}`;
    (async () => {
      // CACHÉ-PRIMERO: mostrar las pastillas cacheadas YA para no bloquear la UI esperando la red
      // (arranque instantáneo en red lenta). Luego revalidamos contra la BD y refrescamos si cambió.
      let hadCache = false;
      const raw = await safeStorage.get(cacheKey);
      if (raw) { try { setPills(JSON.parse(raw)); hadCache = true; } catch (_) { /* noop */ } }
      if (navigator.onLine) {
        const res = await withTimeout(
          supabase.from("pastillas").select("*").eq("user_id", session.user.id).eq("paciente_id", pacienteActivoId).order("orden"),
          6000, { data: null, error: true }
        );
        if (!res.error && res.data) {
          // Las altas que aún NO han subido no están en la BD: si nos quedáramos solo con lo que
          // devuelve, el medicamento recién creado DESAPARECERÍA de la lista. Las reponemos desde
          // la cola (solo las de este paciente) marcadas como pendientes.
          const pendientes = (await readPillQueue())
            .filter(p => p.paciente_id === pacienteActivoId && !res.data.some(d => d.id === p.id))
            .map(p => ({ ...p, _pending: true }));
          // Y al revés: lo borrado SIN conexión sigue existiendo en la BD hasta que la cola se
          // drene. Sin filtrarlo aquí, el medicamento que el usuario acaba de borrar REAPARECE.
          const borrados = await readPillDeletes();
          const dbLimpio = borrados.length ? res.data.filter(d => !borrados.includes(d.id)) : res.data;
          const lista = pendientes.length ? [...dbLimpio, ...pendientes] : dbLimpio;
          const fresh = JSON.stringify(lista);
          if (fresh !== raw) setPills(lista); // solo si CAMBIÓ vs el caché → evita re-render y re-ejecutar loadRecords (el "doble refresco")
          safeStorage.set(cacheKey, fresh);
          return;
        }
      }
      // Offline o la consulta falló y NO había caché: no dejar "Cargando…" colgado.
      if (!hadCache) setPills(prev => (prev === null ? [] : prev));
    })();
  }, [session, pacienteActivoId, netTick]); // netTick: refresca/reintenta al reconectar

  return { pills, setPills };
}
