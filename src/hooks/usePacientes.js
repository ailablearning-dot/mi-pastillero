// Pacientes del usuario y cuál está activo.
//
// El guard `pacientesLoadedRef` no es opcional: al iniciar sesión llegan dos eventos de auth casi
// simultáneos y sin él se cargaba (o se auto-creaba "Yo") dos veces, dejando pacientes duplicados.
// Y la carga es caché-primero, con reintento al reconectar vía `netTick`: sin conexión el usuario
// tiene que poder seguir viendo y cambiando de paciente.

import { useState, useEffect, useCallback, useRef } from "react";
import { safeStorage } from "../lib/storage";
import { supabase } from "../lib/supabase";

export default function usePacientes(session, netTick, sesionNueva) {
  const [pacientes, setPacientes] = useState([]);
  const [pacienteActivoId, setPacienteActivoIdState] = useState(null);
  const [showPacienteSelector, setShowPacienteSelector] = useState(false);
  const pacientesLoadedRef = useRef(null); // guard: evita cargar/auto-crear "Yo" dos veces por eventos de auth casi simultáneos

  const setPacienteActivoId = useCallback(async (id) => {
    setPacienteActivoIdState(id);
    if (id) await safeStorage.set("paciente_activo_id", id);
  }, []);

  // Cargar pacientes del usuario actual + auto-crear "Yo" si no tiene ninguno
  useEffect(() => {
    if (!session) { pacientesLoadedRef.current = null; return; }
    // Guard sincrónico: al iniciar sesión Supabase emite varios eventos de auth
    // (INITIAL_SESSION + SIGNED_IN) → este efecto corría dos veces y creaba dos "Yo".
    // Con el ref por usuario solo corre una vez. (Se resetea al hacer signOut arriba.)
    if (pacientesLoadedRef.current === session.user.id) return;
    // CAMBIÓ EL USUARIO: lo que hay en memoria es de la cuenta anterior. Se limpia antes de cargar,
    // y no es cosmética — mientras `pacienteActivoId` siga apuntando al paciente de la otra cuenta,
    // el cargador de medicamentos consulta por él, recibe VACÍO (no es suyo) y la app enciende la
    // bienvenida "Agrega tu primer medicamento". Visto en device al entrar con Apple desde "Tu
    // suscripción volvió": medio segundo de esa pantalla a quien acababa de entrar a recuperar sus
    // medicamentos. Con esto, App.jsx enseña "Preparando tu pastillero…" —que es la verdad— hasta
    // que el paciente de la cuenta nueva esté puesto.
    if (pacientesLoadedRef.current && pacientesLoadedRef.current !== session.user.id) {
      setPacientes([]);
      setPacienteActivoIdState(null);
    }
    pacientesLoadedRef.current = session.user.id;
    const cacheKey = `pacientes_cache_${session.user.id}`;
    const applyActive = async (lista) => {
      setPacientes(lista);
      // Restaurar paciente activo o usar el primero
      const saved = await safeStorage.get("paciente_activo_id");
      const valido = lista.find(p => p.id === saved);
      const activo = valido ? valido.id : lista[0]?.id;
      setPacienteActivoIdState(activo);
      if (activo && activo !== saved) await safeStorage.set("paciente_activo_id", activo);
    };
    const fromCache = async () => {
      const raw = await safeStorage.get(cacheKey);
      if (raw) { try { const lista = JSON.parse(raw); if (lista.length) { await applyActive(lista); return true; } } catch (_) { /* noop */ } }
      return false;
    };
    (async () => {
      // CACHÉ-PRIMERO: mostrar los pacientes cacheados YA (online u offline) para no bloquear el
      // arranque esperando la red. En red lenta esto es la diferencia entre "Cargando…" varios
      // segundos y entrar al instante. Luego, si hay conexión, revalidamos contra la BD.
      const cachedShown = await fromCache();
      // ⚠️ NO se consulta `navigator.onLine` para rendirse antes de intentarlo. En iOS el WebView
      // MIENTE: reporta que no hay red cuando sí la hay, sobre todo en el arranque en frío. Aquí
      // eso dejaba la app en "Cargando…" con el Wi-Fi conectado —reproducido en device— porque
      // sin pacientes no hay paciente activo, y sin paciente activo no se pinta nada. Tocar
      // "Reintentar" funcionaba a la primera, que es la firma de este fallo.
      //
      // Es la MISMA lección que ya está escrita en src/lib/supabase.js sobre `timeoutFetch`, solo
      // que no se había aplicado aquí. Se intenta siempre: si de verdad no hay red, la consulta
      // falla y la línea de abajo se queda con la caché igual, que es el mismo resultado sin el
      // falso negativo.
      // Si la sesión anónima se acaba de crear, preguntar "¿tiene pacientes?" es preguntar por
      // algo que acabamos de crear hace un segundo: no los tiene. Saltarse esa consulta quita uno
      // de los cuatro viajes a la red del primer arranque, que son los 3-4 s de espera medidos en
      // device. Si el alta de abajo fallara, el camino normal sigue disponible en el reintento.
      let lista = [];
      if (!sesionNueva) {
        const { data: pacs, error } = await supabase.from("pacientes").select("*").eq("user_id", session.user.id).order("orden").order("created_at");
        if (error) { if (!cachedShown) pacientesLoadedRef.current = null; return; } // red falló → nos quedamos con la caché ya mostrada (o reintentar si no había)
        lista = pacs || [];
      }
      // Auto-crear "Yo" para usuarios nuevos (sin pacientes después de la migración)
      if (lista.length === 0) {
        // es_default:true + índice único parcial (migración 004) garantizan un solo
        // default por usuario aunque una carrera intente crear el segundo.
        const { data: nuevo } = await supabase.from("pacientes").insert({
          user_id: session.user.id, nombre: "Yo", emoji: "👤", orden: 0, es_default: true
        }).select().single();
        if (nuevo) {
          lista = [nuevo];
        } else {
          // El insert falló (p.ej. violación del índice único por una carrera, o red) →
          // re-leer para quedarnos con el "Yo" que sí exista.
          const { data: again } = await supabase.from("pacientes").select("*").eq("user_id", session.user.id).order("orden").order("created_at");
          lista = again || [];
        }
        // Si tras intentarlo seguimos sin ninguno, hay que DEJAR QUE SE REINTENTE. Sin esto el
        // guard de arriba (`pacientesLoadedRef`) daba por hecho que este usuario ya se cargó y
        // cortaba todos los reintentos siguientes: la app se quedaba en "Cargando…" para siempre,
        // sin salida ni con red ni reabriendo. Reproducido con un insert rechazado (409).
        if (lista.length === 0) pacientesLoadedRef.current = null;
      }
      // Solo re-aplicar si CAMBIÓ vs lo que ya mostramos del caché → evita un re-render y una
      // reprogramación redundante de notificaciones (pesada: ~60 notifs) durante el arranque.
      const freshStr = JSON.stringify(lista);
      if (freshStr !== (await safeStorage.get(cacheKey))) await applyActive(lista);
      safeStorage.set(cacheKey, freshStr); // caché para arranques offline
    })();
  }, [session, netTick]); // netTick: reintenta al reconectar (si la carga offline falló sin caché)

  return {
    pacientes, setPacientes,
    pacienteActivoId, setPacienteActivoId,
    showPacienteSelector, setShowPacienteSelector,
  };
}
