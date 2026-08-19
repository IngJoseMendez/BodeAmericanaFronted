import ExcelJS from 'exceljs';
import { hojaUtilidadContenedor } from '../src/lib/entregables.js';

// Inversión 15.000.000 · utilidad 15.000/paca × 300 pacas = 4.500.000 · tasa 4.100
const cont = { numero: 'C-1', tasa_conversion: 4100, total_pacas: 300,
  utilidad_unitaria: 15000, costo_total: 15000000 };
const inv = [
  { inversionista_nombre: 'Socio A', aporte_cop: 9000000 },  // 60%
  { inversionista_nombre: 'Socio B', aporte_cop: 6000000 },  // 40%
];

const wb = new ExcelJS.Workbook();
const ws = hojaUtilidadContenedor(wb, cont, 'UTIL', inv);

const filas = [];
ws.eachRow((r) => filas.push(r.values.map(v => (typeof v === 'object' && v?.result != null) ? v.result : v)));

const busca = (nombre) => filas.find(f => f.includes(nombre));
const a = busca('Socio A'), b = busca('Socio B'), t = busca('TOTAL');

const esperado = [
  ['Socio A %',        a?.[3], 0.60],
  ['Socio A util CO$', a?.[4], 2700000],
  ['Socio A util US$', a?.[5], 2700000 / 4100],
  ['Socio B %',        b?.[3], 0.40],
  ['Socio B util CO$', b?.[4], 1800000],
  ['TOTAL %',          t?.[3], 1.00],
  ['TOTAL util CO$',   t?.[4], 4500000],
];

let malos = 0;
for (const [etiqueta, real, esp] of esperado) {
  const bien = typeof real === 'number' && Math.abs(real - esp) < 0.01;
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta.padEnd(18)} esperado ${esp}  obtenido ${real}`);
}
console.log(malos ? `\n${malos} valor(es) incorrecto(s)` : '\nReparto entre inversionistas: cuentas correctas');
process.exit(malos ? 1 : 0);
