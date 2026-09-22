# Mi Pastillero en Android — análisis técnico

**Fecha:** 2026-09-21 · **Base analizada:** rama `refactor/modularizacion` (`ac46975`, versión 2.2 build 20), que es la que lleva la app real. No `main`, que sigue en la PWA vieja de un solo archivo.

Este documento dice **qué hay**, **qué se reutiliza**, y **dónde Android no es iOS**. Cada afirmación incómoda va con su evidencia: archivo y línea, o el código del plugin en `node_modules`. El PRD (`PRD.md`) sale de aquí.

---

## 1. La conclusión, primero

Portar a Android **no es reescribir la app: es reescribir la mitad que toca el sistema operativo.**

- **~90 % del código fuente se reutiliza sin tocar**: 10 730 líneas de `src/` en las que solo un puñado de archivos habla con iOS. Las 529 pruebas de `src/domain/*.test.mjs` corren en `node` a secas y seguirán en verde: no saben en qué teléfono están.
- **El 10 % restante es exactamente lo que hace valiosa a esta app**: que suene a la hora, que suene aunque el teléfono esté en silencio, y que cobre. Esas tres cosas en Android se construyen de otra manera, no se traducen.

Dicho de otro modo: la app se ve en Android en un día; la app **cumple su promesa** en Android varias semanas después. Y el riesgo no es que no compile — es que compile, se vea bien, y los recordatorios lleguen tarde o no lleguen, que es el fallo que esta app no se puede permitir (ya pasó una vez: ver `project_bug_notifs_sin_red`).

---

## 2. Qué hay hoy (verificado)

| Pieza | Estado |
|---|---|
| Stack | React 18 + Vite 4, JSX sin TypeScript, Tailwind 3.4.17 **vendorizado** en `public/vendor/` |
| Nativo | Capacitor **8.3.1**, solo plataforma iOS (`ios/`). **No existe `android/`**, y `@capacitor/android` no está instalado |
| Backend | Supabase (auth + Postgres con RLS), 11 migraciones en `db/migrations/`, 2 edge functions |
| Pagos | RevenueCat (`@revenuecat/purchases-capacitor`), entitlement `premium`, offering `default` |
| App ID | `com.mipastillero.app` (`capacitor.config.json`) |
| Publicado | 1.1 en App Store (MX + CR). La 2.x es lo que hay en esta rama |

**Los nueve plugins de Capacitor que usa la app tienen implementación de Android.** Lo comprobé carpeta por carpeta en `node_modules`: `local-notifications`, `preferences`, `share`, `filesystem`, `keyboard`, `native-biometric` (capgo), `social-login` (capgo), `purchases` (RevenueCat), `in-app-review`. **Ninguno hay que sustituir.** Eso es la mejor noticia del análisis, y evita el escenario caro de tener que buscar plugin nuevo y rehacer una capa entera.

### Lo que se reutiliza tal cual

```
src/domain/     11 módulos + 529 pruebas   → íntegro, es JS puro
src/screens/    13 pantallas                → íntegro salvo copy y botón atrás
src/components/  8 componentes              → íntegro
src/hooks/       9 hooks                    → íntegro salvo useNotifScheduling y usePremium
src/lib/        12 módulos                  → 5 tocados (ver §3)
db/ + supabase/                             → íntegro: mismo backend, mismas cuentas, mismos datos
docs/prototipos/                            → íntegro: el diseño no cambia
```

Un usuario que entra con su cuenta desde Android ve **sus mismos datos**. Supabase no sabe ni le importa desde qué teléfono se conecta. No hay migración de datos, no hay backend nuevo, no hay API que versionar.

---

## 3. Los ocho frentes donde Android no es iOS

Ordenados por lo que cuesta si sale mal, no por lo que cuesta hacerlo.

### A. Alarmas exactas — el que puede arruinar el producto en silencio

En iOS, una notificación programada a las 9:00 suena a las 9:00. En Android desde la versión 12 hay que **pedir permiso para ser exacto**, y si no lo tienes el sistema te deja programar igual… con retraso.

Esto no es teoría. Está en el código del plugin que ya usamos — `node_modules/@capacitor/local-notifications/android/.../LocalNotificationManager.java:374`:

```java
if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && !alarmManager.canScheduleExactAlarms()) {
    alarmManager.setAndAllowWhileIdle(...)   // INEXACTO: el sistema decide cuándo
} else {
    alarmManager.setExactAndAllowWhileIdle(...)
}
```

Y el `AndroidManifest.xml` del plugin declara `RECEIVE_BOOT_COMPLETED`, `WAKE_LOCK` y `POST_NOTIFICATIONS` — **no declara ningún permiso de alarma exacta**. O sea: si no lo añadimos nosotros, la app cae por el `if` de arriba y los recordatorios se vuelven aproximados sin avisar a nadie. Un "9:00" que llega a las 9:40 es un medicamento saltado, y encima con la app diciendo que todo va bien.

**Lo que hay que hacer:** declarar `USE_EXACT_ALARM` en nuestro manifest (Android 13+ lo concede al instalar, sin preguntar) y `SCHEDULE_EXACT_ALARM` como respaldo para Android 12. `USE_EXACT_ALARM` está reservado a apps cuya función central son las alarmas y recordatorios — un pastillero califica —, pero **Google Play obliga a declararlo y justificarlo** en la consola. Si la justificación se rechaza, no hay app.

**Verificación obligatoria antes de publicar:** un caso de prueba que programe una dosis a 15 minutos vista, mande el teléfono a Doze forzado (`adb shell dumpsys deviceidle force-idle`) y compruebe que suena al minuto exacto. Y encima de esa, la prueba de la noche entera en teléfono real (CA-1.2 del PRD), que es la única que reproduce las horas de inactividad que despiertan a las capas de ahorro del fabricante. Esto no se puede validar "a ojo".

> **Nota sobre WorkManager.** Es habitual leer el consejo de "no dependas de WorkManager para los recordatorios, usa alarmas exactas". El consejo es correcto y es exactamente el riesgo de arriba, pero **el mecanismo no es el nuestro**: el plugin de Capacitor que ya usamos no toca WorkManager, programa con `AlarmManager` directamente. Nuestro agujero no es estar en la cola equivocada — es que `AlarmManager` **degrada a inexacto en silencio** cuando falta el permiso. El destino es el mismo (recordatorios que llegan tarde); la causa y el arreglo, no.

### B. El sonido ya no viaja con la notificación, vive en el canal

Desde Android 8 el sonido, la vibración y la importancia se fijan en el **canal de notificación**, no en cada aviso. Y un canal **es inmutable**: una vez creado, ni tú ni el código pueden cambiarle el sonido — solo el usuario desde los ajustes del sistema.

La app tiene 7 sonidos elegibles **por medicamento** (`SONIDOS` en `src/lib/notifications.js:12`). En iOS eso es un campo por notificación. En Android obliga a un rediseño:

- **Un canal por sonido** (7 canales + uno silencioso), creados al arrancar con `createChannel`.
- `soundFields()` deja de devolver `{ sound, interruptionLevel, criticalVolume }` y pasa a devolver `{ channelId }`.
- Los IDs de canal se **versionan** (`dosis_ding_v1`): el día que haya que cambiarle la importancia a un canal, la única salida es crear `_v2` y borrar el viejo. Si no se versionan desde el principio, ese cambio es imposible sin desinstalar.
- Los `.caf` no sirven: Android quiere `.ogg` o `.mp3` en `res/raw/`, con nombre en minúsculas y sin guiones. **Ya tenemos los `.mp3` listos** en `public/sounds/` (7 archivos, ~420 KB en total), así que esto es mover archivos, no producir audio.

### C. Las Alertas Críticas no existen en Android

Es la característica que distingue a esta app: suena **aunque el teléfono esté en silencio o en modo Focus**, con volumen configurable en cuatro niveles (`VOLUMENES` en `src/lib/notifications.js:38`). En iOS se consigue con un entitlement que Apple concede a mano y un parche propio al plugin (`patches/@capacitor+local-notifications+8.1.0.patch`).

**Android no tiene equivalente.** Tiene tres piezas sueltas que juntas se acercan:

1. `AudioAttributes.USAGE_ALARM` en el canal → suena por el canal de alarma, que **sobrevive al modo silencio** en la mayoría de fabricantes.
2. `IMPORTANCE_HIGH` → banner emergente en vez de aviso callado.
3. `setBypassDnd(true)` → salta el No Molestar, pero exige que el usuario conceda el permiso `ACCESS_NOTIFICATION_POLICY` desde ajustes del sistema.

Y aquí está el detalle que obliga a un parche, igual que en iOS: el plugin **pone `USAGE_NOTIFICATION` en todos los canales que creamos** (`NotificationChannelManager.java:96-98`) y reserva `USAGE_ALARM` solo para su canal por defecto (`LocalNotificationManager.java:114`). Tampoco expone `bypassDnd` ni pantalla completa. Los campos que acepta son exactamente: `id, name, description, importance, visibility, sound, vibration, lights, lightColor`.

**Consecuencia de producto:** el interruptor "Alertas Críticas" y el selector de volumen de Ajustes **no se pueden portar tal cual**. Android no permite fijar el volumen de una notificación por código: manda el deslizador del sistema. Hay que decidir si en Android ese ajuste desaparece, o si se convierte en otra cosa ("Sonar aunque el teléfono esté en silencio", sí/no). Es una decisión de producto, no técnica, y está en el PRD.

### D. Doze y los fabricantes que matan la app

En iOS, una notificación local programada suena aunque la app lleve un mes sin abrirse: la agenda es del sistema. En Android eso **depende del fabricante**. Xiaomi, Huawei, Oppo, Vivo y Samsung aplican capas propias de ahorro de batería que cierran procesos y cancelan alarmas de apps que consideran inactivas. Es el motivo número uno de reseñas de una estrella en apps de recordatorios, y no es un bug que se pueda arreglar en el código: se gestiona pidiéndole al usuario que exima a la app.

**Lo que hay que construir:**
- Un flujo, una sola vez tras el primer medicamento, que pida la exención de optimización de batería (`REQUEST_IGNORE_BATTERY_OPTIMIZATIONS`).
- Una pantalla de ayuda con las instrucciones **por marca** — hay que detectar `Build.MANUFACTURER` y enseñar solo la que aplica; un listado genérico no lo sigue nadie, y menos el público de esta app.
- El buen lado: el plugin **ya restaura las notificaciones al reiniciar el teléfono** (`LocalNotificationRestoreReceiver` con `BOOT_COMPLETED` y `LOCKED_BOOT_COMPLETED`, declarado en su manifest). Eso en iOS ni se plantea, y aquí viene gratis.

### E. El botón atrás, el borde a borde y el teclado

Tres cosas que en el código iOS **no existen** y que en Android se notan en el primer minuto de uso.

**Botón atrás.** Android tiene un gesto/botón de retroceso global. Sin un manejador, pulsarlo **cierra la app** — desde un modal, desde el formulario de alta a medio llenar, desde cualquier sitio. La app navega con estado propio (`abrir(...)` en `App.jsx`) y tiene al menos 6 modales. Hay que instalar `@capacitor/app` (**no está en `package.json` hoy**) y construir una pila de navegación que atienda `backButton` en cada pantalla y cada modal. Es trabajo mecánico pero transversal: toca todas las pantallas.

**Borde a borde.** Google Play exige desde el 31 de agosto de 2026 que las apps nuevas apunten a **Android 16 (API 36)**, y en Android 16 el dibujo bajo las barras del sistema es obligatorio: la vía de escape (`windowOptOutEdgeToEdgeEnforcement`) ya no se respeta. La app **depende de `env(safe-area-inset-*)` en 28 sitios repartidos por 19 archivos**, incluida la barra `#safe-top` de `index.html` que tapa el notch. En Android esos `env()` devuelven valores equivocados en WebViews anteriores a la 140. La solución está resuelta desde Capacitor **8.3.2** (estamos en 8.3.1, un salto menor): el framework inyecta variables `--safe-area-inset-*` y el patrón correcto pasa a ser `var(--safe-area-inset-top, env(safe-area-inset-top, 0px))`. Son 28 sustituciones que además **no rompen iOS**.

**Teclado y tamaño de letra.** `@capacitor/keyboard` está configurado con `resize: body`, que en Android necesita además `windowSoftInputMode=adjustResize` en el manifest. Y `index.html` fija `font-size: 18px` para agrandar toda la UI un 12,5 % pensando en adultos mayores — en Android, el WebView **multiplica eso por la escala de fuente del sistema**, que ese mismo público suele tener subida. Una persona con la letra del sistema al 130 % vería la app a ~23 px efectivos y los diseños de dos columnas se rompen. Hay que probarlo con la escala al máximo y decidir si se limita.

### F. Pagos: dos tiendas, un entitlement

RevenueCat ya está integrado y su abstracción aguanta el cambio; `src/purchases.js` necesita tres arreglos concretos:

1. **Clave de API por plataforma.** Hoy `RC_IOS_KEY` es literal (`purchases.js:15`). Pasa a elegirse según `Capacitor.getPlatform()`, con `VITE_REVENUECAT_ANDROID_KEY` nueva en `.env`.
2. **Gestionar la suscripción.** `manageSubscriptions()` abre `https://apps.apple.com/account/subscriptions` (`purchases.js:139`). En Android es la URL de Play, con el `productId` y el `packageName`.
3. **Productos nuevos en Google Play Console**, con los mismos tres periodos y precios a la paridad ya decidida. Los códigos promocionales de Apple (`OfferCodeOneTimeUseCodes_*.csv`) **no valen**: Play tiene su propio sistema y hay que generarlos aparte.

**Un hallazgo que vale dinero, y su letra pequeña.** La app identifica al usuario en RevenueCat con su id de Supabase (`identifyUser(session.user.id)`). Eso significa que **quien pagó en iPhone y entra con su cuenta en Android tiene premium automáticamente**, sin pagar dos veces y sin que haya que construir nada. Pero solo **si entra con su cuenta**: el rescate silencioso (`rescatarSuscripcion` en `usePremium.js`) llama a `restore()`, que pregunta a la tienda del dispositivo — y Google Play no sabe nada de una compra hecha en Apple. Para el usuario anónimo que viene de iOS, restaurar en Android **devolverá vacío, y eso es correcto**. El copy que ya existe para ese caso ("restaurar en vacío ofrece entrar a la cuenta", commit `7ebf442`) resuelve la situación tal cual: es la pantalla que ya está construida, y en Android pasa a ser la ruta principal en vez de la excepción.

### G. Login social: Google sí, Apple es una decisión

`@capgo/capacitor-social-login` trae Android. Para Google hace falta un **client ID de tipo Android** en Google Cloud con la huella SHA-1 del certificado — y **dos huellas**, la de depuración y la de Play App Signing, que es distinta y solo aparece en la consola de Play después de subir el primer paquete. Olvidar la segunda es el error clásico: funciona en tu teléfono y falla para todo el mundo.

Apple es la decisión de verdad. "Iniciar sesión con Apple" en Android existe solo como flujo web con redirección, lo que exige registrar un deep link y pasar por el navegador. **A quién afecta:** a cualquiera que creó su cuenta con Apple en el iPhone y quiera entrar desde un Android. Si no se soporta, esa persona se queda fuera de su propia cuenta — y no hay forma de recuperarla desde la app, porque no tiene contraseña. La recomendación está en el PRD.

### H. Los flecos

| Qué | Dónde | Arreglo |
|---|---|---|
| `window.open("app-settings:")` abre los ajustes de iOS | `useNotifScheduling.js:53` | Intent de Android; `capacitor-native-settings` o código nativo |
| `window.open(url, '_system')` para la gestión de suscripción | `purchases.js:145` | Usar `@capacitor/browser` o el plugin App, que sí es portable |
| Copy "Face ID" | 12 sitios en 7 archivos | "huella o reconocimiento facial"; el plugin ya es multiplataforma |
| Reseña in-app | `lib/resena.js` | El plugin envuelve el flujo de Play; la lógica de *cuándo* (`domain/resena.js`) no se toca |
| Compartir Excel y ficha | `ReportesScreen.jsx:126`, `FichaEmergenciaScreen.jsx:49` | `Directory.Cache` + `Share` funcionan; verificar el FileProvider al compartir con WhatsApp |
| Service Worker | `public/sw.js` | En Capacitor Android no hace falta y puede servir bundle viejo (ver `feedback_sw_bundle_viejo_en_dev`). Desactivarlo en nativo |
| Icono | `public/icon-*.png` | Android pide **icono adaptativo** (capa frontal + fondo). `@capacitor/assets` ya está y lo genera |

---

## 4. Lo que exige Google Play y Apple no pedía

Esto es calendario, no código, y es donde se pierden las semanas si se descubre tarde.

1. **Apuntar a Android 16 (API 36).** Obligatorio para apps nuevas desde el 31 de agosto de 2026 — o sea, ya. Capacitor 8 lo soporta de fábrica.
2. **Declaración de alarmas exactas.** Formulario en la consola justificando `USE_EXACT_ALARM`. Sin él, la app se rechaza.
3. **Formulario de seguridad de los datos** (*Data safety*) + declaración de **app de salud**. Hay que declarar qué se recoge (correo, datos de salud) y que va cifrado. La política de privacidad ya existe y ya está en dominio propio.
4. **Borrado de cuenta por web.** Play exige, además del borrado dentro de la app —que ya está, `SettingsScreen.jsx:91`—, **una URL pública** donde pedir el borrado sin instalar la app. Apple nunca lo pidió. Es una página nueva en `mipastillero.jimbera.com`.
5. **Prueba cerrada de 12 probadores durante 14 días continuos** antes de poder publicar, si la cuenta de desarrollador es **personal** y se creó después del 13 de noviembre de 2023. Las cuentas de **empresa están exentas**. Esto son **dos semanas de calendario mínimo** y hace falta reunir 12 personas con cuenta de Google dispuestas a tener la app instalada. Es el punto que más puede retrasar la fecha y el que hay que resolver **el primer día**, no el último.
6. **Formato AAB** (no APK), firma gestionada por Google, y alta de $25 una sola vez si aún no hay cuenta.

---

## 5. Lo que no hay que hacer

- **No tocar `src/domain/`.** Si el port obliga a cambiar una regla de negocio, es que algo se está haciendo en el sitio equivocado.
- **No bifurcar el código.** Un solo repositorio, un solo `src/`, las diferencias resueltas con `Capacitor.getPlatform()` dentro de `lib/`. Dos ramas de UI es dos apps que mantener y la segunda siempre va por detrás.
- **No publicar sin probar en un teléfono Android real de gama media.** El emulador de Google no tiene las capas de ahorro de batería que son la causa número uno de fallos, y en el emulador no existe la prueba que de verdad importa: dejar el teléfono quieto ocho horas. Este punto no es negociable — es el mismo tipo de fallo que la app ya sufrió con las notificaciones sin red, que solo se vio en device.

  **Qué comprar, si hay que elegir uno solo: un Samsung de la serie A.** Dos razones, y la segunda es la que no se ve venir: es de las marcas más extendidas en México, así que cubre a mucha gente; y trae de fábrica su función de "poner a dormir las apps que no usas", que es lo bastante agresiva como para ser una prueba de verdad y no un trámite. Si más adelante hubiera presupuesto para un segundo, un Redmi barato — Xiaomi es el más hostil de todos con las apps en segundo plano, y lo que pase ahí es el peor caso.
- **No partir de `main`.** Está en la PWA vieja de 932 líneas. Todo sale de `refactor/modularizacion`.

---

## 6. Evidencia y método

Todo lo de arriba se comprobó leyendo: `package.json`, `capacitor.config.json`, `CLAUDE.md`, los 66 archivos de `src/`, el parche de iOS, el `AndroidManifest.xml` y el código Java de `@capacitor/local-notifications` en `node_modules`, y las nueve carpetas `android/` de los plugins instalados. Las reglas de Google Play (API 36, prueba cerrada) se verificaron contra la documentación vigente a septiembre de 2026, porque rotan cada año y un número de memoria habría sido falso.

Lo que **no** está verificado y hay que confirmar antes de fechar nada: el tipo de cuenta de Google Play (personal o empresa), que decide si aplica la prueba de 12×14 días.
