# Prototipos navegables

Dos prototipos hechos para **decidir** el rediseño de la app, no para copiarse tal cual.
Se abren con doble clic en cualquier navegador (son autocontenidos, no necesitan servidor).

También están publicados como artifacts privados en la cuenta del usuario, pero **esas URLs no
son legibles por otra sesión**; estos archivos sí. Si algo del prototipo hay que consultar,
leer estos HTML — traen el texto exacto de cada pantalla y la nota que explica cada decisión.

## `prototipo-sin-muros.html` — el modelo nuevo (APROBADO)

17 pantallas en 4 flujos, cada una con el razonamiento al lado. Es la referencia visual de la
Ola 1. Lo que hay que respetar de aquí:

- **Se entra sin registro.** Sesión anónima de Supabase por debajo; la cuenta se pide AL COMPRAR,
  no al abrir. "Registro para poder pagar", no "para poder probar".
- **Tres puertas con candado en el Home** (avatar → varias personas, tarjeta → historial,
  pestaña → citas) y las tres llevan a la MISMA hoja de pago.
- **La prueba de 7 días arranca al tocar algo premium**, no al abrir la app.
- **La ficha de emergencia va gratis** y se autocompone con los medicamentos ya capturados.
- Lo premium se ve **velado con candado**, nunca oculto: "ver, no usar".

Ojo: las pestañas del prototipo son *Hoy · Mi salud · Citas · Ajustes*, y las construidas son
*Hoy · Calendario · Reportes · Ajustes* — se pusieron las que ya tenían contenido detrás.
`src/components/TabBar.jsx` guarda las pestañas en una lista preparada para añadir las otras dos.

## `pauta-karen.html` — la decisión sobre los ejes de la dosis (CERRADA)

Compara tres opciones para "una dosis de lunes a jueves y otra de viernes a domingo".
**Se eligió A + duplicar, y ya está construido.** Se conserva porque su cuarta pestaña explica
por qué los mapas sueltos no escalan (una cuadrícula de 21 celdas en un teléfono), y eso es lo
que hay que releer si algún día se plantea B2 (pautas como lista de reglas).

---

Las decisiones de fondo están en la memoria del proyecto:
`project_modelo_monetizacion_v2`, `project_pauta_real_medicamentos`, `reference_prototipos`.
