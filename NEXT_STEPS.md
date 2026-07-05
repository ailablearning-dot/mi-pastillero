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
   - ⚠️ **Pendiente probar e2e con correo real:** bloqueado por el rate limit del email integrado de Supabase (~pocos/hora). Se destraba con SMTP propio (ver punto 2).

### Email / SMTP (bloquea la prueba real del reset y es requisito de producción)
2. **Montar SMTP propio con Resend** — el email integrado de Supabase tiene rate limit bajo y mala entregabilidad; no sirve para usuarios reales.
   - Dominio elegido: **subdominio `pastillero.jimbera.com`** (dominio `jimbera.com` está en **Namecheap**, sin usar → reputación limpia; raíz queda libre para otros proyectos).
   - Pasos: crear cuenta Resend → Add Domain `pastillero.jimbera.com` → pegar registros DNS (SPF/DKIM/MX) en Namecheap Advanced DNS (**ojo:** el campo Host lleva solo la parte antes de `jimbera.com`) → verificar → API Key → configurar en Supabase Authentication → Emails → SMTP Settings (host `smtp.resend.com`, port 465/587, user `resend`, pass = API key, from `no-responder@pastillero.jimbera.com`, name "Mi Pastillero").
   - Repetir en el proyecto de producción cuando se active.
3. **Correo de soporte** `soporte@pastillero.jimbera.com` (requisito App Store) — vía **ImprovMX** (gratis, reenvía a Gmail, soporta subdominios, se queda en DNS de Namecheap). NO bloquea nada hoy; hacer antes de publicar. Opcional: ponerlo como Reply-To del email de reset.

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
9. **Investigar colisión de horarios**: cuando dos pastillas están programadas al mismo minuto (ej. 10:00 NucleoForte + Xarelto en la cuenta `usertest1@gmail.com`), iOS solo reproduce el sonido de una. Ver si compensar con offset de 1 min.

## ⚠️ Cosas a NO olvidar

- **`.env`** está gitignored, contiene `SUPABASE_SECRET_KEY` (service_role) — no rotar salvo compromiso
- Cuando vayas a producción: `mi-pastillero` (pausado, `kbsxjdtdleauzvbtbrqi`) es el proyecto que debería ser prod. Actualmente todo apunta a `mi-pastillero-dev` (`hylwfravrxnlifxefuey`).
- **NativeBiometric requiere Cmd+R en Xcode** — cualquier cambio con plugins Capacitor nuevos exige rebuild del binario nativo, no basta con reload web.
- Los **`.caf` en `ios/App/App/`** están en codec IMA4 a 10s cada uno (ya optimizados). Los `sonidos/*.caf` son fuentes PCM (referencia).
