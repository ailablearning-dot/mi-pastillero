# Próximos pasos — Mi Pastillero

> ⚠️ **Todo lo que hay por debajo de la sección "2.0" es de la 1.0/1.1 y se conserva como
> historial.** La 1.1 ya está publicada. El plan vigente es el de aquí arriba.

---

# 🎯 2.0 — el modelo sin muros

Rediseño **aprobado** en el prototipo `docs/prototipos/prototipo-sin-muros.html` (17 pantallas,
4 flujos, cada una con su razonamiento). Las decisiones de fondo están en la memoria del
proyecto: `project_modelo_monetizacion_v2`.

**El problema que resuelve, con los números de la 1.1:** 287 instalaciones en 28 días, 16 cuentas
creadas, **11 de esas 16 sin un solo medicamento**, 1 suscripción. No hay problema de atracción
—la ficha convierte al 34,8 % y entran 7-10 descargas diarias sin publicidad— sino de los
**primeros treinta segundos**: hoy se pide cuenta y acto seguido se cobra, antes de que nadie
haya visto una pastilla.

**Las cuatro reglas del modelo nuevo:**
1. **Se entra sin registro.** Sesión anónima de Supabase; la cuenta se pide **al comprar**.
   Registro para poder pagar, no para poder probar.
2. **Lo premium se ve velado con candado, nunca oculto.** "Ver, no usar".
3. **La prueba de 7 días arranca al tocar algo premium**, no al abrir la app.
4. **Tres puertas con candado en el Home** (avatar → varias personas, tarjeta → historial,
   pestaña → citas) y las tres llevan a la MISMA hoja de pago.

## El reparto: qué es gratis y qué es de pago

| GRATIS (el motor del hábito) | PREMIUM (mi historia y mi futuro) |
|---|---|
| Medicamentos **ilimitados**, una persona | Varias personas (multipaciente) |
| Recordatorios completos | Historial completo + adherencia + Excel |
| Historial de los **últimos 7 días** | Citas médicas con recordatorios |
| **Ficha de emergencia** (la joya, y va gratis a propósito) | "Mi salud": medicamentos ampliados y receta |
| Ver lo premium, velado | Ficha en PDF para el médico |

La ficha de emergencia va gratis **a propósito**: multipaciente —lo más fuerte de la ola— no
vale nada para quien no cuida a nadie, y la ficha y el PDF son las que sí le hablan al paciente
solo. Como se alimenta de alergias y condiciones, **capturarlas también es gratis**.

## ✅ Ya construido (rama `refactor/modularizacion`, sin publicar)

- **Modularización** de `App.jsx` (3723 → 537 líneas). Era el paso previo a todo esto.
- **Citas médicas completas**: dominio con pruebas, avisos con espacio de nombres propio,
  pantalla, formulario, combobox de médicos y pestaña. Migraciones 008 y 009 corridas en dev y prod.
- **Medicamentos ampliados, la mitad**: tipo, cantidad fraccionaria, días de la semana, nota
  (006) y suspender (007).
- **Tabla `medicos`** y su combobox (hoy solo enganchado al formulario de citas).
- Multipaciente, reportes/Excel e historial completo: **ya existían**; hoy están sepultados
  detrás de los dos muros, que es justo lo que esta versión desentierra.
- 224 pruebas del dominio en verde.

## ⬜ Lo que falta para la 2.0

> **Estado a 2026-08-19.** Todo lo de abajo está tras el flag `MODELO_SIN_MUROS` (hoy en `false`
> en el repo). Encenderlo cambia la app entera; con él apagado se comporta como la publicada.

### A · Gratis — quitar los muros (es el corazón del cambio)
1. ✅ **Sesión anónima de Supabase** al primer arranque, sin pantalla de registro. *Hecha y
   validada en device.* Requiere DOS interruptores en el dashboard ("Anonymous sign-ins" y
   **"Manual linking"**), ya activados en dev y prod.
   - ⏳ **Lo delicado no es crearla, es CONVERTIRLA** (punto 7). Al comprar hay que promover el
     usuario anónimo a uno con correo sin perder sus datos. Si en vez de convertir se crea una
     cuenta nueva, el usuario pierde todo lo capturado justo al pagar. **Comprobado que el camino
     funciona**: conserva el mismo id de usuario y usa el flujo OTP que ya existe.
   - ✅ El **primer arranque sin red** ya no cuelga: pantalla honesta con reintento, que se
     resuelve sola al volver la conexión.
   - ⏳ **Anónimo que borra la app = datos huérfanos.** Confirmado en device. Falta ofrecer cuenta
     al tercer día sin bloquear, y el job que limpie las abandonadas.
   - ✅ Ya se recupera de una **sesión huérfana** (usuario borrado en el servidor), que es lo que
     provocará ese job de limpieza.
2. ✅ **Ficha de emergencia** + captura de alergias y condiciones. *Construida (`3abb4cc`,
   `561af85`) y **VALIDADA en device el 2026-08-22**.* Migración **010** aplicada en dev **y en
   prod** (la corrió el usuario; auditada contra la lista de las cuatro cosas que romperían el
   cliente publicado — ninguna aplica: es aditiva, anulable e idempotente). Alergias con gravedad, condiciones, contacto y los medicamentos activos
   que se componen solos (los suspendidos NO entran: en una urgencia un dato viejo es peor que
   ninguno). Va gratis, sin pasar por `bloqueado()`.
   - Entrada **provisional en Ajustes**, en rojo y avisando si está sin llenar. Su sitio del
     prototipo es la pestaña "Mi salud" (punto 4); se muda cuando exista.
   - ⬜ **Lo que NO se construyó, y el prototipo sí promete: "visible sin desbloquear el
     teléfono".** Eso es un widget de pantalla de bloqueo — extensión WidgetKit en Swift, App Group
     y un puente desde JS para escribir la ficha en el almacén compartido. Es un bloque propio, con
     su compilación y su paso por revisión de Apple. La pantalla NO lo promete mientras no exista.
3. ✅ **Corte de 7 días** en el calendario: los días fuera del plan se ven velados y con candado,
   con su línea que lo explica y abre la hoja de pago. Las estadísticas del mes se calculan solo
   sobre los días visibles cuando no se paga.
4. ✅ **Pestaña "Mi salud"** y la barra a cuatro (`842fda5`). *Construida y **VALIDADA en device
   el 2026-08-22**.* La barra es ya *Hoy · Mi salud · Citas · Ajustes*.
   - ⚠️ **La suposición de este punto era falsa.** Decía que Calendario y Reportes irían
     "probablemente dentro de Mi salud". El prototipo los pone bajo **HOY**, y tiene razón: Hoy y
     el historial son el mismo eje —mi día, mis días—, mientras "Mi salud" es lo que la persona ES
     y no depende de una fecha.
   - **Mi historial** es ahora una tarjeta a todo lo ancho al final de las dosis de Hoy, con el
     límite dicho ahí ("Ves los últimos 7 días"). ⚠️ No volver a convertirlo en un icono del
     encabezado: de ahí salió a ser pestaña porque nadie lo encontraba.
   - **Reportes** dejó de ser pestaña y es una salida del historial. Su **candado se mudó con él**;
     era la parte delicada, porque al quitar la pestaña la función de pago se quedaba sin puerta.
   - **Mis medicamentos** y la **ficha de emergencia** se mudaron de Ajustes a "Mi salud".
   - ⬜ Los módulos de las olas 2 y 3 (signos vitales, consultas, médicos, documentos) **no se
     pintan** todavía: el prototipo los lista con la etiqueta "OLA 2", que es anotación nuestra.
     Se añaden al índice cuando existan.

4b. ✅ **El primer arranque tardaba 3-4 s en "Cargando…"** — atacado por los dos lados: la espera
   tiene la cara de la app (logo + "Preparando tu pastillero…") y se quitaron **dos de los cuatro
   viajes** a la red aprovechando que una sesión recién creada está VACÍA con certeza. Queda el
   detalle histórico: (medido en device, instalación limpia).
   Es esperado por cómo está construido, no un fallo: en una instalación nueva hay **cuatro
   viajes a la red encadenados** antes de poder pintar nada — crear la sesión anónima, consultar
   pacientes, dar de alta el paciente "Yo", y consultar medicamentos. Cada uno depende del
   anterior, así que no se pueden solapar sin rehacer el arranque.

   **Pero es el peor momento posible para una pantalla gris.** Es el primer contacto con la app,
   justo el segundo que este modelo existe para ganar, y hoy se resuelve con un texto "Cargando…"
   sobre fondo vacío. Dos caminos, de menor a mayor esfuerzo:
   - **Barato y ya:** que esa espera tenga la cara de la app — logo y un "Preparando tu
     pastillero…". No acelera nada pero cambia por completo la percepción de 4 segundos.
   - **De fondo:** adelantar la creación de la sesión anónima al arranque de la plataforma, y
     crear el paciente "Yo" en la misma llamada que la consulta (o con un valor por defecto
     local que se sincroniza después). Quita dos viajes de los cuatro.

   ⚠️ No confundir con el "Esto está tardando más de lo normal", que salta a los 8 s: eso es la
   red de seguridad para cuando algo falla, no esta espera normal.

### B · Premium — la monetización nueva
5. ✅ **Muro duro sustituido por gating contextual.** La hoja de pago se abre desde la puerta que
   se toca, nombra esa función, y **se puede cerrar** para seguir en la parte gratis. Puertas
   cerradas: pestaña **Citas**, pestaña **Reportes**, **avatar** (multipaciente), **días velados**
   del calendario y **"Gestionar pacientes"** en Ajustes. Todas pasan por un único `bloqueado()`
   en App para que ninguna se quede abierta por olvido. El reparto vive en `domain/plan.js`.
   - ✅ **Y la hoja tiene que ser coherente de arriba abajo** (`62dd9da`, visto en device): el
     título hablaba de citas y la lista de debajo, de otra cosa — citas no aparecía siquiera en lo
     que Premium incluye. Ahora la lista sale de `domain/plan.js`, **empieza por la puerta que se
     tocó** y lleva la frase puente del prototipo ("Premium incluye mucho más que las citas").
     De paso se cayó un fallo de fondo: la lista era la del muro duro de la 1.1 y seguía vendiendo
     como premium los **recordatorios** y el **respaldo en la nube**, que en este modelo son gratis.
     ⚠️ El **expediente** se queda fuera de la lista hasta que exista (punto 10/12).
6. ✅ **La prueba de 7 días arranca al tocar premium.** No hizo falta código nuevo: la prueba es
   una *Introductory Offer* de la App Store y Apple la concede **al comprar**, nunca antes. Lo
   que cambiaba era CUÁNDO se ve el paywall, y eso lo resolvió el punto 5. Antes salía en el
   segundo cero y se empezaba la prueba sin entender nada; ahora se empieza al chocar con una
   necesidad real.
   - Sí hubo que arreglar un daño colateral: al poner el motivo contextual en el título
     desapareció "Prueba 7 días gratis" de la cabecera y quedó solo en el botón y la letra
     pequeña. Ahora hay una etiqueta verde permanente: el título dice su problema, la etiqueta
     dice que probarlo no cuesta nada.
7. ✅ **Registro movido al final del embudo** (al comprar). *Construido y VALIDADO en device: las
   tres vías —correo, Google y Apple— convierten al usuario anónimo sin perder nada.* Pantalla
   "Guarda tu suscripción" tras la compra, con el aviso azul de que los datos ya están guardados,
   y entrada permanente en Ajustes para quien dijo "más tarde".
   - **Vincula el correo al usuario anónimo que YA existe** (`updateUser({email})` → código →
     contraseña). El id de usuario NO cambia: no se migra ni una fila. Crear una cuenta nueva y
     mover los datos sería el error caro del modelo.
   - El caso peligroso está cubierto: si el **correo ya tiene cuenta**, Supabase lo rechaza y la
     pantalla lo explica, en vez de intentar arreglarlo por debajo.
   - Es **opcional** y la contraseña también: ya pagó, ponerle un muro después de cobrar sería
     indefendible.
   - ✅ **Apple y Google**, con `linkIdentity` y el token nativo (sin navegador). Van primero en
     la pantalla, como el prototipo: son un toque con Face ID y no dependen de que llegue ningún
     correo. La obtención de tokens se unificó en `src/lib/socialLogin.js`, que comparten el login
     de siempre y la conversión — `SocialLogin.initialize` no puede llamarse dos veces con
     configuraciones distintas.
   - ✅ **Apple validado en device el 2026-08-21.** Era lo último que no se podía verificar en el
     navegador, porque el diálogo nativo de Apple no existe ahí.
     El bloqueo que lo tuvo parado no era el que se creía: la **identidad** de Apple ya estaba
     libre, y lo que chocaba era la **DIRECCIÓN** del token, que pertenecía a otro usuario de dev
     (error `email_exists`, no `identity_already_exists`). Se liberó renombrando ese correo. Si
     vuelve a pasar, el mensaje lo distingue solo: si habla de *correo* cuando se tocó *Apple*, es
     la dirección; si habla de *cuenta de Apple o Google*, es la identidad.
   - ⚠️ Y de probarlo salió un fallo ya corregido: esta pantalla tiene **dos entradas** —tras la
     compra y desde Ajustes— y titulaba "Guarda tu suscripción" también a quien no había comprado
     nada. Además su subtítulo contradecía al aviso azul. Arreglado en `a2bd9d5`.
   - ⚠️ **¿La cuenta debe ser OBLIGATORIA tras pagar?** Planteado por el usuario, y su instinto es
     correcto: mientras sea opcional, alguien puede pagar y no asociar nunca sus datos.
     **Pero el orden importa y hoy NO se puede.** Obligar con solo la vía del correo ata "poder
     usar la app que acabo de pagar" a "que llegue un correo": si el envío falla —y el SMTP de
     prod está **sin verificar**, ver punto 13— dejas fuera a un cliente que ya pagó. Eso es peor
     que el problema que resuelve.
     **Secuencia correcta:** primero Apple y Google (un toque con Face ID, sin depender del
     correo), y entonces sí se puede exigir la cuenta al terminar la compra. Hasta entonces se
     queda opcional con el aviso permanente en el home.
8. ✅ **Gate a Citas** puesto (pestaña con candado).
9. ~~**Plan mensual: fijar precio**~~ ✅ **DECIDIDO 2026-08-23** — sube toda la escalera a la
   **paridad con la competencia**: semanal **$29 → $39 MXN** ($1.49 → **$1.99** USD) y mensual
   **$59 → $69 MXN** ($2.99 → **$3.49** USD). **El anual NO se toca** ($499 MXN / $24.99 USD).
   - **Los tres productos ya existen y están vivos** en México y Costa Rica. Esto NO es crear nada:
     es editar el precio en App Store Connect. El paywall lee `priceString` de StoreKit
     (`Paywall.jsx:165`) y los badges de ahorro se recalculan solos — **cero código**.
   - **Por qué paridad y no debajo:** estábamos 25 % bajo la competencia en los dos planes sin
     haberlo decidido. Nadie compara dos apps de pastillas lado a lado, así que ese descuento no
     compraba ninguna descarga; y en salud el precio bajo resta confianza. Encima de la competencia
     tampoco se puede **todavía**: hace falta una razón visible en la ficha de la App Store, y la
     habrá cuando salga la 2.0 con multipaciente y expediente. **Paridad es el precio correcto
     mientras no haya argumento, no un compromiso permanente.**
   - **Se abandona el criterio del 50-60 %** de ahorro del anual: no se puede cumplir sin salirse
     del mercado (exigía un mensual de $83-104). Queda en **40 %** contra doce mensualidades y
     **75 %** contra 52 semanas, parejo en los dos países. 40 % ya es el doble de lo habitual
     ("dos meses gratis" son 17 %).
   - ⏱️ **Hacerlo ANTES de que haya un solo suscriptor semanal o mensual.** Hoy no hay ninguno (el
     único de pago real es anual, más los dos accesos de cortesía), así que es editar un campo. Con
     uno solo pagando el precio viejo, Apple exige notificar y pedir consentimiento, y a quien no
     conteste se le corta la renovación.
   - ⚠️ **Esto no mueve la aguja y no hay que fingir que sí.** Con un suscriptor real la diferencia
     son unos pesos al mes. La fuga son los 11 de 16 que nunca agregaron un medicamento: esos ni
     llegaron al paywall. El dinero está en el modelo sin muros, no en estos $10.
   - **El plan semanal casi no tiene comprador honesto** en una app de medicación crónica: quien
     toma losartán lo toma para siempre. Su usuario real es el del tratamiento corto (diez días de
     antibiótico, analgésico posoperatorio). Que exista está bien; la puerta de entrada es el
     mensual, no el semanal.
10. **La pantalla de detalle del medicamento** — los puntos 10 y 12 son LA MISMA PANTALLA
    («El detalle, con la receta» en el prototipo), dentro de *Mis medicamentos* → *Mi salud*.
    Separarlos en el plan fue un error de este documento: se construyen juntos o se toca la misma
    pantalla tres veces. Lleva tres cosas:
    - **«¿Para qué lo tomas?»** (`para_que`) — en palabras del paciente; es lo que alimenta la
      ficha de emergencia.
    - **«¿Quién te lo indicó?»** (`medico_id`) — vínculo a un registro, no texto libre.
    - **Foto de la receta** — el papel que te dieron en el consultorio.

    De las tres, **las dos primeras son casi regalo**: las columnas ya existen (migración 008) y
    el combobox de médicos ya está construido para citas; solo hay que engancharlos a `PillForm`.
    La foto es la única que trae obra nueva (Supabase Storage).

    Sobre la foto, dos condiciones de alcance que vienen del prototipo:
    - **Es un CAMPO del medicamento, no un módulo de documentos.** Una foto colgada del
      medicamento: sin carpetas, sin categorías, sin visor, sin buscador. En cuanto se vuelve
      «gestor de documentos» te comes la Ola 3 entera por adelantado.
    - **Comprimir en cliente** (~1600 px + JPEG 70 %): una foto de iPhone son 3-5 MB y comprimida
      ~300 KB. **El argumento cambió**: el proyecto está en **plan Pro**, así que no hay un muro
      de 1 GB cerca — es control de coste (más de 10× en la factura), no supervivencia.
11. ✅ **Compartir la ficha médica**. *Construido (`a5cf233` texto → `99651b2` imagen) y
    **VALIDADO en device el 2026-08-22**.* Salió de una pregunta del usuario que dio en el hueso: "¿de qué sirve la
    ficha si no se puede compartir?". La respuesta honesta era que estaba construida a medias — la
    captura y la vista, sin la salida.
    - Se comparte como **IMAGEN** (`src/lib/fichaImagen.js`, Canvas a 1080 px), y el texto plano se
      probó primero y se **descartó en device**: "se ve súper simple es un texto, y además se puede
      editar". Lo segundo es lo grave — quien la recibe podría cambiar una alergia antes de
      reenviarla, y un documento que se edita no es un documento. Una imagen no se edita, se ve
      dentro de la conversación sin abrir nada, se guarda en Fotos y se imprime desde la misma hoja
      del sistema. El **PDF** sigue descartado: una librería nueva en el bundle y, en WhatsApp, un
      archivo que hay que abrir.
    - El documento se ordena por **lo que se necesita en una urgencia**, no por el orden de captura:
      cabecera en rojo sólido con el nombre en grande (una miniatura en un chat tiene que decir
      "urgencia" antes de que nadie la abra), un icono por bloque dibujado a mano en Canvas, filete
      entre filas, la alergia **GRAVE** con banda y barra roja, y el **teléfono a 52 px** — es el
      único dato de la ficha sobre el que se ACTÚA y se leía igual que una alergia.
    - Se dibuja con las **mismas funciones de `domain/emergencia`** que pinta la pantalla, así que un
      suspendido no puede colarse en lo que se comparte. Y **lleva fecha**: sin ella quien la recibe
      no sabe si fiarse.
    - **No escribe "Yo"** — es el nombre que la app pone al primer paciente y en algo enviado a otra
      persona no dice nada; cualquier otro nombre sí va, porque compartir la ficha de "Mamá" sin
      decirlo sería el error grave de esta pantalla.
    - La acción es el **icono del encabezado**, el mismo botón de Reportes. Los dos botones grandes
      al pie que hubo antes se cayeron en device: "se ve feo, súper grande".
    - **Gratis y sin decirlo.** Cobrar por sacar información médica del teléfono es indefendible, y
      poner "gratis" ahí es hablar de precios en la pantalla que se mira cuando algo va mal.
    - ⬜ **Descartado a conciencia: el widget de pantalla de bloqueo.** iOS ya tiene su Ficha médica
      visible desde el bloqueo y la app no puede escribir en ella; competir con eso es perder. Lo
      que la nuestra tiene y la de Apple no es que **se llena sola y está al día** — la de Apple se
      escribe a mano y envejece. Ese es el argumento de venta de la nuestra, no la pantalla de
      bloqueo.
12. ~~Completar medicamentos ampliados en `PillForm`~~ → **fusionado con el punto 10**: es la
    misma pantalla. Se deja el número para no renumerar el resto.

13. **Correo transaccional en producción — verificar qué SMTP está usando.**
    - **Comprobado el 2026-08-18:** el camino de correo **funciona hoy** en prod (4 usuarios
      dados de alta por correo, los 4 confirmados) y **las dos Edge Functions están ACTIVAS**,
      incluida `notify-password-changed`, que usa Resend. Esa parte del pendiente de julio ya
      estaba hecha aunque este archivo la daba por abierta.
    - **Lo que NO se puede ver desde fuera:** qué SMTP tiene configurado Auth en prod. Solo se ve
      en el dashboard (Authentication → Emails → SMTP Settings). **Hay que mirarlo.**
    - **Por qué importa:** si sigue con el servicio interno de Supabase, está limitado a unos
      pocos correos por hora y Supabase mismo dice que no es para producción. **El plan Pro NO
      levanta ese límite.** Y falla en silencio: el correo simplemente no llega.
    - **Por qué hoy no se ha notado:** el volumen es mínimo y está sesgado — de 16 altas, **9 son
      por Apple y 3 por Google**, y esas no mandan correo de confirmación. Solo 4 usuarios en
      toda la vida del proyecto han ejercitado el camino del correo.
    - ⚠️ **Cómo lo cambia el modelo nuevo, que no es lo obvio:** el plan gratis **no** sube los
      correos por delante — al contrario, con sesión anónima nadie se registra para probar, así
      que las confirmaciones en la instalación bajan a cero. El que sí los dispara es el
      **"ofrecer cuenta al tercer día"** (decisión abierta n.º 4): eso empuja a crear cuenta a
      mucha más gente que hoy, y cada una es un correo. Más los restablecimientos de contraseña
      conforme crezca la base.
    - Y el riesgo no es el promedio mensual, es el **pico**: el límite del servicio interno es
      por hora, así que un golpe de descargas tira correos sin avisar.
    - Ojo también con el techo siguiente: el plan gratuito de **Resend** ronda los 100 correos al
      día / 3.000 al mes. Conviene confirmar en qué plan está la cuenta antes de crecer.

14. ✅ **Reinstalar la app = perder el acceso que ya pagaste.** *Arreglado (`0756661`),
    pendiente de la prueba del anónimo puro en device.* Encontrado en device el 2026-08-21,
    y **no es cosa de Sandbox**: es un agujero que abre este modelo y que la versión publicada no
    tiene.

    RevenueCat identifica al usuario con **el id de Supabase** (`identifyUser(session.user.id)` en
    `hooks/usePremium.js`). Con login obligatorio ese id era ESTABLE: reinstalabas, entrabas, y
    RevenueCat te reconocía. Con sesión anónima **cada instalación nueva crea un usuario nuevo**, o
    sea un usuario de RevenueCat nuevo y sin entitlement — mientras la suscripción sigue pegada al
    Apple ID.

    El síntoma es de los peores que hay, porque cierra las dos salidas a la vez:
    - **la app** enseña el paywall (este usuario de RevenueCat no tiene nada), y
    - **Apple** responde «Ya estás suscrito» y no deja volver a pagar.

    La única salida hoy es **"Restaurar compras"**, un texto gris al pie de una pantalla que esa
    persona no debería estar viendo. Dos remedios, y no son excluyentes:
    - **Restaurar en silencio** al primer arranque de una sesión anónima: una llamada, y quien ya
      pagó entra sin enterarse. Es la red de seguridad.
    - **La cuenta tras pagar (punto 7), que es el arreglo de fondo.** Con Apple o Google vinculado,
      reinstalar → entrar → mismo id de Supabase → RevenueCat lo reconoce. ⚠️ Esto **cambia el
      argumento del punto 7**: hoy dice "para no perder tus datos si cambias de teléfono", y lo
      cierto es más fuerte y más urgente — **sin cuenta, reinstalar es perder el acceso a lo que
      pagaste**. Refuerza también la pregunta de si la cuenta debe ser obligatoria al comprar.

    ✅ **Probado en device el 2026-08-21, y salió mejor y peor de lo esperado.**
    - **Restaurar FUNCIONA** sin tocar nada en el dashboard de RevenueCat: tras reinstalar, un
      toque devolvió la suscripción entera al usuario anónimo nuevo. Así que el remedio barato
      —restaurar en silencio al primer arranque— es viable y es el que hay que hacer.
    - 🔴 **Pero restaurar devuelve el DINERO, no los DATOS.** Se comprobó con las dos filas
      delante: la suscripción volvió y el medicamento capturado antes se quedó colgado del usuario
      anterior, inalcanzable. Esto convierte "crear cuenta al pagar" de recomendable a
      **necesario**: sin cuenta, reinstalar deja a un cliente que paga con la app vacía.
    - 🔴 Y destapó un **callejón sin salida** en el flujo, ya corregido (`4d6f0dd`): tras
      restaurar, la pantalla ofrecía "Continuar con Apple" —vincular— y eso choca contra la
      identidad de su propia cuenta anterior ("Esa cuenta de Apple o Google ya está en uso").
      Quien restaura VUELVE: ahora se le ofrece **entrar** primero.

    ✅ **Construido el 2026-08-22 (`0756661`): el restaurar en silencio.** Justo antes de bajar el
    candado, si la sesión es anónima se llama a restaurar sin que la persona lo pida. La decisión
    de cuándo vive en `domain/plan.js` (`debeRestaurarEnSilencio`) con pruebas, y cada condición
    evita un daño concreto — la que más importa es **una vez por instalación**: restaurar puede
    sacarle a iOS una petición de contraseña del Apple ID, y dispararla en cada arranque a alguien
    que nunca compró sería pedirle la contraseña sin motivo. La marca va en **Preferences** y no en
    localStorage, porque tiene que morir al desinstalar, que es justo el momento que esto atiende.
    Si la llamada no se completa (timeout) **no se anota el intento**: se reintenta al siguiente
    arranque — anotarlo dejaría a quien ya pagó encerrado para siempre por un timeout.
    - El resultado **se dice** ("Recuperamos tu suscripción ✓") aunque el rescate sea silencioso:
      encontrarse premium sin haber hecho nada desconcierta. Y se dice **solo eso**: añadir "entra
      con tu cuenta para recuperar tus medicamentos" sería mandar a una puerta que no existe para
      quien compró siendo anónimo y no tiene ninguna cuenta a la que volver.
    - ✅ **Probado en device el 2026-08-22, y el rescate FUNCIONA**: borrar la app, agregar un
      medicamento, y la suscripción volvió sola sin pedir nada.
    - 🔴 **Pero destapó que estaba a medias** (`ec26906`): *"me abrió la versión premium sin
      recuperar la cuenta"*, *"todo salió en blanco pero todas las opciones premium activadas"*.
      Premium encendido con la app vacía **no es algo que se avise, es un estado roto** — quien pagó
      tiene datos en alguna parte y lo que toca es llevarlo a ellos. El toast de 2,2 s era
      insuficiente, y mi razón para callar el resto ("no sabemos si tenía cuenta") se cae con un
      dato que ya estaba en el código: "Continuar con Apple" **vincula si la identidad es nueva y
      ENTRA si ya existe**, así que una sola puerta sirve a los dos y no se manda a nadie a una que
      no exista. Ahora se **pide la cuenta**, reusando `pedirCuenta`, y **antes de que teclee nada**
      — lo que además deja sin coste la decisión del punto 15, porque no hay nada capturado todavía.
      No es bloqueante; quien lo pospone se queda con la puerta permanente del home, que también
      cambió: decía "Termina de crear tu cuenta · tus medicamentos viven solo en este teléfono" —la
      puerta equivocada para quien ya tiene una— y dice "Entra a tu cuenta · Tu suscripción volvió,
      pero tus medicamentos no".
    - ⬜ **Falta volver a probarlo en device** con este arreglo.

15. ✅ **Entrar a tu cuenta te metía el medicamento que capturaste de invitado.** *Reportado en
    device el 2026-08-22 y arreglado el mismo día (`OPCIÓN A`): entrar a una cuenta existente ya no
    trae nada.*

    Reproducción: borrar la app → sesión anónima nueva → crear un medicamento → "ya tengo cuenta,
    entrar" → tras autenticarse aparecen **los medicamentos de la cuenta + el que creó de invitado**.
    Palabras del usuario: *"me parece que lo correcto es que no agregue a mi cuenta el medicamento
    que creé de manera anónima antes de restaurar mi cuenta"*.

    ⚠️ **El dato que reencuadra esto, y que hay que tener claro antes de decidir:** el traspaso solo
    se dispara cuando alguien **VUELVE**, nunca cuando **CREA** cuenta. Crear cuenta usa
    `linkIdentity`, que vincula la credencial al mismo usuario anónimo — el id no cambia y no hay
    ninguna fila que mover. Las dos únicas rutas que copian datos
    (`entrarConservandoLoCapturado` y `entrarConLaMismaCredencial`, en `lib/anonAuth.js`) son las
    dos de gente que ya tenía cuenta. Así que el argumento con el que se construyó el traspaso —"si
    no, quien crea cuenta pierde su medicamento"— **no aplica a este código**.

    Y hay un argumento de seguridad, no solo de orden: quien reinstala y teclea un medicamento antes
    de acordarse de que tiene cuenta está casi siempre **volviendo a escribir uno que ya tiene**.
    Fusionar deja dos filas iguales → **dos recordatorios a la misma hora** → riesgo de doble dosis.
    Es el peor fallo posible de esta app.

    El caso —único— en que no fusionar pierde algo de verdad: que ese medicamento sea una receta
    **nueva** que la cuenta no tiene.

    Dos diseños posibles:
    - **A (lo que propone el usuario, y la recomendación).** Entrar a una cuenta existente no trae
      nada. Tiene un principio detrás —*entrar a tu cuenta es restaurarla, y restaurar no inventa
      filas*— y es predecible. Es borrar los dos `reinsertar` de las rutas de entrada.
    - **B (fusionar sin duplicar).** Traer solo lo que la cuenta no tiene ya, comparando por nombre
      normalizado (hay precedente: `getOrCreateMedico` lo hace con `normNombre`). Evita los dos
      fallos, pero mete una regla difusa que puede equivocarse en las dos direcciones, y sus
      errores son **invisibles**.

    **Se hizo A**, y se decidió CALLAR: el aviso pasa de "Entramos a tu cuenta · trajimos tu
    medicamento" a "Entramos a tu cuenta ✓". Quien vuelve está mirando sus medicamentos de siempre,
    que es lo que vino a buscar; explicarle una ausencia que no ha echado en falta es la clase de
    párrafo que levanta sospecha.

    Fuera `leerLoCapturado`, `reinsertar`, `asegurarPacienteDestino` y el envoltorio
    `entrarConservandoLoCapturado`: `LoginScreen` llama a `supabase.auth.*` directamente. El
    razonamiento entero quedó escrito en `lib/anonAuth.js`, para que nadie lo reconstruya por
    parecerle una pérdida de datos.

    Verificado en el navegador contando peticiones durante un intento de entrada: **una sola,
    `POST /auth/v1/token`**. Antes había un `GET /pastillas` y un `GET /medicamentos` ANTES de
    autenticar (la lectura previa era incondicional) y un `POST` después.

    ⚠️ **Consecuencia asumida:** lo capturado se queda colgado del usuario anónimo, que queda
    huérfano. Es el mismo huérfano que ya genera todo lo demás y lo limpia el trabajo pendiente de
    la sección de limpieza.

16. ✅ **Screenshots rehechos para la 2.0** (2026-08-23). Los seis de julio retrataban una UI que
    este tramo se llevó por delante —la cabecera con `Hoy | Mes` y los tres iconos— y la guía 2.3.3
    exige que reflejen la app real: era riesgo de rechazo, no solo fealdad.

    **Ocho paneles**, en `screenshots/appstore/`, a 1320×2868 (6,9"):

    | # | titular | pantalla |
    |---|---|---|
    | 1 | Nunca olvides una dosis · **"Sin crear cuenta"** | Hoy |
    | 2 | Se te acaba la caja, y lo sabes antes | Mis medicamentos |
    | 3 | Tu adherencia, de un vistazo | Mi historial |
    | 4 | Cuida a toda tu familia | selector de persona |
    | 5 | Tu información, el día que algo pasa | ficha de emergencia |
    | 6 | No olvides tus citas | Citas |
    | 7 | Un reporte listo para tu médico | Reportes |
    | 8 | Cuida tu vista, día y noche | Hoy en oscuro |

    Dos son nuevos y venden lo que antes no aparecía en la tienda: **la caja** y **la ficha de
    emergencia**. Y el primero dice **"sin crear cuenta"**, que es la objeción número uno de quien
    descarga una app de salud y desde el modelo sin muros por fin es verdad.

    **Cómo se rehacen si hace falta:**
    - Capturas REALES de device, nunca maquetas. Es la decisión de julio y no cambia.
    - Los originales viven en `screenshots/originales/` como `p1_hoy.PNG`…`p8_oscuro.PNG` —
      renombrados a propósito: antes eran `IMG_7325` y nadie sabía cuál era cuál.
    - `screenshots/make_appstore.py` compone (fondo, titular, marco). **No limpia la barra de
      estado**: la hora y la batería que salgan en la captura se publican.
    - Los datos demo se sembraron por SQL en **dev**, en una segunda persona del usuario. Al
      capturar, esa persona se llamó "Yo" y la real "Mamá" — un intercambio de nombres reversible
      que no movió ni un medicamento. Siete paneles dicen "Yo"; el 4 enseña las dos, que es su
      razón de ser.
    - ⚠️ Cuatro paneles necesitan **premium**: se resolvió con un grant temporal en RevenueCat
      sobre el id de Supabase de dev. Ver [[project_testing_sin_paywall]].

    ⬜ **Falta subirlos a App Store Connect** con la versión 2.0.

### D · Descubrimiento y ayuda (decisión abierta, 2026-08-19)

Planteado por el usuario: *"quizás el paciente no sepa cómo hacer algo en la app — por ejemplo el
botón de gestionar pacientes está oculto en Ajustes"*. Es real, pero son **dos problemas y solo uno
se arregla con ayuda**.

**1. La mayoría de los "no sé cómo hacer X" son "esto está donde no me lo esperaba".** No se
arreglan documentando: se arreglan moviendo la acción a donde nace la necesidad. Quien piensa
"quiero agregar a mi mamá" está mirando el avatar del encabezado, no Ajustes. Es más barato que un
manual y no hay que mantenerlo. ✅ El primer caso (gestionar pacientes desde el selector) ya está
hecho; conviene repasar el resto de acciones con el mismo criterio.

**2. Para lo que quede, ayuda CONTEXTUAL, no un centro de ayuda.** Un índice tiene el mismo
problema de descubrimiento un nivel más abajo — de hecho ya existe una página de "Ayuda y soporte"
con preguntas frecuentes, enterrada en Ajustes, y nadie la encuentra. Lo que funciona con este
público es un **"?" en la cabecera de cada pantalla** que abra una hoja corta sobre ESA pantalla,
con tres o cuatro preguntas. La ayuda va donde estás.

**Cuándo: NO antes de esta versión.** De 16 cuentas, 11 nunca agregaron un medicamento: el cuello
de botella no es encontrar funciones, es llegar a usar la primera — que es justo lo que ataca el
modelo sin muros. Construir el sistema de ayuda ahora sería diseñarlo **a ciegas**, sin saber en
qué se atasca la gente, y retrasaría la versión que puede decírtelo.

**Lo que sí conviene antes de salir, y es barato:**
- Que **cada pantalla vacía enseñe**, como ya hace "Empieza por tu primer medicamento". Repasar la
  lista de citas vacía, el calendario sin datos y un paciente sin medicamentos.
- Usar **"Enviar una sugerencia"** (ya existe) como instrumento para descubrir qué confunde de
  verdad, antes de inventar la ayuda.

⚠️ Si se diseña, va en un ejercicio de prototipo **aparte**: el prototipo actual resuelve el
embudo, no el aprendizaje.

### E · Pedir la reseña en la App Store (idea del usuario, 2026-08-21)

Planteado por el usuario: pedir la valoración dentro de la app pasados unos días. **Vale mucho aquí
y más que en la mayoría de apps**, por una razón concreta de los números: la ficha ya convierte al
**34,8 %** sin publicidad y entran 7-10 descargas diarias por búsqueda. La ficha es lo único del
embudo que funciona, y las reseñas son la palanca que la hace convertir todavía mejor. Hoy no hay
ninguna, y una app de salud sin reseñas da la desconfianza que precisamente hay que vencer.

**Se hace con la hoja nativa de Apple** (`SKStoreReviewController.requestReview`, vía un plugin de
Capacitor). Es una hoja del sistema, no una pantalla propia: sale con sus estrellas, se puede
ignorar y **Apple la muestra como máximo 3 veces al año** por usuario, decidiendo él si aparece.
Consecuencia importante: **no se puede saber si salió ni si dejaron reseña**, así que el disparo hay
que elegirlo bien porque no hay segunda oportunidad ni forma de medirla.

**La trampa, y es la parte que importa: "a los N días" es el criterio equivocado.** De 16 cuentas,
11 nunca agregaron un medicamento. A esas personas el día 5 les llega una petición de valorar algo
que no han usado — y la reseña que sale de ahí es de una estrella, o peor: les recuerda que la app
existe justo para desinstalarla. Con Premium ya hay un ejemplo del mismo error corregido: la prueba
de 7 días dejó de arrancar en el segundo cero y arranca al chocar con una necesidad real (punto 6).

**El disparo va por LOGRO, no por calendario.** La regla que encaja con esta app:
- Ha marcado dosis como tomadas **varios días distintos** (p. ej. 5 días con al menos una toma), no
  "lleva 5 días instalada".
- Y se pide **justo después de un momento bueno** —marcar la última dosis del día, ver la racha
  cerrada—, nunca después de un fallo, de un "no lo he tomado" ni al cerrar el paywall.
- **Jamás pegada a la compra**: pedir estrellas después de cobrar es el patrón que produce reseñas
  quejándose del precio.

**Lo que Apple no permite** (guía 1.1.7 y sus reglas de reseñas): condicionar nada a que valoren,
ofrecer algo a cambio, preguntar antes "¿te gusta la app?" para filtrar y mandar solo a los
contentos a la tienda, o montar una hoja propia que imite la del sistema.

**Cuándo construirlo:** después de encender el modelo sin muros, no antes. Es barato (un plugin y
una condición) y depende de tener a gente usando la app varios días seguidos, que es justo lo que
esta versión intenta conseguir. Pedirlo hoy sería pedírselo a los 11 que nunca empezaron.

### F · ⚠️ La app supone que quien abre una instalación nueva es alguien NUEVO (abierto, 2026-08-21)

Planteado por el usuario al final de la sesión: *"siento que hay algo mal de diseño en esto"*. Su
instinto es correcto y conviene no parchearlo por partes, porque **una sola suposición equivocada
está produciendo tres síntomas distintos**, y los tres se vieron en device el mismo día:

1. **El Setup no tiene salida.** En una instalación nueva con una sola persona, la única acción es
   "Agregar medicamento" — el `← Volver` solo aparece si ya hay más de un paciente
   (`SetupScreen.jsx`). Quien vuelve **no puede** llegar a "Ya tengo cuenta, entrar" sin inventarse
   antes un medicamento que no quiere.
2. **Y ese medicamento se pierde en silencio.** Al entrar con su cuenta, la sesión cambia al usuario
   de siempre y lo capturado en el anónimo queda huérfano, sin aviso.
3. **Tras restaurar, se le ofrecía vincular en vez de entrar** (corregido en `4d6f0dd`, pero era el
   mismo error de fondo: dar por hecho que es alguien nuevo).

**La suposición:** el modelo sin muros quitó el muro del registro, pero dejó **otro muro en el mismo
sitio** — ahora se exige capturar antes de poder hacer nada, incluido decir "ya tengo cuenta". Para
alguien que vuelve, la primera pantalla es una pared que le pide datos que no quiere dar para llegar
a una puerta que ya es suya.

**El prototipo NO tiene este problema, y ahí está la pista:** su estado vacío es el **Home con la
barra de pestañas** (`S.a1` → `${T.tabs('hoy')}`), no una pantalla aparte. Quien vuelve toca Ajustes
y entra. Convertirlo en un Setup a pantalla completa sin barra fue una desviación nuestra, y es la
causa de los tres síntomas.

✅ **CONSTRUIDO el 2026-08-21 (`5318051`)** siguiendo el flujo estándar de Supabase y Firebase.
Falta probarlo en device: es lo único que no se puede verificar en el navegador, porque el diálogo
nativo de Apple no existe ahí. ⚠️ El caso a vigilar: si Apple marca su token como de un solo uso,
`signInWithIdToken` recibiría uno gastado por `linkIdentity` — la salida es reintentar.

**Lo que hacen las apps de verdad (investigado el 2026-08-21).** No hay que inventar nada: el
flujo estándar está documentado por Firebase, por Supabase y por RevenueCat, y es **más simple que
el nuestro**. Son cuatro pasos y ninguno es una pantalla nueva.

1. **Un enlace discreto "Ya tengo cuenta, entrar" en la PRIMERA pantalla.** Empezar como invitado
   es correcto y se queda; lo que falta es la puerta del que vuelve. Es la práctica común: se
   ofrece el "skip/invitado" para no bloquear a quien llega nuevo **y** el "ya tengo cuenta" para
   distinguir a quien vuelve. Esto solo ya mata la trampa del Setup, sin rediseñar nada.

2. **Un solo botón, una sola intención: "Continuar con Apple".** Se intenta VINCULAR y, si falla
   porque esa identidad ya existe, la app **entra con esa misma credencial automáticamente**. No se
   enseña un error ni se manda a la persona a buscar otro botón: ya dijo lo que quería al tocar
   Apple. Es literalmente lo que prescriben las dos documentaciones:
   - Firebase: el error `credential-already-in-use` trae la credencial dentro y *"puedes recuperarte
     de este error iniciando sesión con `error.credential`"*.
   - Supabase, en su guía de anónimos: *"Maneja el error (porque el correo pertenece a un usuario
     existente)"* → *"Inicia sesión en la cuenta existente"*.
   Nuestro `vincularConToken` ya tiene el token en la mano cuando falla, así que son ~5 líneas:
   capturar `identity_already_exists` y llamar a `signInWithIdToken` con el MISMO token.

3. **Llevarse lo capturado a la cuenta a la que se entró.** La guía de Supabase tiene el paso con
   nombre propio: *"Reasignar las entidades ligadas al usuario anónimo"*. Sobre conflictos dice que
   depende del modelo de datos (sobrescribir uno, el otro, o fusionar) — y **en esta app no hay
   conflicto que resolver**: los medicamentos son una lista, así que sumar uno más no destruye nada.
   Sin algoritmo de fusión y sin deduplicar.
   ⚠️ **Detalle práctico que la guía no dice:** con RLS el cliente no puede hacer `UPDATE` de filas
   de otro usuario, así que no se "reasigna" — se **leen ANTES** de entrar (siendo aún el anónimo) y
   se **reinsertan después**. Mismo resultado, y sin clave de servicio.

4. **Borrar el anónimo que queda vacío.** Supabase confirma que *"la limpieza automática de usuarios
   anónimos no está disponible"* y da el SQL. Es el job que ya estaba pendiente en el punto A·1.

**Y del lado del dinero no hay nada que inventar tampoco:** RevenueCat transfiere por defecto entre
App User IDs —*"si un ID anónimo restaura y el dueño es un App User ID identificado, las compras se
transfieren"*—, que es exactamente lo que se vio en device. Y para el cambio de cuenta,
`syncPurchases()` después de `logIn()` reasigna lo que haga falta.

**Lo que estábamos haciendo mal, dicho claro:** convertimos una condición **recuperable** en un
error sin salida, y le pasamos a la persona la decisión de cuál de dos botones era el suyo — cuando
la propia credencial ya lo dice. De ahí salían los tres síntomas.

✅ `4d6f0dd` **revertido** al construir esto, como estaba previsto: con el paso 2 nadie choca con el
error, así que reordenar los botones para quien venía de restaurar sobraba. Un mensaje y un juego de
botones, venga de donde venga.

⬜ **Lo que sigue pendiente de esta sección:** borrar el anónimo que queda vacío (paso 4) — es el
job de limpieza del punto A·1, y ahora tiene una razón más: cada "vuelve a su cuenta" deja uno.

**Fuentes:** [Supabase · Anonymous Sign-Ins](https://supabase.com/docs/guides/auth/auth-anonymous) ·
[Firebase · credential-already-in-use](https://firebase.google.com/docs/reference/js/auth) ·
[RevenueCat · Identifying Customers](https://www.revenuecat.com/docs/customers/identifying-customers) ·
[RevenueCat · Restore Behavior](https://www.revenuecat.com/docs/projects/restore-behavior)

### G · Avisar de una versión nueva desde la app (planteado 2026-08-23) — **después de la 2.0**

Planteado por el usuario: *"¿no valdrá la pena mostrar la pantalla de que hay nueva actualización
para que el usuario sepa cuándo debe actualizar?"*. Se decidió **no hacerlo para la 2.0**, y la
razón que más pesa no es el coste:

**Lo que se construya hoy solo sirve DESDE la versión que lo incluya.** Los usuarios de la 1.1 que
ya están en la tienda no lo tendrían nunca. O sea que no es una palanca de emergencia para el
lanzamiento de la 2.0 — es un seguro para la 2.1 en adelante, y como tal puede esperar.

Lo demás en contra, en orden:
- **iOS ya actualiza solo.** La actualización automática viene encendida por defecto, así que el
  público de esa pantalla es la minoría que la tiene apagada, no "todos".
- **Cae en el peor sitio del arranque.** Es un viaje más a la red al abrir, y este proyecto peleó
  justo lo contrario (punto 4b: se quitaron dos de los cuatro viajes del arranque en frío).
- **Apple no da API.** Habría que consultar el *iTunes Lookup* y comparar versiones, y ese endpoint
  tiene retraso de caché: puede anunciar una versión que en ese país todavía no está. Un "actualiza"
  que no lleva a ningún lado es peor que no avisar.

**Y si se hace, que NO sea "hay actualización".** La pieza que vale es un **aviso remoto** que
controle el equipo: una fila en Supabase con `{version_minima, mensaje}` que la app lee y pinta.
Cuesta lo mismo y da las dos cosas — "actualiza, esta versión tiene un fallo" **y** poder decirle
algo a todos los usuarios sin publicar un binario. Supabase ya está en el proyecto.

Dos condiciones si se construye:
- **No se comprueba al arrancar.** Al volver del fondo, o después de que el home ya pintó, y
  cacheado. El arranque en frío no admite un viaje más.
- **Nunca bloquea.** Una versión que se niega a abrirse por estar desactualizada es de las cosas
  que Apple mira con lupa, y en una app de medicación es indefendible: alguien puede necesitar ver
  sus dosis en un aeropuerto sin datos.

Versión barata si algún día urge sin construir lo de arriba: en Ajustes ya se muestra
`Versión 1.1.0`; ahí cabe un "hay una versión nueva" discreto al lado, pasivo y sin interrumpir.

### C · Decisiones abiertas
| # | Decisión | Estado |
|---|---|---|
| 1 | ¿Barra de pestañas abajo? | ✅ **Resuelta** — construida |
| 2 | ¿Cuánto historial gratis? | Propuesta: **7 días**, con el corte visible |
| 3 | Precio del mensual (y del semanal) | ✅ **Resuelta (2026-08-23)** — paridad con la competencia: semanal **$39 MXN / $1.99**, mensual **$69 MXN / $3.49**, anual sin tocar. Falta aplicarlo en App Store Connect (punto 9) |
| 4 | Anónimo que borra la app | Propuesta: cuenta al 3.er día + job de limpieza |
| 5 | Primer arranque sin red | Propuesta: reusar la cola optimista y reintentar |
| 6 | ¿«Mi salud» o «Expediente»? | Propuesta: **«Mi salud»** en la app, «expediente médico» en la ficha de la App Store |
| 7 | ¿Qué logro dispara la petición de reseña? | Propuesta: **5 días distintos con dosis marcadas**, y al cerrar un día completo |
| 8 | ¿«pacientes» o «personas» en la UI? | ✅ Hecho (`a2bd9d5`): «personas» en las 14 etiquetas, «familia» en los subtítulos. La BD no se tocó |
| 9 | ¿Cómo entra quien VUELVE? (sección F) | ✅ **Resuelta, construida y validada en device** (`5318051`), con el flujo estándar |

## Olas siguientes (no son de la 2.0)

- **Ola 2 · expediente ligero:** signos vitales (solo presión, glucosa y peso), consultas +
  "preguntas para el médico", pantalla del directorio de médicos (la tabla ya viene llena),
  diagnósticos y cirugías. Nada necesita almacenamiento de archivos.
- **Ola 3 · expediente pesado (solo si 1 y 2 validan):** documentos y estudios con archivos,
  laboratorios, vacunas, dispositivos. Son los caros: almacenamiento recurrente, etiqueta de
  privacidad de datos de salud y más lupa de Apple.

---

Estado del archivo histórico de abajo: última sesión 2026-07-17 (antes de publicar la 1.1).

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
- **App Store Connect:** grupo **"Mi Pastillero Premium"** (ID 22239888) con 3 suscripciones auto-renovables — `com.mipastillero.app.weekly` ($29 MXN), `.monthly` ($59), `.annual` ($499). Todas con precio base México, localización es-MX, e **Introductory Offer de 7 días gratis** (Free · 1 week).
  ⚠️ **Corregido el 2026-08-23:** esta nota decía "disponibilidad SOLO México" y se quedó vieja. Desde el **2026-08-06** la app está en **México y Costa Rica**, y las **tres suscripciones también** — se agregó su Availability a CR expresamente, que era el paso que faltaba para que allá se pudiera pagar y no solo mirar. Precios **vigentes hoy en la tienda**: CR **$1.49 / $2.99 / $24.99** USD y México **$29 / $59 / $499** MXN. ⬜ **Pendiente de aplicar en ASC** (ver punto 9): semanal y mensual suben a **$39 / $69 MXN** y **$1.99 / $3.49** USD; el anual se queda igual.
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
   - ✅ **En producción YA FUNCIONA** (comprobado el 2026-08-18): 4 altas por correo, las 4 confirmadas, y las dos Edge Functions activas con su secret, `notify-password-changed` incluida. Esta línea decía «pendiente para producción: repetir template + OTP length + bucket `brand` + SMTP + Edge Function» y llevaba meses vieja; **ya indujo un error el 2026-08-23**. Lo único abierto es el punto 13: mirar en el dashboard de prod **qué SMTP usa Auth**, porque eso no se ve desde fuera.
3. ~~**Correo de soporte**~~ ✅ HECHO (2026-08-23). `soporte@pastillero.jimbera.com`, vía **ImprovMX** gratis: MX 10/20 a `mx1|mx2.improvmx.com` + TXT `v=spf1 include:spf.improvmx.com ~all`, en host `pastillero` de los Custom records del DNS de Squarespace. Reenvía a `ailab.learning@gmail.com`; probado de extremo a extremo.
   - ⚠️ **No convive con lo de Resend por casualidad, sino por host**: lo de enviar cuelga de `send.pastillero` (MX de SES + su SPF) y de `resend._domainkey.pastillero`. Borrar cualquiera de esos tres deja a los usuarios sin el código de registro.
   - ⚠️ **Solo recibe.** ImprovMX no guarda buzón, reenvía. Si contestas desde Gmail, al usuario le llega desde `ailab.learning@gmail.com`, que es justo el remitente del que se huía. Pendiente: «Enviar como» en Gmail con el SMTP de Resend (que ya está de alta en este mismo dominio).

### Onboarding / lanzamiento App Store
4. ~~**Screenshots para App Store**~~ ✅ HECHO (2026-07-10). 6 paneles de marketing a **1290×2796** (iPhone 6.7") en `screenshots/appstore/` (01→06), generados con `screenshots/make_appstore.py` (Pillow) montando **capturas reales** (fondo morado-índigo + glow, titular SF Rounded, marco iPhone). Titulares: "Nunca olvides una dosis" / "Tu adherencia, de un vistazo" / "Cuida a toda tu familia" / "Un reporte listo para tu médico" / "Tus datos, solo tuyos" / "Cuida tu vista, día y noche".
   - Capturas originales en `screenshots/originales/` (paciente **demo "Mau"** — sus datos de calendario se poblaron por SQL para mostrar 8🟢 9🔴 10🟠 y reporte "A tiempo"). Se decidió usar **capturas reales enmarcadas** en vez de recrear la UI en HTML (Apple 2.3.3: los screenshots deben reflejar la app real; recrear UI falsa = riesgo de rechazo).
   - Para regenerar (tras recapturar o para prod): ajustar `SRC`/titulares en `make_appstore.py` y correr `python3 screenshots/make_appstore.py`.
   - Opcional/pendiente cosmético: barra de estado limpia (9:41 + batería llena) — no bloquea.
5. **Pantalla de bienvenida / onboarding** (opcional pero recomendado antes de publicar): 3 slides intro tras el signup mostrando qué hace la app.
6. ~~**Política de privacidad + URL de soporte**~~ ✅ HECHO (2026-07-12). Páginas en `legal/privacidad.html` y `legal/soporte.html` (branded, español, fieles a la app; contacto `soporte@pastillero.jimbera.com`). Hospedadas en **GitHub Pages** (rama `gh-pages`, repo público `ailablearning-dot/mi-pastillero`):
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

## 💡 Ideas para versiones futuras (post-lanzamiento)

Propuestas por un revisor externo (amigo de sistemas, 2026-07-23). **NO son para v1** — se evalúan con feedback real de usuarios ya en tienda. El usuario ve potencial en varias.

1. **Perfil familiar / compartir lectura de un paciente.** Que un familiar pueda **ver** los medicamentos de su familiar (p.ej. para una visita al médico) desde su propio teléfono, sin pedir prestado el teléfono de quien tiene la app. Requiere modelo de "compartir paciente" con acceso de **solo-lectura** (invitación por email/código + política RLS que permita a un segundo `user_id` leer las pastillas/medicamentos de un paciente compartido). Encaja fuerte con el ángulo cuidador/familia.

2. **Integración con WhatsApp (Mi Pastillero como servicio).** Exponer la app como backend y operar desde WhatsApp: "@pastillero dime mis medicamentos actuales", "¿qué pastillas me faltan por tomar hoy?", e incluso **enviar los recordatorios por WhatsApp** en lugar de (o además de) la notificación con sonido. La app quedaría más para gestión/administración y la operación diaria viviría en WhatsApp. Requiere WhatsApp Business API / proveedor (Meta Cloud API, Twilio), backend con webhook (Edge Function) y NLU básico para los comandos. **Bonus:** resolvería de raíz el throttling de sonido de iOS (el recordatorio llega por WhatsApp). Esfuerzo y costo por mensaje altos → evaluar modelo de negocio.

3. **Menos captura, más selección (UX).** Reemplazar campos de texto libre por opciones seleccionables donde se pueda: dosis con chips comunes (1 tableta, 5mg, 500mg…), autocompletar el nombre del medicamento contra un catálogo, etc. Hace la app más amigable (menos escribir, más tocar).

4. **Contexto clínico por medicamento: nota de voz + receta + médico.** ⚠️ *Parcialmente
   SUPERADO: la receta y el médico subieron a la Ola 1 (punto 10 de la 2.0). Lo que sigue vivo
   aquí es solo la **nota de voz**.* Adjuntar a cada medicamento una **nota de voz** (grabación) explicando por qué lo mandó el médico, y quizás también la **foto/archivo de la receta** y el **nombre del médico**. Ayuda a recordar el motivo y es útil en visitas / segundas opiniones. Requiere: grabación y reproducción de audio (plugin Capacitor de voz + subida a Supabase Storage), adjuntos de imagen para la receta, y campos nuevos en `pastillas` (o tabla anexa `medicamento_notas`). Ojo privacidad: es dato de salud → RLS estricto + declararlo en App Privacy.

**Otras diferidas en la sesión del 2026-07-23:**
- **Onboarding "de la manita" (wizard guiado)** tras el registro, para agregar el primer medicamento paso a paso ("ahora el nombre", "ahora los días", "ahora el sonido"). Enhancement de activación; candidato a **v1.1** con feedback real. Hoy ya existe `SetupScreen` funcional (no está roto, solo sería más cálido).
- **Accesibilidad completa:** reactivar el pinch-zoom (requiere subir los inputs a ≥16px para evitar el auto-zoom de iOS al enfocar) y/o soportar Dynamic Type. En v1 se hizo un **agrandado global (base 18px)** + se eliminaron los tamaños 10-11px.
- **Estado "pospuesta" visible en el home (v1.1, 2026-07-24):** hoy una dosis que el usuario pospone se ve como "pendiente" en el home aunque ya pasó su hora (parece olvidada). La tabla `medicamentos` solo tiene "tomada / no tomada" — NO existe estado "pospuesta". Para mostrar un badge hay que **persistir** ese estado (p.ej. un mapa `doseKey → pospuesta_hasta` en `Preferences`, sin tocar la BD, o una columna nueva) y limpiarlo al marcarla. La dosis no se pierde (el posponer vuelve a sonar); es solo un tema visual. Diferido a post-lanzamiento por decisión del usuario.

## ⚠️ Cosas a NO olvidar

- **`.env`** está gitignored, contiene `SUPABASE_SECRET_KEY` (service_role) — no rotar salvo compromiso
- Cuando vayas a producción: `mi-pastillero` (pausado, `kbsxjdtdleauzvbtbrqi`) es el proyecto que debería ser prod. Actualmente todo apunta a `mi-pastillero-dev` (`hylwfravrxnlifxefuey`).
- **NativeBiometric requiere Cmd+R en Xcode** — cualquier cambio con plugins Capacitor nuevos exige rebuild del binario nativo, no basta con reload web.
- **Sonidos de notificación (fix 2026-07-08):** ahora se usan **`.wav` mono** (`ios/App/App/*.wav`, referenciados en `App.jsx` como `${sonido}.wav`). Los `.caf` estéreo **no sonaban** en notificaciones iOS (mostraban el banner pero mudo, mientras otras apps sí sonaban). Claves del fix: (1) formato **mono** + **`.wav`** (recomendado por el plugin), (2) iOS **cachea el registro del sonido por instalación**, así que hubo que **borrar y reinstalar** la app para que tomara el sonido nuevo. Los `.caf` viejos siguen en el bundle (redundantes, inofensivos; limpieza opcional). Fuentes en `sonidos/`.
