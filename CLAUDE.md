# Mi Pastillero

App de pastillero digital — recordatorios y control diario de medicamentos. PWA web + app nativa iOS (mediante Capacitor).

## Estado del proyecto

Ver [NEXT_STEPS.md](NEXT_STEPS.md) para el estado detallado (qué está hecho, qué queda pendiente).

Resumen a alto nivel: la **1.1 está publicada** en México y Costa Rica. La rama
`refactor/modularizacion` lleva la **2.0, "el modelo sin muros"**, sin publicar: se cambia el
embudo entero —sesión anónima en vez de registro, paywall contextual en vez de muro duro— y se
desentierra lo que ya existía detrás de esos dos muros. Añade además ficha de emergencia
compartible, pestaña "Mi salud", citas médicas, control de la caja y petición de reseña.

⚠️ **Todo eso vive tras el flag `MODELO_SIN_MUROS`** de `src/lib/config.js`. Con él apagado la app
se comporta exactamente como la publicada.

**Lo que falta para la 2.0** está en NEXT_STEPS, y a 2026-08-24 es todo trabajo de App Store
Connect: subir los ocho screenshots (listos en `screenshots/appstore/`, 1320×2868), aplicar los
precios nuevos, y cambiar el correo de soporte. El bloqueante técnico —**probar el reset de
contraseña en producción**, donde nunca había corrido— quedó **cerrado y en verde el 2026-08-24**
(punto 13 de NEXT_STEPS). Enseñar `para_que` y el médico también está hecho (`a2fafc7`, `922250e`).

⚠️ Al publicar la 2.0 hay que subir `public/legal/soporte.html` a la rama `gh-pages`: hoy la copia
de ahí es la de la 1.1 y las tres páginas legales publicadas **siguen diciendo el gmail viejo**, no
`soporte@pastillero.jimbera.com`. La copia del bundle sí está bien, y es la que se ve desde la app.

## Stack

- **Frontend:** React 18 + Vite 4 (JSX, sin TypeScript)
- **Estilos:** Tailwind CSS **servido desde la app**, no desde su CDN: `public/vendor/tailwind-3.4.17.js`, cargado directo en `index.html`. Sigue sin build-step de Tailwind ni `tailwind.config.js` — es el mismo script del CDN, compilando en tiempo de ejecución, solo que local. ⚠️ **No volver a apuntar a `cdn.tailwindcss.com`:** ese `<script>` BLOQUEA el renderizado, y en el primer arranque tras instalar (sin caché) congelaba la app hasta que iOS daba la petición por perdida — un minuto en device. Y como esa URL no lleva versión, un cambio de Tailwind podía alterar el aspecto de la app ya publicada. Para actualizar: descargar `cdn.tailwindcss.com`, guardarlo en `public/vendor/` con su versión en el nombre y cambiar la línea de `index.html`. Dark mode automático vía `prefers-color-scheme`.
- **Fuente:** Nunito desde Google Fonts, con **un solo `<link>` en `index.html`**. Estuvo repetida en 16 componentes, que la inyectaban al montarse y la quitaban al salir. No devolverla a los componentes.
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
- **Migrations:** `db/migrations/` — SQL versionado (001 multipaciente, 002 RLS, 003 fecha_inicio, 004 paciente_default, 005 prod_parity, 006 pauta del medicamento, 007 suspender, 008 medicos + citas, 009 segundo aviso de cita, 010 ficha de emergencia, 011 existencias de la caja). Se corren **manualmente** en el SQL Editor del Dashboard de Supabase, y **en dev Y prod** para mantener los dos entornos homologados.

## Estructura

```
src/
  main.jsx        # Entry point (ReactDOM.createRoot)
  App.jsx         # Composición: estado que se comparte, acciones de dosis, gates y rutas (~540 líneas)
  purchases.js    # RevenueCat
  domain/         # PURO: sin React, sin red, sin storage. Probable con `node` a secas.
    schedule.js   #   getHoras, isPillDueOnDay, pautaLabel — de aquí salen las horas y los días
    dosage.js     #   cantidad por toma (DECIMAL: media, un cuarto) y doseLabel
    medTypes.js   #   12 tipos (pastilla, pomada, gotas…) con su verbo, unidad y si llevan cantidad,
                  #   y TIPOS_CON_CAJA: solo pastilla y cápsula llevan control de existencias
    citas.js      #   tipos de cita, próximas vs pasadas y CUÁNDO suena el aviso (momentoDelAviso)
    sesion.js     #   anónimo vs permanente, y por qué falló crear la sesión (reintentable o no)
    plan.js       #   qué es gratis y qué de pago, y el corte de 7 días del historial
    emergencia.js #   qué entra en la ficha de urgencia (los suspendidos NO) y en qué orden
    inventario.js #   la caja: lo que queda se DERIVA de las tomas desde un corte, nunca se descuenta
    posponer.js   #   posponer es local y se caduca solo — no es un estado de la BD
    resena.js     #   cuándo se ha ganado el derecho a pedir la valoración (5 días con dosis)
    dates.js  catalogs.js
    *.test.mjs    #   529 pruebas, sin framework: `node src/domain/schedule.test.mjs`
  lib/            # Efectos laterales aislados
    supabase.js  storage.js  offlineQueue.js  notifications.js  biometrics.js  config.js
    socialLogin.js #  tokens de Apple/Google; SocialLogin.initialize NO admite dos configuraciones
    fichaImagen.js #  la ficha de urgencia dibujada en Canvas — se comparte como IMAGEN, no texto
    resena.js      #  pedirResena() vía in-app-review; solo se marca si la llamada no lanzó
    citaNotifs.js #  avisos de las citas — espacio de nombres propio (extra.cita)
    anonAuth.js   #  crear la sesión anónima (entrar sin registro) — flag ANON_SESSION_ENABLED
  hooks/          # Estado + efectos agrupados por tema
    useSession  usePremium  usePacientes  usePills
    useNotifScheduling  useOfflineQueues  useCriticalAlerts  useCitas
    useInventario #  solo trae las tomas ANTERIORES al mes cargado; si esa consulta falla,
                  #  la caja se CALLA en vez de enseñar un número más alto del real
  components/     # PillForm PacienteForm CitaForm MedicoCombobox DoseConfirmModal GroupDoseModal Paywall TabBar
  screens/        # Home Login Setup Settings Medicamentos Pacientes Citas Reportes BiometricLock
                  # MiSalud FichaEmergencia CrearCuenta
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

## Diseño: el prototipo manda

⚠️ **Toda pantalla del modelo nuevo se construye mirando `docs/prototipos/prototipo-sin-muros.html`.**
Es el rediseño **aprobado** por el usuario: 17 pantallas en 4 flujos, cada una con su texto exacto
y el razonamiento al lado. Se abre con doble clic; el texto se puede extraer del HTML.

No es un adorno ni una referencia opcional: es bonito y **funcional**, y sus decisiones de copy
están razonadas con los números reales del embudo. Ejemplo de lo que se pierde al no mirarlo: la
pantalla de bienvenida decía "Configura tus medicamentos" (pide una tarea) en vez de "Empieza por
tu primer medicamento" (pide UN paso) + "No necesitas crear cuenta", que es la objeción número uno
de quien acaba de descargar una app de salud.

**Antes de escribir una pantalla nueva: abrir el prototipo y copiar su texto y su estructura.**
Si algo se aparta de él, que sea una decisión consciente y dicha en voz alta, no un descuido.

Ver `docs/prototipos/README.md` y la memoria `project_modelo_monetizacion_v2`.

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
- ⚠️ **Dos programadores de notificaciones que NO se pueden pisar.** El de dosis (`scheduleLocalNotifs`) reprograma **cancelando todo lo pendiente** salvo lo que lleve `extra.snooze` o `extra.cita`; el de citas (`scheduleCitaNotifs`) cancela **solo** lo que lleve `extra.cita === true`. Si se agenda algo nuevo que deba sobrevivir a una reprogramación de dosis, hay que marcarlo en `extra` **y** añadirlo a esa lista de preservados, o desaparecerá en silencio. El presupuesto de iOS (~64) se reparte con cuotas fijas: `DOSIS_CAP` + `CITAS_CAP` = `NOTIF_CAP`.
- Sonidos: archivos `.caf` para notificaciones nativas iOS, `.mp3` para reproducir desde la web. El mapeo de nombres está en la constante `SONIDOS` en `src/lib/notifications.js`.
