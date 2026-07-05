# Roadmap Mi Pastillero → App Store

Plan estratégico para llegar a producción. Complementa [NEXT_STEPS.md](NEXT_STEPS.md) (pendientes técnicos puntuales).

## Decisiones ya tomadas

| Aspecto | Decisión |
|---|---|
| **Modelo de monetización** | Hard paywall trial-to-paid (7 días de prueba, luego se cierra el acceso si no paga). **No hay free tier permanente**. |
| **Trial** | 7 días gratis, disponibles solo para usuarios nuevos (`Introductory Offer` de Apple). |
| **Precio semanal** | $29 MXN (~$1.50 USD) |
| **Precio mensual** | $89 MXN (~$4.50 USD) |
| **Precio anual** | $599 MXN (~$30 USD) — ahorro de 44% vs mensual |
| **Apple Developer Program** | ✅ Ya pagado |
| **BD producción** | Se usará `mi-pastillero` (`kbsxjdtdleauzvbtbrqi`, ahora pausado) cuando toque salir a prod. Dev sigue en `mi-pastillero-dev` (`hylwfravrxnlifxefuey`). |
| **Web y legales** | Pendientes. Se planean en GitHub Pages (gratis). |

**Nota sobre precios**: si en TestFlight/lanzamiento notamos baja conversión trial→paid, considerar bajar el semanal ($19), o hacer el trial más largo (14 días).

---

## FASE 1 — Terminar el producto
**Estimado: 10-15 horas**

| # | Tarea | Prioridad |
|---|---|---|
| 1.1 | Pantalla **"Establecer nueva contraseña"** post reset email | Alta |
| 1.2 | **Google OAuth nativo** iOS (sin URL Supabase visible) | Alta |
| 1.3 | **Onboarding** 3 slides tras signup | Media |
| 1.4 | **Warning amarillo** de Security Advisor Supabase | Baja |
| 1.5 | Investigar **colisión de horarios** al mismo minuto | Media |
| 1.6 | Integrar **RevenueCat** (via `@capgo/capacitor-purchases`) | Alta |
| 1.7 | **Paywall** con 3 planes (semanal / mensual / anual) | Alta |
| 1.8 | Gate: **si !trial && !suscrito → mostrar paywall** en cada apertura | Alta |
| 1.9 | Botón **"Restore Purchase"** siempre visible (requisito Apple) | Alta |
| 1.10 | Manejo de **eventos de RevenueCat** (webhook a Supabase para sincronizar estado de suscripción por usuario) | Media |

---

## FASE 2 — TestFlight
**Estimado: 1-2 semanas de iteración con usuarios reales**

TestFlight es el sistema oficial de Apple para pruebas beta. Los testers instalan la app "TestFlight" en su iPhone y desde ahí acceden a tu app sin pasar por App Store.

**Modalidades:**
| Tipo | Testers | Review Apple |
|---|---|---|
| Internal | Hasta 100 del equipo Apple Dev | ❌ Instantáneo |
| External | Hasta 10,000 públicos (link o email) | ✅ Beta App Review (~24-48h, mucho más simple que la del Store) |

**Pasos:**
1. Setup en App Store Connect (crear la app record)
2. En Xcode: Product → Archive → Distribute → App Store Connect
3. Esperar procesamiento (~15 min)
4. Crear grupo de testers, invitar por email
5. Recolectar feedback (Apple da un canal de comentarios integrado)
6. Iterar builds

**Beta con testers de confianza** (5-10 personas primero: familia, amigos, colegas médicos si tienes).

---

## FASE 3 — Monetización: RevenueCat + suscripciones
**Estimado: 8-12 horas**

### Por qué RevenueCat vs StoreKit puro
- **Gratis hasta $2,500/mes** de ingresos
- Envuelve StoreKit 2 (menos código)
- Webhook a Supabase para saber quién está suscrito sin tener que verificar con Apple cada vez
- Restore, upgrade/downgrade, promo codes, refunds — todo manejado
- Multi-plataforma (Android futuro, mismo código)

### Configuración en App Store Connect

Un solo **Subscription Group** llamado ej. "Mi Pastillero Premium" con 3 productos:

| Product ID | Duración | Precio MXN | Precio USD (aprox) |
|---|---|---|---|
| `mipastillero_weekly` | 1 semana | $29 | $1.50 |
| `mipastillero_monthly` | 1 mes | $89 | $4.50 |
| `mipastillero_yearly` | 1 año | $599 | $30 |

**Introductory Offer**:
- Tipo: **Free**
- Duración: **1 semana**
- Se ata al plan **mensual** (recomendación estándar)
- Elegibilidad: **New subscribers only**

### Comisión de Apple
- Default: 30%
- Small Business Program (menos de $1M/año): **15% siempre** — te conviene inscribirte
- 15% también aplica automáticamente al 2° año de un suscriptor renovado

### Configuración RevenueCat
1. Crear cuenta en revenuecat.com (gratis)
2. Crear "App" con Bundle ID `com.mipastillero.app`
3. Configurar los 3 productos vinculando a los IDs de App Store Connect
4. Crear **Entitlement** único: `premium`
5. Crear **Offering** con las 3 opciones para mostrar en el paywall
6. Copiar la API key iOS al `.env` como `VITE_REVENUECAT_KEY`
7. Webhook a Edge Function de Supabase que actualice tabla `subscripciones` (o campo en `auth.users`)

### Código en la app
```js
// Al iniciar sesión
await Purchases.configure({ apiKey: VITE_REVENUECAT_KEY, appUserID: session.user.id });
const info = await Purchases.getCustomerInfo();
const isPro = info.entitlements.active['premium'] !== undefined;

// Si no isPro && trial expiró → mostrar paywall
if (!isPro && !enTrial) return <PaywallScreen />;
```

---

## FASE 4 — Setup producción
**Estimado: 4-6 horas**

### 4a. BD de producción
1. Ir a Supabase Dashboard → **reanudar** proyecto `mi-pastillero` (`kbsxjdtdleauzvbtbrqi`)
2. Correr `db/migrations/001_multipaciente.sql` en el SQL Editor de ese proyecto
3. Correr `db/migrations/002_enable_rls.sql`
4. Copiar las nuevas keys al `.env.production`:
   - `VITE_SUPABASE_URL` (URL del proyecto prod)
   - `VITE_SUPABASE_KEY` (publishable)
   - Guardar la `service_role` fuera de git para diagnóstico
5. Configurar Vite para usar `.env.production` al hacer build de release
6. Build + Archive de prod desde Xcode apuntando a la BD prod

### 4b. Web + legales (GitHub Pages, gratis)
Estructura sugerida en `docs/`:
```
docs/
  index.html          # Landing (logo + descripción + links)
  privacy.html        # Privacy Policy
  terms.html          # Terms of Service
  support.html        # Contacto + FAQ
```
Publicado automático en: `https://ailablearning-dot.github.io/mi-pastillero/`

**Privacy Policy** debe cubrir:
- Datos que recolectas (email, pastillas, medicamentos, biometría — pero SOLO local, no sube)
- Que usas Supabase (data processor)
- No vendes datos a terceros
- Uso de notificaciones locales
- Derecho a eliminar cuenta (importante — hay que dar UI para esto en la app también)

**Terms of Service** debe cubrir:
- Suscripción auto-renovable, cómo cancelar, dónde
- Reembolsos (redirigir a Apple)
- Disclaimer médico (la app NO es dispositivo médico, no reemplaza consejo médico profesional)

Puedes usar [App Privacy Policy Generator](https://app-privacy-policy-generator.firebaseapp.com/) como base y luego editarlo.

### 4c. Requerimiento no-obvio: función para eliminar cuenta
Apple exige (desde 2022) que las apps con cuenta permitan eliminarla desde dentro de la app. Requiere:
- Settings → botón "Eliminar cuenta"
- Confirmación con contraseña o Face ID
- Borra usuario de Supabase auth + cascade a sus pastillas/medicamentos/pacientes

---

## FASE 5 — App Store submission
**Estimado: 3-5 horas de prep + 2-7 días de espera Apple**

### Assets
| Asset | Requisito |
|---|---|
| App Icon 1024x1024 | ✅ Ya está |
| Screenshots iPhone 6.7" | 5-8 imágenes, obligatorio |
| Screenshots iPhone 6.5" | Se usan los mismos si es mismo aspect ratio |
| App Preview Video (opcional) | 15-30 seg, recomendado |

**Screenshots sugeridos** (con overlay de texto explicativo):
1. Vista Hoy con progreso — "Nunca olvides una pastilla"
2. Notificación llegando — "Alertas puntuales a tu hora"
3. Selector de paciente — "Cuida a toda tu familia"
4. Pantalla Reportes — "Comparte con tu médico"
5. Face ID activación — "Tu información, privada"
6. Dark mode — "Bonito de día y de noche"

Herramientas para mockups: [Screenshots.pro](https://screenshots.pro/), [Shotstack](https://shotstack.io/), o Figma con templates gratis de la comunidad.

### Contenido App Store Connect
- **Nombre**: "Mi Pastillero" (30 chars)
- **Subtitle**: "Tus medicamentos puntuales" (30 chars)
- **Description**: 4000 chars — describe features, beneficios, aviso de suscripción
- **Keywords** (100 chars sin espacios entre comas): `medicamentos,pastillas,recordatorio,salud,alarma,paciente,dosis,farmacia,adherencia,medicos`
- **Primary Category**: Medical (o Health & Fitness)
- **Age Rating**: formulario Apple (probablemente 4+)
- **Support URL**, **Privacy Policy URL** (obligatorios)

### Datos para el reviewer
- Cuenta demo (email + password) que funcione
- Notas explicativas: "Es una app de recordatorios de medicamentos con suscripción. Usa notificaciones locales (no push server-side). Face ID es opcional para desbloquear. Los datos se guardan en Supabase con RLS."

---

## 📊 Cronograma

| Semana | Fase | Hitos |
|---|---|---|
| 1-2 | Fase 1 | Terminar auth + onboarding + integración RevenueCat |
| 3 | Fase 1 | Paywall + testing local de suscripciones (sandbox de Apple) |
| 4 | Fase 2 | Primer build a TestFlight interno (5-10 amigos) |
| 5 | Fase 2 | External Testing (~20-50 personas, iterar bugs) |
| 6 | Fase 4a | Setup Supabase prod + migrations |
| 6-7 | Fase 4b | GitHub Pages: landing + Privacy + Terms |
| 7 | Fase 5 | Screenshots + description + submit |
| 8-9 | Espera | Apple review + posibles rechazos |
| 9-10 | 🚀 | Launch en App Store |

**Total realista: 8-10 semanas** trabajando part-time.

---

## ⚠️ Cosas críticas que no se pueden olvidar

1. **Función "Eliminar cuenta"** en la app (Apple lo exige desde 2022)
2. **Restore Purchase** siempre visible en el paywall
3. **Precio y duración** claros ANTES de la compra ("Al finalizar el trial se cobrarán $89 MXN mensuales")
4. **Cómo cancelar** explicado en Terms + link a Settings de iOS
5. **Disclaimer médico** — la app NO reemplaza al médico
6. **Privacy Policy URL** debe funcionar y estar accesible al momento del submit
