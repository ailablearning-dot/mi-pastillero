// Qué es gratis y qué es de pago. Puro: sin React, sin red, sin RevenueCat.
//
// Vive aquí y no repartido por las pantallas porque el reparto es una DECISIÓN de producto que se
// consulta desde muchos sitios (la barra de pestañas, el selector de paciente, el calendario, los
// reportes). Con la regla en un solo lugar, cambiarla es cambiar una línea; repartida, es una
// cacería en la que siempre queda una puerta abierta o una de más.
//
// El modelo, del prototipo aprobado (docs/prototipos/prototipo-sin-muros.html):
//   GRATIS  = el motor del hábito. Medicamentos ilimitados, UNA persona, recordatorios completos,
//             historial de los últimos días y la ficha de emergencia.
//   PREMIUM = mi historia y mi futuro. Varias personas, historial completo con Excel, citas y el
//             expediente.
//
// Y una regla que atraviesa todo: lo premium **se ve, velado y con candado. Nunca escondido.**
// Una pantalla en blanco o un menú que no existe no vende nada; enseñar qué hay dentro sí.

export const FUNCIONES = {
  MULTIPACIENTE: "multipaciente",
  HISTORIAL_COMPLETO: "historial_completo",
  CITAS: "citas",
  EXPEDIENTE: "expediente",
};

// Cuántos días hacia atrás ve el plan gratis.
//
// 7 y no 30 a propósito: con 30 se siente más generoso pero el incentivo de pagar desaparece, y
// con 7 el corte se nota justo al final de la primera semana, cuando la persona ya tomó el hábito
// y el historial empieza a valerle. Decidido en el prototipo.
export const DIAS_HISTORIAL_GRATIS = 7;

// Lo que se le enseña al usuario cuando toca una puerta cerrada. El paywall es SIEMPRE el mismo
// —entra por una puerta, ve la casa entera— pero el encabezado nombra lo que acaba de tocar: si
// alguien viene de "quiero agendar mi consulta", hablarle de multipaciente es no escucharlo.
export const MOTIVO = {
  [FUNCIONES.MULTIPACIENTE]:      { titulo: "Cuida a más de una persona", detalle: "Agrega a tu mamá, a tu papá o a quien cuides, cada uno con sus medicamentos y su historial." },
  [FUNCIONES.HISTORIAL_COMPLETO]: { titulo: "Tu historial completo",      detalle: `El plan gratis guarda los últimos ${DIAS_HISTORIAL_GRATIS} días. Con Premium tienes todo, y lo exportas a Excel para tu médico.` },
  [FUNCIONES.CITAS]:              { titulo: "No olvides tus citas",       detalle: "Anota tus consultas, estudios y vacunas, y te avisamos antes de que lleguen." },
  [FUNCIONES.EXPEDIENTE]:         { titulo: "Tu expediente médico",       detalle: "Para qué tomas cada medicamento, quién te lo indicó y la foto de la receta." },
};

// ¿Puede usar esta función?
//
// `hasPremium` incluye el periodo de prueba: RevenueCat no distingue entre "pagando" y "en los 7
// días", y la app tampoco debe hacerlo — durante la prueba se usa todo.
export const puedeUsar = (funcion, hasPremium) => !!hasPremium || !esPremium(funcion);

// Hoy TODAS las funciones del catálogo son de pago; la lista existe igualmente para que añadir una
// gratis en el futuro sea añadirla aquí y no tocar cada pantalla.
const PREMIUM = new Set(Object.values(FUNCIONES));
export const esPremium = (funcion) => PREMIUM.has(funcion);

// ¿Este día del historial entra en el plan gratis?
//
// La ventana cuenta hacia ATRÁS desde hoy e incluye el día de hoy: con 7 días, hoy y los 6
// anteriores. El futuro nunca se corta — un tratamiento programado para la semana que viene no es
// "historial" y velarlo sería incomprensible.
export const diaVisible = (fechaStr, hoyStr, hasPremium) => {
  if (hasPremium) return true;
  if (!fechaStr || !hoyStr) return true;
  const dias = diasEntre(fechaStr, hoyStr);
  if (dias <= 0) return true;                    // hoy o futuro
  return dias < DIAS_HISTORIAL_GRATIS;
};

// Días enteros de `fechaStr` a `hoyStr`, positivo hacia el pasado. Anclado al mediodía para que un
// cambio de horario no mueva el corte un día entero.
const alMediodia = (f) => new Date(String(f).slice(0, 10) + "T12:00:00");
export const diasEntre = (fechaStr, hoyStr) =>
  Math.round((alMediodia(hoyStr) - alMediodia(fechaStr)) / 86400000);

// El texto del corte. Va escrito a propósito: un calendario que se corta sin decir por qué se lee
// como un fallo de la app, no como un límite del plan — y eso trae reseñas malas en vez de compras.
//
// El prototipo usa "HASTA AQUÍ LLEGA EL PLAN GRATIS" como línea DIVISORIA entre el bloque gratis y
// el de pago. En una cuadrícula de mes no hay un "aquí": los días velados quedan repartidos por
// las primeras semanas, así que la frase señalaría a ningún sitio. Se conserva la intención —el
// corte se explica y se puede tocar— con una redacción que sí encaja en un pie de calendario.
export const TEXTO_CORTE = `El plan gratis muestra los últimos ${DIAS_HISTORIAL_GRATIS} días · Ver todo`;

// ── Lo que Premium incluye, y por qué la lista NO es fija ──────────────────────────────────
//
// La lista de beneficios vivía escrita a mano dentro del paywall, y era la del muro duro de la 1.1
// —cuando TODO era de pago—. Al cambiar el modelo se quedó atrás y nadie lo notó: seguía vendiendo
// "recordatorios que suenan a tiempo", que hoy es GRATIS. A quien lleva una semana usándolos, la
// primera línea del argumento de venta le ofrece algo que ya tiene, y eso le quita crédito al resto.
//
// Por eso la lista se deriva de aquí: es el mismo reparto que gobierna las puertas, así que no
// puede volver a desalinearse sin que se vea.
//
// Una línea por función de pago. Deliberadamente NO están las gratis.
export const BENEFICIO = {
  [FUNCIONES.CITAS]:              "Citas médicas con recordatorio",
  [FUNCIONES.MULTIPACIENTE]:      "Los medicamentos de toda tu familia",
  [FUNCIONES.HISTORIAL_COMPLETO]: "Todo tu historial, y en Excel",
  // EXPEDIENTE se anuncia cuando exista (punto 10/12 del roadmap). El prototipo lo lista porque
  // dibuja el destino; prometer hoy una pantalla que no está es lo que trae reembolsos.
};

// La lista del paywall, empezando por la puerta que la persona acaba de tocar.
//
// El orden importa más de lo que parece: tocas el candado de citas, el título habla de citas y —con
// la lista fija— citas no aparecía en lo que "incluye". El paywall parecía hablar de otra cosa.
export const beneficios = (funcion) => {
  const claves = Object.keys(BENEFICIO);
  const primero = funcion && BENEFICIO[funcion] ? [funcion, ...claves.filter(k => k !== funcion)] : claves;
  return primero.map(k => BENEFICIO[k]);
};

// El nombre corto de cada función, para la frase puente. Es una frase, no una etiqueta: tiene que
// caber en "…mucho más que ___".
//
// Ojo con el tono al escribir estas: "varias personas a tu cargo" venía del prototipo y en device
// se leyó como si el usuario fuera el jefe de alguien. Quien cuida a su mamá no la tiene "a su
// cargo". Se nombra la ACCIÓN que acaba de intentar —agregar a otra persona—, no una jerarquía.
const MAS_QUE = {
  [FUNCIONES.CITAS]:              "las citas",
  [FUNCIONES.MULTIPACIENTE]:      "agregar a otra persona",
  [FUNCIONES.HISTORIAL_COMPLETO]: "el historial",
};

// La frase puente entre el título contextual y la lista. Del prototipo, textual:
// "Premium incluye mucho más que citas."
//
// Sin ella el paywall se lee como dos pantallas pegadas —arriba habla de citas, abajo y sin
// transición de pacientes y reportes— y quien lo mira siente que le cambiaron el tema a media
// venta. Una línea es todo lo que hace falta para dar permiso de ese cambio.
export const puente = (funcion) =>
  MAS_QUE[funcion] ? `Premium incluye mucho más que ${MAS_QUE[funcion]}` : "Todo lo que incluye Premium";
