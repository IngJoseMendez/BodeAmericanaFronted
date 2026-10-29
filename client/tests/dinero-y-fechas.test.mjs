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

// ── EL FORMATEADOR EN CACHÉ DICE EXACTAMENTE LO MISMO ─────────────
//
// formatFecha y formatFechaCorta pasaron de construir un Intl nuevo en cada
// llamada a reusar una instancia: 66 veces más rápido sobre las 2.215 filas de
// la ficha de cartera más grande, y donde de verdad se nota es al buscar, que
// formatea una fecha por movimiento en cada tecla.
//
// Un cambio así NO PUEDE cambiar ni un carácter de lo que se lee: si cambiara,
// las fechas de los abonos de una clienta se verían distintas de un día para
// otro y nadie sabría por qué. Se comparan las dos formas sobre nueve años.
// ── EL DINERO, IGUAL: MISMO TEXTO, 51 VECES MÁS RÁPIDO ────────────
//
// Mismo cambio que en las fechas y pesa más: una fila de tabla trae una fecha y
// tres o cuatro cifras, y formatCOP es de lo más llamado del proyecto. Medido
// con 5.000 celdas: 103,4 ms contra 2,0 ms.
//
// Aquí el riesgo de equivocarse es el bug más caro que ha tenido este proyecto
// —leer «45.000» como 45, porque en Colombia el punto separa MILES— así que se
// compara cifra por cifra contra la forma de antes, incluidos los negativos,
// los decimales y el cero.
grupo('el formateador de dinero no cambia ni un carácter');
{
  let distintas = 0;
  let probadas = 0;
  const casos = [0, 1, 999, 1000, 45000, 1234567, 90000000, 307449601,
                 -1500, -1234567, 0.5, 1234.56, 0.004];
  for (const n of casos) {
    for (const dec of [0, 2]) {
      const viejoCOP = '$' + n.toLocaleString('es-CO',
        { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (formatCOP(n, { decimales: dec }) !== viejoCOP) distintas++;
      const viejoNum = n.toLocaleString('es-CO',
        { minimumFractionDigits: dec, maximumFractionDigits: dec });
      if (formatNumero(n, { decimales: dec }) !== viejoNum) distintas++;
      probadas += 2;
    }
    // La moneda con símbolo, por las dos ramas: una válida y una inventada.
    for (const cod of ['COP', 'USD', 'EUR']) {
      const dec = cod === 'COP' ? 0 : 2;
      const viejo = new Intl.NumberFormat('es-CO', { style: 'currency', currency: cod,
        minimumFractionDigits: dec, maximumFractionDigits: dec }).format(n);
      if (formatMoneda(n, cod) !== viejo) distintas++;
      probadas++;
    }
  }
  comprobar(`${probadas} cifras dan el mismo texto`, distintas, 0);
  comprobar('"45.000" sigue siendo cuarenta y cinco mil', parseMonto(formatNumero(45000)), 45000);

  // ── DONDE ESTA DE VERDAD EL LIMITE DE Intl ──────────────────────
  //
  // Importa saberlo porque la pantalla deja escribir cualquier cosa en «Otra…».
  // Intl NO lanza con tres letras ASCII aunque la moneda no exista: usa el
  // codigo como simbolo. Lanza con todo lo demas —'pesos', 'US$', 'XY'—, y es
  // ahi donde entra el respaldo.
  // Ojo con el espacio: Intl separa el simbolo del numero con un espacio DURO
  // (U+00A0), no con uno normal. Comparar contra un literal escrito a mano
  // falla por un caracter invisible, asi que se compara contra Intl mismo.
  comprobar('tres letras inventadas: Intl las acepta como simbolo',
    formatMoneda(1234, 'XQZ'),
    new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'XQZ',
      minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(1234));
  // El respaldo NO fuerza decimales: usa solo maximumFractionDigits, que es
  // exactamente lo que hacia el codigo de antes. 1234 sale «1.234», no
  // «1.234,00».
  const escrita = formatMoneda(1234, 'pesos');
  comprobar('lo que no son tres letras cae en el respaldo', escrita, '1.234 PESOS');
  comprobar('y la segunda vez da lo mismo: el fallo se recuerda y no se reintenta',
    formatMoneda(1234, 'pesos'), escrita);
}

grupo('el formateador en caché no cambia ni un carácter');
{
  const OPC_L = { day: '2-digit', month: 'short', year: 'numeric' };
  const OPC_C = { day: '2-digit', month: '2-digit', year: 'numeric' };
  let distintas = 0;
  let probadas = 0;
  for (let a = 2019; a <= 2027; a++) {
    for (let m = 1; m <= 12; m++) {
      for (const dia of [1, 9, 15, 28]) {
        const s = `${a}-${String(m).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
        const d = aFecha(s);
        if (formatFecha(s) !== d.toLocaleDateString('es-CO', OPC_L)) distintas++;
        if (formatFechaCorta(s) !== d.toLocaleDateString('es-CO', OPC_C)) distintas++;
        probadas++;
      }
    }
  }
  comprobar(`${probadas} fechas dan el mismo texto`, distintas, 0);
  // La rama de opciones a medida, que entra por el Map con otra clave.
  comprobar('con opciones a medida, también',
    formatFecha('2026-03-05', { month: 'long' }),
    aFecha('2026-03-05').toLocaleDateString('es-CO', { ...OPC_L, month: 'long' }));
  // Y la caché no se come el caso de «no hay fecha».
  comprobar('sin fecha sigue siendo el guion largo', formatFechaCorta(''), '—');
}

console.log(malos ? `\n${malos} PRUEBA(S) FALLIDA(S)` : '\nTodas las pruebas de dinero y fechas pasaron');
process.exit(malos ? 1 : 0);
