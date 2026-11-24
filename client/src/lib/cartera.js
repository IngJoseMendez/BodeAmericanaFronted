// ── UN SALDO A FAVOR NO ES CARTERA ──────────────────────────────────────────
//
// Cuando un cliente abona mas de lo que debe, su saldo queda en negativo. Eso
// NO es cartera: no hay nada que cobrarle. Mientras esa cifra entraba en la
// suma, un cliente con 300.000 a favor le bajaba 300.000 al total de arriba,
// como si otro hubiera pagado esa plata. Nadie perdia dinero, pero la cifra con
// la que se sale a cobrar decia menos de lo que de verdad hay que cobrar, y la
// diferencia no se veia en ninguna parte de la pantalla.
//
// LA REGLA ES UNA: un saldo a favor no suma y no resta.
//
// Por eso esto no devuelve un total ya mezclado, sino TRES MONTONES que nunca se
// suman entre si:
//
//   porCobrar  lo que de verdad se espera cobrar (saldos positivos y activos)
//   perdido    lo dado por perdido (`cartera_inactiva`), tambien en positivo
//   aFavor     lo que se le debe a los clientes, en positivo y aparte
//
// Es la misma decision que ya se tomo con las carteras inactivas y por el mismo
// motivo: una sola cifra obliga a elegir cual mentira contar. Si el favor se
// resta, la cartera sale mas chica de lo que es; si se esconde, hay plata que
// desaparece de la pantalla sin que nadie sepa donde fue. Separados, la pantalla
// enseña las dos cosas y ningun total depende de que alguien se acuerde de la
// regla.
//
// LA MISMA REGLA ESTA EN EL SERVIDOR, en src/utils/carteraTotales.js: el
// tablero y el reporte mensual suman en la base de datos y esta pantalla suma
// filas ya traidas. Si se cambia aqui, se cambia alli.
//
// Los montones se deciden con el saldo REDONDEADO AL PESO. Una cuenta que queda
// en 0,4 pesos por un centavo de un abono viejo no es ni deuda ni favor, y lo
// que se ve en pantalla —que va redondeado— tiene que coincidir con el monton en
// el que esta: nunca una tarjeta de «$0 a favor».

const num = (v) => {
  const n = typeof v === 'number' ? v : parseFloat(v);
  return Number.isFinite(n) ? n : 0;
};

/** El saldo de un cliente, con la formula unica del sistema. */
export const saldoDeFila = (c) => num(c?.saldo_inicial) + num(c?.total_vendido) - num(c?.total_abonado);

// Si la fila ya trae el saldo calculado se usa ese, para no volver a sumar lo
// mismo con otros nombres de columna y acabar con dos cifras distintas.
export const saldoDeCartera = (c) => (c && c.saldo_pendiente != null
  ? num(c.saldo_pendiente)
  : (c && c.saldo != null ? num(c.saldo) : saldoDeFila(c)));

/**
 * Reparte las filas de cartera en los tres montones y devuelve sus totales.
 *
 * `aFavor` viene EN POSITIVO: es lo que se le debe a los clientes, y una cifra
 * que se va a pintar en una tarjeta no deberia llevar el signo puesto por
 * dentro. Quien la pinta decide como decirlo.
 */
export function totalesDeCartera(filas, saldoDe = saldoDeCartera) {
  let porCobrar = 0, perdido = 0, aFavor = 0;
  let cuentasPerdidas = 0, cuentasAFavor = 0;

  for (const c of filas || []) {
    const s = num(saldoDe(c));
    const alPeso = Math.round(s);
    if (alPeso === 0) continue;                       // en cero: ni deuda ni favor
    if (alPeso < 0) { aFavor += -s; cuentasAFavor++; continue; }
    if (c && c.cartera_inactiva) { perdido += s; cuentasPerdidas++; continue; }
    porCobrar += s;
  }

  return { porCobrar, perdido, aFavor, cuentasPerdidas, cuentasAFavor };
}

/**
 * ¿Este saldo es plata a favor del cliente?
 *
 * Un saldo negativo no es una deuda negativa. Pintarlo como «Saldo pendiente:
 * -$300.000» obliga a quien lo lee a interpretar un signo; con su nombre y en
 * positivo —«Saldo a favor: $300.000»— no hay nada que interpretar. Se decide
 * con el saldo al peso, igual que los montones.
 */
export const esAFavor = (v) => Math.round(num(v)) < 0;

/**
 * Las tres listas, para los papeles de cobro.
 *
 * El Excel y el PDF de CARTERA(INTERNA) pintan cada monton en su propia tabla,
 * debajo de un total ya cerrado. Mezclados en una sola tabla, alguien acabaria
 * seleccionando la columna de cifras entera para sumarla —es lo primero que hace
 * cualquiera en Excel— y el error no avisaria.
 */
export function montonesDeCartera(filas, saldoDe = saldoDeCartera) {
  const activas = [], perdidas = [], aFavor = [];
  for (const c of filas || []) {
    const alPeso = Math.round(num(saldoDe(c)));
    if (alPeso === 0) continue;
    if (alPeso < 0) aFavor.push(c);
    else if (c && c.cartera_inactiva) perdidas.push(c);
    else activas.push(c);
  }
  return { activas, perdidas, aFavor };
}

// ── CUÁNTAS PACAS LLEVA UNA COMPRA ──────────────────────────────────────────
//
// Sale de DOS sitios y hacen falta los dos:
//   · una compra del Excel la trae en `cantidad`, deducida y comprobada al
//     cargar el libro (precio × cantidad daba el importe);
//   · una venta hecha EN EL SISTEMA no la trae, porque su detalle son pacas de
//     verdad y el servidor las manda en `detalles`.
//
// Y HAY TRES RESPUESTAS POSIBLES, no dos. Esta es la corrección que pidió el
// negocio al ver clientes «con la cantidad de pacas vacía»:
//
//   un número  se sabe;
//   NO_APLICA  el renglón no es mercancía —un flete, un descuento, un ajuste de
//              cuadre— y por lo tanto no tiene pacas que contar. Antes caía en
//              el mismo guion que lo desconocido, así que la pantalla parecía
//              tener un agujero de datos donde no había ninguno: de las 223
//              compras sin cantidad de los libros, 213 son exactamente esto;
//   null       es mercancía y el dato FALTA. Son las 59 en las que la propia
//              hoja se contradice con su total. Se deja vacío y se dice cuántas
//              son: inventar una cantidad aquí metería en la cuenta de pacas
//              vendidas un número que nadie escribió.
//
// `clase` es la que distingue: un movimiento de tipo 'venta' es mercancía
// cuando su clase es 'venta' (o no la trae, que es lo que había antes de que
// existiera la columna). 'ajuste' y 'descuento' no lo son. Es el mismo filtro
// que usa el servidor en GET /cartera/pacas, para que las dos cifras cuadren.
export const NO_APLICA = 'no-aplica';

// ── Y HAY UN FLETE QUE `clase` NO PUEDE DELATAR ─────────────────────────────
// En los libros viejos hay 106 renglones de FLETES y un PRESTAMO guardados con
// `clase = 'venta'`, porque son cargos que el cliente DEBE y el saldo se calcula
// sumando precisamente las líneas de clase 'venta' (ver GET /cartera en
// src/routes/cartera.js). Reclasificarlos los sacaría de la deuda, así que la
// clase se queda como está y es aquí donde se reconocen.
//
// Se mira SÓLO EL PRINCIPIO del concepto, y por eso: «FLETES», «FLETES $75000
// C/U», «6 x FLETES», «TOTAL FLETES X 9» son todos fletes, mientras que una
// referencia de paca empieza por la prenda. Buscar la palabra en cualquier
// posición convertiría en flete cualquier paca que la llevara en el nombre.
const NO_MERCANCIA = /^(?:\d+\s*[xX]\s*)?(?:TOTAL\s+)?(FLETES?|DESCUENTO|AJUSTE|PRESTAMO|COMISION|TRANSPORTE|INTERES|GIRO)\b/;

const sinMarca = (s) => String(s || '')
  .replace(/\s*\[fila .*$/, '')       // «... [fila 247 de SONIAP]»
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toUpperCase();

export const esMercancia = (m) => String(m?.clase || 'venta') === 'venta'
  && !NO_MERCANCIA.test(sinMarca(m?.descripcion ?? m?.concepto));

export const pacasDeCompra = (m) => {
  if (!esMercancia(m)) return NO_APLICA;
  if (m?.cantidad != null) return num(m.cantidad);
  if (m?.detalles?.length) return m.detalles.reduce((s, d) => s + num(d.cantidad), 0);
  return null;
};

/**
 * Las pacas de un grupo de compras, con la cuenta de sobre cuántas se sabe.
 *
 * Se devuelven las cuatro cifras y no sólo la suma, porque una suma sola
 * mentiría por omisión: quien lee «1.240 pacas» tiene derecho a saber si son
 * todas sus compras o 230 de 256. `noAplica` va aparte de `sinDato` para no
 * contar como agujero lo que nunca tuvo pacas.
 */
export function pacasDeCompras(movimientos) {
  let pacas = 0, conDato = 0, sinDato = 0, noAplica = 0;
  for (const m of movimientos || []) {
    const n = pacasDeCompra(m);
    if (n === NO_APLICA) { noAplica++; continue; }
    if (n == null) { sinDato++; continue; }
    pacas += n;
    conDato++;
  }
  return { pacas, conDato, sinDato, noAplica, compras: conDato + sinDato };
}

/**
 * La CANTIDAD TOTAL de pacas que se le han vendido a un cliente.
 *
 * Es la cifra que pidió el negocio para el resumen de su cartera: cuántas pacas
 * se llevó en total, sin importar en cuántas compras. Se cuenta sobre TODOS sus
 * movimientos de venta —no sobre los que deje a la vista el buscador— porque es
 * un total del cliente, no del filtro.
 */
export const pacasDeCliente = (movimientos) =>
  pacasDeCompras((movimientos || []).filter((m) => m?.tipo === 'venta'));
