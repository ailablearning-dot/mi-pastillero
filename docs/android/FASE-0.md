# Fase 0 — Arranque

**Estado:** en curso desde 2026-09-22 · Rama de trabajo: **`feature/android`**, sacada de `refactor/modularizacion` (`ac46975`).

La fase 0 tiene dos mitades que corren en paralelo: **la tuya** (cuenta, probadores, teléfono, herramientas) y **la mía** (el proyecto Android dentro del repo). La tuya es la que manda el calendario, porque arranca relojes que no se pueden acelerar después.

---

## Lo que te toca a ti

### 1. Instalar las herramientas ⛔ *me bloquea a mí*

Esta Mac no puede compilar Android todavía. Comprobado hoy:

| Qué | Estado |
|---|---|
| Node v24.3.0 | ✅ sobra (Capacitor 8 pide 22+) |
| Java | ❌ solo tienes la **1.8**, de 2014. Android Gradle pide **17 o 21** |
| Android Studio | ❌ no está instalado |
| SDK de Android, `adb`, emulador | ❌ no existen |

**Con instalar Android Studio se arregla todo de golpe**, porque trae su propio Java 21 dentro y el resto se baja desde su asistente. No hace falta que toques la Java 1.8 que ya tienes: no se pisan.

1. Descarga Android Studio de `developer.android.com/studio` (~1,2 GB) e instálalo.
2. Ábrelo y deja correr el asistente de primer arranque, que baja el SDK y acepta las licencias.
3. En **SDK Manager**, asegúrate de tener marcado **Android 16 (API 36)** — es el nivel al que Google Play obliga a apuntar desde el 31 de agosto de 2026.
4. En **Device Manager**, crea un emulador con API 36. Sirve para el 90 % del trabajo; el 10 % que importa se prueba en el teléfono de verdad.

Cuando termines, dímelo y sigo: compilo, sincronizo y lo arranco.

### 2. Abrir la cuenta de Google Play ⏰ *arranca el reloj de los 14 días*

- Cuenta **personal** con tu Gmail, $25 una sola vez, en `play.google.com/console/signup`.
- Verificación de identidad: piden documento. **Puede tardar unos días**, así que cuanto antes empiece, mejor.
- Nombre de desarrollador: **el mismo que usas en App Store**. Dos nombres distintos para la misma app confunde a quien busca y resta en las reseñas.

### 3. Juntar a los 12 probadores ⏰ *es el cuello de botella real*

No es un trámite: es **la condición para poder publicar**. Doce personas con cuenta de Google, metidas en la prueba cerrada, que sigan dentro **de forma continua los 14 días anteriores** al día que pidas publicar. Quien entra y se sale, no cuenta, y el contador de esa persona vuelve a cero.

- Empieza la lista hoy: Karen, familia, las testers del iPhone que tengan también un Android, quien sea.
- **Necesitas el correo de Gmail de cada una.** Eso es lo que se mete en la consola.
- Junta **14 o 15**, no 12 justos. Alguien se va a salir o va a cambiar de teléfono, y quedarte en 11 el día de pedir publicación significa esperar 14 días más.
- En cuanto tenga un paquete que arranque —aunque esté a medio hacer— lo subo al canal de pruebas cerradas y el reloj empieza a correr en paralelo al desarrollo. Ese es el truco que hace que estas dos semanas no cuesten calendario.

### 4. Comprar el teléfono de QA

Un **Samsung de la serie A** (A16, A26 o similar, gama media baja). Dos razones: es de las marcas más extendidas en México, así que cubre a mucha gente; y trae de fábrica su función de *poner a dormir las apps que no usas*, lo bastante agresiva como para ser una prueba de verdad.

No corre prisa para empezar — hace falta en la **fase 2**, cuando toque probar que los avisos suenan de noche con la app cerrada. Pero pídelo ya para que esté aquí cuando llegue ese momento.

---

## La justificación de las alarmas exactas

Play te va a pedir, en **Contenido de la aplicación → Permiso de alarmas exactas**, que declares por qué usas `USE_EXACT_ALARM`. Si esa declaración se rechaza, no hay app: sin alarma exacta este producto no existe. Conviene tenerla escrita antes de construir nada, no improvisarla el día del envío.

**Texto listo para pegar (español):**

> Mi Pastillero es una aplicación de recordatorios de medicamentos. Su función principal y única es avisar a la persona en el momento exacto en que debe tomar cada dosis, según la pauta que el usuario configura para cada medicamento.
>
> La hora exacta no es una preferencia de presentación: es el propósito del producto. Muchos tratamientos requieren intervalos estrictos (cada 8 horas, cada 12 horas) y un aviso que el sistema retrase o agrupe con otros deja de cumplir su función: una dosis avisada con retraso es una dosis mal tomada o saltada. Nuestros usuarios son en su mayoría personas mayores y cuidadores que dependen de este aviso como único recordatorio.
>
> La aplicación no usa alarmas exactas para ninguna otra finalidad: no muestra publicidad, no sincroniza datos en segundo plano ni realiza tareas diferidas con ellas. Cada alarma programada corresponde a una dosis o a una cita médica que el propio usuario ha registrado.

**Misma justificación en inglés** (la revisión suele leerse en inglés):

> Mi Pastillero is a medication reminder app. Its sole core function is to alert the user at the exact time each dose is due, following the schedule the user sets for every medication.
>
> Exact timing is not a presentation preference: it is the purpose of the product. Many treatments require strict intervals (every 8 hours, every 12 hours), and a reminder that the system delays or batches no longer serves its function — a late reminder is a missed or mistimed dose. Our users are mostly older adults and caregivers who rely on this alert as their only reminder.
>
> The app does not use exact alarms for any other purpose: no advertising, no background sync, no deferred work. Every scheduled alarm corresponds to a dose or a medical appointment the user has entered.

---

## Lo que me toca a mí

- [x] Rama `feature/android` creada sobre `refactor/modularizacion`, con los documentos
- [x] Dependencias instaladas y `.env` apuntando a **dev** (ver nota abajo)
- [x] `@capacitor/android` 8.3.1 añadido y `npx cap add android`: **los 9 plugins resueltos para Android**, ninguno hay que sustituir
- [x] `applicationId` `com.mipastillero.app`, nombre "Mi Pastillero", `versionName` 2.2.0 a la par de iOS
- [x] `minSdk` **26** (por debajo no existen los canales de notificación) y `targetSdk` **36**, que es lo que Play exige
- [x] `USE_EXACT_ALARM` y `SCHEDULE_EXACT_ALARM` en el manifest, con el porqué escrito al lado
- [x] `adjustResize` para que el teclado no tape los campos
- [x] SDK de Facebook fuera (`socialLogin.facebook.include=false`)
- [x] **Compila**: `./gradlew assembleDebug` en verde, APK de 14 MB, 365 tareas, los 9 plugins dentro
- [x] **Arranca** ✅ 2026-09-22 — emulador `Pastillero_API36` (Android 16, arm64), app instalada y
      abierta en la pantalla de bienvenida del modelo sin muros. `versionName=2.2.0 minSdk=26
      targetSdk=36`, **cero crashes** en el log y ni un error de la app (el único `chromium: E` es
      un componente interno del WebView del emulador, no nuestro).

### El `.env` de esta rama apunta a DEV, a propósito

La copia que traje apuntaba a **producción** —se cambió el 2026-08-24 para compilar la 2.0 de la
tienda y ahí se quedó—, así que la cambié a dev en **esta worktree solamente**. Tu copia de
`/Users/jmontero/PP/mi-pastillero` sigue en producción y tus envíos a App Store no se enteran de
nada. Desarrollar Android contra la base de los usuarios reales es exactamente lo que la etiqueta
ámbar de Ajustes existe para evitar, y aquí vamos a crear cuentas y medicamentos de prueba a
puñados.

### Las dos dudas de la primera compilación: resueltas ✅

1. **Apagar Facebook no rompe nada.** `capgo-capacitor-social-login:assembleDebug` compiló contra
   sus stubs. El SDK de Facebook no viaja en el APK.
2. **`minSdk` 26 no choca con ninguno de los 9 plugins.** Ni un aviso.

### El Java: el tropiezo de la primera compilación

Android Studio 2026.1 trae dentro un **Java 25**, y Gradle 8.14 —el que usa la plantilla de
Capacitor 8— no lo entiende: la compilación muere con `Unsupported class file major version 69`
antes de empezar. No es un fallo del proyecto, es la combinación de versiones.

Arreglado instalando un **JDK 21** (`brew install openjdk@21`, sin `sudo`) y fijándolo en
`android/gradle.properties` con `org.gradle.java.home`. Está escrito en el archivo, y no como
variable de entorno, para que valga igual desde la terminal y desde Android Studio — si no, la
compilación funciona en una y falla en la otra, que es de los ratos más tontos que se pueden perder.

⚠️ **Esa línea lleva una ruta de esta máquina.** Si el repo se clona en otra, hay que cambiarla o
borrarla y fijar el "Gradle JDK" en los ajustes de Studio. Está avisado en un comentario al lado.

### Lo que instalé en tu máquina

Para que quede constancia y se pueda deshacer: `openjdk@21` por Homebrew, en `/opt/homebrew`, sin
`sudo` y sin tocar el Java 1.8 que ya tenías. Se va con `brew uninstall openjdk@21`.

---

## Lo que NO se hace en la fase 0

Que quede dicho, para que no parezca que falta: en esta fase la app **no va a avisar bien**, no va a cobrar y se va a ver mal en los bordes. Los canales de notificación son la fase 2, los pagos la 3 y el borde a borde la 1. La fase 0 termina cuando la app **arranca** en un Android y enseña su primera pantalla. Nada más, y ya es bastante.


---

## Fase 0: CERRADA (la mitad técnica)

La app compila y arranca en Android. Lo que queda de la fase 0 es tuyo y corre en paralelo: la
cuenta de Play, los 12 probadores y el teléfono.

### Sobre el borde a borde (corregido en la fase 1)

Al ver la primera captura di por hecho que la app dibujaba bajo las barras del sistema. **No es
así**, y se comprobó midiéndolo en la fase 1: Capacitor 8 encaja el WebView DENTRO de las barras
(2276 px de los 2400 de la pantalla; los otros 124 son las barras), así que no hay solape que
arreglar y los márgenes de área segura valen 0 con razón. El detalle está en `FASE-1.md`.

### Un requisito de Play que apareció montando el emulador

Al elegir la imagen del sistema, el asistente ofrece una variante de **16 KB Page Size**. No es un
detalle del emulador: Google Play exige que las apps nuevas funcionen con ese tamaño de página, y
nuestro APK lleva librerías nativas de terceros (RevenueCat, biometría, login social). **Hay que
compilar y arrancar sobre esa imagen antes de enviar**, y si alguna librería no lo soporta, se
descubre ahí y no en la revisión. Pendiente para la fase 6.