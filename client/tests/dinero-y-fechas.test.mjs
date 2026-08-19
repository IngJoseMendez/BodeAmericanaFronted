// Pruebas de los dos helpers de los que cuelga todo el dinero y todas las
// fechas del sistema. El bug más caro del proyecto fue leer "45.000" como 45,
// porque en Colombia el punto separa MILES, no decimales.
import { parseMonto, formatCOP, formatMoneda, formatNumero } from '../src/lib/money.js';
import { hoy, aFecha, formatFecha, formatFechaCorta, aInputDate, entreFechas } from '../src/lib/fecha.js';

let malos = 0;
const grupo = (t) => console.log('\n── ' + t + ' ' + '─'.repeat(Math.max(0, 50 - t.length)));
function comprobar(etiqueta, real, esperado) {
  const bien = Object.is(real, esperado) ||
    (typeof real === 'number' && typeof esperado === 'number' && Math.abs(real - esperado) < 1e-9);
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${etiqueta.padEnd(38)} ${JSON.stringify(real)}${bien ? '' : '  ← esperaba ' + JSON.stringify(esperado)}`);
}

grupo('parseMonto — formato colombiano');
comprobar('"45.000" son cuarenta y cinco mil',   parseMonto('45.000'), 45000);
comprobar('"1.234.567"',                          parseMonto('1.234.567'), 1234567);
comprobar('"45.000,50" con decimales',            parseMonto('45.000,50'), 45000.5);
comprobar('"0,75" solo decimales',                parseMonto('0,75'), 0.75);
comprobar('"$ 98.000" con símbolo',               parseMonto('$ 98.000'), 98000);
comprobar('"98000" sin separadores',              parseMonto('98000'), 98000);
comprobar('negativo "-1.500"',                    parseMonto('-1.500'), -1500);

grupo('parseMonto — formato inglés (pegado de otra hoja)');
comprobar('"1,234,567.89"',                       parseMonto('1,234,567.89'), 1234567.89);
comprobar('"1,234.56"',                           parseMonto('1,234.56'), 1234.56);

grupo('parseMonto — casos límite');
comprobar('cadena vacía',                         parseMonto(''), 0);
comprobar('nulo',                                 parseMonto(null), 0);
comprobar('indefinido',                           parseMonto(undefined), 0);
comprobar('texto sin números',                    parseMonto('abc'), 0);
comprobar('número ya numérico',                   parseMonto(45000), 45000);
comprobar('"12.5" decimal ambiguo → 12,5',        parseMonto('12.5'), 12.5);
comprobar('"12.500" tres cifras → miles',         parseMonto('12.500'), 12500);

grupo('ida y vuelta: formatear y volver a leer');
for (const n of [0, 1, 999, 1000, 45000, 1234567, 98000.5]) {
  comprobar(`round-trip ${n}`, parseMonto(formatCOP(n, { decimales: n % 1 ? 2 : 0 })), n);
}

grupo('formatMoneda');
comprobar('USD lleva su símbolo',   /US\$|\$/.test(formatMoneda(1500, 'USD')), true);
comprobar('COP no queda vacío',     formatCOP(1500).length > 0, true);
comprobar('cero se muestra',        formatCOP(0).includes('0'), true);
comprobar('formatNumero mil',       formatNumero(1000), '1.000');

grupo('fechas — sin desfase de zona horaria');
comprobar('hoy() tiene formato ISO', /^\d{4}-\d{2}-\d{2}$/.test(hoy()), true);
comprobar('hoy() coincide con el reloj local',
  hoy(), [new Date().getFullYear(),
          String(new Date().getMonth() + 1).padStart(2, '0'),
          String(new Date().getDate()).padStart(2, '0')].join('-'));

// El caso que corría las fechas un día: una fecha de solo día leída como UTC.
comprobar('aFecha("2026-08-11") mantiene el día 11', aFecha('2026-08-11').getDate(), 11);
comprobar('aFecha("2026-01-01") mantiene enero',     aFecha('2026-01-01').getMonth(), 0);
comprobar('aFecha("2026-12-31") mantiene el 31',     aFecha('2026-12-31').getDate(), 31);
comprobar('aInputDate no corre el día',              aInputDate('2026-08-11'), '2026-08-11');
comprobar('formatFechaCorta("2026-08-11")',          formatFechaCorta('2026-08-11'), '11/08/2026');
comprobar('formatFecha con nulo',                    formatFecha(null), '—');
comprobar('aFecha con basura',                       aFecha('no es fecha'), null);

grupo('vigencia de promociones (se apagaban un día antes)');
comprobar('el último día SÍ está vigente',  entreFechas('2026-08-25', '2026-08-20', '2026-08-25'), true);
comprobar('el primer día SÍ está vigente',  entreFechas('2026-08-20', '2026-08-20', '2026-08-25'), true);
comprobar('el día anterior NO',             entreFechas('2026-08-19', '2026-08-20', '2026-08-25'), false);
comprobar('el día siguiente NO',            entreFechas('2026-08-26', '2026-08-20', '2026-08-25'), false);
comprobar('sin fecha fin, abierto',         entreFechas('2027-01-01', '2026-08-20', null), true);

console.log(malos ? `\n${malos} PRUEBA(S) FALLIDA(S)` : '\nTodas las pruebas de dinero y fechas pasaron');
process.exit(malos ? 1 : 0);
