// El botón/gesto ATRÁS de Android.
//
// En iOS no existe, así que en esta app tampoco existía. Y su ausencia no se nota "un poco": sin
// manejador, pulsar atrás CIERRA la app. Desde un modal, desde el formulario de alta a medio
// llenar, desde cualquier sitio. Es la primera cosa que hace un usuario de Android y la primera
// que rompería.
//
// El modelo es una PILA de manejadores. Cada capa que se puede cerrar —una pantalla apilada, un
// modal, una hoja— registra el suyo al montarse, y el atrás llama SOLO al de más arriba. Esa es la
// razón de que sea una pila y no un manejador único: con un modal abierto encima de una pantalla
// apilada, el atrás tiene que cerrar el modal y dejar la pantalla donde estaba. Con un solo
// manejador se cerrarían las dos, o ninguna.
//
// El orden es de montaje (el último que se monta manda), que en React coincide con el orden visual
// porque un modal se monta después que la pantalla que lo abre.
//
// En iOS y en web no hace nada: no hay evento al que suscribirse.

import { useEffect, useRef } from "react";
import { App as CapApp } from "@capacitor/app";

const pila = [];
let suscrito = false;

const esNativo = () => !!window.Capacitor?.isNativePlatform();

function suscribir() {
  if (suscrito || !esNativo()) return;
  suscrito = true;
  CapApp.addListener("backButton", () => {
    const arriba = pila[pila.length - 1];
    if (arriba) arriba();
    // Nadie registrado: al fondo, no a cerrar. `exitApp` MATA la app, y para esta audiencia eso
    // es perder lo que estuviera a medias y creer que algo falló. Mandarla al fondo conserva el
    // estado, y los recordatorios siguen programados igual porque viven en AlarmManager, no en
    // el proceso.
    else CapApp.minimizeApp();
  }).catch(() => { suscrito = false; });
}

// Registra un manejador mientras el componente esté montado y `activo` sea true.
//
// `activo` es lo que permite que un modal registre su cierre solo cuando está ABIERTO: si el
// componente siempre está montado pero oculto, registrar de continuo se comería el atrás sin que
// haya nada que cerrar.
export default function useBackButton(alAtras, activo = true) {
  // El manejador vive en una ref para no re-registrar en cada render. Si se registrara de nuevo
  // cada vez que cambia su identidad —y cambia en cada render, porque casi siempre es una función
  // en línea— la capa saltaría al tope de la pila constantemente y el orden dejaría de significar
  // nada.
  const ref = useRef(alAtras);
  ref.current = alAtras;

  useEffect(() => {
    if (!activo || !esNativo()) return;
    const entrada = () => ref.current?.();
    pila.push(entrada);
    suscribir();
    return () => {
      const i = pila.lastIndexOf(entrada);
      if (i >= 0) pila.splice(i, 1);
    };
  }, [activo]);
}

// Mandar la app al fondo. Lo usa el manejador raíz de App cuando ya no queda nada que cerrar.
export const alFondo = () => { if (esNativo()) CapApp.minimizeApp().catch(() => {}); };

// La misma pila, para código que NO es React. Hoy lo usa el visor de documentos legales de
// `lib/config.js`, que se construye sobre el DOM a propósito para poder abrirse desde cualquier
// pantalla sin pasar props. Devuelve la función para darse de baja.
export function registrarAtras(alAtras) {
  if (!esNativo()) return () => {};
  pila.push(alAtras);
  suscribir();
  return () => {
    const i = pila.lastIndexOf(alAtras);
    if (i >= 0) pila.splice(i, 1);
  };
}
