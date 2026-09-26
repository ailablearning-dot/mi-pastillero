# PRD — Mi Pastillero para Android

**Versión:** 1.0 · **Escrito:** 2026-09-21 · **Última actualización:** 2026-09-25 · **Base técnica:** `ANALISIS.md`, en esta misma carpeta.

---

## 0. Dónde vamos (al 2026-09-25)

Cinco días. **Las fases 0 y 1 están cerradas. La 2 —la que decide el proyecto— está construida y
depende de UNA sola cosa: pasar una noche entera de verdad.**

| # | Fase | Estado | Qué falta |
|---|---|---|---|
| **0** | Cuenta, teléfono y arranque | ✅ **Hecha** | — |
| **1** | Que se vea bien | ✅ **Hecha** | — |
| **2** | Que avise ⚠️ | 🟡 **Construida; la prueba de la noche PENDIENTE DE REPETIR** | Una noche con el teléfono solo (ver abajo) y la decisión D3 |
| **3** | Que cobre | ⬜ **Sin empezar** | Clave de RevenueCat para Android, productos en Play |
| **4** | Que entre | 🟡 **Google y biometría construidos** | Probar Google en el A06; cliente OAuth de *Play App Signing* |
| **5** | Los flecos | 🟡 **A medias** | Compartir y Excel sin verificar |
| **6** | Tienda | 🟡 **Ficha lista, dos declaraciones bloqueadas** | Cuenta demo en prod y `borrar-cuenta.html` en `gh-pages` |

### ⚠️ Lo más importante que pasó, y fue un error mío

**El 2026-09-24 di la prueba de la noche (CA-1.2) por superada. No lo estaba.**

Las alarmas se programaban con `setExact(AlarmManager.RTC)` — exactas, pero **incapaces de
despertar el teléfono**. El plugin solo usa `RTC_WAKEUP` si se le pasa `allowWhileIdle`, y nunca
se lo pasamos: `schedule: { at }` a secas, en las cuatro programaciones.

Lo que engañó: la dosis de las 10:00 llegó a las 10:00:02 y lo tomé como prueba de reposo profundo.
Pero José estaba **despierto y con el teléfono en la mano**: el aparato estaba activo y la alarma
no necesitó despertar a nadie. La de las **15:00, con el teléfono solo, se entregó a las 15:23:46**
— 24 minutos, con el broadcast llegando tarde AL SISTEMA, visible en logcat.

**La lección de método, que vale para todo el proyecto:** comprobé que la alarma estaba PUESTA con
cero holgura (`window=0`, `exactAllowReason=policy_permission`) y concluí que se ENTREGARÍA a
tiempo. No es lo mismo. El dato que lo delataba estaba en el mismo volcado: `type=RTC` en vez de
`type=RTC_WAKEUP`.

Arreglado en `a93b580` y verificado: todas las pendientes salen ya como `RTC_WAKEUP`.
**La prueba hay que repetirla, y esta vez sin tocar el teléfono por la mañana.**

### Lo que está en verde con evidencia del sistema, no de palabra

Alarma exacta y **que despierta** (`type=RTC_WAKEUP`, `window=0`, `exactAllowReason=policy_permission`),
canal de alarma que suena en silencio (`usage=USAGE_ALARM`), alarma a pantalla completa sobre el
bloqueo (fotografiada, con `screenState` pasando a ON), biometría por huella de punta a punta,
modo oscuro, áreas seguras y botón atrás. La ficha de Play está "Lista para enviar a revisión" y el
`.aab` firmado está en el canal Alpha.

**Lo único que cuesta calendario sigue siendo el reloj de los 14 días**, y no ha arrancado: hacen
falta 12 probadores dentro de forma continua.

## 1. Por qué Android, y por qué ahora

En México —el mercado donde la app ya está publicada y donde vive su público— **Android es la abrumadora mayoría de los teléfonos**. La app existe hoy solo para iPhone, así que está compitiendo por la minoría del mercado que más caro cuesta ganar.

Y encaja con lo que ya sabemos del embudo (`project_metricas_embudo_monetizacion`): **atraer dejó de ser el problema** —las impresiones se multiplicaron por 4,6— y el estrangulamiento está en el toque sobre el resultado de búsqueda. Publicar en Play no arregla ese embudo, pero **le abre uno nuevo, mucho más ancho, al mismo producto ya construido y ya validado**, sin backend nuevo, sin datos que migrar y sin rediseñar una sola pantalla.

El momento es bueno por una razón concreta: la 2.0 acaba de cerrarse y el modelo de monetización ya está decidido y probado en device. Portar un producto estable es barato; portar uno que aún se está moviendo es pagar dos veces cada cambio.

---

## 2. Objetivo

**Publicar Mi Pastillero en Google Play para México y Costa Rica, con paridad funcional con la versión 2.x de iOS, en un solo repositorio y un solo `src/`.**

Paridad funcional significa: quien use la app en Android y en iPhone debe poder hacer **las mismas cosas**, aunque el sistema se las presente distinto. No significa que cada pantalla sea idéntica píxel a píxel — Android tiene botón atrás, canales de notificación y su propia tienda, y pelearse con eso solo produce una app que se siente extranjera en el teléfono.

### Lo que NO es este proyecto

- **No** es rediseñar la app. `docs/prototipos/prototipo-sin-muros.html` sigue mandando.
- **No** es cambiar el modelo de negocio, los precios ni el reparto gratis/premium.
- **No** es tocar `src/domain/` ni el esquema de la base de datos.
- **No** es resucitar la PWA. La web sigue como está.
- **No** es soportar tabletas ni Wear OS en la primera versión.

---

## 3. A quién va dirigida

La misma persona de siempre, que ahora tiene un Android: adulto que toma medicación a diario o cuida de alguien que la toma. Letra grande, pocos pasos, nada que configurar antes de servir para algo.

Dos perfiles nuevos que Android sí trae y que hay que atender explícitamente:

- **Quien viene del iPhone.** Ya tiene cuenta y puede tener suscripción. Al entrar con su cuenta debe encontrar **todos sus datos y su premium**, sin pagar otra vez. Si creó la cuenta con "Iniciar sesión con Apple", hoy no podría entrar — ver decisión D2.
- **Quien tiene un teléfono que mata las apps.** Xiaomi, Huawei, Oppo, Vivo. No es un caso raro: es una parte grande del parque en México. Si la app no le avisa, para esa persona la app no sirve, y lo dirá en una reseña.

---

## 4. Cómo sabremos si salió bien

Cuatro números, en orden de importancia:

1. **Recordatorios entregados a tiempo ≥ 99 %**, medido como notificación que suena en el minuto programado, en una matriz de dispositivos que incluya al menos un Xiaomi o Huawei real y un Samsung de gama media. Este es **el** número: si falla, los demás dan igual.
2. **Ninguna reseña en el primer mes que diga "no me avisó"**. Es la traducción del número 1 a lo que el usuario ve.
3. **Instalación → primer medicamento dado de alta ≥ 60 %**, comparable con iOS. Si baja mucho, algo del port está rompiendo el alta.
4. **Conversión a premium en un margen del ±30 % de la de iOS** al tercer mes. No tiene por qué igualarla —el público de Android paga distinto—, pero una diferencia mayor significa que el paywall o los precios están mal puestos, no que "Android es así".

---

## 5. Alcance de la versión 1.0 de Android

Todo lo que hay en la 2.x de iOS, con tres excepciones razonadas y una adición obligatoria.

### 5.1 Entra completo

Medicamentos con su pauta real (dosis por día, cantidad por hora, fracciones) · recordatorios con acciones Tomar y Posponer · agrupación de dosis del mismo minuto · varias personas · historial y calendario con el corte de 7 días del plan gratis · reportes y exportación a Excel · citas médicas con médicos y sus avisos · ficha de emergencia compartible como imagen · control de existencias de la caja · sesión anónima y paywall contextual · bloqueo biométrico · modo oscuro · funcionamiento sin conexión con cola de guardado.

### 5.2 Las tres excepciones

| Qué | Qué pasa en Android | Por qué |
|---|---|---|
| **Alertas Críticas** | Se sustituyen por un canal de alarma con importancia alta, que suena en silencio en la mayoría de teléfonos, más un permiso opcional para saltar el No Molestar | Android no tiene el concepto. Ver §3.C del análisis |
| **Volumen de la alerta** (4 niveles) | **Desaparece** de Ajustes en Android | El sistema no permite fijarlo por código: manda el deslizador del teléfono. Un ajuste que no hace nada es peor que no tenerlo |
| **Iniciar sesión con Apple** | Pendiente de decisión D2 | Solo existe como flujo web en Android |

### 5.3 La adición obligatoria

**Pantalla de fiabilidad de los avisos.** No existe en iOS y en Android no es opcional: es lo que separa una app que avisa de una que a veces avisa.

- Aparece **una sola vez**, después de dar de alta el primer medicamento — no antes: pedir permisos a quien todavía no sabe para qué sirve la app es la forma más rápida de que diga que no.
- Pide, en este orden: permiso de notificaciones, exención de ahorro de batería y —solo si el usuario quiere que suene en silencio— el permiso de No Molestar.
- Si el teléfono es de una marca con capa propia, enseña **las instrucciones de esa marca y solo de esa**.
- Se puede volver a ella desde Ajustes, y avisa en el inicio si algún permiso se perdió.
- **Copy:** se dice **una vez** y se calla, según la regla de `feedback_menos_explicacion_mas_confianza`. Nada de tres párrafos justificando por qué hace falta el permiso.

---

## 6. Requisitos, con sus criterios de aceptación

Cada requisito tiene un criterio que se puede probar en un teléfono. Un criterio que no se puede probar no es un criterio.

### RF-1 · Los recordatorios suenan a su hora

- **CA-1.1** — Una dosis programada a 15 minutos vista suena en el minuto exacto con la pantalla apagada y el teléfono en Doze forzado (`adb shell dumpsys deviceidle force-idle`). Es la prueba rápida, la de iterar mientras se construye.
- **CA-1.2** — **La prueba de la noche entera**, en teléfono real y sin `adb`: dosis a las 09:00, app **cerrada del todo**, ahorro de batería **activo**, teléfono quieto y con la pantalla apagada desde las 23:00. Suena a las 09:00. Esta prueba no la sustituye ninguna simulación: el Doze forzado entra en reposo, pero no reproduce las ocho horas de inactividad que son justo lo que disparan las capas de ahorro del fabricante.
- **CA-1.3** — La misma prueba de CA-1.2 **repetida tras reiniciar el teléfono**, sin volver a abrir la app en ningún momento.
- **CA-1.4** — Cada medicamento suena con **su** sonido elegido, verificado con los 7 sonidos.
- **CA-1.5** — Dos dosis del mismo minuto producen **una** notificación agrupada, como en iOS.
- **CA-1.6** — Las acciones Tomar y Posponer aparecen y funcionan desde la notificación, con la app cerrada.
- **CA-1.7** — Marcar una dosis como tomada cancela su notificación y la de su posponer.
- **CA-1.8** — **Sin conexión, los recordatorios ya programados no se borran.** Es la regresión que ya ocurrió una vez; se prueba con el modo avión puesto durante todo un ciclo de arranque.
- **CA-1.9** — Programar los avisos de las citas no borra los de las dosis, ni al revés.

> **Las tres primeras se corren en un teléfono comprado para esto, no en el emulador.** El emulador de Google no trae las capas de ahorro de batería de los fabricantes, que son la causa número uno de recordatorios perdidos. Ver §7, fase 0.

### RF-2 · Suena aunque el teléfono esté en silencio

- **CA-2.1** — Con el timbre en silencio, un recordatorio suena por el canal de alarma en un Pixel y en un Samsung.
- **CA-2.2** — Con No Molestar activo y el permiso concedido, suena. Sin el permiso, no suena pero **la app lo dice en Ajustes** en vez de prometer algo que no cumple.
- **CA-2.3** — El usuario puede desactivarlo, y entonces los avisos pasan a un canal normal.

### RF-3 · La app se siente de Android

- **CA-3.1** — El botón/gesto atrás cierra el modal o vuelve a la pantalla anterior en **todas** las pantallas y modales. Solo cierra la app desde el inicio, y pidiendo confirmación.
- **CA-3.2** — No hay contenido bajo la barra de estado ni bajo la barra de navegación, en gestos y en tres botones, en Android 12 a 16.
- **CA-3.3** — Con la letra del sistema al máximo, ninguna pantalla se desborda ni deja texto cortado.
- **CA-3.4** — El teclado no tapa el campo que se está escribiendo en ninguno de los tres formularios.
- **CA-3.5** — El icono se ve correcto como icono adaptativo, incluido recortado en círculo.

### RF-4 · Pagar y recuperar lo pagado

- **CA-4.1** — Los tres planes se ven con su precio local y se compran desde el paywall.
- **CA-4.2** — Quien compró en iPhone **y entra con su cuenta** tiene premium en Android al instante, sin pagar.
- **CA-4.3** — Restaurar compras sin nada que restaurar ofrece entrar a la cuenta, no un error.
- **CA-4.4** — "Gestionar suscripción" abre la pantalla de Google Play, no la de Apple.
- **CA-4.5** — Sin conexión, un usuario premium **no ve el paywall**: se respeta el último estado conocido.

### RF-5 · Entrar

- **CA-5.1** — Correo y contraseña, registro con código de 6 dígitos y recuperación por código funcionan igual que en iOS.
- **CA-5.2** — Google nativo funciona con el paquete **firmado por Play**, no solo en depuración.
- **CA-5.3** — La sesión sobrevive a cerrar y reabrir la app y a reiniciar el teléfono.
- **CA-5.4** — El bloqueo biométrico usa huella o cara según el teléfono, y **ningún texto dice "Face ID"**.

### RF-6 · Compartir y exportar

- **CA-6.1** — El Excel de dos hojas se genera y se comparte por WhatsApp y por correo.
- **CA-6.2** — La ficha de emergencia se comparte como **imagen**, no como texto.

### RNF — No funcionales

- **RNF-1** — Arranque en frío a pantalla usable en menos de 3 segundos en un teléfono de gama media de 2022.
- **RNF-2** — Android 8 (API 26) como mínimo, API 36 como objetivo. Android 8 es el suelo por debajo del cual los canales de notificación no existen y el parque es residual.
- **RNF-3** — Un solo `src/`, sin bifurcar componentes por plataforma. Las diferencias viven en `src/lib/` detrás de `Capacitor.getPlatform()`.
- **RNF-4** — Las 529 pruebas de `src/domain/` siguen en verde sin modificarse. Si una se cae, el port se metió donde no debía.
- **RNF-5** — La app funciona sin conexión con la misma cola de guardado optimista que iOS.

---

## 7. El plan

Siete fases. Las tres primeras son las que deciden si el proyecto es viable; si la 2 sale mal, todo lo demás sobra.

| # | Fase | Qué deja hecho | Esfuerzo |
|---|---|---|---|
| **0** | **Cuenta, teléfono y arranque** | Cuenta de Play abierta **y los 12 probadores metidos en la prueba cerrada el mismo día**, teléfono de QA comprado, `npx cap add android`, la app compila y arranca | 1–2 días (+ el pedido del teléfono) |
| **1** | **Que se vea bien** | Borde a borde y las 28 `env(safe-area-inset-*)`, botón atrás en todas las pantallas, teclado, escala de fuente, icono adaptativo | 3–5 días |
| **2** | **Que avise** ⚠️ | Canales por sonido, `.mp3` a `res/raw/`, permisos de notificación y alarma exacta, parche del plugin para el canal de alarma, acciones, pantalla de fiabilidad, pruebas en device real | 5–8 días |
| **3** | **Que cobre** | Clave de RevenueCat por plataforma, productos en Play, gestión de suscripción, cruce iOS↔Android | 3–4 días |
| **4** | **Que entre** | Google nativo con las dos huellas SHA-1, decisión de Apple, biometría, copy sin "Face ID" | 2–3 días |
| **5** | **Los flecos** | Compartir, Excel, ficha, reseña de Play, ajustes del sistema, Service Worker fuera en nativo | 2 días |
| **6** | **Tienda** | Seguridad de los datos, declaración de alarmas exactas, app de salud, borrado de cuenta por web, capturas de Android, ficha | 3–4 días |

**Trabajo efectivo: 4 a 6 semanas.** El calendario real puede ser mayor por dos esperas que no dependen de nosotros: la prueba cerrada de 14 días y la revisión de Play.

**La fase 0 va primero por una razón concreta:** si la cuenta es personal, el reloj de los 14 días de prueba cerrada empieza el día que subas el primer paquete a un canal de pruebas. Ese paquete puede ser una app a medio hacer. Empezar ese reloj el primer día y no el último **ahorra dos semanas de calendario**, y no cuesta nada.

---

## 8. Riesgos

| Riesgo | Si pasa | Qué hacemos |
|---|---|---|
| **Play rechaza la justificación de alarmas exactas** | No hay app: sin alarma exacta este producto no existe | Redactar la justificación desde la fase 0 y tenerla lista antes de construir nada. Un pastillero es el caso de uso de manual para ese permiso |
| **Un fabricante mata los avisos pese a la exención** | Reseñas de una estrella y la promesa rota | Probar en device real de esa marca en la fase 2, no al final. Si no se puede garantizar en una marca, decirlo **en la ficha de Play**, no descubrirlo el usuario |
| **La prueba cerrada de 12×14 se descubre tarde** | Dos semanas de retraso sobre una fecha ya dicha | Resolverlo el primer día (fase 0) |
| **La escala de fuente del sistema rompe los diseños** | Justo para el público objetivo, que la lleva subida | Probarlo en la fase 1, no dejarlo para el final |
| **El parche del plugin de notificaciones se rompe al actualizar Capacitor** | Silencioso y peligroso: los avisos dejan de ser alarma sin que nadie lo note | `patch-package` ya está en el proyecto. Añadir un caso de prueba manual de "suena en silencio" al checklist de cada versión |

---

## 9. Decisiones que te toca tomar

Cuatro. Las dos primeras bloquean la fase 0; las otras dos pueden esperar a su fase, pero no más.

**D1 · Cuenta de Google Play — ✅ DECIDIDO (2026-09-22): cuenta personal, abierta ya, y los 12 probadores desde el primer día.**
No hay cuenta todavía; se abre una **personal** con el Gmail existente ($25, una vez). Eso activa la prueba cerrada de 12 probadores durante 14 días continuos, y **se acepta a propósito**: esos 14 días corren **en paralelo** con las 4–6 semanas de desarrollo, así que no cuestan calendario **si la prueba se abre el primer día** con un paquete a medio hacer. La cuenta de empresa se descarta: exime de la prueba, pero su verificación con entidad legal puede tardar más que los 14 días que ahorra.
El coste real no es el dinero ni la espera: son **12 personas con cuenta de Google que se metan en la prueba y NO se salgan**. Tienen que estar dentro de forma continua los 14 días previos al día que pidas publicar; quien entra y sale, no cuenta. Empezar a juntarlas hoy (Karen, familia, las testers de iOS) es parte de la fase 0, no del final.

**D2 · "Iniciar sesión con Apple" en Android — ✅ DECIDIDO (2026-09-22): no se soporta en la 1.0, con salida para quien lo necesite.**
No se construye el flujo web con deep link. A cambio, en la pantalla de entrada de Android, quien tenga su cuenta creada con Apple puede **establecer una contraseña con el código de 6 dígitos que llega a su correo** — el mismo flujo de recuperación que la app ya tiene construido y probado en producción. La única pieza nueva es el texto que le dice a esa persona qué hacer, para que no se quede mirando una pantalla que le pide una contraseña que nunca tuvo.

**D3 · ¿Qué hacemos con el ajuste de volumen de las alertas? — 🟡 EJECUTADO, SIN DECIDIR FORMALMENTE.**
**Recomendación: quitarlo en Android y dejar un solo interruptor, "Sonar aunque el teléfono esté en silencio".** Android no deja fijar el volumen por código; un deslizador que no mueve nada es peor que no tenerlo.
En Ajustes ya se sustituyó el deslizador por un atajo al volumen del sistema, que es la recomendación aplicada. Falta confirmarlo como decisión y revisar si las dos secciones de avisos deberían ser una sola.

**D4 · Precios en Google Play.**
**Recomendación: los mismos que en App Store**, en los mismos tres periodos. Cambiar dos variables a la vez —plataforma y precio— hace imposible saber cuál explica el resultado, y el modelo de precios ya se decidió a la paridad de la competencia.

---

## 10. Nota sobre las ramas — ✅ RESUELTO

Estos documentos se escribieron en una worktree que salió de `main` (la PWA vieja). Ya está
corregido: el trabajo vive en **`feature/android`, sacada de `refactor/modularizacion`**, que es
donde está la 2.x. El `.env` de esta worktree apunta a **dev** — el de la copia principal sigue en
**prod**, y hay que devolverlo antes de compilar para la tienda (ver `project_env_apunta_a_prod`).

## 11. La pantalla que no estaba en este PRD

La **pantalla de permisos** ("Para que el aviso te llegue siempre") no aparece en el alcance de
arriba porque cuando se escribió no sabíamos que haría falta una pantalla entera. Existe por RF-1 y
por el riesgo de "un fabricante mata los avisos": es lo único que separa una app que avisa de una
que a veces avisa.

Se construyó **con prototipo previo** (`docs/prototipos/permisos-android.html`) y se verificó en el
Galaxy A06. Dos filas que se tocan, una tercera que solo aparece cuando las dos primeras están
concedidas, y una fila por marca con los pasos detrás del toque.

⚠️ **Las instrucciones de Xiaomi, Huawei, Oppo y Vivo NO están verificadas.** Las de Samsung sí, y
el resultado obliga a desconfiar de las otras: de tres pasos escritos desde la documentación
oficial y dontkillmyapp.com, **fallaban los tres**. Mientras no haya un teléfono de esa marca a
mano, no se pueden dar por buenas.


---

## 12. La segunda cosa que no estaba en este PRD: que el aviso SE VEA

El PRD daba por hecho que un recordatorio que **suena** es un recordatorio que **llega**. No es lo
mismo, y lo enseñó el propio teléfono de QA el 2026-09-24: la dosis de las 10:00 sonó, y José tuvo
que desbloquear el móvil y buscarla en la lista para saber de qué era.

**La causa no era la app.** Samsung deja elegir cómo se ven las notificaciones en la pantalla de
bloqueo, y una de las opciones —la que traía ese teléfono— es **"Sólo ícono"**: un recordatorio de
medicación queda reducido a un punto de cinco milímetros entre otros cuatro.

Lo grave es lo que viene después: **ese ajuste no se puede consultar desde una app**. Vive en el
editor de la pantalla de bloqueo, no en un `setting` legible. O sea que no basta con avisar de que
está mal puesto, porque ni siquiera podemos saberlo.

**Por eso se añade la alarma a pantalla completa** (`USE_FULL_SCREEN_INTENT`). Se salta el estilo
entero: el sistema enciende la pantalla y muestra la dosis encima del bloqueo, como una llamada
entrante. Solo actúa con la pantalla apagada o bloqueada; con el teléfono en uso, Android la
degrada sola a un aviso normal.

Dos decisiones que merecen quedar escritas:

 · **Abre una pantalla propia, no la app.** El primer intento apuntaba a `MainActivity` y dejaba la
   lista completa de medicamentos y de personas a la vista de cualquiera que cogiera el teléfono
   sin desbloquearlo. `AlarmaActivity` enseña UNA dosis y dos botones.
 · **Pero dispara el PendingIntent de la notificación**, no uno nuevo. Con un intent propio la
   persona aterrizaba en la lista del día sin la pregunta de marcar o posponer: el aviso interno
   que dice QUÉ dosis es viaja dentro del intent de la notificación.

⚠️ **Riesgo de tienda, nuevo:** Play reserva `USE_FULL_SCREEN_INTENT` a apps de alarma y llamadas y
lo revisa. Encaja con la declaración de alarmas exactas ya enviada como "Despertador", pero es un
punto más donde la revisión puede pararse.

### Criterio de aceptación añadido

**CA-1.4 · El aviso se lee sin desbloquear.** Con el teléfono bloqueado y la pantalla apagada, al
llegar la hora de una dosis la pantalla se enciende y se lee el nombre del medicamento sin tocar
nada. Al pulsar "Abrir Mi Pastillero" aparece la pregunta de marcar o posponer **de esa dosis**.
*Verificado en el A06 el 2026-09-25, con captura.*
