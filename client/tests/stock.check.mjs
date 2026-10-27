// Comprueba el agrupado de existencias que usan Ventas y Despachos.
//
// Lo que se vigila aquí es lo que cuesta plata: que una referencia repartida en
// dos contenedores se sume en vez de ofrecerse a medias, que la promoción gane
// sobre el precio escrito en la paca, y que un grupo con precios mezclados
// salga SIN precio en vez de con uno de los dos.
import assert from 'node:assert/strict';
import { agruparStock, agruparPacas, preciosDeHoy, claveStock,
  filtrarGrupos, facetasDeGrupos, DIMENSIONES_PRODUCTO } from '../src/lib/stock.js';

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

// ── filtrarGrupos y facetasDeGrupos ──────────────────────────────
//
// Lo que se vigila: que las listas de los desplegables de la venta no tengan
// callejones sin salida. Si una opcion ofrecida devuelve cero productos, la
// pantalla se queda vacia y no hay nada que explique por que.
{
  const g = [
    { categoria: 'verano',   clasificacion: 'mujer', referencia: 'blusa',     calidad: 'supreme',  disponibles: 3 },
    { categoria: 'verano',   clasificacion: 'mixta', referencia: 'deportivo', calidad: 'supreme',  disponibles: 2 },
    { categoria: 'invierno', clasificacion: 'mixta', referencia: 'buzo',      calidad: 'diamante', disponibles: 5 },
    { categoria: 'invierno', clasificacion: 'mixta', referencia: 'buzo',      calidad: 'supreme',  disponibles: 1 },
  ];

  assert.deepEqual(DIMENSIONES_PRODUCTO, ['categoria', 'clasificacion', 'referencia', 'calidad'],
    'son los cuatro campos de la paca; contenedor y proveedor NO, porque una '
    + 'referencia esta repartida en varios contenedores y la venta toma las primeras por id');

  // Filtrar cruza los campos con AND, y no distingue mayusculas.
  assert.equal(filtrarGrupos(g, { categoria: 'invierno', calidad: 'supreme' }).length, 1);
  assert.equal(filtrarGrupos(g, { categoria: 'INVIERNO' }).length, 2, 'las mayusculas no cuentan');
  assert.equal(filtrarGrupos(g, {}).length, 4, 'sin filtros no quita nada');

  // Las cuentas son de UNIDADES, no de grupos: «buzo» son dos grupos y seis pacas.
  const todo = facetasDeGrupos(g, {});
  assert.deepEqual(todo.referencia.find((o) => o.valor === 'buzo'), { valor: 'buzo', unidades: 6 });

  // Cada dimension se cuenta SIN su propio filtro.
  const conInvierno = facetasDeGrupos(g, { categoria: 'invierno' });
  assert.equal(conInvierno.categoria.length, 2,
    'la lista de temporadas se cuenta sin el filtro de temporada, o no se podria cambiar');
  assert.deepEqual(conInvierno.referencia.map((o) => o.valor), ['buzo'],
    'las referencias si se reducen a las que tienen algo de invierno');
  assert.deepEqual(conInvierno.calidad, [
    { valor: 'diamante', unidades: 5 },
    { valor: 'supreme', unidades: 1 },
  ], 'la calidad cuenta solo lo de invierno');

  // NINGUNA opcion ofrecida puede devolver cero.
  for (const [dim, opciones] of Object.entries(conInvierno)) {
    for (const o of opciones) {
      assert.ok(o.unidades > 0, `${dim}=${o.valor} se ofrece con cero unidades`);
      const quedan = filtrarGrupos(g, { categoria: 'invierno', [dim]: o.valor });
      assert.ok(quedan.length > 0, `elegir ${dim}=${o.valor} deja la pantalla vacia`);
    }
  }

  // Un producto sin ese campo escrito no se ofrece como opcion vacia.
  const conHueco = facetasDeGrupos(
    [{ categoria: '', clasificacion: 'mixta', referencia: 'x', calidad: 'a', disponibles: 1 }], {});
  assert.deepEqual(conHueco.categoria, [], 'un campo en blanco no es una opcion');
}

console.log('stock.check: todo bien');
