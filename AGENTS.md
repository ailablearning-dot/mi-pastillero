# Mi Pastillero

App de pastillero digital — recordatorios y control diario de medicamentos. PWA web + app nativa iOS (mediante Capacitor).

## Stack

- **Frontend:** React 18 + Vite 4 (JSX, sin TypeScript)
- **Estilos:** Tailwind CSS vía CDN (cargado directo en `index.html`, sin build-step de Tailwind)
- **Backend / Auth / DB:** Supabase (`@supabase/supabase-js`)
- **Mobile:** Capacitor 8 con plataforma iOS (`com.mipastillero.app`)
- **Notificaciones:**
  - En iOS: `@capacitor/local-notifications` (programadas localmente, hasta 60 notifs, 7 días hacia adelante)
  - En Web/PWA: Service Worker (`public/sw.js`) con Web Push (VAPID)
- **PWA:** `public/manifest.json` + `public/sw.js` (network-first para JS/CSS, cache-first para estáticos, nunca cachea Supabase)

## Estructura

```
src/
  main.jsx        # Entry point (ReactDOM.createRoot)
  App.jsx         # ⚠️ Toda la app en un solo archivo (~1200 líneas)
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

> Nota: `src/App.jsx` es un componente monolítico grande. Si toca refactor, confirmar con el usuario antes de partirlo en componentes.

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

Se leen como `import.meta.env.VITE_*` en `src/App.jsx`.

### Solo para diagnóstico desde Codex/scripts locales (NUNCA en el frontend):

```
SUPABASE_SECRET_KEY=sb_secret_...   # Service role de Supabase, bypass RLS, acceso total.
```

Esta variable **NO empieza con `VITE_`** a propósito: así Vite no la incluye en el bundle del cliente. Sólo es accesible desde scripts locales (Node, curl, etc.) que lean el `.env`. Usada por Codex para consultar la tabla `pastillas` o `auth.users` directamente cuando hace falta diagnosticar comportamiento por usuario. Si se llega a comprometer: Dashboard de Supabase → API Keys → rotar.

## Modelo de datos (Supabase)

Dos tablas principales, ambas con `user_id` (auth de Supabase):

- **`pastillas`** — definición de cada medicamento del usuario.
  Campos usados en código: `id`, `user_id`, `nombre`, `hora_base`, `frecuencia`, `orden`, ... (ver `App.jsx` para detalle).
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
- Los IDs de notificación se derivan con hash djb2 de `pillId_fecha_hora` (función `notifId` en `App.jsx`) — no usar IDs aleatorios para mantener idempotencia.
- Sonidos: archivos `.caf` para notificaciones nativas iOS, `.mp3` para reproducir desde la web. El mapeo de nombres está en la constante `SONIDOS` en `App.jsx`.
