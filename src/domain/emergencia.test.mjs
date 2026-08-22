// Pruebas de domain/emergencia.js. Sin framework:
//   node src/domain/emergencia.test.mjs
//
// Esto decide qué lee alguien que atiende una urgencia. Los dos fallos posibles no son simétricos:
// que falte un dato es malo; que sobre uno VIEJO —un medicamento ya suspendido— es peor, porque
// se actúa sobre él. De ahí que los suspendidos tengan su propia prueba.

import { alergiasOrdenadas, alergiaLabel, medicamentosActivos, contactoLabel,
         condicionesLimpias, fichaSinCapturar, GRAVEDADES } from "./emergencia.js";

let fallos = 0;
const eq = (nombre, real, esperado) => {
  const ok = JSON.stringify(real) === JSON.stringify(esperado);
  if (!ok) fallos++;
  console.log(`${ok ? "ok   " : "FALLA"} ${nombre.padEnd(52)} → ${JSON.stringify(real)}` +
              (ok ? "" : `  (esperaba ${JSON.stringify(esperado)})`));
};

console.log("── las alergias: las graves arriba ──");
const A = [
  { nombre: "Polen", gravedad: "leve" },
  { nombre: "Penicilina", reaccion: "dificultad para respirar", gravedad: "grave" },
  { nombre: "Mariscos", gravedad: "moderada" },
];
eq("primero la grave", alergiasOrdenadas(A).map(a => a.nombre), ["Penicilina", "Mariscos", "Polen"]);
// Sin gravedad no se hunde al final: que no se haya dicho cuán grave es no la vuelve menos importante.
eq("sin gravedad va con las moderadas",
   alergiasOrdenadas([{ nombre: "Polen", gravedad: "leve" }, { nombre: "Nuez" }]).map(a => a.nombre),
   ["Nuez", "Polen"]);
// Dentro del mismo grupo manda el orden de captura, no el alfabético: es el que la persona eligió.
eq("a igual gravedad, el orden de captura",
   alergiasOrdenadas([{ nombre: "Zetas", gravedad: "grave" }, { nombre: "Ácaros", gravedad: "grave" }]).map(a => a.nombre),
   ["Zetas", "Ácaros"]);
eq("una alergia sin nombre no se pinta", alergiasOrdenadas([{ reaccion: "ronchas" }]).length, 0);
eq("aguanta null",  alergiasOrdenadas(null), []);
eq("aguanta basura", alergiasOrdenadas("penicilina"), []);
eq("las tres gravedades del formulario", GRAVEDADES, ["leve", "moderada", "grave"]);

console.log("\n── cómo se lee una alergia ──");
eq("con reacción",  alergiaLabel({ nombre: "Penicilina", reaccion: "dificultad para respirar" }),
   "Penicilina — dificultad para respirar");
// La gravedad NO va en el texto: en la pantalla es una etiqueta aparte para que resalte.
eq("la gravedad no se cuela en el texto",
   alergiaLabel({ nombre: "Penicilina", reaccion: "ahogo", gravedad: "grave" }).includes("grave"), false);
eq("sin reacción, solo el nombre", alergiaLabel({ nombre: "Polen" }), "Polen");
eq("sin nada, cadena vacía",       alergiaLabel({}), "");

console.log("\n── los medicamentos activos se COMPONEN ──");
const P = [
  { id: "1", nombre: "Losartán", dosis: "50 mg", cantidad: 1, tipo: "pastilla", frecuencia: "Una vez al día", hora_toma: "08:00" },
  { id: "2", nombre: "Metformina", dosis: "850 mg", cantidad: 1, tipo: "pastilla", frecuencia: "Cada 12 horas", hora_toma: "09:00", suspendido_en: "2026-08-01" },
];
eq("un suspendido NO aparece", medicamentosActivos(P).map(m => m.nombre), ["Losartán"]);
eq("y el activo trae dosis y pauta",
   medicamentosActivos(P)[0].detalle.includes("50 mg") && medicamentosActivos(P)[0].detalle.includes("Una vez al día"), true);
eq("sin pastillas, lista vacía", medicamentosActivos([]), []);
eq("aguanta null",              medicamentosActivos(null), []);

console.log("\n── el contacto ──");
eq("completo", contactoLabel({ contacto_nombre: "María Pérez", contacto_relacion: "esposa", contacto_telefono: "55 1234 5678" }),
   "María Pérez — esposa · 55 1234 5678");
eq("sin relación", contactoLabel({ contacto_nombre: "María", contacto_telefono: "5512" }), "María · 5512");
// Un teléfono sin dueño no ayuda a nadie: se considera que no hay contacto.
eq("un teléfono sin nombre no es contacto", contactoLabel({ contacto_telefono: "5512" }), null);
eq("sin nada, null",                        contactoLabel({}), null);

console.log("\n── las condiciones ──");
eq("se limpian los huecos", condicionesLimpias(["Hipertensión", "  ", "", "Diabetes tipo 2"]),
   ["Hipertensión", "Diabetes tipo 2"]);
eq("se respeta el orden de captura", condicionesLimpias(["Diabetes", "Asma"]), ["Diabetes", "Asma"]);
eq("aguanta null", condicionesLimpias(null), []);

console.log("\n── ¿la ficha está sin llenar? ──");
// La parte que importa: los medicamentos NO cuentan. Si contaran, la ficha parecería lista desde el
// primer medicamento y nadie añadiría nunca sus alergias, que es el dato por el que existe.
eq("un paciente nuevo está vacío",   fichaSinCapturar({ nombre: "Yo" }), true);
eq("con una alergia ya NO está vacío", fichaSinCapturar({ alergias: [{ nombre: "Polen" }] }), false);
eq("con una condición tampoco",        fichaSinCapturar({ condiciones: ["Asma"] }), false);
eq("con contacto tampoco",             fichaSinCapturar({ contacto_nombre: "María" }), false);
eq("arrays vacíos siguen siendo vacío", fichaSinCapturar({ alergias: [], condiciones: [] }), true);
eq("una alergia sin nombre no la llena", fichaSinCapturar({ alergias: [{ reaccion: "ronchas" }] }), true);

console.log(fallos ? `\n${fallos} FALLAN` : "\nTodas pasan ✓");
process.exit(fallos ? 1 : 0);
