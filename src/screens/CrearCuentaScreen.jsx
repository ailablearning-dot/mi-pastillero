import { useState } from "react";
import { Shield, X, Mail, KeyRound, Check } from 'lucide-react';
import { vincularCorreo, confirmarCorreo, ponerContrasena, textoDatosASalvo } from "../lib/anonAuth";

// "Guarda tu suscripción" — la pantalla del prototipo que aparece DESPUÉS de comprar.
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
export default function CrearCuentaScreen({ cuantosMedicamentos = 0, onListo, onMasTarde }) {
  const [paso, setPaso] = useState("correo");   // correo → codigo → contrasena
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
    if (!res.ok) { setError(res.fallo?.mensaje || "No se pudo. Inténtalo otra vez."); return false; }
    return true;
  };

  const enviarCodigo  = async () => { if (await hacer(() => vincularCorreo(email))) setPaso("codigo"); };
  const validarCodigo = async () => { if (await hacer(() => confirmarCorreo(email, codigo))) setPaso("contrasena"); };
  // La contraseña es el último paso y es OPCIONAL: con el correo ya verificado la cuenta existe y
  // se puede recuperar por código. Obligar aquí sería poner un muro justo después de cobrar.
  const guardarPwd    = async () => { if (await hacer(() => ponerContrasena(pwd))) onListo(); };

  return (
    <div style={{ fontFamily: "'Nunito', sans-serif", paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
         className="min-h-screen bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950 px-4 pb-8">
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="max-w-md mx-auto">
        <div className="flex justify-end">
          <button onClick={onMasTarde} aria-label="Más tarde"
            className="w-9 h-9 rounded-xl bg-white/70 dark:bg-gray-800/70 flex items-center justify-center text-gray-400"><X size={18} /></button>
        </div>

        <div className="text-center mb-5">
          <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-violet-200 dark:shadow-none">
            <Shield size={28} className="text-white" />
          </div>
          <h1 className="text-2xl text-gray-800 dark:text-gray-100 mb-1" style={{ fontWeight: 900 }}>Guarda tu suscripción</h1>
          <p className="text-sm text-gray-400">Crea tu cuenta para no perder tus datos ni tu suscripción si cambias de teléfono.</p>
        </div>

        {/* El aviso que quita el miedo a empezar de cero. Es cierto al pie de la letra. */}
        <div className="flex items-start gap-3 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-800 rounded-2xl px-4 py-3 mb-5">
          <Check size={18} className="text-blue-500 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-700 dark:text-blue-300 font-medium">{textoDatosASalvo(cuantosMedicamentos)}</p>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-3xl shadow-sm p-5">
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

          {error && (
            <div className="text-xs font-medium text-red-600 dark:text-red-300 bg-red-50 dark:bg-red-950/40 px-3 py-2 rounded-xl mt-3">{error}</div>
          )}
        </div>

        <button onClick={onMasTarde} className="w-full mt-4 py-2 text-xs font-bold text-gray-400">
          Más tarde
        </button>
      </div>
    </div>
  );
}
