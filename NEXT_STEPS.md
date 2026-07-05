# Próximos pasos — Mi Pastillero

Estado a fecha de este archivo (última sesión con Claude: 2026-07-05).

## ✅ Ya está hecho

### Features
- Multipaciente completo: tabla `pacientes`, RLS, selector en header, CRUD desde Settings, filtros por paciente activo
- Face ID / Touch ID nativo iOS (`@capgo/capacitor-native-biometric`)
- Persistencia de sesión Supabase con `@capacitor/preferences` (sobrevive al cierre de app en iOS)
- Pantalla **Reportes** con ficha de medicamentos + historial filtrable, export a Excel (2 hojas)
- Auth: registro con confirmar password, toggle mostrar/ocultar, detección de email ya registrado, y **reset de contraseña por código OTP in-app** (ver punto 1 de pendientes para detalle y lo que falta)
- Marcar/desmarcar tomada cancela/reagenda la notif iOS específica (ya no suena si ya la tomaste)
- Indicador "a tiempo / X min tarde" al marcar (compara `hora_programada` vs `hora` real)
- Dark mode con `prefers-color-scheme` (respeta config del iPhone)
- Iconos vectoriales `lucide-react` en toda la UI (reemplazó emojis del sistema)
- Nuevo App Icon (cuadrado con gradiente violet→indigo + pastilla diagonal) + splash screens light/dark

### Seguridad
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
4. **Screenshots para App Store** (5-8 mockups con texto explicativo). Sugeridos:
   - "Recordatorios puntuales"
   - "Control de adherencia"
   - "Múltiples pacientes en una sola app"
   - "Reportes exportables para tu médico"
   - "Face ID para tu privacidad"
   - "Modo oscuro que cuida tu vista"
5. **Pantalla de bienvenida / onboarding** (opcional pero recomendado antes de publicar): 3 slides intro tras el signup mostrando qué hace la app.
6. **Política de privacidad + URL de soporte** (requisito App Store) — se pueden hospedar bajo `pastillero.jimbera.com`.
6b. **TestFlight** — distribuir la app a beta testers antes de publicar (invitaciones por email/link). Requiere subir un build a App Store Connect. (Lo que el usuario "siempre olvida".)

### Onboarding / lanzamiento App Store
2. **Screenshots para App Store** (5-8 mockups con texto explicativo). Sugeridos:
   - "Recordatorios puntuales"
   - "Control de adherencia"
   - "Múltiples pacientes en una sola app"
   - "Reportes exportables para tu médico"
   - "Face ID para tu privacidad"
   - "Modo oscuro que cuida tu vista"
3. **Pantalla de bienvenida / onboarding** (opcional pero recomendado antes de publicar): 3 slides intro tras el signup mostrando qué hace la app.

### Google OAuth
7. **Login con Google sin mostrar URL de Supabase** — instalar `@capgo/capacitor-social-login` (o similar), configurar OAuth en Google Cloud Console con bundle `com.mipastillero.app`, reemplazar `signInWithOAuth` por el flujo nativo.

### Cosas menores
8. **Warning en Security Advisor** (identificado 2026-07-05): `auth_leaked_password_protection` deshabilitado — Supabase puede bloquear contraseñas comprometidas (cruza con HaveIBeenPwned). Toggle en Authentication → Policies / Password security. Recomendado activar antes de publicar.
9. ~~**Colisión de horarios**~~ ✅ HECHO (2026-07-05): `scheduleLocalNotifs` ahora desfasa +1 min las dosis que caen en el mismo minuto (Set `usedTimes`), porque iOS solo reproduce un sonido si varias notifs disparan a la vez. El `id`/`scheduledTime`/cancelar-al-marcar siguen usando la hora original. ⚠️ Falta **probar en iOS** (nativo, no se ve en preview web): `npm run build && npx cap sync ios` + rebuild, con 2 pastillas al mismo minuto.

## ⚠️ Cosas a NO olvidar

- **`.env`** está gitignored, contiene `SUPABASE_SECRET_KEY` (service_role) — no rotar salvo compromiso
- Cuando vayas a producción: `mi-pastillero` (pausado, `kbsxjdtdleauzvbtbrqi`) es el proyecto que debería ser prod. Actualmente todo apunta a `mi-pastillero-dev` (`hylwfravrxnlifxefuey`).
- **NativeBiometric requiere Cmd+R en Xcode** — cualquier cambio con plugins Capacitor nuevos exige rebuild del binario nativo, no basta con reload web.
- Los **`.caf` en `ios/App/App/`** están en codec IMA4 a 10s cada uno (ya optimizados). Los `sonidos/*.caf` son fuentes PCM (referencia).
