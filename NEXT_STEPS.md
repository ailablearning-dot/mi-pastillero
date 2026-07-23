# Próximos pasos — Mi Pastillero

Estado a fecha de este archivo (última sesión con Claude: 2026-07-17).

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

## ⚠️ Cosas a NO olvidar

- **`.env`** está gitignored, contiene `SUPABASE_SECRET_KEY` (service_role) — no rotar salvo compromiso
- Cuando vayas a producción: `mi-pastillero` (pausado, `kbsxjdtdleauzvbtbrqi`) es el proyecto que debería ser prod. Actualmente todo apunta a `mi-pastillero-dev` (`hylwfravrxnlifxefuey`).
- **NativeBiometric requiere Cmd+R en Xcode** — cualquier cambio con plugins Capacitor nuevos exige rebuild del binario nativo, no basta con reload web.
- **Sonidos de notificación (fix 2026-07-08):** ahora se usan **`.wav` mono** (`ios/App/App/*.wav`, referenciados en `App.jsx` como `${sonido}.wav`). Los `.caf` estéreo **no sonaban** en notificaciones iOS (mostraban el banner pero mudo, mientras otras apps sí sonaban). Claves del fix: (1) formato **mono** + **`.wav`** (recomendado por el plugin), (2) iOS **cachea el registro del sonido por instalación**, así que hubo que **borrar y reinstalar** la app para que tomara el sonido nuevo. Los `.caf` viejos siguen en el bundle (redundantes, inofensivos; limpieza opcional). Fuentes en `sonidos/`.
