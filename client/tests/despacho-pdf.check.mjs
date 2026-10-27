// Genera el PDF del despacho con datos de verdad y comprueba que sale.
//
// No comprueba que sea bonito -eso se mira- pero sí lo que puede romperse sin
// avisar: que el documento se genere, que lleve los bloques que debe, y que NO
// lleve costos. Un PDF que revienta al generarse deja a la bodega sin papel
// justo cuando hay que despachar, y un PDF con costos es el papel que no debe
// salir de la oficina.
import assert from 'node:assert/strict';
import { construirPDFDespacho } from '../src/lib/despachoPdf.js';

// Se comprueba `construirPDFDespacho`, que devuelve el documento, y no
// `exportarPDFDespacho`, que lo descarga: `doc.save()` en jsPDF es una
// propiedad de la instancia y solo tiene sentido en un navegador.
let capturado = null;
const generar = (despachos, separadas, meta) => {
  const doc = construirPDFDespacho(despachos, separadas, meta);
  const crudo = doc.output('arraybuffer');
  capturado = {
    bytes: crudo.byteLength,
    // Sin compresion, jsPDF escribe el texto en claro dentro del contenido.
    texto: Buffer.from(crudo).toString('latin1'),
    hojas: doc.internal.getNumberOfPages(),
  };
  return capturado;
};

const DESPACHOS = [
  {
    nombre: 'MARTA BOTERO', ciudad: 'Neiva', direccion: 'Calle 5 # 3-20',
    celular: '3001234567', tipo_transporte: 'domicilio', transportadora: 'envia', fletes: 'contraentrega',
    grupos: [
      { referencia: 'MIXTA VERANO', calidad: 'premium', cantidad: 3, precio: 2100000 },
      { referencia: 'BLUSA DAMA', calidad: 'especial', cantidad: 2, precio: 1600000 },
    ],
  },
  {
    nombre: 'SONIA PORTILLA', ciudad: 'Pitalito', direccion: 'Carrera 4 # 10-11',
    celular: '3109876543', tipo_transporte: 'recogida', transportadora: 'camion', fletes: 'contado',
    grupos: [
      { referencia: 'BLUSA DAMA', calidad: 'premium', cantidad: 4, precio: 1750000 },
      // Sin precio: el valor del cliente se suma con lo que hay y no se inventa.
      { referencia: 'CHAQUETA GRUESA', calidad: '', cantidad: 1, precio: null },
    ],
  },
];

const SEPARADAS = [{
  nombre: 'GILMA POLANIA', ciudad: 'Garzón', direccion: '', celular: '',
  grupos: [{ referencia: 'JEANS MUJER', calidad: 'supreme', cantidad: 6 }],
}];

let malos = 0;
const prueba = (nombre, fn) => {
  try { fn(); console.log('  ✓ ' + nombre); }
  catch (e) { malos++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
};

console.log('\nPDF del despacho general');

prueba('se genera con separadas y sin ellas', () => {
  for (const sep of [SEPARADAS, []]) {
        generar(DESPACHOS, sep, { titulo: 'DESPACHO(GENERAL)', fecha: '2026-10-27' });
    assert.ok(capturado, 'no llamó a save()');
    assert.ok(capturado.bytes > 2000, `el PDF salió de ${capturado.bytes} bytes, sospechoso`);
  }
});

prueba('las separadas van en su propia hoja', () => {
    generar(DESPACHOS, [], { fecha: '2026-10-27' });
  const sinSeparadas = capturado.hojas;
    generar(DESPACHOS, SEPARADAS, { fecha: '2026-10-27' });
  assert.ok(capturado.hojas > sinSeparadas,
    'lo que se aparta tiene que ir en hoja aparte: no sale hoy y se confunde con lo que sí');
});

prueba('sin nada que despachar tampoco revienta', () => {
    generar([], [], { titulo: 'DESPACHO(GENERAL)', fecha: '2026-10-27' });
  assert.ok(capturado, 'no llamó a save() con la lista vacía');
});

prueba('lleva los dos bloques y sus totales', () => {
    generar(DESPACHOS, SEPARADAS, { fecha: '2026-10-27' });
  for (const frase of ['TOTAL A RECOGER', 'TOTAL A SEPARAR', 'PARA EMPACAR Y ROTULAR', 'PARA QUI']) {
    assert.ok(capturado.texto.includes(frase), `falta «${frase}» en el PDF`);
  }
});

prueba('el COSTO no sale en el papel de bodega', () => {
  // Un papel de bodega con costos es justo lo que la separación entre «bodega»
  // e «internos» existe para evitar, y para recoger mercancía no sirve de nada.
  // El valor por cliente sí va: es lo que se cobra contra entrega.
    generar(DESPACHOS, [], { fecha: '2026-10-27' });
  assert.ok(!capturado.texto.includes('COSTO'), 'apareció una columna COSTO');
  assert.ok(capturado.texto.includes('VALOR'), 'falta la columna VALOR, que sí debe estar');
});

prueba('un cliente sin precio en una línea no saca un cero', () => {
  // Sonia lleva una línea sin precio. Su valor se suma con lo que hay; lo que
  // no puede salir es «$0», que se lee como «no se le cobra nada».
    generar([DESPACHOS[1]], [], { fecha: '2026-10-27' });
  assert.ok(!/\$0[^0-9]/.test(capturado.texto), 'salió un $0 en el valor del cliente');
});

console.log(malos ? `\n${malos} PRUEBA(S) FALLIDA(S)\n` : '\nEl papel de bodega se genera, lleva sus bloques y no lleva costos\n');
process.exit(malos ? 1 : 0);
