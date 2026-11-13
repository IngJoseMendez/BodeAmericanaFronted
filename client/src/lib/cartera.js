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
