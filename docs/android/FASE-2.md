# Fase 2 — Que avise

**En curso.** Lo que sigue está hecho y verificado en el emulador `Pastillero_API36`; lo que falta está al final con su porqué.

---

## Hecho

### 1. La alarma es exacta, y hay prueba

Programada una dosis a dos minutos vista, el sistema registró:

```
type=RTC  origWhen=…  window=0  exactAllowReason=policy_permission
whenElapsed=+1m59s943ms   maxWhenElapsed=+1m59s943ms
```

`window=0` y las dos marcas idénticas: **cero holgura**, y concedida **por el permiso que
declaramos**. En el mismo volcado, una alarma de Google llevaba tres minutos y medio de margen —
eso es lo que habríamos tenido sin `USE_EXACT_ALARM`, en silencio y sin aviso.

Con el emulador **desenchufado, pantalla apagada y en reposo profundo forzado**, la notificación se
entregó y apareció en la sección que SUENA de la persiana, no en la de silenciosas.

### 2. Un canal por sonido

En Android el sonido es propiedad del canal, no del aviso, y un canal es **inmutable**. Como la app
deja elegir el sonido por medicamento, no hay otra: ocho canales, siete tonos y el silencioso.

`soundFields()` se bifurca por plataforma en un solo sitio — devuelve `{ channelId }` en Android y lo
de siempre en iOS — así que **los seis sitios que la llaman no se tocaron**.

⚠️ **El canal silencioso usa importancia BAJA (2) a propósito.** El plugin solo llama a `setSound()`
cuando le pasas un sonido, así que un canal "sin sonido" con importancia alta se quedaría con el
sonido POR DEFECTO del sistema — lo contrario de lo que pidió el usuario. Con importancia baja
Android no suena pase lo que pase. Subirle la importancia algún día rompería eso en silencio.

### 3. El sucedáneo de las Alertas Críticas

Android no tiene el concepto. Lo más cercano son dos propiedades del canal que **el plugin no
expone**, así que hay parche (`patches/`, junto a los dos de iOS que ya había):

| | Qué hace | Estado |
|---|---|---|
| `usage: 'alarm'` | El aviso sale por el canal de ALARMA, que **el modo silencio no calla** | ✅ funcionando |
| `bypassDnd: true` | Además se salta el No Molestar | ⚠️ pedido, **no aplicado** |

Verificado en el sistema con `dumpsys notification`:

```
dosis_ding_v2 … mBypassDnd=false … usage=USAGE_ALARM
```

`USAGE_ALARM` es la pieza grande y **no necesita ningún permiso**. `bypassDnd` sale en `false`
porque **solo se graba si el permiso de política de notificaciones YA estaba concedido cuando se
creó el canal**. Si el usuario lo concede después, estos canales seguirán sin saltarse el No
Molestar: habría que crear una versión `v3`.

De ahí que la pantalla de fiabilidad tenga que pedir ese permiso **antes** de dar la promesa por
buena — y que la app no deba prometerle a nadie que sonará en No Molestar sin haberlo comprobado.
Por eso también se quitó esa frase de la descripción de la tienda.

### 4. Los ids de canal llevan versión, y hoy se cobró la apuesta

Los canales nacieron como `dosis_<sonido>_v1`. Al añadir `usage: 'alarm'` hubo que pasar a `_v2`,
porque un canal creado no se puede modificar. **Sin esa versión en el id, este cambio habría exigido
que cada usuario desinstalara la app.** Los `_v1` se borran al arrancar para que no queden ocho
categorías muertas en los ajustes del teléfono; comprobado: `mDeleted=true`.

---

## Lo que falta

1. **La pantalla de fiabilidad.** Pide el permiso de notificaciones, la exención de ahorro de batería
   y —si el usuario quiere sonar en No Molestar— el acceso a la política de notificaciones. Y enseña
   las instrucciones de SU marca, detectando `Build.MANUFACTURER`.
   ⚠️ **No tiene prototipo**, y la regla del proyecto es que el prototipo manda. Pendiente de
   decisión antes de construirla.
2. **La decisión D3**: qué pasa con el selector de volumen de cuatro niveles, que en Android no se
   puede implementar.
3. **La prueba de la noche entera** (CA-1.2), que solo dice el Samsung: dosis a las 09:00, app
   cerrada, ahorro de batería activo, teléfono quieto y **desenchufado** desde las 23:00.
4. **Que suene de verdad en silencio**: el emulador no tiene altavoz que escuchar. `USAGE_ALARM`
   está puesto y verificado en el sistema, pero oírlo es cosa del teléfono.

---

## Una lección de método, para no repetirla

Al compilar el parche encadené `(./gradlew … ; true)` para que un fallo no cortara la cadena. Gradle
**falló** —un `Logger.warn` de tres argumentos que no existe— y ese `; true` se lo tragó: se instaló
el APK anterior y durante un rato estuve depurando por qué el código nuevo "no hacía nada".

Lo que lo destapó no fue el log de Gradle sino comparar **qué bundle había cargado el WebView**
(`index-9cf630c2.js`) contra el que había en el proyecto (`index-29139bbb.js`). Cuando algo no
cambia pese a haberlo compilado, esa comparación es la primera pregunta, no la última.
