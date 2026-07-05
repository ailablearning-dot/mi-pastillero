# Próximos pasos — Mi Pastillero

Estado a fecha de este archivo (última sesión con Claude: 2026-06-13 aprox).

## ✅ Ya está hecho

### Features
- Multipaciente completo: tabla `pacientes`, RLS, selector en header, CRUD desde Settings, filtros por paciente activo
- Face ID / Touch ID nativo iOS (`@capgo/capacitor-native-biometric`)
- Persistencia de sesión Supabase con `@capacitor/preferences` (sobrevive al cierre de app en iOS)
- Pantalla **Reportes** con ficha de medicamentos + historial filtrable, export a Excel (2 hojas)
- Auth: registro con confirmar password, toggle mostrar/ocultar, detección de email ya registrado, link "¿Olvidaste tu contraseña?" (flujo básico — recibe link por email → auto-login)
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
1. **Pantalla "Establecer nueva contraseña"** — completar flujo de reset por email
   - Actualmente: usuario click en link del email → auto-login sin cambiar contraseña
   - Deseado: detectar `?type=recovery` en la URL → mostrar pantalla "Escribe tu nueva contraseña" + confirmación → `supabase.auth.updateUser({ password })`
   - Ojo: en iOS Capacitor el link del email abre navegador, no la app. Puede requerir deep-link o dejar el flujo en PWA/web.

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
4. **Login con Google sin mostrar URL de Supabase** — instalar `@capgo/capacitor-social-login` (o similar), configurar OAuth en Google Cloud Console con bundle `com.mipastillero.app`, reemplazar `signInWithOAuth` por el flujo nativo.

### Cosas menores
5. **Warning amarillo en Security Advisor** (1 warning restante) — revisar cuál es y decidir si vale la pena. Probablemente `function_search_path_mutable` o config de OTP.
6. **Investigar colisión de horarios**: cuando dos pastillas están programadas al mismo minuto (ej. 10:00 NucleoForte + Xarelto en la cuenta `usertest1@gmail.com`), iOS solo reproduce el sonido de una. Ver si compensar con offset de 1 min.

## ⚠️ Cosas a NO olvidar

- **`.env`** está gitignored, contiene `SUPABASE_SECRET_KEY` (service_role) — no rotar salvo compromiso
- Cuando vayas a producción: `mi-pastillero` (pausado, `kbsxjdtdleauzvbtbrqi`) es el proyecto que debería ser prod. Actualmente todo apunta a `mi-pastillero-dev` (`hylwfravrxnlifxefuey`).
- **NativeBiometric requiere Cmd+R en Xcode** — cualquier cambio con plugins Capacitor nuevos exige rebuild del binario nativo, no basta con reload web.
- Los **`.caf` en `ios/App/App/`** están en codec IMA4 a 10s cada uno (ya optimizados). Los `sonidos/*.caf` son fuentes PCM (referencia).
