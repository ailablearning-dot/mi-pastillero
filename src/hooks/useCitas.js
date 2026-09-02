// Citas del paciente activo + el catálogo de médicos del usuario.
//
// Dos cosas que NO son simétricas y conviene tener claras al leer esto:
//  - Las CITAS son por paciente: la pantalla enseña las del activo.
//  - Los MÉDICOS son por usuario: el mismo pediatra atiende a los dos hijos, así que el catálogo
//    se comparte entre pacientes (así está la tabla desde la migración 008).
//
// Y una tercera, que es la que importa para los avisos: la PROGRAMACIÓN de notificaciones va
// sobre las citas de TODOS los pacientes, no solo el activo. Es la misma lección del programador
// de dosis: si solo se agendara el paciente activo, cambiar de paciente dejaría a los demás sin
// avisos y nadie se enteraría hasta perder una consulta.

import { useState, useEffect, useCallback, useRef } from "react";
import { safeStorage } from "../lib/storage";
import { supabase } from "../lib/supabase";
import { withTimeout } from "../lib/offlineQueue";
import { scheduleCitaNotifs, cancelCitaNotif } from "../lib/citaNotifs";

// Tope de espera de un guardado de cita. supabase-js no trae ninguno: sin esto, una petición que
// sale y no vuelve deja el botón en "Guardando…" hasta que el sistema la dé por perdida, cerca de
// un minuto en iOS. 12 s es de sobra para un insert de una fila y es poco para que alguien se
// quede mirando la pantalla sin saber qué pasa.
const CITA_TIMEOUT_MS = 12000;
const TARDO_DEMASIADO = "Tardó demasiado en responder. Inténtalo otra vez.";

// La misma normalización que el índice único de la BD (lower + btrim), para que lo que aquí se
// considera "el mismo médico" sea exactamente lo que allí choca. Si las dos difieren, el insert
// falla con 23505 en casos que aquí parecían nuevos.
const normNombre = (s) => String(s || "").trim().toLowerCase();

export default function useCitas({ session, pacienteActivoId, pacientes, netTick, resumeTick }) {
  const [citas, setCitas] = useState(null);   // null = aún no se sabe; [] = no hay ninguna
  const [medicos, setMedicos] = useState([]);
  const medicosRef = useRef([]);              // lectura fresca dentro de callbacks sin re-crearlos
  useEffect(() => { medicosRef.current = medicos; }, [medicos]);

  const cacheKey = pacienteActivoId ? `citas_cache_${pacienteActivoId}` : null;

  // Escribe estado y caché a la vez: si se separan, un reinicio sin red enseña una lista distinta
  // de la que el usuario acababa de ver.
  const aplicar = useCallback((fn) => {
    setCitas(prev => {
      const next = fn(prev || []);
      if (cacheKey) safeStorage.set(cacheKey, JSON.stringify(next));
      return next;
    });
  }, [cacheKey]);

  // ── Carga de las citas del paciente activo (caché-primero, igual que usePills) ──────────
  useEffect(() => {
    if (!session || !pacienteActivoId) return;
    const key = `citas_cache_${pacienteActivoId}`;
    (async () => {
      let habiaCache = false;
      const raw = await safeStorage.get(key);
      if (raw) { try { setCitas(JSON.parse(raw)); habiaCache = true; } catch (_) { /* noop */ } }
      if (navigator.onLine) {
        const res = await withTimeout(
          supabase.from("citas").select("*").eq("user_id", session.user.id)
            .eq("paciente_id", pacienteActivoId).order("fecha"),
          6000, { data: null, error: true }
        );
        if (!res.error && res.data) {
          const fresh = JSON.stringify(res.data);
          if (fresh !== raw) setCitas(res.data);   // solo si CAMBIÓ → evita un re-render y un reagendado de golpe
          safeStorage.set(key, fresh);
          return;
        }
      }
      // Sin red y sin caché: [] en vez de dejar "Cargando…" colgado para siempre.
      if (!habiaCache) setCitas(prev => (prev === null ? [] : prev));
    })();
  }, [session, pacienteActivoId, netTick]);

  // ── Catálogo de médicos del usuario (caché-primero) ────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    const key = `medicos_cache_${session.user.id}`;
    (async () => {
      const raw = await safeStorage.get(key);
      if (raw) { try { setMedicos(JSON.parse(raw)); } catch (_) { /* noop */ } }
      if (!navigator.onLine) return;
      const res = await withTimeout(
        supabase.from("medicos").select("*").eq("user_id", session.user.id).order("nombre"),
        6000, { data: null, error: true }
      );
      if (!res.error && res.data) {
        const fresh = JSON.stringify(res.data);
        if (fresh !== raw) setMedicos(res.data);
        safeStorage.set(key, fresh);
      }
    })();
  }, [session, netTick]);

  // ── Programación de los avisos: TODAS las citas del usuario, no solo las del activo ─────
  useEffect(() => {
    if (!session || !window.Capacitor?.isNativePlatform()) return;
    (async () => {
      const key = `citas_all_cache_${session.user.id}`;
      let todas;
      const res = await withTimeout(
        supabase.from("citas").select("*").eq("user_id", session.user.id),
        6000, { data: null, error: true }
      );
      if (!res.error && res.data) { todas = res.data; safeStorage.set(key, JSON.stringify(todas)); }
      else { try { todas = JSON.parse(await safeStorage.get(key)) || undefined; } catch (_) { todas = undefined; } }
      // No se pudo leer NI hay caché: no sabemos nada. `scheduleCitaNotifs` ignora lo que no sea
      // un array justamente para esto, pero cortamos aquí para no gastar la llamada.
      if (!Array.isArray(todas)) return;
      // Lo del paciente activo se toma del estado en memoria: incluye lo que se acaba de crear y
      // aún no ha vuelto de la BD, y lo que se acaba de borrar y todavía está en ella.
      const merged = (pacienteActivoId && citas)
        ? [...todas.filter(c => c.paciente_id !== pacienteActivoId), ...citas]
        : todas;
      const medicosById = Object.fromEntries((medicos || []).map(m => [m.id, m]));
      const pacientesById = Object.fromEntries((pacientes || []).map(p => [p.id, p]));
      scheduleCitaNotifs(merged, { medicosById, pacientesById });
    })();
    // resumeTick (vuelta del fondo) y netTick (reconexión) reconstruyen la cola si iOS la perdió,
    // exactamente en los mismos momentos que el programador de dosis.
  }, [session, citas, medicos, pacientes, pacienteActivoId, resumeTick, netTick]);

  // ── El catálogo de médicos se ACUMULA: no hay pantalla de alta ──────────────────────────
  // Se busca por nombre normalizado y, si no existe, se crea al vuelo. Devuelve el médico o null.
  const getOrCreateMedico = useCallback(async (nombre, especialidad) => {
    const n = String(nombre || "").trim();
    if (!n || !session) return null;
    const lista = medicosRef.current;
    const ya = lista.find(m => normNombre(m.nombre) === normNombre(n));
    if (ya) {
      // El médico ya existe, pero la especialidad que acaba de escribirse PUEDE ser nueva. Antes se
      // devolvía el registro tal cual y ese texto se perdía en silencio: la especialidad solo se
      // podía poner en la creación y, si no entraba ahí, no había forma de añadirla nunca. Una
      // usuaria la escribió dos veces sin saber por qué no aparecía.
      //
      // Solo se actualiza si viene algo y es DISTINTO: así reutilizar un médico sin tocar el campo
      // no borra lo que ya tenía. Y si la escritura falla, se devuelve el médico igual — perder la
      // especialidad es molesto, perder el vínculo del medicamento con su médico es peor.
      const nueva = String(especialidad || "").trim();
      if (nueva && nueva !== String(ya.especialidad || "").trim()) {
        const { data: act } = await supabase.from("medicos")
          .update({ especialidad: nueva }).eq("id", ya.id).eq("user_id", session.user.id).select().single();
        if (act) {
          setMedicos(prev => {
            const next = prev.map(m => (m.id === act.id ? act : m));
            safeStorage.set(`medicos_cache_${session.user.id}`, JSON.stringify(next));
            return next;
          });
          return act;
        }
      }
      return ya;
    }
    const { data, error } = await supabase.from("medicos").insert({
      user_id: session.user.id,
      nombre: n,
      especialidad: String(especialidad || "").trim() || null,
    }).select().single();
    if (data) {
      setMedicos(prev => {
        const next = [...prev, data].sort((a, b) => a.nombre.localeCompare(b.nombre));
        safeStorage.set(`medicos_cache_${session.user.id}`, JSON.stringify(next));
        return next;
      });
      return data;
    }
    // 23505 = chocó con el índice único de la 008. Pasa si otro dispositivo lo creó antes, o si
    // dos guardados salen casi a la vez. No es un error: el médico existe, solo que no era el
    // nuestro. Se relee y nos quedamos con el que ganó.
    if (error?.code === "23505") {
      const { data: again } = await supabase.from("medicos").select("*")
        .eq("user_id", session.user.id).order("nombre");
      if (again) {
        setMedicos(again);
        safeStorage.set(`medicos_cache_${session.user.id}`, JSON.stringify(again));
        return again.find(m => normNombre(m.nombre) === normNombre(n)) || null;
      }
    }
    return null;
  }, [session]);

  // Guarda (alta o edición). Devuelve { ok, cita } o { ok:false, error }.
  // El llamador NO cierra el formulario si falla: perder lo que la persona escribió es peor que
  // tener que darle a Guardar otra vez.
  //
  // ⚠️ TODO va dentro de un try, y las peticiones con TIMEOUT. Reportado en device: "a veces
  // aunque el botón esté en azul y le dé guardar, no guarda". Había dos formas de que esto pasara
  // sin decir una palabra, y las dos acababan igual — el botón clavado en "Guardando…" y ningún
  // mensaje:
  //  1. Si cualquiera de estas llamadas LANZABA (un fallo de red de supabase-js), la promesa se
  //     rechazaba y subía sin que nadie la atrapara: ni aquí, ni en App.jsx, ni en el formulario.
  //     Todo lo que venía después de `await onSave(...)` —incluido apagar "Guardando…" y pintar el
  //     error— no llegaba a ejecutarse nunca.
  //  2. supabase-js no tiene tiempo de espera. Si la petición sale y no vuelve nada, se espera a
  //     que el sistema la dé por perdida, que en iOS es cerca de un minuto. Todo lo demás en esta
  //     app pasa por `withTimeout` por esta razón; las citas se habían quedado fuera.
  const guardarCita = useCallback(async (datos, existente = null) => {
    if (!session || !pacienteActivoId) return { ok: false, error: { message: "Sin sesión" } };
    if (!navigator.onLine) return { ok: false, error: { message: "Sin conexión." } };
    try {

    // Si se eligió un médico de la lista se usa tal cual; si se escribió uno nuevo, se crea.
    let medico = null;
    if (datos.medicoId) medico = medicosRef.current.find(m => m.id === datos.medicoId) || null;
    else if (datos.medicoNombre?.trim()) medico = await getOrCreateMedico(datos.medicoNombre, datos.medicoEspecialidad);

    const fila = {
      tipo: datos.tipo,
      motivo: datos.motivo?.trim() || null,
      // Si el médico no se pudo crear (red), la cita se guarda SIN médico en vez de no guardarse:
      // la cita es el dato que importa, el médico se puede añadir después editándola.
      medico_id: medico?.id || null,
      fecha: datos.fecha,
      hora: datos.hora || null,
      lugar: datos.lugar?.trim() || null,
      notas: datos.notas?.trim() || null,
      avisar_horas_antes: datos.avisar_horas_antes,
      // `?? null` y no `|| null`: el 0 ("a la hora") es un valor válido y con `||` se convertiría
      // en "sin segundo aviso". Mismo cuidado que en el dominio.
      avisar2_horas_antes: datos.avisar2_horas_antes ?? null,
    };

    // El centinela distingue "el servidor dijo que no" de "no contestó": el primero se enseña con
    // su motivo, el segundo tiene que decir que se intente otra vez, no dar la cita por perdida.
    const SIN_RESPUESTA = { data: null, error: { message: TARDO_DEMASIADO } };

    if (existente) {
      const { data, error } = await withTimeout(
        supabase.from("citas").update(fila).eq("id", existente.id).select().single(),
        CITA_TIMEOUT_MS, SIN_RESPUESTA);
      if (error || !data) { console.error("[citas] update falló:", error); return { ok: false, error }; }
      aplicar(prev => prev.map(c => (c.id === existente.id ? data : c)));
      return { ok: true, cita: data };
    }
    const { data, error } = await withTimeout(
      supabase.from("citas").insert({ ...fila, user_id: session.user.id, paciente_id: pacienteActivoId })
        .select().single(),
      CITA_TIMEOUT_MS, SIN_RESPUESTA);
    if (error || !data) { console.error("[citas] insert falló:", error); return { ok: false, error }; }
    aplicar(prev => [...prev, data]);
    return { ok: true, cita: data };

    } catch (e) {
      // El caso que dejaba el botón muerto y sin mensaje. Ahora sale por aquí y se pinta.
      console.error("[citas] guardar lanzó:", e);
      return { ok: false, error: { message: "No se pudo conectar. Inténtalo otra vez." } };
    }
  }, [session, pacienteActivoId, getOrCreateMedico, aplicar]);

  const borrarCita = useCallback(async (cita) => {
    const { error } = await supabase.from("citas").delete().eq("id", cita.id);
    if (error) { console.error("[citas] delete falló:", error); return { ok: false, error }; }
    aplicar(prev => prev.filter(c => c.id !== cita.id));
    // El aviso se cancela aquí y no se espera al reagendado: si el usuario borra la cita y cierra
    // la app, el efecto de arriba puede no llegar a correr y sonaría un aviso de algo que ya no existe.
    await cancelCitaNotif(cita);
    return { ok: true };
  }, [aplicar]);

  return { citas, medicos, guardarCita, borrarCita, getOrCreateMedico };
}
