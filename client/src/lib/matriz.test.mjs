// Pruebas de la aritmética del reparto y del libro de faltantes.
//
// Se corren con `node client/src/lib/matriz.test.mjs` desde la raíz del
// frontend. Sin framework y sin dependencias, como el resto de las pruebas de
// este proyecto: un helper que compara contra un número escrito a mano y una
// cuenta de fallos al final.
//
// Estas comprueban cosas que, si se rompen, no fallan — mienten. Un reparto que
// entrega once pacas donde hay diez no lanza ningún error: crea una cotización
// que la bodega no puede despachar y se descubre con el camión cargado. Un
// faltante que se duplica en cada ronda tampoco lanza: se descubre cuando la
// dueña llama a un cliente a decirle que le debe el doble de lo que le debe.
// Por eso los números de aquí son los del diseño, calculados a mano, y no lo
// que devuelva la implementación de hoy.

import {
  normTxt, claveStock, claveAsignacion,
  aProrrata, porOrden, cubrirFaltante,
  reconciliarReparto, proyectarFilas, totalesDeReparto,
} from './matriz.js';
import { aplicarMovimiento, movimientoDeLinea } from './faltantes.js';

let malos = 0;
const grupo = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 52 - t.length)));

function comprobar(etiqueta, real, esperado) {
  const bien = typeof real === 'number' && typeof esperado === 'number'
    ? Math.abs(real - esperado) < 0.001
    : JSON.stringify(real) === JSON.stringify(esperado);
  if (!bien) malos++;
  console.log(`  ${bien ? '✓ OK  ' : '✗ MAL '} ${etiqueta.padEnd(52)} ${JSON.stringify(real)}${bien ? '' : '  ← esperaba ' + JSON.stringify(esperado)}`);
}

/** Corre algo que podría lanzar y devuelve el nombre del error, o 'no lanza'. */
function sinLanzar(etiqueta, fn) {
  try {
    fn();
    comprobar(etiqueta, 'no lanza', 'no lanza');
  } catch (e) {
    comprobar(etiqueta, `LANZÓ ${e && e.message}`, 'no lanza');
  }
}

const linea = (cliente_id, pedida, faltante_abierto = 0) => ({ cliente_id, pedida, faltante_abierto });
const enOrden = (mapa, ids) => ids.map((id) => mapa.get(id) ?? null);
const suma = (mapa) => [...mapa.values()].reduce((s, n) => s + n, 0);


grupo('claves de comparación');
comprobar('normTxt quita acentos y mayúsculas', normTxt('  Mixta INVIERNO  '), 'mixta invierno');
comprobar('normTxt aguanta null', normTxt(null), '');
comprobar('claveStock une referencia y calidad', claveStock('MIXTA INVIERNO', 'Premium'), 'mixta invierno|premium');
comprobar('claveStock sin calidad', claveStock('SHORTS', null), 'shorts|');
comprobar('claveAsignacion lleva el cliente delante', claveAsignacion(7, 'SHORTS', 'supreme'), '7|shorts|supreme');
// El id llega unas veces como número y otras como clave de objeto (string).
// Las dos formas tienen que producir la MISMA clave o la proyección del dinero
// no encontraría la mitad de las asignaciones y el pie cobraría de menos.
comprobar('el id numérico y el id string dan la misma clave',
  claveAsignacion('7', 'SHORTS', 'supreme') === claveAsignacion(7, 'SHORTS', 'supreme'), true);


grupo('a prorrata — el caso del diseño');
{
  // MIXTA INVIERNO: piden 8 + 7 + 5 = 20 y hay 10.
  // Exactos 4 / 3,5 / 2,5 → enteros 4 / 3 / 2 = 9, sobra 1.
  // La suelta va al de mayor decimal; empatan el de 7 y el de 5, y gana el que
  // más pidió, que es lo que promete el title del botón.
  const r = aProrrata([linea(1, 8), linea(2, 7), linea(3, 5)], 10);
  comprobar('8/7/5 sobre 10 → 4/4/2', enOrden(r, [1, 2, 3]), [4, 4, 2]);
  comprobar('reparte exactamente el disponible', suma(r), 10);
}
{
  const r = aProrrata([linea(1, 1), linea(2, 1), linea(3, 1)], 2);
  comprobar('1/1/1 sobre 2 → los dos primeros', enOrden(r, [1, 2, 3]), [1, 1, 0]);
  comprobar('no se inventa una tercera paca', suma(r), 2);
}
{
  // Tres pacas entre doce clientes: la parte entera es 0 para todos y todo se
  // decide en el reparto del resto. Es el caso que hace que «a partes iguales»
  // no exista como cuarto botón.
  const doce = Array.from({ length: 12 }, (_, i) => linea(i + 1, 1));
  const r = aProrrata(doce, 3);
  comprobar('3 entre 12 que piden 1 → los tres primeros', enOrden(r, [1, 2, 3, 4, 5]), [1, 1, 1, 0, 0]);
  comprobar('siguen siendo tres pacas', suma(r), 3);
}

grupo('a prorrata — los dos topes innegociables');
{
  const r = aProrrata([linea(1, 8), linea(2, 7), linea(3, 5)], 100);
  comprobar('si sobra stock, cada uno recibe lo que pidió', enOrden(r, [1, 2, 3]), [8, 7, 5]);
  comprobar('NUNCA se reparte más de lo pedido', suma(r), 20);
}
{
  const r = aProrrata([linea(1, 8), linea(2, 7), linea(3, 5)], 1);
  comprobar('una sola paca va al que más pidió', enOrden(r, [1, 2, 3]), [1, 0, 0]);
  comprobar('nunca se pasa del disponible', suma(r) <= 1, true);
}
{
  const r = aProrrata([linea(1, 8), linea(2, 7), linea(3, 5)], 0);
  comprobar('sin stock nadie recibe nada', enOrden(r, [1, 2, 3]), [0, 0, 0]);
  // La celda «Le doy» tiene que leer un 0, no un hueco: un hueco y un cero no
  // pueden verse distinto en la tabla.
  comprobar('pero las tres líneas siguen en el Map', r.size, 3);
}
{
  // Barrido: con cualquier disponible entre 0 y 30, jamás se reparte de más.
  let fallos = 0;
  for (let hay = 0; hay <= 30; hay++) {
    const r = aProrrata([linea(1, 8), linea(2, 7), linea(3, 5)], hay);
    const total = suma(r);
    if (total > hay || total > 20) fallos++;
    if (r.get(1) > 8 || r.get(2) > 7 || r.get(3) > 5) fallos++;
  }
  comprobar('31 disponibles distintos y ni uno se pasa', fallos, 0);
}


grupo('por orden — llena de arriba abajo hasta agotar');
{
  const r = porOrden([linea(1, 8), linea(2, 7), linea(3, 5)], 10);
  comprobar('8/7/5 sobre 10 → 8/2/0', enOrden(r, [1, 2, 3]), [8, 2, 0]);
  comprobar('agota el disponible', suma(r), 10);
}
{
  const r = porOrden([linea(1, 8), linea(2, 7), linea(3, 5)], 100);
  comprobar('si sobra, todos completos y nada más', enOrden(r, [1, 2, 3]), [8, 7, 5]);
}
comprobar('sin stock, por orden tampoco inventa',
  enOrden(porOrden([linea(1, 4), linea(2, 2)], 0), [1, 2]), [0, 0]);


grupo('cubrir lo que faltó — primero lo que ya faltaba');
{
  // Los dos piden 5 y hay 5. Por orden, el primero se lleva todo y el segundo
  // —al que ya le faltaron 4— se va otra vez con las manos vacías.
  const lineas = [linea(1, 5, 0), linea(2, 5, 4)];
  const r = cubrirFaltante(lineas, 5);
  comprobar('paga primero las 4 que se le venían debiendo', enOrden(r, [1, 2]), [1, 4]);
  comprobar('y reparte las 5 completas', suma(r), 5);
  comprobar('por orden habría dejado en cero al que ya faltaba',
    enOrden(porOrden(lineas, 5), [1, 2]), [5, 0]);
}
{
  // Se le deben 9 pero hoy solo pide 2: no se le puede meter en la cotización
  // mercancía que no ha pedido en esta ronda.
  const r = cubrirFaltante([linea(1, 2, 9), linea(2, 5, 0)], 10);
  comprobar('lo viejo se topa con lo que pide hoy', enOrden(r, [1, 2]), [2, 5]);
  comprobar('lo que sobra no se reparte a la fuerza', suma(r), 7);
}
{
  const r = cubrirFaltante([linea(1, 5, 3), linea(2, 5, 3)], 4);
  comprobar('si no alcanza ni para lo viejo, va por orden', enOrden(r, [1, 2]), [3, 1]);
}
comprobar('sin stock no se cubre nada',
  enOrden(cubrirFaltante([linea(1, 5, 3)], 0), [1]), [0]);


grupo('reconciliar — y decir en voz alta lo que se tocó');
{
  const productos = [{
    referencia: 'MIXTA INVIERNO', calidad: 'premium', disponibles: 10,
    clientes: [{ cliente_id: 1, pedida: 8 }, { cliente_id: 2, pedida: 7 }],
  }];
  const previo = new Map([
    [claveAsignacion(1, 'MIXTA INVIERNO', 'premium'), 6],
    [claveAsignacion(2, 'MIXTA INVIERNO', 'premium'), 4],
  ]);
  const r = reconciliarReparto(previo, productos);
  comprobar('lo que no cambió se conserva EXACTO',
    [...r.asignaciones.values()], [6, 4]);
  comprobar('y no se avisa de nada que no pasó', r.ajustados, []);
}
{
  // El cliente bajó su pedido de 8 a 4 y le estaban asignadas 6.
  const productos = [{
    referencia: 'MIXTA INVIERNO', calidad: 'premium', disponibles: 10,
    clientes: [{ cliente_id: 1, pedida: 4 }],
  }];
  const previo = new Map([[claveAsignacion(1, 'MIXTA INVIERNO', 'premium'), 6]]);
  const r = reconciliarReparto(previo, productos);
  comprobar('se recorta a lo que pide ahora', r.asignaciones.get('1|mixta invierno|premium'), 4);
  comprobar('y queda constancia del recorte',
    r.ajustados, [{ referencia: 'MIXTA INVIERNO', calidad: 'premium', antes: 6, ahora: 4 }]);
}
{
  // Bajó el disponible: había 10 repartidas (6 y 4) y ahora solo hay 5.
  // Se recorta A PRORRATA, que reparte el daño en vez de castigar al último.
  const productos = [{
    referencia: 'CHAQUETA', calidad: 'premium', disponibles: 5,
    clientes: [{ cliente_id: 1, pedida: 8 }, { cliente_id: 2, pedida: 7 }],
  }];
  const previo = new Map([
    [claveAsignacion(1, 'CHAQUETA', 'premium'), 6],
    [claveAsignacion(2, 'CHAQUETA', 'premium'), 4],
  ]);
  const r = reconciliarReparto(previo, productos);
  comprobar('el recorte por disponible va a prorrata', [...r.asignaciones.values()], [3, 2]);
  comprobar('y nunca deja más de lo que hay', suma(r.asignaciones), 5);
  comprobar('el aviso trae el antes y el ahora',
    r.ajustados, [{ referencia: 'CHAQUETA', calidad: 'premium', antes: 10, ahora: 5 }]);
}
{
  // El producto ya no lo pide nadie: su reparto se descarta, pero se CUENTA.
  // Que unas pacas repartidas desaparezcan sin una línea en el aviso es
  // exactamente el silencio que hace que se deje de confiar en la pantalla.
  const previo = new Map([[claveAsignacion(1, 'SHORTS', 'supreme'), 4]]);
  const r = reconciliarReparto(previo, []);
  comprobar('la asignación huérfana se descarta', r.asignaciones.size, 0);
  comprobar('pero sale en el aviso, marcada', r.ajustados,
    [{ referencia: 'shorts', calidad: 'supreme', antes: 4, ahora: 0, descartado: true }]);
}


grupo('el libro de faltantes — la secuencia completa del diseño');
{
  // Reparto 8: MARIA pide 5 de MIXTA/premium, hay 0 → recibe 0.
  const r8 = aplicarMovimiento({}, { suma: 5 });
  comprobar('pidió 5 y no había → abierta 5', r8.cantidad_abierta, 5);
  comprobar('y el faltante nace abierto', r8.estado, 'abierto');

  // Reparto 9: pulsa el chip, pide 8 (3 cargadas + 5 nuevas), hay 3 → recibe 3.
  const m9 = movimientoDeLinea({
    cantidad_pedida: 8, cantidad_cargada_faltante: 3, cantidad_repartida: 3,
  });
  comprobar('abono = min(repartida, cargada) = 3', m9.abono, 3);
  comprobar('faltante nuevo = (8−3) − (3−3) = 5', m9.faltante_nuevo, 5);

  const r9 = aplicarMovimiento(
    { cantidad_original: 5, cantidad_saldada: 0, cantidad_anulada: 0 },
    { suma: m9.faltante_nuevo, salda: m9.abono },
  );
  comprobar('original 10', r9.cantidad_original, 10);
  comprobar('saldada 3', r9.cantidad_saldada, 3);
  comprobar('abierta 7 (2 viejas + 5 nuevas)', r9.cantidad_abierta, 7);
  comprobar('sigue abierto', r9.estado, 'abierto');

  // Reparto 10: pide 2, recibe 2 y responde que SÍ a cerrar el resto.
  const r10 = aplicarMovimiento(
    { cantidad_original: 10, cantidad_saldada: 3, cantidad_anulada: 0 },
    { salda: 2, anula: 5 },
  );
  comprobar('saldada 5', r10.cantidad_saldada, 5);
  comprobar('anulada 5', r10.cantidad_anulada, 5);
  comprobar('abierta 0', r10.cantidad_abierta, 0);
  // Se entregó parte: NO merece leerse como anulado.
  comprobar('estado completado', r10.estado, 'completado');
}
{
  // La invariante que sostiene el módulo entero, comprobada a lo bruto sobre
  // combinaciones absurdas: original = saldada + anulada + abierta, SIEMPRE.
  let fallos = 0;
  for (let orig = 0; orig <= 6; orig++) {
    for (let salda = 0; salda <= 6; salda++) {
      for (let anula = 0; anula <= 6; anula++) {
        const r = aplicarMovimiento({ cantidad_original: orig }, { salda, anula });
        if (r.cantidad_original !== r.cantidad_saldada + r.cantidad_anulada + r.cantidad_abierta) fallos++;
        if (r.cantidad_abierta < 0) fallos++;
      }
    }
  }
  comprobar('343 combinaciones y la invariante aguanta', fallos, 0);
}
{
  // Si un abono y una anulación se pasan juntos de lo original, gana lo
  // ENTREGADO: anular de más solo borra un faltante, saldar de más afirma que
  // salió mercancía que nunca salió de la bodega.
  const r = aplicarMovimiento({ cantidad_original: 5 }, { salda: 5, anula: 5 });
  comprobar('gana lo entregado sobre lo perdonado', [r.cantidad_saldada, r.cantidad_anulada], [5, 0]);
}
{
  const sinContar = movimientoDeLinea({
    cantidad_pedida: 50, cantidad_cargada_faltante: 0, cantidad_repartida: 10,
    cuenta_faltante: false,
  });
  comprobar('la casilla «no cuenta» no ensucia el libro', sinContar.faltante_nuevo, 0);
}


grupo('el dinero — una sola aritmética, la de cotizacion.js');
{
  // MARIA, del wireframe: pidió 8 MIXTA + 4 SHORTS + 6 JEANS = 18 pacas.
  // Se le reparten 5 MIXTA + 0 SHORTS + 6 JEANS = 11.
  //   5 × 1.700.000 + 6 × 1.600.000 = 18.100.000
  //   − descuento 11 × 50.000 = 550.000  + transporte 11 × 35.000 = 385.000
  //   = 17.935.000
  const filas = {
    7: {
      items: [
        { referencia: 'MIXTA INVIERNO', calidad: 'premium', cantidad: '8', precio: '1.700.000' },
        { referencia: 'SHORTS', calidad: 'supreme', cantidad: '4', precio: '1.900.000' },
        { referencia: 'JEANS CLÁSICO', calidad: 'primera', cantidad: '6', precio: '1.600.000' },
      ],
      descuento: '50.000', tipo_descuento: 'valor_fijo', transporte_unitario: '',
    },
  };
  const asignado = new Map([
    [claveAsignacion(7, 'MIXTA INVIERNO', 'premium'), 5],
    [claveAsignacion(7, 'SHORTS', 'supreme'), 0],
    [claveAsignacion(7, 'JEANS CLÁSICO', 'primera'), 6],
  ]);

  const p = proyectarFilas(filas, asignado);
  comprobar('la línea en cero no pasa a la cotización', p[7].items.length, 2);
  comprobar('las cantidades son las repartidas', p[7].items.map((i) => i.cantidad), [5, 6]);
  comprobar('el descuento del cliente viaja con la fila', p[7].descuento, '50.000');

  const t = totalesDeReparto(filas, asignado, 35000);
  const maria = t.clientes.get(7);
  comprobar('MARIA · 11/18', [maria.repartidas, maria.pedidas], [11, 18]);
  comprobar('le quedan faltando 7', maria.faltando, 7);
  comprobar('y su total es 17.935.000', maria.total, 17935000);
  comprobar('el pie suma las 11 repartidas', t.unidades, 11);
  comprobar('y las 18 pedidas', t.pedidas, 18);
  comprobar('un cliente con faltante', t.clientesConFaltante, 1);
}
{
  // Un cliente puede tener DOS líneas del mismo producto si los precios
  // difieren. Sin control de cupo, las dos leerían la misma clave y cada una se
  // llevaría la asignación entera: el cliente pagaría el doble de pacas de las
  // que se le apartaron y cuadraría con todo menos con la bodega.
  const filas = {
    3: {
      items: [
        { referencia: 'JEANS', calidad: 'primera', cantidad: '3', precio: '1.000.000' },
        { referencia: 'JEANS', calidad: 'primera', cantidad: '4', precio: '900.000', esPromocion: true },
      ],
      descuento: '', tipo_descuento: 'valor_fijo', transporte_unitario: '0',
    },
  };
  const asignado = new Map([[claveAsignacion(3, 'JEANS', 'primera'), 5]]);
  const p = proyectarFilas(filas, asignado);
  comprobar('el cupo se gasta de arriba abajo', p[3].items.map((i) => i.cantidad), [3, 2]);
  const t = totalesDeReparto(filas, asignado, 35000);
  comprobar('no se cobran 10 pacas donde se apartaron 5', t.clientes.get(3).repartidas, 5);
}
{
  // Un cliente que pidió y al que no le tocó nada NO desaparece: su nombre sale
  // en el pie («ANDREA no recibe nada: le quedan faltando 5»).
  const filas = {
    9: {
      items: [{ referencia: 'SHORTS', calidad: 'supreme', cantidad: '5', precio: '1.900.000' }],
      descuento: '', tipo_descuento: 'valor_fijo', transporte_unitario: '',
    },
  };
  const t = totalesDeReparto(filas, new Map(), 35000);
  comprobar('el cliente en cero sigue en la cinta', t.clientes.has(9), true);
  comprobar('con nombre en el pie', t.clientesSinNada, 1);
  comprobar('y sin transporte que cobrarle', t.total, 0);
}
{
  // La casilla «esto no queda debiendo»: el pie y el rótulo del botón tienen que
  // contar lo MISMO que el servidor va a escribir. Sin esto, el botón prometía
  // «anotar 12 faltante(s)» y el libro se quedaba con 9, sin que nada fallara.
  const filas = {
    4: {
      items: [
        { referencia: 'MIXTA INVIERNO', calidad: 'premium', cantidad: '8', precio: '1.700.000' },
        { referencia: 'SHORTS', calidad: 'supreme', cantidad: '4', precio: '1.900.000' },
      ],
      descuento: '', tipo_descuento: 'valor_fijo', transporte_unitario: '0',
    },
  };
  const asignado = new Map([
    [claveAsignacion(4, 'MIXTA INVIERNO', 'premium'), 5],
    [claveAsignacion(4, 'SHORTS', 'supreme'), 0],
  ]);

  const conTodo = totalesDeReparto(filas, asignado, 0);
  comprobar('sin descartar nada, le faltan 3 + 4', conTodo.faltando, 7);

  // La dueña apaga la línea de SHORTS: pidió 4 «a ver si suena la flauta».
  const apagadas = new Set([claveAsignacion(4, 'SHORTS', 'supreme')]);
  const conCasilla = totalesDeReparto(filas, asignado, 0, apagadas);
  comprobar('la línea apagada deja de contar', conCasilla.faltando, 3);
  comprobar('y el cliente sigue contando por la otra', conCasilla.clientesConFaltante, 1);
  comprobar('lo repartido no se toca', conCasilla.unidades, 5);
  comprobar('ni lo pedido', conCasilla.pedidas, 12);

  // Apagadas las dos, el cliente deja de aparecer como que le falta algo.
  const todas = new Set([
    claveAsignacion(4, 'MIXTA INVIERNO', 'premium'),
    claveAsignacion(4, 'SHORTS', 'supreme'),
  ]);
  const ninguna = totalesDeReparto(filas, asignado, 0, todas);
  comprobar('apagadas las dos, no queda faltando nada', ninguna.faltando, 0);
  comprobar('y ningún cliente con faltante', ninguna.clientesConFaltante, 0);

  // El conjunto también se acepta como arreglo o como objeto: la pantalla lo
  // guarda como Set, pero el borrador de localStorage lo serializa a arreglo.
  comprobar(
    'acepta un arreglo en vez de un Set',
    totalesDeReparto(filas, asignado, 0, [claveAsignacion(4, 'SHORTS', 'supreme')]).faltando,
    3,
  );
}


grupo('entradas basura — la pantalla las llama en cada tecla');
sinLanzar('aProrrata(null, null)', () => aProrrata(null, null));
sinLanzar('aProrrata(undefined, NaN)', () => aProrrata(undefined, NaN));
sinLanzar('aProrrata("basura", "10")', () => aProrrata('basura', '10'));
sinLanzar('porOrden({}, -5)', () => porOrden({}, -5));
sinLanzar('cubrirFaltante([null, undefined], 5)', () => cubrirFaltante([null, undefined], 5));
sinLanzar('reconciliarReparto(null, null)', () => reconciliarReparto(null, null));
sinLanzar('reconciliarReparto("x", [null])', () => reconciliarReparto('x', [null]));
sinLanzar('proyectarFilas(null, null)', () => proyectarFilas(null, null));
sinLanzar('proyectarFilas({1:null}, "x")', () => proyectarFilas({ 1: null }, 'x'));
sinLanzar('totalesDeReparto(undefined, undefined, undefined)', () => totalesDeReparto(undefined, undefined, undefined));
sinLanzar('aplicarMovimiento(null)', () => aplicarMovimiento(null));
sinLanzar('aplicarMovimiento(undefined, null)', () => aplicarMovimiento(undefined, null));
sinLanzar('movimientoDeLinea(null)', () => movimientoDeLinea(null));

comprobar('una línea sin cliente_id no entra en el reparto',
  aProrrata([{ pedida: 5 }, { cliente_id: null, pedida: 3 }], 10).size, 0);
comprobar('una cantidad a medio escribir vale 0',
  enOrden(aProrrata([linea(1, 'oc'), linea(2, 4)], 10), [1, 2]), [0, 4]);
comprobar('una cantidad negativa vale 0',
  enOrden(porOrden([linea(1, -5), linea(2, 3)], 10), [1, 2]), [0, 3]);
comprobar('un disponible NaN no reparte nada',
  suma(aProrrata([linea(1, 5)], NaN)), 0);
comprobar('un faltante vacío se lee como cero abierto',
  aplicarMovimiento(null).cantidad_abierta, 0);
comprobar('y como anulado, que es el único estado sin nada detrás',
  aplicarMovimiento(null).estado, 'anulado');
// Éste es el que de verdad importa: pg devuelve las columnas DECIMAL como
// STRING. Sin normalizar la entrada, ("5" || 0) + 3 da "53" y el faltante de un
// cliente se multiplica por diez sin que falle absolutamente nada.
comprobar('los números del servidor en string NO se concatenan',
  aplicarMovimiento({ cantidad_original: '5' }, { suma: '3' }).cantidad_original, 8);
comprobar('un movimiento negativo se lee como que no hubo movimiento',
  aplicarMovimiento({ cantidad_original: 5 }, { suma: -3 }).cantidad_original, 5);


console.log(malos ? `\n${malos} PRUEBA(S) FALLIDA(S)` : '\nEl reparto y el libro de faltantes cuadran');
process.exit(malos ? 1 : 0);
