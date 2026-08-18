# Mi Pastillero

App de pastillero digital — recordatorios y control diario de medicamentos. PWA web + app nativa iOS (mediante Capacitor).

## Estado del proyecto

Ver [NEXT_STEPS.md](NEXT_STEPS.md) para el estado detallado (qué está hecho, qué queda pendiente).

Resumen a alto nivel: la app tiene multipaciente, Face ID nativo, persistencia de sesión, reportes exportables a Excel, dark mode, iconos Lucide y App Icon profesional. RLS habilitado en todas las tablas. **Próximos hitos**: completar flujo de reset de contraseña (pantalla "nueva contraseña"), screenshots para App Store, Google OAuth nativo.

## Stack

- **Frontend:** React 18 + Vite 4 (JSX, sin TypeScript)
- **Estilos:** Tailwind CSS vía CDN (cargado directo en `index.html`, sin build-step de Tailwind). Dark mode automático vía `prefers-color-scheme`.
- **Iconos UI:** `lucide-react` (SVG). Los emojis se usan solo como **datos** (pastillas, avatares), nunca como iconos de UI.
- **Backend / Auth / DB:** Supabase (`@supabase/supabase-js`) con RLS habilitado en `pastillas`, `medicamentos`, `pacientes`.
- **Mobile:** Capacitor 8 con plataforma iOS (`com.mipastillero.app`)
- **Notificaciones:**
  - En iOS: `@capacitor/local-notifications` (programadas localmente, hasta 60 notifs, 7 días hacia adelante). Se cancelan al marcar dosis como tomada.
  - En Web/PWA: Service Worker (`public/sw.js`) con Web Push (VAPID)
- **Biometría:** `@capgo/capacitor-native-biometric` (Face ID / Touch ID iOS). En web usa WebAuthn como fallback.
- **Storage nativo:** `@capacitor/preferences` — se usa como adapter de storage para Supabase auth (persistencia de sesión) y para flags propios del app (paciente activo).
- **Export:** `xlsx` + `@capacitor/share` + `@capacitor/filesystem` — pantalla Reportes exporta Excel de 2 hojas y comparte vía iOS Share Sheet.
- **PWA:** `public/manifest.json` + `public/sw.js` (network-first para JS/CSS, cache-first para estáticos, nunca cachea Supabase)
- **Migrations:** `db/migrations/` — SQL versionado (001 multipaciente, 002 RLS, 003 fecha_inicio, 004 paciente_default, 005 prod_parity, 006 pauta del medicamento, 007 suspender, 008 medicos + citas). Se corren **manualmente** en el SQL Editor del Dashboard de Supabase, y **en dev Y prod** para mantener los dos entornos homologados.

## Estructura

```
src/
  main.jsx        # Entry point (ReactDOM.createRoot)
  App.jsx         # Composición: estado que se comparte, acciones de dosis, gates y rutas (~540 líneas)
  purchases.js    # RevenueCat
  domain/         # PURO: sin React, sin red, sin storage. Probable con `node` a secas.
    schedule.js   #   getHoras, isPillDueOnDay, pautaLabel — de aquí salen las horas y los días
    dosage.js     #   cantidad por toma (DECIMAL: media, un cuarto) y doseLabel
    medTypes.js   #   12 tipos (pastilla, pomada, gotas…) con su verbo, unidad y si llevan cantidad
    citas.js      #   tipos de cita, próximas vs pasadas y CUÁNDO suena el aviso (momentoDelAviso)
    dates.js  catalogs.js
    *.test.mjs    #   200 pruebas, sin framework: `node src/domain/schedule.test.mjs`
  lib/            # Efectos laterales aislados
    supabase.js  storage.js  offlineQueue.js  notifications.js  biometrics.js  config.js
  hooks/          # Estado + efectos agrupados por tema
    useSession  usePremium  usePacientes  usePills
    useNotifScheduling  useOfflineQueues  useCriticalAlerts
  components/     # PillForm PacienteForm DoseConfirmModal GroupDoseModal Paywall TabBar
  screens/        # Home Login Setup Settings Medicamentos Pacientes Reportes BiometricLock
public/
  sw.js           # Service Worker (PWA + Web Push)
  manifest.json
  icon-192.png, icon-512.png
  sounds/         # Sonidos servidos como assets
sonidos/          # Sonidos fuente (.caf para iOS, .mp3 para web)
ios/              # Proyecto Xcode generado por Capacitor
dist/             # Build de Vite (gitignored)
capacitor.config.json
vite.config.js
```

> **Dónde buscar las cosas.** La app estuvo en un solo archivo de 3723 líneas hasta el 2026-08-17; ya está modularizada, así que NO buscar en `App.jsx` lo que vive en `domain/`, `lib/` o `hooks/`.
>
> **Reglas de negocio → `domain/`.** Son funciones puras y tienen pruebas: si se toca `isPillDueOnDay`, `getHoras` o la cantidad de una toma, correr `node src/domain/*.test.mjs`. De esas funciones dependen el home, el calendario, los reportes Y la programación de notificaciones a la vez.
>
> ⚠️ **El build en verde NO valida nada** en JS/JSX. Un símbolo sin importar, un componente inexistente o una `const` usada antes de declararse (zona muerta temporal) compilan sin error y revientan en runtime. Tras mover código: verificar que cada símbolo usado esté importado y que las llamadas a hooks vayan DESPUÉS de lo que reciben.

## Comandos

```bash
npm run dev        # Vite dev server (web)
npm run build      # Build a dist/
npm run preview    # Preview del build

# Capacitor / iOS
npx cap sync ios   # Sincroniza dist/ al proyecto iOS tras un build
npx cap open ios   # Abre Xcode
```

Flujo típico para probar en iOS: `npm run build && npx cap sync ios && npx cap open ios`.

## Variables de entorno

Archivo `.env` (gitignored). Requeridas:

```
VITE_SUPABASE_URL=...
VITE_SUPABASE_KEY=...
```

Se leen como `import.meta.env.VITE_*` en `src/lib/config.js`.

### Solo para diagnóstico desde Claude/scripts locales (NUNCA en el frontend):

```
SUPABASE_SECRET_KEY=sb_secret_...   # Service role de Supabase, bypass RLS, acceso total.
```

Esta variable **NO empieza con `VITE_`** a propósito: así Vite no la incluye en el bundle del cliente. Sólo es accesible desde scripts locales (Node, curl, etc.) que lean el `.env`. Usada por Claude para consultar la tabla `pastillas` o `auth.users` directamente cuando hace falta diagnosticar comportamiento por usuario. Si se llega a comprometer: Dashboard de Supabase → API Keys → rotar.

## Modelo de datos (Supabase)

Dos tablas principales, ambas con `user_id` (auth de Supabase):

- **`pastillas`** — definición de cada medicamento del usuario.
  Campos usados en código: `id`, `user_id`, `nombre`, `hora_base`, `frecuencia`, `orden`, ... (ver `src/domain/schedule.js` y las migraciones 006/007 para detalle).
  Frecuencias soportadas (parseadas en `getHoras`): `"Una vez al día"`, `"Dos veces al día"` / `"Cada 12 horas"`, `"Tres veces al día"` / `"Cada 8 horas"`, `"Cada 6 horas"`, `"Cada 4 horas"`, y patrón genérico `/^Cada (\d+) horas?$/`.

- **`medicamentos`** — registro histórico de tomas.
  Campos: `id`, `user_id`, `nombre`, `fecha` (YYYY-MM-DD), `hora` (string local), `hora_programada`, `tomado` (bool).

## Convenciones

- Idioma del producto y de los textos UI: **español**.
- Tema visual: morado-índigo (`#4F46E5`), fondo blanco.
- Viewport iOS: `viewport-fit=cover`, sin zoom, sin overscroll horizontal (configurado en `index.html`).
- Service Worker versión: actualizar `CACHE_NAME` en `public/sw.js` (`pastillero-vN`) cuando se cambie el SW.

## Cosas a tener en cuenta

- Tailwind viene por CDN — no hay `tailwind.config.js`. Usar solo clases utilitarias estándar.
- El Service Worker **excluye Supabase** del caché (importante: cualquier URL `*.supabase.co` va directo a red).
- Las notificaciones iOS se reprograman llamando a `scheduleLocalNotifs(pillsList)`; cancela las pendientes y vuelve a crear hasta 60 para los próximos 7 días.
- Los IDs de notificación se derivan con hash djb2 de `pillId_fecha_hora` (función `notifId` en `src/lib/notifications.js`) — no usar IDs aleatorios para mantener idempotencia.
- Sonidos: archivos `.caf` para notificaciones nativas iOS, `.mp3` para reproducir desde la web. El mapeo de nombres está en la constante `SONIDOS` en `src/lib/notifications.js`.
