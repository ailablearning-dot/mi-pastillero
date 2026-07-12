# Próximos pasos — Mi Pastillero

Estado a fecha de este archivo (última sesión con Claude: 2026-07-12).

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

## 🔜 Pendientes (siguiente sesión)

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
6. **Política de privacidad + URL de soporte** (requisito App Store) — se pueden hospedar bajo `pastillero.jimbera.com`.
7. **TestFlight** — distribuir la app a beta testers antes de publicar (invitaciones por email/link). Requiere subir un build a App Store Connect. (Lo que el usuario "siempre olvida".)

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

### Cosas menores
9. **Warning en Security Advisor**: `auth_leaked_password_protection` deshabilitado (bloquea contraseñas filtradas vía HaveIBeenPwned). **Es solo plan Pro** y la org está en Free → no se puede activar ahora. Es solo un warning; queda apagado. Revisar si algún día se sube a Pro. (Nota: el mínimo de contraseña ya está alineado a 8 entre app y Supabase.)
10. ~~**Colisión de horarios**~~ ✅ HECHO (2026-07-05): `scheduleLocalNotifs` desfasa +1 min las dosis que caen en el mismo minuto (Set `usedTimes`), porque iOS solo reproduce un sonido si varias notifs disparan a la vez. El `id`/`scheduledTime`/cancelar-al-marcar siguen usando la hora original. ✅ Validado en iOS.

## ⚠️ Cosas a NO olvidar

- **`.env`** está gitignored, contiene `SUPABASE_SECRET_KEY` (service_role) — no rotar salvo compromiso
- Cuando vayas a producción: `mi-pastillero` (pausado, `kbsxjdtdleauzvbtbrqi`) es el proyecto que debería ser prod. Actualmente todo apunta a `mi-pastillero-dev` (`hylwfravrxnlifxefuey`).
- **NativeBiometric requiere Cmd+R en Xcode** — cualquier cambio con plugins Capacitor nuevos exige rebuild del binario nativo, no basta con reload web.
- **Sonidos de notificación (fix 2026-07-08):** ahora se usan **`.wav` mono** (`ios/App/App/*.wav`, referenciados en `App.jsx` como `${sonido}.wav`). Los `.caf` estéreo **no sonaban** en notificaciones iOS (mostraban el banner pero mudo, mientras otras apps sí sonaban). Claves del fix: (1) formato **mono** + **`.wav`** (recomendado por el plugin), (2) iOS **cachea el registro del sonido por instalación**, así que hubo que **borrar y reinstalar** la app para que tomara el sonido nuevo. Los `.caf` viejos siguen en el bundle (redundantes, inofensivos; limpieza opcional). Fuentes en `sonidos/`.
