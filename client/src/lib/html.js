/**
 * Escapa texto antes de meterlo en una plantilla HTML.
 *
 * Las cotizaciones, los estados de cuenta y las guías de despacho se arman
 * concatenando HTML y se imprimen con html2pdf o en una ventana nueva. Ahí se
 * interpolan datos que escribe la gente: nombre del cliente, dirección, notas.
 * Un nombre con "<" parte el documento y lo deja ilegible; y como la ventana
 * de impresión hereda el mismo origen que la aplicación, un texto con una
 * etiqueta <script> se ejecutaría con la sesión abierta y el token a mano.
 *
 * Regla: todo valor que venga de la base de datos o de un formulario pasa por
 * aquí antes de entrar en la plantilla. Los números y los importes ya
 * formateados no hacen daño, pero escaparlos tampoco cuesta nada.
 */
export function escapeHtml(valor) {
  if (valor === null || valor === undefined) return '';
  return String(valor)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Etiqueta de plantilla: escapa TODO lo interpolado.
 *
 *   html`<td>${cliente.nombre}</td>`
 *
 * Así no hay que acordarse de llamar a escapeHtml en cada hueco, que es donde
 * se cuelan los olvidos. Si algún trozo ya es HTML de confianza (una fila
 * generada por nosotros), pásalo con crudo().
 */
export function html(trozos, ...valores) {
  return trozos.reduce((acc, trozo, i) => {
    if (i === 0) return trozo;
    const v = valores[i - 1];
    const texto = v && v.__htmlCrudo ? v.valor : escapeHtml(v);
    return acc + texto + trozo;
  }, '');
}

/** Marca una cadena como HTML ya seguro, para que html`` no la vuelva a escapar. */
export function crudo(valor) {
  return { __htmlCrudo: true, valor: String(valor ?? '') };
}
