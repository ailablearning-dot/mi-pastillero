import { useState } from "react";
import { Shield, X, Mail, KeyRound } from 'lucide-react';
import { vincularCorreo, confirmarCorreo, ponerContrasena, vincularApple, vincularGoogle } from "../lib/anonAuth";

// "Guarda tu suscripción" — la pantalla del prototipo que aparece DESPUÉS de comprar.
//
// ⚠️ UN SOLO MENSAJE y UN SOLO juego de botones, aunque la pantalla tenga tres entradas (tras
// comprar, tras restaurar y desde Ajustes). Se probaron las dos alternativas y las dos sobraban:
// primero un título distinto por entrada, y después reordenar los botones para quien venía de
// restaurar. Lo que las hace innecesarias es que "Continuar con Apple" ahora RESUELVE los dos
// casos —vincula si la identidad es nueva, entra si ya existe (ver anonAuth.js)—, así que la
// persona no tiene que elegir entre dos puertas ni la app adivinar cuál le toca.
//
// ⚠️ Y se aparta del prototipo a propósito. El prototipo titula "Guarda tu suscripción", y eso es
// FALSO: la suscripción vive en el Apple ID, no en el teléfono. Comprobado en device el 2026-08-21
// —se reinstaló la app y "Restaurar compras" la devolvió entera— y lo que NO volvió fueron los
// medicamentos, que se quedaron colgados del usuario anterior. Prometer que se protege lo que no
// corre peligro, y callar lo que sí, es exactamente al revés. La app ya sabía esto: hay un
// comentario en HomeScreen que rechazó "Asegura tu suscripción" por la misma razón.
//
// Registro para poder pagar, no para poder probar: es el mismo formulario de siempre, movido del
// principio al final del embudo. Quien llega aquí ya decidió pagar, así que no filtra a nadie.
//
// Por qué existe: si compra siendo anónimo y luego borra la app, "Restaurar compras" le devuelve
// la suscripción pero sus datos quedan huérfanos — el token del teléfono era la única llave. Esta
// pantalla evita exactamente esa reseña.
//
// Y lo importante: NO crea una cuenta nueva. Vincula el correo al usuario anónimo que ya existe,
// así que no se migra ni una fila y el aviso de "tus medicamentos ya están guardados" es cierto
// al pie de la letra.
export default function CrearCuentaScreen({ onListo, onMasTarde, onYaTengoCuenta, motivo }) {
  // Arranca en los botones sociales, como el prototipo: son un toque con Face ID y no dependen
  // de que llegue ningún correo. El correo queda como alternativa, no como camino principal.
  const [paso, setPaso] = useState("elegir");   // elegir → correo → codigo → contrasena
  const [email, setEmail] = useState("");
  const [codigo, setCodigo] = useState("");
  const [pwd, setPwd] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState(null);

  const cls = "w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-inset focus:ring-violet-300";

  const hacer = async (fn) => {
    setOcupado(true); setError(null);
    const res = await fn();
    setOcupado(false);
    if (!res.ok) { setError({ mensaje: res.fallo?.mensaje || "No se pudo. Inténtalo otra vez.", detalle: res.fallo?.detalle }); return false; }
    return true;
  };

  // Apple y Google terminan en un solo paso: no hay código ni contraseña que poner.
  const social = async (fn) => {
    setOcupado(true); setError(null);
    const res = await fn();
    setOcupado(false);
    // `entro` = no creó una cuenta, VOLVIÓ a la suya (vincular falló porque ya existía y la app
    // entró con la misma credencial). La pantalla tiene que decir eso y no "Cuenta creada".
    if (res.ok) { onListo({ entro: !!res.entro }); return; }
    // Cancelar el diálogo nativo no es un error que enseñar: cerró la hoja a propósito.
    if (res.cancelado) return;
    setError({ mensaje: res.fallo?.mensaje || "No se pudo crear la cuenta. Inténtalo otra vez.", detalle: res.fallo?.detalle });
  };

  const enviarCodigo  = async () => { if (await hacer(() => vincularCorreo(email))) setPaso("codigo"); };
  const validarCodigo = async () => { if (await hacer(() => confirmarCorreo(email, codigo))) setPaso("contrasena"); };
  // La contraseña es el último paso y es OPCIONAL: con el correo ya verificado la cuenta existe y
  // se puede recuperar por código. Obligar aquí sería poner un muro justo después de cobrar.
  const guardarPwd    = async () => { if (await hacer(() => ponerContrasena(pwd))) onListo(); };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
         className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 px-4 pb-8">
      <div className="max-w-md mx-auto">
        <div className="flex justify-end">
          <button onClick={onMasTarde} aria-label="Más tarde"
            className="w-9 h-9 rounded-xl bg-white/70 dark:bg-gray-800/70 flex items-center justify-center text-gray-400"><X size={18} /></button>
        </div>

        <div className="text-center mb-5">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-violet-200 dark:shadow-none">
            <Shield size={28} className="text-white" />
          </div>
          {/* DOS mensajes, y es una excepción medida a la regla de arriba. Los botones siguen
              siendo los mismos: lo que cambia es de qué se está hablando.

              `motivo === "volviendo"` es una situación que no existía cuando se escribió esta
              pantalla: instalación NUEVA en la que el rescate silencioso acaba de devolver la
              suscripción. A esa persona "No pierdas tus medicamentos · viven solo en este teléfono"
              le dice lo contrario de lo que le pasa — en este teléfono no tiene NADA que perder, y
              lo que busca es de dónde salen los suyos. Visto en device: "me abrió la versión premium
              sin recuperar la cuenta, todo salió en blanco pero todas las opciones premium
              activadas".

              El "si ya tenías cuenta" no es un titubeo: quien compró siendo invitado y nunca creó
              una NO tiene nada que recuperar, y prometerle que sus medicamentos vuelven sería
              mentirle. Una palabra condicional lo deja cierto para los dos, y sigue siendo una
              línea. */}
          {motivo === "volviendo" ? (
            <>
              <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>Tu suscripción volvió</h1>
              <p className="text-sm text-gray-400">Si ya tenías cuenta, entra y tus medicamentos vuelven contigo.</p>
            </>
          ) : (
            <>
              <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>No pierdas tus medicamentos</h1>
              {/* UNA línea, y corta. Antes había tres frases tranquilizando sobre los datos —el
                  subtítulo largo más un aviso azul con "no pierdes nada"— y el usuario dio el
                  argumento que las tumba: tanto afán por convencer levanta la sospecha de que hay
                  algo que justificar. En una app de salud eso juega en contra. Si el embudo llega a
                  decir que la gente teme perder lo capturado, se recupera el aviso; hasta entonces,
                  menos es más. */}
              <p className="text-sm text-gray-400">Tus medicamentos viven solo en este teléfono.</p>
            </>
          )}
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5">
          {paso === "elegir" && (
            <>
              {/* Apple primero: 10 de las 16 cuentas actuales entraron así. Un toque, sin correo
                  de por medio, que es lo que permitirá exigir la cuenta al comprar sin dejar a
                  nadie fuera por un envío que no llegó. */}
              <button onClick={() => social(vincularApple)} disabled={ocupado}
                className="w-full py-3 rounded-xl bg-black text-white text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                 Continuar con Apple
              </button>
              <button onClick={() => social(vincularGoogle)} disabled={ocupado}
                className="w-full mt-2 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                Continuar con Google
              </button>
              <button onClick={() => { setPaso("correo"); setError(null); }}
                className="w-full mt-3 py-2 text-xs font-bold text-violet-600">
                Usar mi correo
              </button>
            </>
          )}

          {paso === "correo" && (
            <>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Tu correo</label>
              <input value={email} onChange={e => { setEmail(e.target.value); setError(null); }}
                type="email" inputMode="email" autoCapitalize="none" autoCorrect="off"
                placeholder="tu@correo.com" className={cls} />
              <button onClick={enviarCodigo} disabled={ocupado || !email.trim()}
                className="w-full mt-3 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200 dark:shadow-none disabled:opacity-60 flex items-center justify-center gap-2">
                <Mail size={16} /> {ocupado ? "Enviando…" : "Enviarme un código"}
              </button>
              <button onClick={() => { setPaso("elegir"); setError(null); }} className="w-full mt-2 py-2 text-xs font-bold text-gray-400">
                Usar Apple o Google
              </button>
            </>
          )}

          {paso === "codigo" && (
            <>
              <p className="text-xs text-gray-500 mb-3">Te enviamos un código de 6 dígitos a <strong>{email}</strong>.</p>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Código</label>
              <input value={codigo} onChange={e => { setCodigo(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(null); }}
                inputMode="numeric" maxLength={6} placeholder="000000"
                className={`${cls} text-center tracking-[0.4em] text-lg`} />
              <button onClick={validarCodigo} disabled={ocupado || codigo.length < 6}
                className="w-full mt-3 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200 dark:shadow-none disabled:opacity-60">
                {ocupado ? "Comprobando…" : "Confirmar"}
              </button>
              <button onClick={() => { setPaso("correo"); setError(null); }} className="w-full mt-2 py-2 text-xs font-bold text-gray-400">
                Usar otro correo
              </button>
            </>
          )}

          {paso === "contrasena" && (
            <>
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-bold mb-3">✓ Correo confirmado</p>
              <label className="text-xs font-bold text-gray-500 mb-1 block">Crea una contraseña</label>
              <input value={pwd} onChange={e => { setPwd(e.target.value); setError(null); }}
                type="password" placeholder="Mínimo 6 caracteres" className={cls} />
              <button onClick={guardarPwd} disabled={ocupado || pwd.length < 6}
                className="w-full mt-3 py-3 rounded-xl bg-gradient-to-r from-violet-500 to-indigo-500 text-white text-sm font-bold shadow-lg shadow-violet-200 dark:shadow-none disabled:opacity-60 flex items-center justify-center gap-2">
                <KeyRound size={16} /> {ocupado ? "Guardando…" : "Guardar y terminar"}
              </button>
              {/* Saltarse la contraseña deja la cuenta usable: el correo ya está verificado y se
                  entra con código. Obligar aquí sería un muro justo después de cobrar. */}
              <button onClick={onListo} className="w-full mt-2 py-2 text-xs font-bold text-gray-400">
                Ahora no, ya tengo mi correo guardado
              </button>
            </>
          )}

          {/* La pista técnica va en pequeño y solo cuando el fallo no se reconoce: es lo único que
              permite diagnosticar algo que solo se reproduce en el teléfono, sin un Mac enchufado.
              Nunca lleva el mensaje del servidor —ahí puede venir el correo de la persona— solo el
              código. Ver `pista()` en domain/sesion.js. */}
          {error && (
            <div className="text-xs font-medium text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-xl mt-3">
              {error.mensaje}
              {error.detalle && <span className="block mt-1 text-[10px] font-normal opacity-60">({error.detalle})</span>}
            </div>
          )}
        </div>

        {/* El mensaje de "ese correo ya tiene una cuenta" mandaba aquí, y hasta ahora esta
            opción no existía en ningún sitio. */}
        {onYaTengoCuenta && (
          <button onClick={onYaTengoCuenta} className="w-full mt-4 py-2 text-xs font-bold text-violet-600">
            Ya tengo cuenta, entrar
          </button>
        )}
        <button onClick={onMasTarde} className="w-full mt-1 py-2 text-xs font-bold text-gray-400">
          Más tarde
        </button>
      </div>
    </div>
  );
}
