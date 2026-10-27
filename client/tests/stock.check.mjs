// Comprueba el agrupado de existencias que usan Ventas y Despachos.
//
// Lo que se vigila aquí es lo que cuesta plata: que una referencia repartida en
// dos contenedores se sume en vez de ofrecerse a medias, que la promoción gane
// sobre el precio escrito en la paca, y que un grupo con precios mezclados
// salga SIN precio en vez de con uno de los dos.
import assert from 'node:assert/strict';
import { agruparStock, agruparPacas, preciosDeHoy, claveStock } from '../src/lib/stock.js';

// ── agruparStock ──────────────────────────────────────────────────
{
  const filas = [
    { referencia: 'MIXTA VERANO', calidad: 'A', disponibles: '4', precio_unitario: '1200000' },
    { referencia: 'MIXTA VERANO', calidad: 'A', disponibles: '3', precio_unitario: '1200000' }, // otro contenedor
    { referencia: 'MIXTA VERANO', calidad: 'B', disponibles: '2', precio_unitario: '900000' },
    { referencia: 'BLUSA DAMA',   calidad: '',  disponibles: '1', precio_unitario: '800000',
      tiene_promocion: true, precio_promocion: '650000' },
    { referencia: 'AGOTADA',      calidad: 'A', disponibles: '0', precio_unitario: '500000' },
  ];
  const g = agruparStock(filas);

  assert.equal(g.length, 3, 'la agotada no debe aparecer');
  assert.deepEqual(g.map((x) => x.referencia), ['BLUSA DAMA', 'MIXTA VERANO', 'MIXTA VERANO'],
    'orden alfabético por referencia');

  const verano = g.find((x) => x.referencia === 'MIXTA VERANO' && x.calidad === 'A');
  assert.equal(verano.disponibles, 7, 'las dos filas del mismo producto se suman');
  assert.equal(verano.precio, 1200000);

  const blusa = g.find((x) => x.referencia === 'BLUSA DAMA');
  assert.equal(blusa.precio, 650000, 'la promoción gana sobre el precio de lista');
}

// Precios distintos dentro del mismo grupo: no se escoge ninguno.
{
  const g = agruparStock([
    { referencia: 'SHORT', calidad: 'A', disponibles: '2', precio_unitario: '1000000' },
    { referencia: 'SHORT', calidad: 'A', disponibles: '2', precio_unitario: '1100000' },
  ]);
  assert.equal(g.length, 1);
  assert.equal(g[0].disponibles, 4);
  assert.equal(g[0].precio, null, 'precios mezclados => sin precio');
  assert.equal(g[0].mezclado, true);
}

// ── agruparPacas ──────────────────────────────────────────────────
{
  const pacas = [
    { id: 30, referencia: 'MIXTA VERANO', calidad: 'A', precio_venta: '1200000' },
    { id: 10, referencia: 'MIXTA VERANO', calidad: 'A', precio_venta: '1200000' },
    { id: 20, referencia: 'MIXTA VERANO', calidad: 'A', precio_venta: '1200000' },
    { id: 40, referencia: 'BLUSA DAMA',   calidad: '',  precio_venta: '800000' },
  ];
  const g = agruparPacas(pacas);
  const verano = g.find((x) => x.referencia === 'MIXTA VERANO');
  assert.equal(verano.disponibles, 3);
  assert.deepEqual(verano.ids, [10, 20, 30], 'los ids salen ordenados: se vende lo que llegó antes');
  assert.equal(verano.precio, 1200000);

  // Con el precio de hoy, manda la promoción.
  const hoy = preciosDeHoy([
    { referencia: 'MIXTA VERANO', calidad: 'A', disponibles: '3',
      precio_unitario: '1200000', tiene_promocion: true, precio_promocion: '999000' },
  ]);
  assert.equal(hoy.get(claveStock('mixta verano', 'a')), 999000);
  const g2 = agruparPacas(pacas, hoy);
  assert.equal(g2.find((x) => x.referencia === 'MIXTA VERANO').precio, 999000,
    'el precio de hoy gana sobre el escrito en la paca');
  assert.equal(g2.find((x) => x.referencia === 'BLUSA DAMA').precio, 800000,
    'sin promoción, el de la paca');
}

// Pacas del mismo producto con precios distintos y sin promoción: en blanco.
{
  const g = agruparPacas([
    { id: 1, referencia: 'SHORT', calidad: 'A', precio_venta: '1000000' },
    { id: 2, referencia: 'SHORT', calidad: 'A', precio_venta: '1100000' },
  ]);
  assert.equal(g[0].precio, null);
  assert.equal(g[0].mezclado, true);
  assert.equal(g[0].disponibles, 2);
}

// Calidad vacía y calidad en blanco son el MISMO producto; mayúsculas también.
{
  const g = agruparPacas([
    { id: 1, referencia: 'Short', calidad: 'A',  precio_venta: '500000' },
    { id: 2, referencia: 'SHORT', calidad: ' a ', precio_venta: '500000' },
  ]);
  assert.equal(g.length, 1, 'no se duplica por mayúsculas ni espacios');
  assert.equal(g[0].disponibles, 2);
}

console.log('stock.check: todo bien');
