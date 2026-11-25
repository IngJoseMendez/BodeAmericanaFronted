// DE DÓNDE SALE EL PRECIO DE UNA PACA, Y EN QUÉ ORDEN.
//
// La dueña fija los precios por CATEGORÍA + CALIDAD, y «categoría» es la
// TEMPORADA: sólo hay invierno y verano. Lo que se escoge en la Matriz, en una
// cotización o en el inventario es una REFERENCIA —«deportivo», «polar»— y cada
// referencia cuelga de una temporada. Así que el precio de «deportivo premium»
// es el de «verano premium», porque deportivo es de verano.
//
// Ese salto referencia → temporada → precio estaba escrito TRES veces (Matriz,
// Cotizaciones y el modal de aprobar un contenedor) y las tres copias se
// separaron: dos ponían el precio guardado en la paca por encima del de la tabla
// de Precios y la tercera no, así que el mismo producto salía a un precio
// distinto según la pantalla. Ahora la regla vive en src/lib/precios.js y esto
// la clava.
import assert from 'assert';
import {
  precioDeVenta, temporadaDeReferencia,
  ORIGEN_PROMOCION, ORIGEN_CATALOGO, ORIGEN_INVENTARIO,
} from '../src/lib/precios.js';

let malos = 0;
const grupo = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 54 - t.length)));
const prueba = (nombre, fn) => {
  try { fn(); console.log('  ✓ ' + nombre); }
  catch (e) { malos++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
};

// Las tablas reales, recortadas: son las cifras que hay hoy en producción.
const REFERENCIAS = [
  { nombre: 'deportivo', temporada_nombre: 'verano' },
  { nombre: 'deportivo invierno', temporada_nombre: 'invierno' },
  { nombre: 'mixta verano', temporada_nombre: 'verano' },
  { nombre: 'polar', temporada_nombre: 'invierno' },
  // Una referencia de las 49 que nadie dio de alta: no tiene temporada.
];
const PREESTABLECIDOS = [
  { categoria: 'verano', calidad: 'premium', precio: '2300000.00' },
  { categoria: 'verano', calidad: 'especial', precio: '1430000.00' },
  { categoria: 'verano', calidad: 'supreme', precio: '1750000.00' },
  { categoria: 'invierno', calidad: 'premium', precio: '1700000.00' },
  { categoria: 'invierno', calidad: 'supreme', precio: '1420000.00' },
];
// El precio que se tecleó al aprobar el contenedor y quedó en las pacas.
const LISTA = [
  { referencia: 'deportivo', calidad: 'premium', precio: '2300000.00' },
  { referencia: 'deportivo', calidad: 'especial', precio: '1600000.00' },
  { referencia: 'mixta verano', calidad: 'supreme', precio: '1900000.00' },
  { referencia: 'SHORT MIXTO', calidad: 'supreme', precio: '1900000.00' },
];
const T = { promos: [], preestablecidos: PREESTABLECIDOS, listaPrecios: LISTA, referencias: REFERENCIAS };

grupo('La referencia cuelga de una temporada');
prueba('deportivo es de verano', () => {
  assert.strictEqual(temporadaDeReferencia('deportivo', REFERENCIAS), 'verano');
});
prueba('y deportivo invierno es de invierno: son dos referencias distintas', () => {
  assert.strictEqual(temporadaDeReferencia('deportivo invierno', REFERENCIAS), 'invierno');
});
prueba('se compara sin acentos ni mayusculas', () => {
  assert.strictEqual(temporadaDeReferencia('  DEPORTIVO ', REFERENCIAS), 'verano');
});
prueba('una referencia que no esta en el catalogo no tiene temporada', () => {
  assert.strictEqual(temporadaDeReferencia('SHORT MIXTO', REFERENCIAS), null);
});

grupo('El caso que se reporto: deportivo premium');
prueba('el precio sale de VERANO premium, no de «deportivo»', () => {
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' }, T);
  assert.strictEqual(r.precio, 2300000);
  assert.strictEqual(r.categoria, 'verano', 'y se dice de que temporada salio');
  assert.strictEqual(r.origen, ORIGEN_CATALOGO);
});

grupo('Manda el catalogo sobre el precio guardado en la paca');
prueba('con los dos distintos gana el de la tabla de Precios', () => {
  // deportivo/especial: catalogo 1.430.000, pacas 1.600.000. Antes ganaba el de
  // las pacas; ahora manda la decision vigente y no la foto del contenedor.
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'especial' }, T);
  assert.strictEqual(r.precio, 1430000);
  assert.strictEqual(r.origen, ORIGEN_CATALOGO);
});
prueba('y la cifra que NO se aplico viaja igual, para poder enseñarla', () => {
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'especial' }, T);
  assert.strictEqual(r.precioCatalogo, 1430000);
  assert.strictEqual(r.precioInventario, 1600000);
  assert.strictEqual(r.discrepancia, true, 'cambiar un precio en silencio es lo que no se puede hacer');
  assert.ok(/pacas/i.test(r.aviso), 'y se avisa de que hay otro precio guardado');
});
prueba('coincidiendo no hay discrepancia que avisar', () => {
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' }, T);
  assert.strictEqual(r.discrepancia, false);
  assert.strictEqual(r.aviso, null);
});

grupo('Una promocion gana a todo');
prueba('la promo vigente manda sobre el catalogo', () => {
  const conPromo = { ...T, promos: [
    { referencia: 'deportivo', calidad: 'premium', clasificacion: null, precio_promocional: '1990000' },
  ] };
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' }, conPromo);
  assert.strictEqual(r.precio, 1990000);
  assert.strictEqual(r.origen, ORIGEN_PROMOCION);
  assert.strictEqual(r.esPromocion, true);
});
prueba('una promo CON clasificacion gana a la general', () => {
  const conPromo = { ...T, promos: [
    { referencia: 'deportivo', calidad: 'premium', clasificacion: null, precio_promocional: '2000000' },
    { referencia: 'deportivo', calidad: 'premium', clasificacion: 'dama', precio_promocional: '1800000' },
  ] };
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium', clasificacion: 'dama' }, conPromo);
  assert.strictEqual(r.precio, 1800000, 'la especifica, aunque sea mas barata');
});
prueba('entre dos promos iguales gana la MAS ALTA', () => {
  // Quien escribio dos para el mismo producto no dejo dicho cual: la mas baja
  // regalaria margen sin que nadie lo decidiera.
  const conPromo = { ...T, promos: [
    { referencia: 'deportivo', calidad: 'premium', clasificacion: null, precio_promocional: '1800000' },
    { referencia: 'deportivo', calidad: 'premium', clasificacion: null, precio_promocional: '2100000' },
  ] };
  assert.strictEqual(precioDeVenta({ referencia: 'deportivo', calidad: 'premium' }, conPromo).precio, 2100000);
});

grupo('Una promocion solo manda si esta VIGENTE');
// Esto no se comprobaba. La Matriz pedia TODAS las promociones -el endpoint las
// devuelve todas si no se le pasa ?activas=true- y se aplicaba cualquiera con
// precio. En produccion hay una de «mixta verano / supreme» a 1.000.000 con
// activo=false, y son 39 pacas cuyo precio de catalogo es 1.750.000.
const HOY = '2026-11-25';
const promoDe = (extra) => ({ ...T, promos: [{
  referencia: 'deportivo', calidad: 'premium', clasificacion: null,
  precio_promocional: '1500000', activo: true,
  fecha_inicio: '2026-01-01', fecha_fin: '2099-12-31', ...extra,
}] });

prueba('vigente: se aplica', () => {
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' }, promoDe({}), HOY);
  assert.strictEqual(r.precio, 1500000);
  assert.strictEqual(r.origen, ORIGEN_PROMOCION);
});
prueba('APAGADA (activo=false): NO se aplica, manda el catalogo', () => {
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' },
    promoDe({ activo: false }), HOY);
  assert.strictEqual(r.precio, 2300000, 'el de verano premium');
  assert.strictEqual(r.origen, ORIGEN_CATALOGO);
});
prueba('VENCIDA ayer: no se aplica', () => {
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' },
    promoDe({ fecha_fin: '2026-11-24' }), HOY);
  assert.strictEqual(r.origen, ORIGEN_CATALOGO);
});
prueba('que vence HOY: todavia se aplica', () => {
  // El ultimo dia cuenta entero: una promo que vence hoy vale hoy.
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' },
    promoDe({ fecha_fin: HOY }), HOY);
  assert.strictEqual(r.origen, ORIGEN_PROMOCION);
});
prueba('que empieza MANANA: todavia no se aplica', () => {
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' },
    promoDe({ fecha_inicio: '2026-11-26' }), HOY);
  assert.strictEqual(r.origen, ORIGEN_CATALOGO);
});
prueba('que empieza HOY: ya se aplica', () => {
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' },
    promoDe({ fecha_inicio: HOY }), HOY);
  assert.strictEqual(r.origen, ORIGEN_PROMOCION);
});
prueba('sin fechas ni estado se aplica: viene de /activa, que ya filtro', () => {
  // El servidor devuelve ahi solo las vigentes, asi que una promo sin esos
  // campos no puede quedar fuera por no traerlos.
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' },
    { ...T, promos: [{ referencia: 'deportivo', calidad: 'premium', clasificacion: null,
      precio_promocional: '1500000' }] }, HOY);
  assert.strictEqual(r.origen, ORIGEN_PROMOCION);
});
prueba('una fecha con hora (timestamp) tambien se entiende', () => {
  const r = precioDeVenta({ referencia: 'deportivo', calidad: 'premium' },
    promoDe({ fecha_fin: '2026-11-24T23:59:59.000Z' }), HOY);
  assert.strictEqual(r.origen, ORIGEN_CATALOGO, 'se compara solo el dia');
});

grupo('El inventario es el respaldo, no la autoridad');
prueba('sin fila en el catalogo se usa el de las pacas, y se dice', () => {
  // mixta verano / supreme existe en el catalogo (1.750.000). Quitemoslo.
  const sinEsa = { ...T, preestablecidos: PREESTABLECIDOS.filter(
    (p) => !(p.categoria === 'verano' && p.calidad === 'supreme')) };
  const r = precioDeVenta({ referencia: 'mixta verano', calidad: 'supreme' }, sinEsa);
  assert.strictEqual(r.precio, 1900000);
  assert.strictEqual(r.origen, ORIGEN_INVENTARIO);
  assert.ok(/Sin precio en la tabla de Precios/.test(r.aviso));
});
prueba('una referencia sin temporada cae al inventario con su propio aviso', () => {
  const r = precioDeVenta({ referencia: 'SHORT MIXTO', calidad: 'supreme' }, T);
  assert.strictEqual(r.precio, 1900000);
  assert.strictEqual(r.origen, ORIGEN_INVENTARIO);
  assert.ok(/no esta en el catalogo|no está en el catálogo/.test(r.aviso),
    'el motivo no es el mismo que «falta el precio de esa temporada»');
});

grupo('Lo que no se sabe no se inventa');
prueba('sin nada devuelve null y el motivo, nunca un cero', () => {
  const r = precioDeVenta({ referencia: 'polar', calidad: 'diamante' }, T);
  assert.strictEqual(r.precio, null, 'un 0 en un campo de precio es una cotizacion gratis');
  assert.ok(/invierno/.test(r.aviso), 'y se dice que temporada se busco');
});
prueba('sin referencia o sin calidad no hay nada que resolver', () => {
  for (const q of [{}, { referencia: 'deportivo' }, { calidad: 'premium' }]) {
    assert.strictEqual(precioDeVenta(q, T).precio, null);
  }
});
prueba('aguanta tablas vacias y basura sin reventar', () => {
  assert.strictEqual(precioDeVenta({ referencia: 'x', calidad: 'y' }, {}).precio, null);
  assert.strictEqual(precioDeVenta(undefined, undefined).precio, null);
  const sucio = { promos: null, preestablecidos: [{ categoria: 'verano', calidad: 'premium', precio: 'x' }],
    listaPrecios: null, referencias: REFERENCIAS };
  assert.strictEqual(precioDeVenta({ referencia: 'deportivo', calidad: 'premium' }, sucio).precio, null,
    'un precio que no es un numero no se usa');
});

console.log(malos
  ? `\n✗ ${malos} comprobación(es) fallida(s)`
  : '\n✓ El precio sale de la temporada de la referencia, y manda el catálogo');
process.exit(malos ? 1 : 0);
