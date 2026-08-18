// Preferencias de las Alertas Críticas: si están encendidas y a qué volumen.
//
// Vive fuera de App porque tiene una particularidad fácil de romper: el nivel y el volumen NO se
// leen desde React a la hora de notificar. Las notificaciones se programan desde efectos y
// callbacks que no siempre tienen el estado a mano, así que el módulo `lib/notifications` guarda
// su propia copia — y este hook es el encargado de mantener las dos sincronizadas: la del módulo
// (que es la que se usa de verdad) y la de React (que solo pinta la pantalla de Ajustes).
//
// Cambiar cualquiera de las dos obliga a REPROGRAMAR: ambos valores viajan DENTRO de cada
// notificación ya agendada, así que las pendientes conservarían el valor viejo. Por eso App las
// tiene en las dependencias del efecto de scheduling.

import { useState, useCallback } from "react";
import { safeStorage } from "../lib/storage";
import { setCriticalAlertsEnabled, setCriticalVolume, VOLUMEN_POR_DEFECTO } from "../lib/notifications";

export default function useCriticalAlerts() {
  const [criticalAlerts, setCriticalAlerts] = useState(true); // por defecto ENCENDIDAS
  const [criticalVolume, setCriticalVolumeState] = useState(VOLUMEN_POR_DEFECTO);

  // La carga inicial la dispara App desde su efecto de arranque, junto con el resto de
  // preferencias, para no añadir otra lectura de storage al primer render.
  const cargarPreferencias = useCallback(async () => {
    // Default ON: solo se apaga si el usuario lo guardó explícitamente como "false".
    const crit = await safeStorage.get("critical_alerts");
    const critOn = (crit == null) ? true : (crit === "true");
    setCriticalAlertsEnabled(critOn);
    setCriticalAlerts(critOn);

    const volId = (await safeStorage.get("critical_volume")) || VOLUMEN_POR_DEFECTO;
    setCriticalVolume(volId);       // el módulo de notificaciones, que es quien lo usa
    setCriticalVolumeState(volId);  // y la pantalla de Ajustes
  }, []);

  const toggleCriticalAlerts = useCallback((val) => {
    setCriticalAlertsEnabled(val);
    setCriticalAlerts(val);
    safeStorage.set("critical_alerts", String(val));
  }, []);

  const cambiarVolumenCritico = useCallback((id) => {
    setCriticalVolume(id);
    setCriticalVolumeState(id);
    safeStorage.set("critical_volume", id);
  }, []);

  return { criticalAlerts, criticalVolume, cargarPreferencias, toggleCriticalAlerts, cambiarVolumenCritico };
}
