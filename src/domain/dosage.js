// Cantidad de pastillas por toma. Puro: sin estado, sin red, sin React.
//
// Por qué existe este archivo. La app modelaba un medicamento como "una dosis, N veces al día",
// y las recetas reales no son así. Reportado por una usuaria en tres mensajes seguidos:
//   1. "de lunes a jueves una dosis y de viernes a domingo otra"
//   2. "tomo una pastilla en la mañana y 2 por la noche"
//   3. "en la mañana mitad de pastilla, a medio día un cuarto y por la noche completa"
// El tercero es el que fija el diseño: la cantidad es FRACCIONARIA. Por eso se guarda como
// número decimal (0.25, 0.5, 1, 1.5) y NUNCA se le muestra así al usuario: nadie piensa
// "0.25 pastillas", piensa "un cuarto". De ahí que formatear viva aquí y en un solo sitio.

// Con extensión .js a propósito: así este módulo se puede probar con `node` a secas, sin Vite.
import { usaCantidad, unidadPara, esFraccionable } from "./medTypes.js";

// Las opciones que se ofrecen de entrada. Corta en 2 a propósito: nueve botones llenaban la
// pantalla y las cantidades altas son raras. Lo que no está en la lista se captura a mano con
// "Otra cantidad", así que el tope no bloquea a nadie — por eso esta lista NO necesita ser
// configurable desde la BD: cualquier cantidad ya es alcanzable sin tocar código ni publicar.
export const CANTIDADES = [0.25, 0.5, 0.75, 1, 1.5, 2];

// Las que tienen sentido para un tipo concreto: una cápsula no se parte a la mitad, así que
// ofrecerle ¼ y ½ solo invita a capturar algo imposible.
export const cantidadesPara = (pill) =>
  esFraccionable(pill) ? CANTIDADES : CANTIDADES.filter(n => n % 1 === 0);

// ¿Esta cantidad está fuera de las opciones rápidas? Si lo está, el formulario abre directo el
// campo libre en vez de mostrar una selección que no coincide con nada.
export const esCantidadLibre = (pill, v) => {
  const n = parseCantidad(v);
  return n !== null && !cantidadesPara(pill).includes(n);
};

// Etiquetas en palabras para las fracciones. En español "media pastilla" se entiende de un
// golpe y "½ pastilla" se puede leer mal de reojo — y buena parte de los usuarios tiene 60+.
const EN_PALABRAS = {
  0.25: "un cuarto de",
  0.5:  "media",
  0.75: "tres cuartos de",
  1.5:  "una y media",
  2.5:  "dos y media",
};

// Normaliza lo que venga de la BD o de un formulario. Devuelve null si no hay dato utilizable,
// para poder distinguir "no especificado" de "1" (importante: los medicamentos que ya existen
// no tienen cantidad y no queremos inventarles una).
export const parseCantidad = (v) => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(",", "."));
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100; // dos decimales bastan para cuartos y tercios
};

// "media pastilla", "un cuarto de pastilla", "2 pastillas", "una y media pastillas".
export const formatCantidad = (v, unidad = "pastilla") => {
  const n = parseCantidad(v);
  if (n === null) return null;
  const palabra = EN_PALABRAS[n];
  if (palabra) return `${palabra} ${n > 1 ? unidad + "s" : unidad}`;
  return `${n % 1 === 0 ? n : n.toString().replace(".", ",")} ${n === 1 ? unidad : unidad + "s"}`;
};

// La cantidad que toca a una hora concreta. `cantidad_por_hora` es un mapa {"22:00": 2} sobre las
// horas que DERIVA getHoras (las horas no se guardan). Si esa hora no tiene override, se usa la
// cantidad general del medicamento. Así "1 en la mañana y 2 en la noche" solo guarda el override.
export const cantidadPara = (pill, hora) => {
  const porHora = pill?.cantidad_por_hora;
  if (porHora && hora != null) {
    const v = parseCantidad(porHora[String(hora).slice(0, 5)]);
    if (v !== null) return v;
  }
  return parseCantidad(pill?.cantidad);
};

// La etiqueta que ve el usuario, compuesta de concentración + cantidad: "750 mg · media pastilla".
// Vive aquí a propósito: la dosis se pinta en 13 sitios (home, modal, ajustes, reportes y cuatro
// cuerpos de notificación) y la regla debe estar en UNO. Si `pill` no tiene los campos nuevos
// devuelve solo la dosis, así que es seguro usarla antes de que existan los datos.
//
// La unidad la manda el TIPO ("cucharada" para un jarabe, "gota" para unas gotas). Y si el tipo no
// admite cantidad —una pomada— no se muestra ninguna aunque el dato exista: "2 pomadas" no es algo
// que nadie diga. Para esos casos el que informa es el campo de nota ("rodilla derecha, capa fina").
export const doseLabel = (pill, hora, unidad = null) => {
  const dosis = pill?.dosis || null;
  if (!usaCantidad(pill)) return dosis || "";
  const cant = formatCantidad(cantidadPara(pill, hora), unidad || unidadPara(pill) || "dosis");
  if (dosis && cant) return `${dosis} · ${cant}`;
  return dosis || cant || "";
};

// Al cambiar la hora base o la frecuencia, las horas derivadas cambian y el mapa de overrides
// queda apuntando a horas que ya no existen. Se limpia contra la lista vigente para que no se
// arrastren fantasmas (una cantidad de las 22:00 no debe reaparecer si el usuario mueve la toma).
export const limpiarCantidadPorHora = (porHora, horasVigentes) => {
  if (!porHora) return null;
  const validas = new Set((horasVigentes || []).map(h => String(h).slice(0, 5)));
  const out = {};
  for (const [h, v] of Object.entries(porHora)) {
    const n = parseCantidad(v);
    if (n !== null && validas.has(h)) out[h] = n;
  }
  return Object.keys(out).length ? out : null;
};
