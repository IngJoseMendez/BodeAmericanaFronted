import { escapeHtml, html, crudo } from '../src/lib/html.js';
const casos = [
  ['nombre con etiqueta', '<script>alert(1)</script>', '&lt;script&gt;alert(1)&lt;/script&gt;'],
  ['comillas',            'Almacén "La 14"',           'Almacén &quot;La 14&quot;'],
  ['apóstrofo',           "O'Brien",                   'O&#39;Brien'],
  ['ampersand primero',   'A & B <c>',                 'A &amp; B &lt;c&gt;'],
  ['nulo',                null,                        ''],
  ['cero',                0,                           '0'],
];
let malos = 0;
for (const [n, entrada, esperado] of casos) {
  const real = escapeHtml(entrada);
  const bien = real === esperado;
  if (!bien) malos++;
  console.log(`  ${bien ? '✓' : '✗'} ${n.padEnd(20)} ${JSON.stringify(real)}`);
}
const plantilla = html`<td>${'<b>x</b>'}</td><td>${crudo('<b>ok</b>')}</td>`;
const espPlantilla = '<td>&lt;b&gt;x&lt;/b&gt;</td><td><b>ok</b></td>';
const bienP = plantilla === espPlantilla;
if (!bienP) malos++;
console.log(`  ${bienP ? '✓' : '✗'} plantilla html\`\`      ${JSON.stringify(plantilla)}`);
console.log(malos ? `\n${malos} fallo(s)` : '\nEscapado de HTML: correcto');
process.exit(malos ? 1 : 0);
