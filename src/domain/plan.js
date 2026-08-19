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
