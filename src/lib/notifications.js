// Notificaciones locales de iOS: sonidos, ids estables y programación por lotes.
import { LocalNotifications } from '@capacitor/local-notifications';
import { fmtDate } from "../domain/dates";
import { getHoras, isPillDueOnDay } from "../domain/schedule";

export const SONIDOS = [
  { id: 'ding',        label: 'Ding' },
  { id: 'campana',     label: 'Campana' },
  { id: 'alarma',      label: 'Alarma' },
  { id: 'magico',      label: 'Mágico' },
  { id: 'minimalista', label: 'Minimalista' },
  { id: 'pastillero',  label: 'Pastillero' },
  { id: 'tono',        label: 'Tono' },
  { id: 'ninguno',     label: 'Sin sonido' },
];

// Nivel de interrupción de los recordatorios.
// 'critical' = Alertas Críticas: suenan SIEMPRE, ignoran Focus / silencio / throttle de iOS
// (requiere el entitlement com.apple.developer.usernotifications.critical-alerts + permiso del
// usuario). El usuario puede apagarlas en Ajustes; entonces cae a 'timeSensitive'.
// `_criticalAlerts` se carga desde Preferences al arrancar (default ON).
let _criticalAlerts = true;
export const notifLevel = () => (_criticalAlerts ? 'critical' : 'timeSensitive');

// El nivel vive aquí, no en React: las notificaciones se programan desde efectos y
// callbacks que no siempre tienen el estado a mano. App sincroniza este valor con la
// preferencia guardada al arrancar y cada vez que el usuario lo cambia en Ajustes.
export const setCriticalAlertsEnabled = (val) => { _criticalAlerts = !!val; };

// Campos de sonido/nivel de una notificación según el sonido elegido de la pastilla.
// 'ninguno' = silenciosa: sin campo `sound` (solo banner) y nivel timeSensitive (no crítico,
// porque crítico es justamente para GARANTIZAR sonido). Se esparce con ...soundFields(sonido).
export const soundFields = (sonido) => sonido === 'ninguno'
  ? { interruptionLevel: 'timeSensitive' }
  : { sound: `${sonido || 'ding'}.caf`, interruptionLevel: notifLevel() };

export const notifId = (pillId, dateStr, hora) => {
  const str = `${pillId}_${dateStr}_${hora}`;
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) & 0x7fffffff;
  return h || 1;
};

// Cancela la notificación local de una dosis específica (idempotente)
export const cancelDoseNotif = async (pill, dayStr, hora) => {
  if (!window.Capacitor?.isNativePlatform()) return;
  try {
    // Cancela la notif de la dosis Y su posible "posponer" pendiente (id estable por dosis),
    // para que al marcarla tomada/omitida no vuelva a sonar el recordatorio pospuesto.
    await LocalNotifications.cancel({ notifications: [{ id: notifId(pill.id, dayStr, hora) }, { id: notifId(pill.id, 'snooze', hora) }] });
  } catch (_) { /* noop */ }
};

// Reprograma la notificación local de una dosis específica si su hora aún no ha pasado.
export const scheduleDoseNotif = async (pill, dayStr, hora) => {
  if (!window.Capacitor?.isNativePlatform()) return;
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    const [hh, mm] = hora.split(':').map(Number);
    const [Y, M, D] = dayStr.split('-').map(Number);
    const at = new Date(Y, M - 1, D, hh, mm, 0, 0);
    if (at <= new Date()) return; // ya pasó, no tiene sentido reprogramar
    await LocalNotifications.schedule({
      notifications: [{
        id: notifId(pill.id, dayStr, hora),
        title: '💊 Mi Pastillero',
        body: `Hora de tomar ${pill.emoji} ${pill.nombre}${pill.dosis ? ` (${pill.dosis})` : ''}`,
        schedule: { at },
        ...soundFields(pill.sonido),
        actionTypeId: 'PILL_ACTIONS',
        extra: { pillId: pill.id, scheduledTime: hora, dateStr: dayStr, doseKey: `${pill.id}_${hora}`, pacienteId: pill.paciente_id },
      }],
    });
  } catch (_) { /* noop */ }
};

// `takenDoseKeys` es un Set con strings "pillId_YYYY-MM-DD_HH:MM" — dosis ya marcadas
// como tomadas que NO deben sonar aunque su hora esté en el futuro.
// Serializa las llamadas a la programación: cancelar+reprogramar nunca se interpone
// con otra corrida. Antes, al cambiar de paciente podían dispararse dos reagendados a
// la vez (efecto + permiso) y pisarse → notifs sin sonido o desfasadas.
let _schedChain = Promise.resolve();
export const scheduleLocalNotifs = (pillsList, takenDoseKeys = new Set(), pacientesById = {}) => {
  _schedChain = _schedChain
    .then(() => _doScheduleLocalNotifs(pillsList, takenDoseKeys, pacientesById))
    .catch(() => {});
  return _schedChain;
};

// iOS solo mantiene ~64 notificaciones locales pendientes por app y descarta el resto
// EN SILENCIO. Con varias pastillas/pacientes, las dosis de varios días superan ese tope.
// Para que no se caiga nadie injustamente el reparto es en dos fases:
//   1) se RESERVA primero la próxima dosis de CADA pastilla (así una pastilla de `orden`
//      alto, de otro paciente, o un tratamiento que inicia a futuro nunca se queda sin su
//      siguiente recordatorio), y
//   2) se rellena el resto de espacios con las dosis más CERCANAS en el tiempo.
export const NOTIF_CAP = 62;             // margen de seguridad bajo el límite duro de iOS (~64)
export const SCHED_HORIZON_DAYS = 120;   // suficiente para hallar la próxima dosis aun de "Cada 3 meses"

const _doScheduleLocalNotifs = async (pillsList, takenDoseKeys = new Set(), pacientesById = {}) => {
  try {
    const { display } = await LocalNotifications.checkPermissions();
    if (display !== 'granted') return;
    const now = new Date();
    // Reprogramar = cancelar lo pendiente + reconstruir agrupado. Se conservan SOLO las notifs
    // de "posponer" (extra.snooze): una vez que el usuario pospone, ese one-off no debe borrarse
    // hasta que suene. Todo lo demás se cancela y se reconstruye.
    // OJO: NO se conservan las "inminentes". Con la agrupación por minuto no hay desfase +1min
    // que perder; y conservar una notif INDIVIDUAL que a los segundos se agrupó causaba un
    // DUPLICADO (sonaba la individual vieja + la del grupo).
    const pending = await LocalNotifications.getPending();
    const preservedIds = new Set();
    const toCancel = [];
    for (const n of (pending.notifications || [])) {
      if (n.extra?.snooze === true) preservedIds.add(n.id);
      else toCancel.push({ id: n.id });
    }
    if (toCancel.length) await LocalNotifications.cancel({ notifications: toCancel });
    // Si hay varias personas, mostramos el nombre del paciente en la notif para saber de quién es.
    const multiPatient = new Set(pillsList.map(p => p.paciente_id)).size > 1;

    // 1) Genera todas las dosis candidatas (futuras y no tomadas) dentro del horizonte.
    const candidates = [];
    for (let day = 0; day < SCHED_HORIZON_DAYS; day++) {
      const d = new Date(now); d.setDate(d.getDate() + day);
      const dateStr = fmtDate(d.getFullYear(), d.getMonth(), d.getDate());
      for (const pill of pillsList) {
        if (!isPillDueOnDay(pill, dateStr)) continue;
        for (const hora of getHoras(pill.hora_toma, pill.frecuencia)) {
          const [hh, mm] = hora.split(':').map(Number);
          const at = new Date(d); at.setHours(hh, mm, 0, 0);
          if (at <= now) continue;
          if (takenDoseKeys.has(`${pill.id}_${dateStr}_${hora}`)) continue; // ya tomada
          candidates.push({ pill, dateStr, hora, at });
        }
      }
    }
    candidates.sort((a, b) => a.at - b.at);

    // 2) Selección con presupuesto: primero la próxima dosis de cada pastilla (equidad),
    //    luego rellena por cercanía sin duplicar la ya reservada.
    const keyOf = c => `${c.pill.id}_${c.dateStr}_${c.hora}`;
    const chosen = new Set();
    const selected = [];
    const firstByPill = new Map();
    for (const c of candidates) if (!firstByPill.has(c.pill.id)) firstByPill.set(c.pill.id, c);
    for (const c of firstByPill.values()) {
      if (selected.length >= NOTIF_CAP) break;
      selected.push(c); chosen.add(keyOf(c));
    }
    for (const c of candidates) {
      if (selected.length >= NOTIF_CAP) break;
      if (chosen.has(keyOf(c))) continue;
      selected.push(c); chosen.add(keyOf(c));
    }
    selected.sort((a, b) => a.at - b.at); // orden determinista (más cercanas primero) antes de agrupar

    // 3) Agrupa las dosis por minuto exacto (fecha + hora). En un minuto dado:
    //    - 1 sola dosis  → notificación normal con sus acciones Tomar/Posponer (como siempre).
    //    - 2+ dosis (mismo o distintos pacientes) → UNA sola notificación que, al tocarse,
    //      abre la lista in-app para decidir por pastilla (extra.group). Una sola notificación
    //      por minuto = entrega y sonido garantizados (evita el fallo de iOS con dos notifs
    //      casi simultáneas). El id de las individuales se deriva de (pill, fecha, hora) para
    //      que cancelDoseNotif (al marcar tomada) la siga encontrando.
    const groups = new Map();
    for (const c of selected) {
      const k = `${c.dateStr}_${c.hora}`;
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(c);
    }
    const notifications = [];
    for (const members of groups.values()) {
      const at = new Date(members[0].at);
      if (members.length === 1) {
        const c = members[0];
        const id = notifId(c.pill.id, c.dateStr, c.hora);
        if (preservedIds.has(id)) continue; // ya está programada y por sonar; no la re-tocamos
        const pacNombre = pacientesById[c.pill.paciente_id]?.nombre;
        const suffix = (multiPatient && pacNombre) ? ` · ${pacNombre}` : '';
        notifications.push({
          id,
          title: '💊 Mi Pastillero',
          body: `Hora de tomar ${c.pill.emoji} ${c.pill.nombre}${c.pill.dosis ? ` (${c.pill.dosis})` : ''}${suffix}`,
          schedule: { at },
          ...soundFields(c.pill.sonido),
          actionTypeId: 'PILL_ACTIONS',
          extra: { pillId: c.pill.id, scheduledTime: c.hora, dateStr: c.dateStr, doseKey: `${c.pill.id}_${c.hora}`, pacienteId: c.pill.paciente_id },
        });
      } else {
        const first = members[0];
        const id = notifId('grupo', first.dateStr, first.hora);
        if (preservedIds.has(id)) continue;
        const lista = members.map(m => {
          const pn = pacientesById[m.pill.paciente_id]?.nombre;
          return `${m.pill.emoji} ${m.pill.nombre}${(multiPatient && pn) ? ` (${pn})` : ''}`;
        }).join(', ');
        // Un solo sonido para todo el grupo: el del primer medicamento que NO esté en
        // "Sin sonido". Si todas son silenciosas, el grupo es silencioso.
        const grpSonido = members.find(m => m.pill.sonido !== 'ninguno')?.pill.sonido || 'ninguno';
        notifications.push({
          id,
          title: '💊 Mi Pastillero',
          body: `Hora de tomar ${members.length} medicamentos: ${lista}`,
          schedule: { at },
          ...soundFields(grpSonido),
          extra: { group: true, dateStr: first.dateStr, hora: first.hora },
        });
      }
    }
    if (notifications.length) await LocalNotifications.schedule({ notifications });
  } catch (e) { console.warn('[LocalNotifications]', e); }
};
