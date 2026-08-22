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

import { useState, useEffect, useRef } from "react";
import { safeStorage } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { withTimeout, readPillQueue, readPillDeletes } from "../lib/offlineQueue";

export default function usePills(session, pacienteActivoId, netTick, sesionNueva) {
  const [pills, setPills] = useState(null);
  // De quién es lo que hay en `pills` ahora mismo.
  const dueñoRef = useRef(null);

  // Cargar pastillas del paciente activo. Se cachean localmente para que SIN conexión la app
  // muestre los medicamentos reales (no "Configura tus medicamentos") y no se borren al reabrir /
  // reactivar la app offline. Con timeout para no colgarse si la red no responde.
  // ⚠️ Aquí vive el arreglo del parpadeo que se vio en device al entrar con Apple desde "Tu
  // suscripción volvió": medio segundo de "Agrega tu primer medicamento" a alguien que acaba de
  // entrar a recuperar los suyos. Lo peor que puede enseñar esta app, y justo a quien más miedo
  // tiene a perder sus datos.
  //
  // Pasaba por dos cosas, y hacían falta las dos:
  //  1. Al cambiar de sesión, `pills` seguía guardando los medicamentos de la cuenta ANTERIOR. Con
  //     el paciente nuevo ya puesto y ese contenido viejo en memoria, se pintaba la lista ajena.
  //     De ahí el `dueñoRef`: si cambia el usuario, lo de pantalla vuelve a "cargando".
  //  2. Y este cargador se disparaba con el `paciente_id` de la cuenta anterior, porque
  //     `usePacientes` aún no había traído los de la nueva. Esa consulta es legítima y devuelve
  //     VACÍO —ese paciente no es del usuario nuevo—, la app se creía ese vacío, y `pills.length
  //     === 0` encendía la bienvenida. De ahí el `cancelado`: cuando cambia el paciente, la
  //     respuesta que venía en camino ya no se escribe.
  //
  // Se cancela la ESCRITURA y no se bloquea la lectura. Se probó al revés —no consultar hasta que
  // el paciente activo estuviera en la lista de la cuenta— y estaba mal por dos motivos: los dos
  // valores se quedan obsoletos JUNTOS, así que la comprobación pasaba igual; y si alguna vez el
  // paciente activo no apareciera en la lista, la app se quedaría en "Preparando tu pastillero…"
  // para siempre. Un parpadeo es malo; un cuelgue es peor.
  useEffect(() => {
    if (!session || !pacienteActivoId) return;

    if (dueñoRef.current && dueñoRef.current !== session.user.id) setPills(null);
    dueñoRef.current = session.user.id;

    let cancelado = false;
    const cacheKey = `pills_cache_${pacienteActivoId}`;
    (async () => {
      // CACHÉ-PRIMERO: mostrar las pastillas cacheadas YA para no bloquear la UI esperando la red
      // (arranque instantáneo en red lenta). Luego revalidamos contra la BD y refrescamos si cambió.
      let hadCache = false;
      const raw = await safeStorage.get(cacheKey);
      if (raw) { try { const c = JSON.parse(raw); if (!cancelado) setPills(c); hadCache = true; } catch (_) { /* noop */ } }
      // Sesión recién creada: la cuenta está vacía con certeza, así que se pinta YA en vez de
      // dejar la pantalla de carga esperando una consulta cuya respuesta ya conocemos. La
      // consulta se hace igual justo debajo, pero sin bloquear el primer pintado.
      else if (sesionNueva && !cancelado) setPills([]);
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
          if (cancelado) return;              // llegó tarde: es de otro paciente o de otra cuenta
          if (fresh !== raw) setPills(lista); // solo si CAMBIÓ vs el caché → evita re-render y re-ejecutar loadRecords (el "doble refresco")
          safeStorage.set(cacheKey, fresh);
          return;
        }
      }
      // Offline o la consulta falló y NO había caché: no dejar "Cargando…" colgado.
      if (!hadCache && !cancelado) setPills(prev => (prev === null ? [] : prev));
    })();
    return () => { cancelado = true; };
  }, [session, pacienteActivoId, netTick]); // netTick: refresca/reintenta al reconectar

  return { pills, setPills };
}
