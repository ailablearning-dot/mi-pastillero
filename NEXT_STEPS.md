# Próximos pasos — Mi Pastillero

> ⚠️ **Todo lo que hay por debajo de la sección "2.0" es de la 1.0/1.1 y se conserva como
> historial.** La 1.1 ya está publicada. El plan vigente es el de aquí arriba.

---

# 🎯 2.0 — el modelo sin muros

Rediseño **aprobado** en el prototipo `docs/prototipos/prototipo-sin-muros.html` (17 pantallas,
4 flujos, cada una con su razonamiento). Las decisiones de fondo están en la memoria del
proyecto: `project_modelo_monetizacion_v2`.

**El problema que resuelve, con los números de la 1.1:** 287 instalaciones en 28 días, 16 cuentas
creadas, **11 de esas 16 sin un solo medicamento**, 1 suscripción. No hay problema de atracción
—la ficha convierte al 34,8 % y entran 7-10 descargas diarias sin publicidad— sino de los
**primeros treinta segundos**: hoy se pide cuenta y acto seguido se cobra, antes de que nadie
haya visto una pastilla.

**Las cuatro reglas del modelo nuevo:**
1. **Se entra sin registro.** Sesión anónima de Supabase; la cuenta se pide **al comprar**.
   Registro para poder pagar, no para poder probar.
2. **Lo premium se ve velado con candado, nunca oculto.** "Ver, no usar".
3. **La prueba de 7 días arranca al tocar algo premium**, no al abrir la app.
4. **Tres puertas con candado en el Home** (avatar → varias personas, tarjeta → historial,
   pestaña → citas) y las tres llevan a la MISMA hoja de pago.

## El reparto: qué es gratis y qué es de pago

| GRATIS (el motor del hábito) | PREMIUM (mi historia y mi futuro) |
|---|---|
| Medicamentos **ilimitados**, una persona | Varias personas (multipaciente) |
| Recordatorios completos | Historial completo + adherencia + Excel |
| Historial de los **últimos 7 días** | Citas médicas con recordatorios |
| **Ficha de emergencia** (la joya, y va gratis a propósito) | "Mi salud": medicamentos ampliados y receta |
| Ver lo premium, velado | Ficha en PDF para el médico |

La ficha de emergencia va gratis **a propósito**: multipaciente —lo más fuerte de la ola— no
vale nada para quien no cuida a nadie, y la ficha y el PDF son las que sí le hablan al paciente
solo. Como se alimenta de alergias y condiciones, **capturarlas también es gratis**.

## ✅ Ya construido (rama `refactor/modularizacion`, sin publicar)

- **Modularización** de `App.jsx` (3723 → 537 líneas). Era el paso previo a todo esto.
- **Citas médicas completas**: dominio con pruebas, avisos con espacio de nombres propio,
  pantalla, formulario, combobox de médicos y pestaña. Migraciones 008 y 009 corridas en dev y prod.
- **Medicamentos ampliados, la mitad**: tipo, cantidad fraccionaria, días de la semana, nota
  (006) y suspender (007).
- **Tabla `medicos`** y su combobox (hoy solo enganchado al formulario de citas).
- Multipaciente, reportes/Excel e historial completo: **ya existían**; hoy están sepultados
  detrás de los dos muros, que es justo lo que esta versión desentierra.
- 224 pruebas del dominio en verde.

## ⬜ Lo que falta para la 2.0

### A · Gratis — quitar los muros (es el corazón del cambio)
1. **Sesión anónima de Supabase** al primer arranque, sin pantalla de registro.
   - ⚠️ **Lo delicado no es crearla, es CONVERTIRLA.** Al comprar hay que promover el usuario
     anónimo a uno con correo sin perder sus datos. Si en vez de convertir se crea una cuenta
     nueva, el usuario pierde todo lo capturado justo en el momento en que paga.
   - ⚠️ Necesita **red** en el primer arranque. Es el punto débil del diseño y el mismo tipo de
     bug que costó estabilizar la 1.1: hay que reintentar en segundo plano reusando la cola.
   - ⚠️ **Anónimo que borra la app = fila huérfana.** Ofrecer cuenta al tercer día sin bloquear,
     y un job que limpie las abandonadas.
2. **Ficha de emergencia** + captura de alergias y condiciones (pantalla nueva; se autocompone
   con los medicamentos ya capturados).
3. **Corte de 7 días** en el historial del plan gratis, **visible en el calendario** — que se
   entienda como un límite del plan, no como un error.
4. **Pestaña "Mi salud"**. Hoy la barra es *Hoy · Calendario · Citas · Reportes · Ajustes*; el
   prototipo pide *Hoy · Mi salud · Citas · Ajustes*. Hay que decidir dónde queda Calendario y
   Reportes (probablemente dentro de "Mi salud").

### B · Premium — la monetización nueva
5. **Quitar el muro duro.** Hoy `App.jsx` hace `if (!hasPremium) return <Paywall/>`: todo o nada.
   Hay que sustituirlo por **gating contextual** con las tres puertas y el velo con candado.
6. **La prueba de 7 días arranca al tocar premium**, no al abrir.
7. **Registro movido al final del embudo** (al comprar).
8. **Poner el gate a Citas**, que hoy va abierta a propósito porque el modelo no existía.
9. **Plan mensual**: fijar precio. Criterio ya acordado: que el anual ahorre **50-60 %** contra
   doce mensualidades.
10. **La pantalla de detalle del medicamento** — los puntos 10 y 12 son LA MISMA PANTALLA
    («El detalle, con la receta» en el prototipo), dentro de *Mis medicamentos* → *Mi salud*.
    Separarlos en el plan fue un error de este documento: se construyen juntos o se toca la misma
    pantalla tres veces. Lleva tres cosas:
    - **«¿Para qué lo tomas?»** (`para_que`) — en palabras del paciente; es lo que alimenta la
      ficha de emergencia.
    - **«¿Quién te lo indicó?»** (`medico_id`) — vínculo a un registro, no texto libre.
    - **Foto de la receta** — el papel que te dieron en el consultorio.

    De las tres, **las dos primeras son casi regalo**: las columnas ya existen (migración 008) y
    el combobox de médicos ya está construido para citas; solo hay que engancharlos a `PillForm`.
    La foto es la única que trae obra nueva (Supabase Storage).

    Sobre la foto, dos condiciones de alcance que vienen del prototipo:
    - **Es un CAMPO del medicamento, no un módulo de documentos.** Una foto colgada del
      medicamento: sin carpetas, sin categorías, sin visor, sin buscador. En cuanto se vuelve
      «gestor de documentos» te comes la Ola 3 entera por adelantado.
    - **Comprimir en cliente** (~1600 px + JPEG 70 %): una foto de iPhone son 3-5 MB y comprimida
      ~300 KB. **El argumento cambió**: el proyecto está en **plan Pro**, así que no hay un muro
      de 1 GB cerca — es control de coste (más de 10× en la factura), no supervivencia.
11. **Ficha médica en PDF**. Barata: ya existe la plomería de `xlsx` + `@capacitor/share` +
    `@capacitor/filesystem` del Excel de Reportes.
12. ~~Completar medicamentos ampliados en `PillForm`~~ → **fusionado con el punto 10**: es la
    misma pantalla. Se deja el número para no renumerar el resto.

13. **Correo transaccional en producción — verificar qué SMTP está usando.**
    - **Comprobado el 2026-08-18:** el camino de correo **funciona hoy** en prod (4 usuarios
      dados de alta por correo, los 4 confirmados) y **las dos Edge Functions están ACTIVAS**,
      incluida `notify-password-changed`, que usa Resend. Esa parte del pendiente de julio ya
      estaba hecha aunque este archivo la daba por abierta.
    - **Lo que NO se puede ver desde fuera:** qué SMTP tiene configurado Auth en prod. Solo se ve
      en el dashboard (Authentication → Emails → SMTP Settings). **Hay que mirarlo.**
    - **Por qué importa:** si sigue con el servicio interno de Supabase, está limitado a unos
      pocos correos por hora y Supabase mismo dice que no es para producción. **El plan Pro NO
      levanta ese límite.** Y falla en silencio: el correo simplemente no llega.
    - **Por qué hoy no se ha notado:** el volumen es mínimo y está sesgado — de 16 altas, **9 son
      por Apple y 3 por Google**, y esas no mandan correo de confirmación. Solo 4 usuarios en
      toda la vida del proyecto han ejercitado el camino del correo.
    - ⚠️ **Cómo lo cambia el modelo nuevo, que no es lo obvio:** el plan gratis **no** sube los
      correos por delante — al contrario, con sesión anónima nadie se registra para probar, así
      que las confirmaciones en la instalación bajan a cero. El que sí los dispara es el
      **"ofrecer cuenta al tercer día"** (decisión abierta n.º 4): eso empuja a crear cuenta a
      mucha más gente que hoy, y cada una es un correo. Más los restablecimientos de contraseña
      conforme crezca la base.
    - Y el riesgo no es el promedio mensual, es el **pico**: el límite del servicio interno es
      por hora, así que un golpe de descargas tira correos sin avisar.
    - Ojo también con el techo siguiente: el plan gratuito de **Resend** ronda los 100 correos al
      día / 3.000 al mes. Conviene confirmar en qué plan está la cuenta antes de crecer.

### D · Descubrimiento y ayuda (decisión abierta, 2026-08-19)

Planteado por el usuario: *"quizás el paciente no sepa cómo hacer algo en la app — por ejemplo el
botón de gestionar pacientes está oculto en Ajustes"*. Es real, pero son **dos problemas y solo uno
se arregla con ayuda**.

**1. La mayoría de los "no sé cómo hacer X" son "esto está donde no me lo esperaba".** No se
arreglan documentando: se arreglan moviendo la acción a donde nace la necesidad. Quien piensa
"quiero agregar a mi mamá" está mirando el avatar del encabezado, no Ajustes. Es más barato que un
manual y no hay que mantenerlo. ✅ El primer caso (gestionar pacientes desde el selector) ya está
hecho; conviene repasar el resto de acciones con el mismo criterio.

**2. Para lo que quede, ayuda CONTEXTUAL, no un centro de ayuda.** Un índice tiene el mismo
problema de descubrimiento un nivel más abajo — de hecho ya existe una página de "Ayuda y soporte"
con preguntas frecuentes, enterrada en Ajustes, y nadie la encuentra. Lo que funciona con este
público es un **"?" en la cabecera de cada pantalla** que abra una hoja corta sobre ESA pantalla,
con tres o cuatro preguntas. La ayuda va donde estás.

**Cuándo: NO antes de esta versión.** De 16 cuentas, 11 nunca agregaron un medicamento: el cuello
de botella no es encontrar funciones, es llegar a usar la primera — que es justo lo que ataca el
modelo sin muros. Construir el sistema de ayuda ahora sería diseñarlo **a ciegas**, sin saber en
qué se atasca la gente, y retrasaría la versión que puede decírtelo.

**Lo que sí conviene antes de salir, y es barato:**
- Que **cada pantalla vacía enseñe**, como ya hace "Empieza por tu primer medicamento". Repasar la
  lista de citas vacía, el calendario sin datos y un paciente sin medicamentos.
- Usar **"Enviar una sugerencia"** (ya existe) como instrumento para descubrir qué confunde de
  verdad, antes de inventar la ayuda.

⚠️ Si se diseña, va en un ejercicio de prototipo **aparte**: el prototipo actual resuelve el
embudo, no el aprendizaje.

### C · Decisiones abiertas
| # | Decisión | Estado |
|---|---|---|
| 1 | ¿Barra de pestañas abajo? | ✅ **Resuelta** — construida |
| 2 | ¿Cuánto historial gratis? | Propuesta: **7 días**, con el corte visible |
| 3 | Precio del mensual | ⬜ **Pendiente** — el anual ya está decidido |
| 4 | Anónimo que borra la app | Propuesta: cuenta al 3.er día + job de limpieza |
| 5 | Primer arranque sin red | Propuesta: reusar la cola optimista y reintentar |
| 6 | ¿«Mi salud» o «Expediente»? | Propuesta: **«Mi salud»** en la app, «expediente médico» en la ficha de la App Store |

## Olas siguientes (no son de la 2.0)

- **Ola 2 · expediente ligero:** signos vitales (solo presión, glucosa y peso), consultas +
  "preguntas para el médico", pantalla del directorio de médicos (la tabla ya viene llena),
  diagnósticos y cirugías. Nada necesita almacenamiento de archivos.
- **Ola 3 · expediente pesado (solo si 1 y 2 validan):** documentos y estudios con archivos,
  laboratorios, vacunas, dispositivos. Son los caros: almacenamiento recurrente, etiqueta de
  privacidad de datos de salud y más lupa de Apple.

---

Estado del archivo histórico de abajo: última sesión 2026-07-17 (antes de publicar la 1.1).

## ✅ Ya está hecho

### Features
- Multipaciente completo: tabla `pacientes`, RLS, selector en header, CRUD desde Settings, filtros por paciente activo
- Face ID / Touch ID nativo iOS (`@capgo/capacitor-native-biometric`)
- Persistencia de sesión Supabase con `@capacitor/preferences` (sobrevive al cierre de app en iOS)
- Pantalla **Reportes** con ficha de medicamentos + historial filtrable, export a Excel (2 hojas)
- Auth: registro con confirmar password, toggle mostrar/ocultar, detección de email ya registrado, y **reset de contraseña por código OTP in-app** (ver punto 1 de pendientes para detalle y lo que falta)
- Marcar/desmarcar tomada cancela/reagenda la notif iOS específica (ya no suena si ya la tomaste)
- **Modal de confirmación de dosis** (2026-07-06): al tocar la notificación (cualquier tap) o una pastilla en la lista, abre `DoseConfirmModal` con **Tomado / Posponer (10/30/60 min) / No lo he tomado** y hora editable. Posponer reprograma una notif nueva a ahora+N min. Las "no tomadas" se registran (`tomado:false`) y se muestran en rojo; la lista tiene 3 estados (tomado ✓ / no tomado ✕ / pendiente). El reporte Excel sigue mostrando solo tomadas. ✅ **Validado en iOS** (modal + posponer + estados).
- Indicador "a tiempo / X min tarde" al marcar (compara `hora_programada` vs `hora` real)
- **Fecha de inicio + duración del tratamiento** (2026-07-09): columna `fecha_inicio` (migración 003), **campo obligatorio** en el formulario (default hoy). `isPillDueOnDay` ahora (a) ancla las frecuencias por intervalo a la fecha de inicio, (b) no muestra la pastilla antes del inicio, (c) **no la muestra ni notifica después del fin** (inicio + duración días/semanas/meses). Antes la duración se guardaba pero no se respetaba (bug). Lógica validada con 16 pruebas unitarias.
- Dark mode con `prefers-color-scheme` (respeta config del iPhone)
- **Pulido de UI (2026-07-09), validado en device:** texto de inputs visible en modo oscuro (fondo `dark:bg-gray-800` + texto claro; antes invisible); anillo de foco ya no se recorta (ring-inset); inputs `type=date/time` de iOS ya no se desbordan (overflow-x-hidden + ring-inset); botón "Agregar medicamento" en violeta (antes gris apagado); calendario Mes: se quitó la fila de puntos rota (línea blanca), colores consistentes con leyenda y dark mode (verde/ámbar/rojo/gris), leyenda siempre visible bajo el calendario, y anillo solo en el día seleccionado (hoy solo con punto).
- Iconos vectoriales `lucide-react` en toda la UI (reemplazó emojis del sistema)
- Nuevo App Icon (cuadrado con gradiente violet→indigo + pastilla diagonal) + splash screens light/dark

### Seguridad
- **Fix Face ID (2026-07-06):** el flag `bio_enabled` se movió de `localStorage` a `Preferences` — antes el candado biométrico no se aplicaba tras reabrir la app en iOS (localStorage no persiste). Validado en iOS.
- RLS habilitado en `pastillas`, `medicamentos`, `pacientes` (migración 002)
- Security Advisor de Supabase: 0 errors

### Monetización / Suscripciones (2026-07-15/16) ✅ CONFIGURADO Y PROBADO EN SANDBOX
- **App Store Connect:** grupo **"Mi Pastillero Premium"** (ID 22239888) con 3 suscripciones auto-renovables — `com.mipastillero.app.weekly` ($29 MXN), `.monthly` ($59), `.annual` ($499). Todas con precio base México, **disponibilidad SOLO México**, localización es-MX, e **Introductory Offer de 7 días gratis** (Free · 1 week). La **app** también se limitó a México (Pricing and Availability → 1 de 175).
- **RevenueCat:** proyecto "Mi Pastillero"; app de App Store conectada con **In-App Purchase Key** (.p8, requerida por StoreKit 2); **Public SDK Key iOS** en `.env` (`VITE_REVENUECAT_IOS_KEY`); 3 productos; entitlement **`premium`** con los 3; offering **`default`** con packages $rc_weekly/$rc_monthly/$rc_annual. Gratis hasta $2,500 MTR.
- **Código (rama `feature/subscriptions`, flag `SUBSCRIPTIONS_ENABLED=true`):** paywall + wrapper `src/purchases.js`. Paywall: 3 planes ordenados **semanal→mensual→anual**, badges de ahorro en vivo, disclosure claro, **"¿Ya eres suscriptor? Restaurar compras"**, links Términos/Privacidad. **Tarjeta "Tu suscripción" en Ajustes** (plan + fecha de renovación + "Administrar suscripción"); Ajustes rediseñado con acordeones (Mis medicamentos / Tu suscripción colapsados).
- **✅ Compra validada end-to-end en iPhone (Sandbox):** trial 7 días → conversión a anual → app desbloqueada; precios en **MXN** (con Sandbox tester de México); estado visible en el dashboard de RevenueCat.
- **Nota Sandbox:** el tiempo va acelerado (1 semana ≈ 3 min, 1 año ≈ 1 h) y renueva **máx ~6 veces** → el paywall reaparece a las pocas horas. Es SOLO en pruebas; en producción los 7 días y el año son reales.
- Commits **543d56a** + **b44bb9d** (locales, **sin push**). `dev` sigue con el flag en `false` (testers sin paywall).

## 🔜 Pendientes (siguiente sesión)

### 🎯 Recta final para enviar a la tienda (lo que falta, en orden)
1. **⚠️ Sign in with Apple (guía 4.8)** — posible **BLOQUEANTE**: como el login ofrece Google, Apple casi seguro exige también ofrecer Sign in with Apple (o quitar Google). El plugin `@capgo/capacitor-social-login` ya reporta **Apple: enabled** (medio camino). Resolver ANTES del Archive final.
2. **Privacy Manifest** (`PrivacyInfo.xcprivacy`) — Apple lo exige al subir: declarar los "required reason APIs" (UserDefaults/Preferences, etc.) y el uso de datos. Sin él, aviso/rechazo.
3. **Producción (Supabase prod `kbsxjdtdleauzvbtbrqi`)** — completar los pasos manuales del dashboard (detalle en la sección de abajo).
4. **`.env` → prod + `npm run build && npx cap sync ios`** (solo para el build de tienda; hoy sigue en dev).
5. **Archive 1.0 final a TestFlight** (con flag ON, Sign in with Apple, Privacy Manifest, apuntando a prod) → **App Review Information + cuenta demo** → **enviar a revisión** (la 1ª suscripción se revisa junto con el build).
- **Opcional/cuando quieras:** entitlement `premium` de cortesía en RevenueCat (para probar sin paywall); Apple Small Business Program (comisión 15% en vez de 30%); pegar la Apple Server Notification URL de RevenueCat en ASC (estado en tiempo real). Push de los commits locales.

### 🏭 Migración a PRODUCCIÓN — estado (2026-07-13)
Proyecto prod `mi-pastillero` (`kbsxjdtdleauzvbtbrqi`), URL `https://kbsxjdtdleauzvbtbrqi.supabase.co`.
- ✅ **Restaurado** (estaba pausado), **data vieja borrada** (era el proyecto original de abril con test data + RLS inseguro), esquema puesto a paridad con dev vía **`db/migrations/005_prod_parity.sql`** (pacientes, paciente_id, fecha_inicio, es_default, índices, **12 políticas RLS seguras** que reemplazan la vieja `"acceso publico"`). **Edge Functions desplegadas** (`delete-account`, `notify-password-changed`, verify_jwt). **Security Advisor: 0 alertas.**
- ⬜ **FALTA MANUAL en el dashboard de prod** (secretos/config, no automatizable):
  1. Secret **`RESEND_API_KEY`** (Edge Functions → Secrets).
  2. **SMTP** Resend (host `smtp.resend.com`, port 465, user `resend`, pass=API key, from `noreply@pastillero.jimbera.com`).
  3. **Email templates**: Reset password + **Confirm signup** con `{{ .Token }}`; **OTP length = 6**.
  4. Bucket público **`brand`** + `icon-512.png`.
  5. **Google provider**: Client IDs (web+iOS), Skip nonce ON, Client Secret + **publicar consent screen**.
  6. **URL Configuration**: Site URL / Redirect URLs de prod.
- ⬜ **Repo (último, para el build de tienda, NO antes):** `.env` → `VITE_SUPABASE_URL`/`KEY` de prod (anon key en memoria/chat) + `npm run build && npx cap sync ios`. Mientras se prueba en dev, el `.env` sigue en dev.


### Auth
1. ~~**Pantalla "Establecer nueva contraseña"**~~ ✅ HECHO (sesión 2026-07-05) — **flujo OTP** (app iOS pura, ya no PWA)
   - Se descartó el flujo de link web: en iOS el enlace del email abre Safari, no la app (no hay deep link). Se implementó **código OTP** todo dentro de la app.
   - `LoginScreen` (App.jsx) ahora tiene modo `"reset"`: email → `resetPasswordForEmail(email)` envía código → usuario escribe código + nueva contraseña → `verifyOtp({ email, token, type: "recovery" })` + `updateUser({ password })` → entra a la app. El input acepta hasta 10 dígitos (robusto al largo del OTP).
   - No requiere deep links, hosting ni rebuild nativo (solo JS). Se eliminó el `ResetPasswordScreen`/detección de URL de la versión anterior.
   - ✅ **Config Supabase hecha:** plantilla de email "Reset Password" personalizada con `{{ .Token }}` + icono de marca (subject "Cambia tu Contraseña"). **OTP Length cambiado a 6 dígitos**.
   - ✅ **Icono hospedado:** bucket **público `brand`** en Storage de `mi-pastillero-dev` con `icon-512.png` → `https://hylwfravrxnlifxefuey.supabase.co/storage/v1/object/public/brand/icon-512.png` (usado en el template).
   - ✅ **Backend validado vía API:** `admin/generate_link` (recovery) + `verify` confirman que el código de 6 dígitos se genera y `verifyOtp` crea sesión OK.
   - ✅ **Probado e2e con correo real (2026-07-05):** solicitud → email vía Resend (remitente "Mi Pastillero") → código de 6 → cambio de contraseña → entra a la app. Funciona completo.
   - ✅ **Correo de seguridad "Tu contraseña fue actualizada":** Edge Function `notify-password-changed` (código en `supabase/functions/`) invocada tras `updateUser` (fire-and-forget). Verifica el JWT, saca el email del token y envía vía Resend. Requiere el secret `RESEND_API_KEY` en Edge Functions. Probado ✅.

### Email / SMTP ✅ HECHO (2026-07-05)
2. ~~**Montar SMTP propio con Resend**~~ ✅ FUNCIONANDO en `mi-pastillero-dev`.
   - Dominio: **subdominio `pastillero.jimbera.com`** verificado en Resend. Ojo: el DNS de `jimbera.com` NO está en Namecheap sino en **Squarespace** (nameservers de Google; `jimbera.com` migró de Google Domains a Squarespace). `digitalacademym.com` sí está en Namecheap.
   - Registros DNS (DKIM TXT `resend._domainkey.pastillero`, MX `send.pastillero` → `feedback-smtp.us-east-1.amazonses.com` prio 10, SPF TXT `send.pastillero` → `v=spf1 include:amazonses.com ~all`) agregados en Squarespace → DNS → Custom Records. Verificado.
   - Cuenta Resend bajo `ailab.learning@gmail.com`. SMTP en Supabase: host `smtp.resend.com`, port 465, user `resend`, pass = API key de Resend, from `noreply@pastillero.jimbera.com`, name "Mi Pastillero". Rate limit ahora 30/h.
   - ⚠️ **Pendiente para producción:** repetir template + OTP length + bucket `brand` + SMTP + **Edge Function `notify-password-changed` + su secret `RESEND_API_KEY`** en el proyecto `mi-pastillero` (`kbsxjdtdleauzvbtbrqi`) cuando se active.
3. **Correo de soporte** `soporte@pastillero.jimbera.com` (requisito App Store) — vía **ImprovMX** (gratis, reenvía a Gmail, soporta subdominios, DNS en Squarespace). NO bloquea nada hoy; hacer antes de publicar. Opcional: ponerlo como Reply-To del email de reset.

### Onboarding / lanzamiento App Store
4. ~~**Screenshots para App Store**~~ ✅ HECHO (2026-07-10). 6 paneles de marketing a **1290×2796** (iPhone 6.7") en `screenshots/appstore/` (01→06), generados con `screenshots/make_appstore.py` (Pillow) montando **capturas reales** (fondo morado-índigo + glow, titular SF Rounded, marco iPhone). Titulares: "Nunca olvides una dosis" / "Tu adherencia, de un vistazo" / "Cuida a toda tu familia" / "Un reporte listo para tu médico" / "Tus datos, solo tuyos" / "Cuida tu vista, día y noche".
   - Capturas originales en `screenshots/originales/` (paciente **demo "Mau"** — sus datos de calendario se poblaron por SQL para mostrar 8🟢 9🔴 10🟠 y reporte "A tiempo"). Se decidió usar **capturas reales enmarcadas** en vez de recrear la UI en HTML (Apple 2.3.3: los screenshots deben reflejar la app real; recrear UI falsa = riesgo de rechazo).
   - Para regenerar (tras recapturar o para prod): ajustar `SRC`/titulares en `make_appstore.py` y correr `python3 screenshots/make_appstore.py`.
   - Opcional/pendiente cosmético: barra de estado limpia (9:41 + batería llena) — no bloquea.
5. **Pantalla de bienvenida / onboarding** (opcional pero recomendado antes de publicar): 3 slides intro tras el signup mostrando qué hace la app.
6. ~~**Política de privacidad + URL de soporte**~~ ✅ HECHO (2026-07-12). Páginas en `legal/privacidad.html` y `legal/soporte.html` (branded, español, fieles a la app; contacto `ailab.learning@gmail.com`). Hospedadas en **GitHub Pages** (rama `gh-pages`, repo público `ailablearning-dot/mi-pastillero`):
   - Privacidad: `https://ailablearning-dot.github.io/mi-pastillero/privacidad.html`
   - Soporte: `https://ailablearning-dot.github.io/mi-pastillero/soporte.html`
   - ⚠️ Supabase Storage NO sirve para HTML (fuerza `text/plain`+`nosniff` en su dominio público). Por eso GitHub Pages.
   - Para actualizar: editar `legal/*.html`, copiarlas a la rama `gh-pages` y push. Antes de publicar, considerar dominio propio (`jimbera.com`).
   - Pegar ambas URLs en App Store Connect (Privacy Policy URL + Support URL).
9. ~~**Eliminar cuenta in-app**~~ ✅ HECHO (2026-07-12) — requisito Apple 5.1.1(v). Botón "Eliminar cuenta" en `SettingsScreen` (App.jsx) con modal de confirmación → invoca la Edge Function **`delete-account`** (`supabase/functions/`, desplegada en dev) que valida el JWT y con el SERVICE ROLE borra `medicamentos`/`pastillas`/`pacientes` del usuario + el usuario de Auth, luego `signOut`. ⚠️ Falta probar en device y **replicar la función en prod**.
10. ~~**Crear la app en App Store Connect**~~ ✅ HECHO (2026-07-12). App creada: ficha **"Mi Pastillero App"** (el nombre exacto "Mi Pastillero" estaba tomado; en el iPhone se ve "Mi Pastillero" vía `CFBundleDisplayName`). **Apple ID 6790219240**, Bundle `com.mipastillero.app`, SKU `mipastillero-001`, idioma Español (México). Ficha COMPLETA:
   - Screenshots regenerados a **1320×2868** (6.9", único slot que acepta ASC hoy — el 6.7"/1290×2796 ya no tiene slot; se cambió `W,H` en `make_appstore.py`). Subidos al slot 6.9"; el 6.5" los reutiliza solo. (Al subir, el orden se baraja → reordenar arrastrando.)
   - Metadata: subtítulo "Recordatorios de medicamentos", descripción, keywords, promo text, Support URL, Copyright.
   - Categoría **Health & Fitness**; Content Rights sin terceros.
   - **Age Rating = 4+** (Medical/Treatment Info = None, Health/Wellness Topics = No; override Not Applicable).
   - **App Privacy PUBLICADO:** Email Address + Health, ambos App Functionality + Linked to identity + NOT tracking. Privacy Policy URL puesta.
   - **Pricing = Free** (base México MXN) + **Availability = 175 países** (Available on App Release). Mac/Vision Pro desmarcados. Distribución Public.
   - **Export compliance:** `ITSAppUsesNonExemptEncryption = false` agregado a `ios/App/App/Info.plist`.
11b. **⚠️ Sign in with Apple (guía 4.8):** como el login ofrece **Google**, Apple probablemente exige ofrecer también **Sign in with Apple** (o quitar Google del login). **Posible bloqueante de aprobación.** Decisión: **diferir al build final de tienda** (TestFlight no lo exige). Nota: el plugin `@capgo/capacitor-social-login` ya reporta **Apple: enabled** → medio camino andado.
    **Suscripciones (modelo de negocio nuevo, 2026-07-12):** el usuario quiere app gratis con **prueba de 7 días** y luego suscripción **semanal 19 / mensual 59 / anual 599 MXN**. Implica: contrato "Paid Applications" (datos bancarios/fiscales en ASC → Business), integración StoreKit/RevenueCat + paywall + gating + "Restaurar compras", y config de Subscriptions en ASC (grupo + 3 productos + Introductory Offer de 7 días). Se probará en TestFlight (Sandbox, sin cobro real). Feature aparte, para el **build final de tienda** junto con Sign in with Apple.
7. ~~**TestFlight**~~ ✅ HECHO y FUNCIONANDO en device (2026-07-13). Build 1.0 (1) archivado en Xcode (destino "Any iOS Device", automatic signing) → subido vía Organizer → procesado sin pedir export compliance (gracias al flag en Info.plist) → estado "Ready to Submit". Grupo **Internal Testing "Equipo Interno"** creado con **Enable automatic distribution** (cada build nuevo se entrega solo). Tester: `josemauricio.mmontero@gmail.com`. **App instalada y probada en iPhone: funciona perfecto.** También se declaró **NO** dispositivo médico regulado (App Info → Regulated Medical Devices). Ya se puede compartir con hasta 100 testers internos sin revisión de Apple.
   - Pendiente para publicación en UE: **Digital Services Act** (declarar estatus trader/comerciante en Distribution). No bloquea TestFlight.
   - 🐛 **Confirmación de cuenta por OTP (2026-07-13):** el email de confirmación de registro llevaba a la URL vieja de la PWA en **Vercel** → en iOS abría Safari, no la app. Se implementó **confirmación por OTP in-app** (modo `"confirm"` en `LoginScreen`: tras `signUp` se pide código de 6 dígitos → `verifyOtp({type:"signup"})` → crea sesión y entra; botón reenviar con `auth.resend`). Verificado en navegador. Build a **1.0 (3)**. ⚠️ **FALTA (Supabase dashboard):** cambiar la plantilla **"Confirm signup"** para que use `{{ .Token }}` (código) en vez de `{{ .ConfirmationURL }}` (enlace) — sin eso el email sigue trayendo enlace y no código. Plantilla HTML lista en el chat/commit `0e33da7`. Replicar también en prod.
   - 🐛 **Bug encontrado en TestFlight (2026-07-13) y CORREGIDO:** a la primera tester (Lid) se le crearon **dos pacientes "Yo"** al registrarse y **no se le guardaban los medicamentos** (le decía guardar pero nada persistía). Causa: (1) el efecto que auto-crea el "Yo" (`App.jsx`, corre cuando `pacientes.length===0`) se disparaba 2 veces por eventos de auth casi simultáneos → race → doble INSERT; (2) `addPill` **no manejaba el error**, así que un guardado fallido (probablemente por la caída de Supabase de ese día) desaparecía en silencio. Solo afecta el **primer login de cuentas nuevas** (por eso nunca le pasó al owner, cuyas cuentas son viejas). **Fixes:** migración `004_paciente_default.sql` (columna `es_default` + índice único parcial `(user_id) WHERE es_default` — imposible duplicar el default a nivel BD) **ya aplicada en dev**; guard sincrónico por usuario en el efecto; `addPill` (Setup y Settings) ahora avisa con alert si falla. Duplicado de Lid limpiado en BD. **Falta:** subir **build 1.0 (2)** (ya bumpeado) a TestFlight para que el fix llegue a las testers, y **replicar la migración 004 en prod**.

### Google OAuth
8. ~~**Login con Google nativo (sin mostrar URL de Supabase)**~~ ✅ HECHO y **validado en iOS** (2026-07-06).
   - Código: `@capgo/capacitor-social-login@8`. `handleGoogle` usa login nativo en iOS (`SocialLogin.login` → `supabase.auth.signInWithIdToken`) con fallback `signInWithOAuth` en web. Client IDs en `.env` (`VITE_GOOGLE_IOS_CLIENT_ID`, `VITE_GOOGLE_WEB_CLIENT_ID`).
   - Google Cloud (proyecto `mi-pastillero`, número `868658050804`): **iOS client** `...-dp3cm2alvfqu1hsgds29dmfkg1tgmqsv` (bundle `com.mipastillero.app`) + **Web client** `...-3hhtmgk6klr6a4fq9mjd8a7v50aign20` (reusado de la PWA). Consent screen en **modo Testing** (test users) — falta **"Publicar app"** cuando se lance (scopes básicos email/perfil → no requiere verificación de Google).
   - Supabase Google provider: **Client IDs** = web`,`iOS (ambos, separados por coma) + **"Skip nonce checks" ACTIVADO** (necesario para el idToken nativo de iOS) + Client Secret del web.
   - `Info.plist`: `CFBundleURLTypes` con el reversed iOS client ID.
   - ⚠️ **Pendiente para producción:** replicar credenciales/config Google (o reusar) apuntando al proyecto prod `mi-pastillero`, y **publicar el consent screen** para que cualquier usuario pueda entrar (hoy solo test users).

### Notificaciones
11. ~~**Time Sensitive (atravesar Focus / No Molestar)**~~ ✅ HECHO y validado en iOS (2026-07-09).
   - El "no suena" recurrente era un **Modo de Concentración (Focus)** activo que silenciaba las notificaciones (no era el archivo ni el formato).
   - `interruptionLevel: 'timeSensitive'` en los 3 puntos de scheduling (`App.jsx`) + **capacidad "Time Sensitive Notifications"** en Xcode → `ios/App/App/App.entitlements` (`com.apple.developer.usernotifications.time-sensitive`). Validado: la notif sale con etiqueta "URGENTE" y suena aunque haya Focus activo.
   - **Ojo Apple Developer:** para agregar la capacidad hubo que **aceptar el nuevo contrato** en developer.apple.com (banner "program license agreement has been updated") y re-loguear el Apple ID en Xcode.
   - **Duración del sonido:** los `.wav` se regeneraron a **~28s loopeados** (antes de `.caf`→`.wav` quedaron con su duración original de 1-2s = un solo blip; los `.caf` viejos eran de 10s). iOS reproduce el sonido de una notificación **una sola vez, máx 30s** — NO puede repetir "hasta que la persona actúe". Para eso se necesitarían **Critical Alerts** (entitlement especial que Apple aprueba aparte, justificable para apps de salud) — pendiente/opcional si se quiere alerta persistente real.

### Notificaciones (cont.)
12. ~~**Notificaciones de TODOS los pacientes**~~ ✅ HECHO y validado en iOS (2026-07-12). Antes solo sonaban las del paciente activo: `scheduleLocalNotifs` **cancela todas las pendientes** y reprogramaba solo la lista del paciente activo → al cambiar de paciente los demás dejaban de sonar. Fix en `App.jsx`:
   - El efecto de scheduling ahora consulta **todas** las pastillas del usuario (sin filtrar por paciente activo) y programa todas; `pills` solo sirve de señal para reprogramar. La consulta de "ya tomadas" tampoco filtra por paciente y empareja por `paciente_id + nombre`.
   - La notif incluye el **nombre del paciente** en el cuerpo cuando hay >1 (`… · Mama`), y `pacienteId` en el `extra` de las 3 rutas de scheduling.
   - Al **tocar** una notif de un paciente no-activo, la app **cambia a ese paciente** antes de abrir el modal (para registrar en el paciente correcto).
   - Dos dosis a la misma hora (aunque sean de pacientes distintos) → el anti-colisión las desfasa +1 min, así **suenan las dos**. iOS las apila (stack) en la misma app, pero ambas llegan. Validado: dos pacientes a las 16:03 → llegaron 16:03 y 16:04, cada una con su sonido.

13. **⚠️ CONFIABILIDAD DEL SONIDO + Critical Alerts + controles de sonido (PENDIENTE ANTES DE TIENDA — descubierto 2026-07-21):**
   - **Hallazgo:** iOS **throttlea (silencia) las notificaciones de una app cuando dispara muchas en poco tiempo** — se lleva por bundle id (`com.mipastillero.app`), **persiste aunque borres/reinstales/reinicies**, y se recupera solo tras horas. En una sesión de pruebas intensas parece un bug pero NO lo es: se verificó código idéntico al que funcionaba, `.wav` válidos en el bundle, ajustes correctos, iOS 26.5.2, y **hasta la build vieja de TestFlight 1.0(6) (release) falló igual** → es estado de iOS por app, no el código. Para usuarios con VARIOS medicamentos podría pasar incluso en uso normal → resolver de fondo.
   - **✅ Entitlement de Critical Alerts SOLICITADO a Apple (2026-07-21), Request ID `XNDVK6WL5L`** (form Healthcare, "Regularly scheduled", bundle com.mipastillero.app). Apple responde por correo a josemauricio.mmontero@gmail.com (días-semanas; a veces piden más detalle o rechazan la 1ª vez → se reenvía). Al aprobar: agregar la capability `com.apple.developer.usernotifications.critical-alerts` al target en Xcode.
   - ⬜ **CÓDIGO A IMPLEMENTAR CUANDO APPLE APRUEBE (lo hace Claude, todo junto + probado en device):**
     a. `interruptionLevel:'critical'` detrás de flag `CRITICAL_ALERTS_ENABLED` + pedir permiso `UNAuthorizationOptions.criticalAlert`. Critical Alerts **suenan SIEMPRE** (ignoran silencio/Focus/Sueño/throttling) — lo correcto para una app de medicamentos.
     b. **Toggle en Ajustes "Alertas críticas (sonar siempre)"** (ON=critical / OFF=timeSensitive). Se lo prometimos a Apple en la solicitud + Apple lo recomienda. (Además iOS agrega su propio toggle de "Alertas críticas" en Ajustes → Notificaciones al tener el entitlement.)
   - ⬜ **CÓDIGO INDEPENDIENTE DEL ENTITLEMENT (se puede hacer cuando sea):** opción **"Sin sonido"** en el selector de sonido de cada pastilla → si `sonido==='ninguno'`, programar la notif SIN el campo `sound` (aparece pero no suena). Cubre el caso "quiero el recordatorio pero sin ruido".
   - Escape siempre disponible hoy: **Ajustes de iOS → Notificaciones → Mi Pastillero** → apagar "Sonidos" (deja la notif visible, muda) o todo.
   - Nota: los `.wav` se re-codificaron de 28s→8s el 2026-07-21 mientras se probaba (sin commitear; la duración NO era el problema, era throttling). Decidir si dejar 8s (más seguro vs el límite de 30s de iOS) o restaurar 28s.

### Cosas menores
9. **Warning en Security Advisor**: `auth_leaked_password_protection` deshabilitado (bloquea contraseñas filtradas vía HaveIBeenPwned). **Es solo plan Pro** y la org está en Free → no se puede activar ahora. Es solo un warning; queda apagado. Revisar si algún día se sube a Pro. (Nota: el mínimo de contraseña ya está alineado a 8 entre app y Supabase.)
10. ~~**Colisión de horarios**~~ ✅ HECHO (2026-07-05): `scheduleLocalNotifs` desfasa +1 min las dosis que caen en el mismo minuto (Set `usedTimes`), porque iOS solo reproduce un sonido si varias notifs disparan a la vez. El `id`/`scheduledTime`/cancelar-al-marcar siguen usando la hora original. ✅ Validado en iOS.

## 💡 Ideas para versiones futuras (post-lanzamiento)

Propuestas por un revisor externo (amigo de sistemas, 2026-07-23). **NO son para v1** — se evalúan con feedback real de usuarios ya en tienda. El usuario ve potencial en varias.

1. **Perfil familiar / compartir lectura de un paciente.** Que un familiar pueda **ver** los medicamentos de su familiar (p.ej. para una visita al médico) desde su propio teléfono, sin pedir prestado el teléfono de quien tiene la app. Requiere modelo de "compartir paciente" con acceso de **solo-lectura** (invitación por email/código + política RLS que permita a un segundo `user_id` leer las pastillas/medicamentos de un paciente compartido). Encaja fuerte con el ángulo cuidador/familia.

2. **Integración con WhatsApp (Mi Pastillero como servicio).** Exponer la app como backend y operar desde WhatsApp: "@pastillero dime mis medicamentos actuales", "¿qué pastillas me faltan por tomar hoy?", e incluso **enviar los recordatorios por WhatsApp** en lugar de (o además de) la notificación con sonido. La app quedaría más para gestión/administración y la operación diaria viviría en WhatsApp. Requiere WhatsApp Business API / proveedor (Meta Cloud API, Twilio), backend con webhook (Edge Function) y NLU básico para los comandos. **Bonus:** resolvería de raíz el throttling de sonido de iOS (el recordatorio llega por WhatsApp). Esfuerzo y costo por mensaje altos → evaluar modelo de negocio.

3. **Menos captura, más selección (UX).** Reemplazar campos de texto libre por opciones seleccionables donde se pueda: dosis con chips comunes (1 tableta, 5mg, 500mg…), autocompletar el nombre del medicamento contra un catálogo, etc. Hace la app más amigable (menos escribir, más tocar).

4. **Contexto clínico por medicamento: nota de voz + receta + médico.** ⚠️ *Parcialmente
   SUPERADO: la receta y el médico subieron a la Ola 1 (punto 10 de la 2.0). Lo que sigue vivo
   aquí es solo la **nota de voz**.* Adjuntar a cada medicamento una **nota de voz** (grabación) explicando por qué lo mandó el médico, y quizás también la **foto/archivo de la receta** y el **nombre del médico**. Ayuda a recordar el motivo y es útil en visitas / segundas opiniones. Requiere: grabación y reproducción de audio (plugin Capacitor de voz + subida a Supabase Storage), adjuntos de imagen para la receta, y campos nuevos en `pastillas` (o tabla anexa `medicamento_notas`). Ojo privacidad: es dato de salud → RLS estricto + declararlo en App Privacy.

**Otras diferidas en la sesión del 2026-07-23:**
- **Onboarding "de la manita" (wizard guiado)** tras el registro, para agregar el primer medicamento paso a paso ("ahora el nombre", "ahora los días", "ahora el sonido"). Enhancement de activación; candidato a **v1.1** con feedback real. Hoy ya existe `SetupScreen` funcional (no está roto, solo sería más cálido).
- **Accesibilidad completa:** reactivar el pinch-zoom (requiere subir los inputs a ≥16px para evitar el auto-zoom de iOS al enfocar) y/o soportar Dynamic Type. En v1 se hizo un **agrandado global (base 18px)** + se eliminaron los tamaños 10-11px.
- **Estado "pospuesta" visible en el home (v1.1, 2026-07-24):** hoy una dosis que el usuario pospone se ve como "pendiente" en el home aunque ya pasó su hora (parece olvidada). La tabla `medicamentos` solo tiene "tomada / no tomada" — NO existe estado "pospuesta". Para mostrar un badge hay que **persistir** ese estado (p.ej. un mapa `doseKey → pospuesta_hasta` en `Preferences`, sin tocar la BD, o una columna nueva) y limpiarlo al marcarla. La dosis no se pierde (el posponer vuelve a sonar); es solo un tema visual. Diferido a post-lanzamiento por decisión del usuario.

## ⚠️ Cosas a NO olvidar

- **`.env`** está gitignored, contiene `SUPABASE_SECRET_KEY` (service_role) — no rotar salvo compromiso
- Cuando vayas a producción: `mi-pastillero` (pausado, `kbsxjdtdleauzvbtbrqi`) es el proyecto que debería ser prod. Actualmente todo apunta a `mi-pastillero-dev` (`hylwfravrxnlifxefuey`).
- **NativeBiometric requiere Cmd+R en Xcode** — cualquier cambio con plugins Capacitor nuevos exige rebuild del binario nativo, no basta con reload web.
- **Sonidos de notificación (fix 2026-07-08):** ahora se usan **`.wav` mono** (`ios/App/App/*.wav`, referenciados en `App.jsx` como `${sonido}.wav`). Los `.caf` estéreo **no sonaban** en notificaciones iOS (mostraban el banner pero mudo, mientras otras apps sí sonaban). Claves del fix: (1) formato **mono** + **`.wav`** (recomendado por el plugin), (2) iOS **cachea el registro del sonido por instalación**, así que hubo que **borrar y reinstalar** la app para que tomara el sonido nuevo. Los `.caf` viejos siguen en el bundle (redundantes, inofensivos; limpieza opcional). Fuentes en `sonidos/`.
