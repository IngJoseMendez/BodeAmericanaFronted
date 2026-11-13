// UN SALDO A FAVOR NO SUMA Y NO RESTA.
//
// Es la regla entera de lib/cartera.js. Cuando un cliente abona mas de lo que
// debe su saldo queda en negativo, y mientras esa cifra entraba en la suma le
// restaba al total de arriba: un cliente con 300.000 a favor le bajaba 300.000
// a la cartera, como si otro hubiera pagado esa plata. Nadie perdia dinero,
// pero la cifra con la que se sale a cobrar decia menos de lo que hay que
// cobrar, y la diferencia no se veia en ninguna parte.
//
// Se prueban las dos puntas: la cuenta pura, y el TOTAL de la hoja de Excel que
// se imprime para cobrar —que es donde el error se vuelve una decision de
// plata—.
import assert from 'assert';
import ExcelJS from 'exceljs';
import { totalesDeCartera, montonesDeCartera, esAFavor, saldoDeFila } from '../src/lib/cartera.js';
import { hojaCarteraInterna } from '../src/lib/entregables.js';

let malos = 0;
const prueba = async (nombre, fn) => {
  try { await fn(); console.log('  ✓ ' + nombre); }
  catch (e) { malos++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
};

const fila = (nombre, vendido, abonado, extra = {}) => ({
  nombre,
  total_vendido: vendido,
  total_abonado: abonado,
  saldo_pendiente: vendido - abonado,
  ...extra,
});

const MARTA = fila('Marta', 1000000, 0);              // debe 1.000.000
const SONIA = fila('Sonia', 500000, 800000);          // 300.000 a favor
const RUBEN = fila('Ruben', 2260000, 0, { cartera_inactiva: true, cartera_inactiva_motivo: 'no contesta' });
const AL_DIA = fila('Al dia', 400000, 400000);        // en cero

console.log('\nLos tres montones de la cartera');

await prueba('un saldo a favor NO resta de lo por cobrar', () => {
  assert.strictEqual(totalesDeCartera([MARTA]).porCobrar, 1000000);
  assert.strictEqual(totalesDeCartera([MARTA, SONIA]).porCobrar, 1000000,
    'el favor de Sonia le bajo la cartera a Marta');
});

await prueba('el favor sale en su propia cifra, y en positivo', () => {
  const t = totalesDeCartera([MARTA, SONIA]);
  assert.strictEqual(t.aFavor, 300000);
  assert.strictEqual(t.cuentasAFavor, 1);
});

await prueba('tampoco suma: ni el neto ni la suma viven en ningun campo', () => {
  const t = totalesDeCartera([MARTA, SONIA]);
  assert.ok(![700000, 1300000].includes(t.porCobrar));
});

await prueba('una cuenta en cero no es ni deuda ni favor', () => {
  const t = totalesDeCartera([AL_DIA]);
  assert.strictEqual(t.porCobrar, 0);
  assert.strictEqual(t.cuentasAFavor, 0, 'no puede salir una tarjeta de «$0 a favor»');
});

await prueba('un centavo colgando no inventa un saldo a favor', () => {
  assert.strictEqual(totalesDeCartera([fila('Casi cero', 400000, 400000.4)]).cuentasAFavor, 0);
  assert.strictEqual(esAFavor(-0.4), false);
});

await prueba('una cartera inactiva con saldo a favor es favor, no perdida', () => {
  const t = totalesDeCartera([fila('Inactivo', 500000, 900000, { cartera_inactiva: true })]);
  assert.strictEqual(t.perdido, 0, 'no se da por perdida una plata que se debe');
  assert.strictEqual(t.aFavor, 400000);
});

await prueba('lo dado por perdido sigue aparte y en positivo', () => {
  const t = totalesDeCartera([MARTA, RUBEN]);
  assert.strictEqual(t.porCobrar, 1000000);
  assert.strictEqual(t.perdido, 2260000);
});

await prueba('sin filas devuelve ceros, no undefined ni NaN', () => {
  for (const vacio of [[], null, undefined]) {
    assert.deepStrictEqual(totalesDeCartera(vacio), {
      porCobrar: 0, perdido: 0, aFavor: 0, cuentasPerdidas: 0, cuentasAFavor: 0,
    });
  }
});

await prueba('aguanta basura sin devolver NaN', () => {
  const t = totalesDeCartera([{ saldo_pendiente: 'x' }, { total_vendido: null }]);
  assert.ok(Number.isFinite(t.porCobrar) && Number.isFinite(t.aFavor));
});

await prueba('la deuda vieja entra en el saldo, como en toda la aplicacion', () => {
  assert.strictEqual(saldoDeFila({ saldo_inicial: 2000000, total_vendido: 500000, total_abonado: 1000000 }), 1500000);
});

await prueba('los montones reparten cada cliente en uno solo', () => {
  const m = montonesDeCartera([MARTA, SONIA, RUBEN, AL_DIA]);
  assert.deepStrictEqual(m.activas.map((c) => c.nombre), ['Marta']);
  assert.deepStrictEqual(m.perdidas.map((c) => c.nombre), ['Ruben']);
  assert.deepStrictEqual(m.aFavor.map((c) => c.nombre), ['Sonia']);
});

console.log('\nEl TOTAL de la hoja que se imprime para cobrar');

// Lee la hoja como un mapa de textos y numeros, para poder preguntarle por una
// fila por su rotulo sin depender del numero de fila.
const leer = (ws) => {
  const filas = [];
  ws.eachRow((r) => filas.push([1, 2, 3, 4, 5].map((i) => r.getCell(i).value)));
  return filas;
};
const buscar = (filas, rotulo) => filas.find((f) => String(f[0] || '').startsWith(rotulo));

await prueba('el TOTAL no incluye los saldos a favor', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = hojaCarteraInterna(wb, [MARTA, SONIA, RUBEN, AL_DIA]);
  const filas = leer(ws);
  const total = buscar(filas, 'TOTAL');
  assert.ok(total, 'la hoja tiene que llevar su fila de TOTAL');
  assert.strictEqual(total[3], 1000000,
    'el TOTAL se come el favor de Sonia: deberia ser solo la deuda de Marta');
});

await prueba('los favores salen abajo, en su propio bloque y en positivo', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = hojaCarteraInterna(wb, [MARTA, SONIA, RUBEN, AL_DIA]);
  const filas = leer(ws);
  const aviso = filas.find((f) => String(f[0] || '').startsWith('SALDOS A FAVOR'));
  assert.ok(aviso, 'tiene que decir que estan ahi y que no restan');
  assert.ok(/NO restan/.test(String(aviso[0])));
  const total = buscar(filas, 'TOTAL A FAVOR');
  assert.ok(total, 'su propio subtotal, debajo del TOTAL ya cerrado');
  assert.strictEqual(total[3], 300000, 'en positivo, sin signo que interpretar');
});

await prueba('sin favores la hoja no cambia: no aparece el bloque', async () => {
  const wb = new ExcelJS.Workbook();
  const ws = hojaCarteraInterna(wb, [MARTA, RUBEN]);
  const filas = leer(ws);
  assert.ok(!filas.some((f) => String(f[0] || '').startsWith('SALDOS A FAVOR')),
    'un bloque vacio es un adorno que nadie lee');
  assert.strictEqual(buscar(filas, 'TOTAL')[3], 1000000);
});

await prueba('la hoja con favores se puede escribir y volver a leer', async () => {
  // Los errores de ExcelJS —rangos mal fusionados, celdas fuera de rango— solo
  // aparecen al serializar el libro, no al construirlo.
  const wb = new ExcelJS.Workbook();
  hojaCarteraInterna(wb, [MARTA, SONIA, RUBEN, AL_DIA]);
  const buf = await wb.xlsx.writeBuffer();
  const leido = new ExcelJS.Workbook();
  await leido.xlsx.load(buf);
  assert.ok(leido.getWorksheet('CARTERA(INTERNA)'), 'la hoja tiene que sobrevivir el viaje');
});

console.log(`\n${malos === 0 ? 'Un saldo a favor no mueve la cartera' : malos + ' fallo(s)'}\n`);
process.exit(malos === 0 ? 0 : 1);
