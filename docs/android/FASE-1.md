# Fase 1 — Que se vea y se comporte como Android

**Cerrada el 2026-09-22.** Todo verificado en el emulador `Pastillero_API36` (Android 16), no sobre el papel.

---

## Lo que se arregló, por orden de gravedad

### 1. La app arrancaba EN BLANCO en la segunda instalación 🔴

El fallo más grave de la fase, y no se habría visto nunca compilando una sola vez: la primera
instalación va bien, la segunda muestra una pantalla vacía sin ningún error a la vista. En el log:

```
E Capacitor: Unable to open asset URL: https://localhost/assets/index-<hash viejo>.js
```

**Era el Service Worker.** Cachea el `index.html` de una instalación y en la siguiente sirve ese, que
apunta a un bundle con otro hash. El archivo ya no existe y no carga nada.

En nativo el Service Worker **no aporta nada** —los assets viajan dentro del paquete, no hay red que
ahorrar— así que en `index.html` deja de registrarse cuando `Capacitor.isNativePlatform()`, y además
se **desregistra** lo que hubiera y se borran sus cachés: una instalación que ya se llevó un SW no se
cura sola.

⚠️ **Esto toca también a iOS**, porque la condición es "nativo", no "Android". Es el mismo fallo
latente y el mismo arreglo, pero conviene comprobarlo en la próxima compilación de iOS.

### 2. El modo oscuro no funcionaba en Android 🟠

La app entera se pinta con `prefers-color-scheme` y en iOS sale sola. En Android **no**: desde
targetSdk 33 el WebView le dice al contenido "estoy en claro" aunque el teléfono esté en modo noche.
La app se veía **en blanco a las once de la noche**, en un teléfono con todo lo demás en oscuro.

Dos piezas:
- `MainActivity.java` autoriza el modo oscuro del WebView (`setAlgorithmicDarkeningAllowed`). El
  nombre asusta —suena a que Android va a invertir los colores por su cuenta— pero solo lo hace con
  páginas que no saben pintarse en oscuro; a las que sí, les pasa el `prefers-color-scheme: dark` y
  se aparta.
- `index.html` declara `<meta name="color-scheme" content="light dark">`, que es como la página dice
  "sé pintarme de las dos formas, no me toques".

Y un remate: las franjas del sistema quedaban grises y no acompañaban al fondo. `values/colors.xml`
y `values-night/colors.xml` fijan el fondo de la ventana al mismo color que `html` en `index.html`.
⚠️ **Son dos sitios que hay que cambiar a la vez**: no hay forma de que se enteren solos.

### 3. El botón atrás no existía 🟠

Sin manejador, atrás **cierra la app**: desde un modal, desde el formulario a medio llenar, desde
donde sea. Es lo primero que hace un usuario de Android.

Se resolvió con una **pila de manejadores** (`src/hooks/useBackButton.js`): cada capa que se puede
cerrar registra el suyo al montarse y el atrás llama solo al de más arriba. Es una pila y no un
manejador único porque con un modal abierto sobre una pantalla apilada hay que cerrar el modal y
dejar la pantalla donde estaba.

Registradas 12 capas: el manejador raíz de `App.jsx` (pantallas apiladas, pestañas, paywall, crear
cuenta, login, modales de dosis), los tres formularios, las dos hojas de dosis, el paywall, las
pantallas apiladas y las confirmaciones de Ajustes. El visor de documentos legales, que no es React,
usa la misma pila con `registrarAtras`.

Tres decisiones que valen la pena:
- **Desde el inicio, atrás manda la app al FONDO, no la cierra.** `exitApp` mata el proceso, y para
  esta audiencia eso es perder lo que hubiera a medias y creer que algo falló. Los recordatorios
  siguen programados igual porque viven en AlarmManager, no en el proceso.
- **Con el candado puesto, atrás manda al fondo y no toca nada más.** Nunca puede servir para
  saltarse el bloqueo ni para mover la pantalla de debajo.
- **Sobre una confirmación, atrás CANCELA.** Borrar la cuenta no puede pasar por un gesto que la
  gente hace sin mirar.

> Esto cambia un criterio del PRD. CA-3.1 decía que salir desde el inicio pediría confirmación; se
> queda en mandar al fondo, que es la convención de Android y no pierde nada. Un diálogo en cada
> pulsación de atrás es fricción para quien menos la tolera.

### 4. Áreas seguras: seguro contratado, no incendio apagado 🟡

Las 28 `env(safe-area-inset-*)` de 19 archivos pasan al patrón que funciona en los dos sistemas:

```css
var(--safe-area-inset-top, env(safe-area-inset-top, 0px))
```

**Pero midiendo resultó que en Android valen 0, y está bien que valgan 0**: Capacitor 8 encaja el
WebView dentro de las barras del sistema (2276 px de 2400), así que la app nunca dibuja debajo. O
sea que esto no arregló ningún solape — no lo había. Es seguro para tres casos reales: iOS, donde
sí valen; los WebView anteriores a la versión 140, que devuelven mal el `env()`; y el día que el
borde a borde de verdad se active.

Requiere Capacitor **8.5.2** (veníamos de 8.3.1), que es quien inyecta esas variables.
⚠️ Tras fusionar esta rama hay que correr `npx cap sync ios`.

---

## Lo que se probó, y cómo

| Qué | Cómo | Resultado |
|---|---|---|
| Atrás cierra el formulario | `input tap` + `keyevent 4` + comprobar la actividad en primer plano | ✅ vuelve, la app sigue viva |
| Atrás en el inicio | `keyevent 4` + comprobar el proceso | ✅ va al lanzador, proceso vivo (pid intacto) |
| Modo oscuro | `cmd uimode night yes` | ✅ tras el arreglo |
| Franjas del sistema | captura en los dos modos | ✅ acompañan al fondo |
| Letra del sistema al 130 % | `settings put system font_scale 1.3` + medir desbordes por DOM | ✅ nada se sale, sin scroll horizontal |
| Variables de área segura | conexión al WebView por CDP | ✅ definidas, valen 0 por la razón correcta |
| Reglas de negocio | `node src/domain/*.test.mjs` | ✅ 10 de 10 archivos |

---

## Lo que queda para más adelante

- **El splash es el de Capacitor**, con su logo, no el de la app. Se ve al arrancar. `@capacitor/assets`
  lo genera; es cosmético pero sale en cada arranque.
- **El icono adaptativo** sigue siendo el de la plantilla.
- **Arranque lento**: en el emulador tarda varios segundos hasta pintar. La RNF-1 pide menos de 3 en
  gama media, y el emulador con una compilación de depuración no sirve para medirlo. Medir en el
  Samsung.
- **`org.gradle.java.home`** lleva una ruta de esta máquina (ver FASE-0).

---

## Adelanto de la fase 2: los canales de notificación

Hecho el 2026-09-22, aprovechando que no dependía de la cuenta de Play ni del teléfono.

**Un canal por sonido, ocho en total.** En Android el sonido es propiedad del canal, no del aviso, y
un canal es inmutable una vez creado. Como esta app deja elegir el sonido por medicamento, no hay
otra forma. Los ids llevan versión (`dosis_ding_v1`) desde el principio: el día que haya que
cambiarle la importancia a un canal, la única salida será crear uno nuevo — sin versión en el id,
ese cambio exigiría que cada usuario desinstalara la app.

`soundFields()` se bifurca por plataforma en un solo sitio, así que **los seis sitios que la llaman
no cambiaron**: en Android devuelve `{ channelId }`, en iOS lo de siempre.

**Una trampa que se confirmó al medir:** el canal silencioso aparece con el sonido por defecto del
sistema, porque el plugin solo llama a `setSound()` cuando le pasas uno. Por eso ese canal usa
importancia BAJA (2) y no alta: con importancia baja Android no suena pase lo que pase. Si algún día
se le sube la importancia, empezará a sonar un canal que el usuario eligió en silencio.

### La prueba de la alarma exacta

Programada una dosis a dos minutos vista, el sistema registró:

```
type=RTC  origWhen=2026-09-22 11:35:02.382  window=0  exactAllowReason=policy_permission
whenElapsed=+1m59s943ms   maxWhenElapsed=+1m59s943ms
```

`window=0` y las dos marcas idénticas: **cero holgura**. Y `exactAllowReason=policy_permission` dice
que se concede por el permiso que declaramos. Justo encima, en el mismo volcado, una alarma de
Google con `whenElapsed=+1m55s` pero `maxWhenElapsed=+5m21s` — tres minutos y medio de margen. Eso
es lo que habríamos tenido sin `USE_EXACT_ALARM`, y nadie nos habría avisado.

Con el emulador **desenchufado, pantalla apagada y en reposo profundo forzado**, la notificación se
entregó: dejó de estar pendiente, figura entre las entregadas y aparece en la sección que SUENA de
la persiana, no en la de silenciosas.

### Lo que esto NO prueba

- **Que sonara "campana".** Se verificó que el canal lleva ese recurso, no que el altavoz lo tocara.
- **Las diez horas de verdad.** El reposo forzado por `adb` no reproduce la inactividad larga que
  despierta a las capas de ahorro del fabricante. Eso es CA-1.2 y solo lo dice el Samsung.
