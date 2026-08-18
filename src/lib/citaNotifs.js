// Avisos locales de las CITAS médicas. Espacio de nombres propio, separado del de las dosis.
//
// POR QUÉ ESTE ARCHIVO EXISTE Y NO SE REUSA EL PROGRAMADOR DE DOSIS
// `_doScheduleLocalNotifs` (notifications.js) reprograma cancelando TODO lo pendiente y
// reconstruyendo. Si los avisos de citas se agendaran sin más, cada vez que se toca un
// medicamento —o al volver del fondo, o al recuperar la red— desaparecerían EN SILENCIO.
//
// El reparto es por marca en `extra`:
//   · el programador de DOSIS preserva lo que lleva `extra.snooze` o `extra.cita`;
//   · este programador cancela SOLO lo que lleva `extra.cita === true`.
// Ninguno pisa al otro, los dos son idempotentes y pueden correr en cualquier orden.
//
// Se dispara en los mismos momentos que el de dosis (alta/edición de una cita, vuelta del fondo,
// reconexión) para que se reconstruya si iOS pierde la cola. Ese cableado vive en useCitas.

import { LocalNotifications } from '@capacitor/local-notifications';
import { notifId, soundFields, CITAS_CAP } from './notifications';
import { fmtDate } from '../domain/dates';
import {
  momentosDeAviso, resumenCita, fechaCitaLabel, horaCitaLabel, tieneHora, emojiCita,
} from '../domain/citas.js';

// Ids de los avisos de una cita, en un espacio propio ('cita') para no chocar con el de las
// dosis. Dependen SOLO del id de la cita y de CUÁL de los dos avisos es, nunca de la fecha: así,
// si la cita se mueve de día, el aviso viejo se puede cancelar sin saber cuándo era.
// Reprogramar = mismo id = se reemplaza.
//
// `cual` ('aviso' | 'aviso2') es imprescindible: sin él los dos avisos de una misma cita
// compartirían id y el segundo pisaría al primero, así que solo sonaría uno.
export const citaNotifId = (citaId, cual = 'aviso') => notifId('cita', citaId, cual);
const LOS_DOS = ['aviso', 'aviso2'];

// Cancela el aviso de UNA cita (al borrarla o al quitarle el recordatorio). Idempotente.
export const cancelCitaNotif = async (citaOrId) => {
  if (!window.Capacitor?.isNativePlatform()) return;
  const id = typeof citaOrId === 'string' ? citaOrId : citaOrId?.id;
  if (!id) return;
  try {
    // Los DOS avisos, siempre: no sabemos cuáles tenía agendados y cancelar uno que no existe
    // es inocuo. Cancelar solo el primero dejaba sonando el segundo de una cita ya borrada.
    await LocalNotifications.cancel({ notifications: LOS_DOS.map(cual => ({ id: citaNotifId(id, cual) })) });
  } catch (_) { /* noop */ }
};

// Serializa las corridas, igual que scheduleLocalNotifs: cancelar+reprogramar nunca debe
// interponerse con otra corrida, o quedan avisos duplicados o ninguno.
let _chain = Promise.resolve();
export const scheduleCitaNotifs = (citas, opts = {}) => {
  _chain = _chain.then(() => _doScheduleCitaNotifs(citas, opts)).catch(() => {});
  return _chain;
};

const _doScheduleCitaNotifs = async (citas, { medicosById = {}, pacientesById = {} } = {}) => {
  if (!window.Capacitor?.isNativePlatform()) return;

  // LA REGLA QUE COSTÓ EL PEOR BUG DE LA APP: si no se pudo LEER, no se cancela nada.
  // El programador de dosis leía por red y sin conexión concluía "no hay nada" → cancelaba
  // todo. Aquí `undefined`/`null` significa "no sé", y no saber nunca puede borrar avisos.
  // Una lista vacía SÍ es una respuesta ("no hay citas") y sí limpia.
  if (!Array.isArray(citas)) return;

  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;

    // 1) Cancelar solo lo NUESTRO. Todo lo que no lleve `extra.cita` es de las dosis y no se toca.
    const pending = await LocalNotifications.getPending();
    const mios = (pending.notifications || []).filter(n => n.extra?.cita === true);
    if (mios.length) await LocalNotifications.cancel({ notifications: mios.map(n => ({ id: n.id })) });

    // 2) Candidatos: cada cita puede aportar UNO o DOS momentos (el segundo aviso es opcional).
    const now = new Date();
    const candidatos = [];
    for (const cita of citas) {
      for (const m of momentosDeAviso(cita)) {
        if (m.at <= now) continue;   // ese momento ya pasó
        candidatos.push({ cita, at: m.at, cual: m.cual });
      }
    }
    candidatos.sort((a, b) => a.at - b.at);

    // 3) Presupuesto. iOS solo mantiene ~64 notificaciones pendientes por app y descarta el resto
    //    EN SILENCIO, así que las citas tienen una cuota fija y las dosis programan contra el
    //    resto (ver CITAS_CAP en notifications.js). Es fija a propósito: si dependiera de cuántas
    //    citas hay pendientes, el reparto cambiaría según cuál de los dos programadores corriera
    //    primero.
    //
    //    El reparto va en DOS FASES, igual que el de las dosis y por el mismo motivo: primero se
    //    reserva el aviso más próximo de CADA cita, y solo después se rellena con el resto. Sin
    //    esto, una cita de mañana con sus dos avisos podría gastarse los huecos que necesitaba el
    //    ÚNICO aviso de una cita de la semana que viene, y esa se quedaría sin avisar del todo.
    const elegidos = [];
    const reservadas = new Set();
    for (const c of candidatos) {
      if (elegidos.length >= CITAS_CAP) break;
      if (reservadas.has(c.cita.id)) continue;
      elegidos.push(c); reservadas.add(c.cita.id);
    }
    const yaElegido = new Set(elegidos.map(c => `${c.cita.id}_${c.cual}`));
    for (const c of candidatos) {
      if (elegidos.length >= CITAS_CAP) break;
      if (yaElegido.has(`${c.cita.id}_${c.cual}`)) continue;
      elegidos.push(c);
    }
    elegidos.sort((a, b) => a.at - b.at);   // orden determinista

    const multiPaciente = new Set(citas.map(c => c.paciente_id)).size > 1;

    const notifications = elegidos.map(({ cita, at, cual }) => {
      const medico = cita.medico_id ? medicosById[cita.medico_id] : null;
      // El texto se calcula respecto al DÍA DEL AVISO, no respecto a hoy. Un aviso "el día antes"
      // se agenda hoy pero suena mañana: si dijera "En 3 días" (lo que es hoy) mentiría justo en
      // el momento en que se lee. Con la referencia en el día del aviso dice "Mañana", que es lo
      // que será cierto cuando aparezca en la pantalla.
      const diaDelAviso = fmtDate(at.getFullYear(), at.getMonth(), at.getDate());
      const cuando = fechaCitaLabel(cita, diaDelAviso);
      const partes = [tieneHora(cita) ? `${cuando} a las ${horaCitaLabel(cita)}` : cuando];
      if (cita.lugar?.trim()) partes.push(cita.lugar.trim());
      const pacNombre = pacientesById[cita.paciente_id]?.nombre;
      if (multiPaciente && pacNombre) partes.push(pacNombre);

      return {
        id: citaNotifId(cita.id, cual),
        title: `${emojiCita(cita)} ${resumenCita(cita, medico)}`,
        body: partes.join(' · '),
        schedule: { at },
        // MISMO tratamiento de sonido que las dosis, a propósito. Al principio esto era
        // `timeSensitive`, reservando las Alertas Críticas para los medicamentos — y el
        // resultado en device fue que la notificación salía MUDA: `timeSensitive` respeta el
        // interruptor de silencio y los Focus, así que con el teléfono en silencio aparecía el
        // banner y no se oía nada. Un aviso de cita que no suena no avisa.
        // `soundFields()` sin argumento = sonido 'ding' y el nivel que el usuario tenga
        // configurado en Ajustes (crítico si tiene las Alertas Críticas encendidas), con su
        // volumen. Así las citas siguen la misma preferencia que las dosis en vez de otra aparte.
        ...soundFields(),
        // `cita: true` es LA MARCA del espacio de nombres: es lo que mira el programador de
        // dosis para no borrar esto, y lo que miramos nosotros para no borrar lo suyo.
        extra: {
          cita: true,
          cual,
          citaId: cita.id,
          pacienteId: cita.paciente_id,
          fecha: cita.fecha,
        },
      };
    });

    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch (e) { console.warn('[CitaNotifs]', e); }
};
