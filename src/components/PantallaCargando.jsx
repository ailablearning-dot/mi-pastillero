// La espera del arranque, con la cara de la app.
//
// En una instalación limpia hay cuatro viajes a la red encadenados antes de poder pintar nada
// (crear la sesión, consultar pacientes, crear el paciente inicial, consultar medicamentos), y
// eso son 3-4 segundos medidos en device. Parte se puede recortar y se recortó; el resto es
// inevitable mientras dependa de la red.
//
// Lo que NO es inevitable es que esos segundos sean una pantalla gris con la palabra "Cargando".
// Es el primer contacto con la app —justo el segundo que este modelo existe para ganar— y un
// fondo vacío ahí ya empieza mal. El mismo tiempo con el logo y una frase se percibe como que la
// app está haciendo algo, no como que se colgó.
export default function PantallaCargando({ mensaje = "Un momento…" }) {
  return (
    <div
      style={{ fontFamily: "'Nunito', sans-serif" }}
      className="min-h-screen flex flex-col items-center justify-center gap-4 bg-gradient-to-br from-slate-50 via-gray-50 to-stone-100 dark:from-gray-900 dark:via-gray-900 dark:to-gray-950"
    >
      <link href="https://fonts.googleapis.com/css2?family=Nunito:wght@400;500;600;700;800;900&display=swap" rel="stylesheet" />
      <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center text-4xl shadow-lg shadow-violet-200 dark:shadow-none">
        💊
      </div>
      <p className="text-sm font-bold text-gray-400">{mensaje}</p>
      {/* Barra indeterminada: da señal de vida sin prometer un porcentaje que no sabemos. */}
      <div className="w-32 h-1 rounded-full bg-gray-200 dark:bg-gray-800 overflow-hidden">
        <div className="h-full w-1/3 rounded-full bg-violet-400" style={{ animation: "cargando 1.1s ease-in-out infinite" }} />
      </div>
      <style>{`@keyframes cargando { 0% { transform: translateX(-100%) } 100% { transform: translateX(300%) } }`}</style>
    </div>
  );
}
