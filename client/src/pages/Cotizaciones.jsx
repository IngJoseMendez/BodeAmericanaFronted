import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Modal, Badge, useToast, useConfirm, RefLink } from '../components/common';
import { cotizacionesApi, clientesApi, pacasApi, preciosPromocionApi, preciosApi, cuentasApi, listaPreciosApi } from '../services/api';
import { useCatalog } from '../context/CatalogContext';
import { useAuth } from '../context/AuthContext';
import html2pdf from 'html2pdf.js';
import ExcelJS from 'exceljs';
import { FileText, Plus, Eye, Trash2, Download, Check, X, Clock, User, X as XIcon, Search, Package, AlertCircle, Info, ShoppingCart } from 'lucide-react';
import { parseMonto, formatCOP } from '../lib/money';
import { hoy } from '../lib/fecha';

// Los nombres de referencia, categoría y calidad vienen de tablas distintas y
// difieren en mayúsculas y acentos: se comparan normalizados.
const normTxt = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

const formatCurrency = formatCOP;

// El PDF se arma interpolando texto en una plantilla HTML. Ese texto lo teclean
// los usuarios (nombre del cliente, notas, referencias), así que si lleva
// etiquetas se cuela en el documento que html2pdf adjunta al DOM para
// renderizarlo, y ahí manejadores como el onerror de un <img> sí se ejecutan.
// Todo valor variable pasa por aquí antes de entrar a la plantilla.
const escapeHtml = (v) => String(v ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

function PriceInput({ value, onChange, placeholder = 'Precio', className = '' }) {
  const [focused, setFocused] = useState(false);
  const [raw, setRaw] = useState('');

  const handleFocus = () => {
    setRaw(value > 0 ? String(value) : '');
    setFocused(true);
  };

  const handleBlur = () => {
    setFocused(false);
    // El campo muestra el valor con Intl es-CO ("45.000"), donde el punto es
    // separador de MILES. El parseo anterior sólo quitaba comas, así que leía ese
    // punto como decimal y guardaba 45 en vez de 45.000.
    onChange(parseMonto(raw));
  };

  const handleChange = (e) => {
    const v = e.target.value.replace(/[^0-9.,]/g, '');
    setRaw(v);
  };

  const displayValue = focused
    ? raw
    : value > 0
      ? new Intl.NumberFormat('es-CO').format(value)
      : '';

  return (
    <input
      type="text"
      inputMode="decimal"
      value={displayValue}
      placeholder={placeholder}
      onFocus={handleFocus}
      onBlur={handleBlur}
      onChange={handleChange}
      className={className}
    />
  );
}

const generarPDF = (cotizacion) => {
  // La cotización se emite en pesos, pero el cliente negocia en dólares: se
  // muestran las dos columnas usando la tasa guardada en la cotización.
  const tasaPDF = parseFloat(cotizacion.tasa) || 0;
  const usd = (v) => (tasaPDF > 0
    ? 'US$ ' + (( parseFloat(v) || 0) / tasaPDF).toLocaleString('es-CO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
    : '—');
  const contenido = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <title>Cotización ${escapeHtml(cotizacion.numero)}</title>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, sans-serif; padding: 40px; color: #0f172a; font-size: 14px; }
        .header { text-align: center; margin-bottom: 30px; padding-bottom: 20px; border-bottom: 3px solid #6366f1; }
        .header h1 { font-size: 28px; margin-bottom: 5px; color: #0f172a; }
        .header p { color: #64748b; font-size: 14px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-bottom: 30px; }
        .info-box { background: #f8fafc; padding: 15px; border-radius: 8px; }
        .info-box h3 { color: #6366f1; font-size: 12px; margin-bottom: 8px; text-transform: uppercase; }
        .info-box p { margin: 3px 0; }
        .bold { font-weight: bold; }
        table { width: 100%; border-collapse: collapse; margin: 20px 0; }
        th { background: #0f172a; color: white; padding: 12px 15px; text-align: left; font-size: 12px; }
        td { padding: 12px 15px; border-bottom: 1px solid #e2e8f0; }
        .text-right { text-align: right; }
        .totals { margin-top: 20px; }
        .totals-row { display: flex; justify-content: flex-end; margin: 5px 0; }
        .totals-label { width: 150px; text-align: right; color: #64748b; }
        .totals-value { width: 130px; text-align: right; font-weight: bold; }
        .totals-total { font-size: 18px; color: #0f172a; border-top: 2px solid #6366f1; padding-top: 10px; margin-top: 10px; }
        .notes { background: #eff6ff; padding: 15px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #6366f1; }
        .footer { margin-top: 50px; text-align: center; color: #999; font-size: 11px; }
        .status { display: inline-block; padding: 5px 15px; border-radius: 20px; font-size: 12px; font-weight: bold; }
        .status-pendiente { background: #fff3cd; color: #856404; }
        .status-aprobada { background: #d4edda; color: #155724; }
        .status-rechazada { background: #f8d7da; color: #721c24; }
        .status-vencida { background: #e2e3e5; color: #383d41; }
        @media print { body { padding: 20px; } }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>🌐 COMERCIO GLOBAL LOGÍSTICO</h1>
        <p>COTIZACIÓN</p>
      </div>
      
      <div class="info-grid">
        <div class="info-box">
          <h3>Datos de la Cotización</h3>
          <p><span class="bold">Número:</span> ${escapeHtml(cotizacion.numero)}</p>
          <p><span class="bold">Fecha:</span> ${new Date(cotizacion.created_at).toLocaleDateString('es-MX')}</p>
          <p><span class="bold">Válida hasta:</span> ${new Date(cotizacion.fecha_vencimiento).toLocaleDateString('es-MX')}</p>
          <p>
            <span class="bold">Estado:</span>
            <span class="status status-${escapeHtml(cotizacion.estado)}">${escapeHtml(String(cotizacion.estado ?? '').toUpperCase())}</span>
          </p>
        </div>
        <div class="info-box">
          <h3>Datos del Cliente</h3>
          <p><span class="bold">Cliente:</span> ${escapeHtml(cotizacion.cliente_nombre || 'N/A')}</p>
          <p><span class="bold">Teléfono:</span> ${escapeHtml(cotizacion.cliente_telefono || 'N/A')}</p>
          <p><span class="bold">Ciudad:</span> ${escapeHtml(cotizacion.cliente_ciudad || 'N/A')}</p>
          <p><span class="bold">Vendedor:</span> ${escapeHtml(cotizacion.vendedor_nombre || 'N/A')}</p>
        </div>
      </div>
      
      <table>
        <thead>
          <tr>
            <th>Referencia</th>
            <th>Calidad</th>
            <th class="text-right">Cantidad</th>
            <th class="text-right">Precio Unit.</th>
            <th class="text-right">Subtotal COP</th>
            <th class="text-right">Subtotal USD</th>
          </tr>
        </thead>
        <tbody>
          ${cotizacion.detalles?.map(item => `
            <tr>
              <td>${escapeHtml(item.referencia || item.tipo || '-')}</td>
              <td>${escapeHtml(item.calidad || item.categoria || '-')}</td>
              <td class="text-right">${escapeHtml(item.cantidad)}</td>
              <td class="text-right">${formatCurrency(item.precio_unitario)}</td>
              <td class="text-right">${formatCurrency(item.subtotal)}</td>
              <td class="text-right" style="color:#64748b">${usd(item.subtotal)}</td>
            </tr>
          `).join('') || ''}
        </tbody>
      </table>
      
      ${tasaPDF > 0 ? `
        <p style="text-align:right;color:#64748b;font-size:12px;margin-top:-10px">
          Tasa aplicada: 1 US$ = ${tasaPDF.toLocaleString('es-CO')} COP
        </p>` : ''}

      <div class="totals">
        <div class="totals-row">
          <span class="totals-label">Subtotal:</span>
          <span class="totals-value">${formatCurrency(cotizacion.subtotal)}</span>
          <span class="totals-value" style="color:#64748b">${usd(cotizacion.subtotal)}</span>
        </div>
        ${cotizacion.descuento > 0 ? `
        <div class="totals-row">
          <span class="totals-label">Descuento total:</span>
          <span class="totals-value" style="color:#ef4444">-${formatCurrency(cotizacion.descuento)}</span>
          <span class="totals-value" style="color:#94a3b8">-${usd(cotizacion.descuento)}</span>
        </div>
        ` : ''}
        ${parseFloat(cotizacion.transporte_total) > 0 ? `
        <div class="totals-row">
          <span class="totals-label">Transporte:</span>
          <span class="totals-value">${formatCurrency(cotizacion.transporte_total)}</span>
          <span class="totals-value" style="color:#64748b">${usd(cotizacion.transporte_total)}</span>
        </div>
        ` : ''}
        <div class="totals-row totals-total">
          <span class="totals-label">TOTAL:</span>
          <span class="totals-value">${formatCurrency(cotizacion.total)}</span>
          <span class="totals-value" style="color:#6366f1">${usd(cotizacion.total)}</span>
        </div>
      </div>
      
      ${cotizacion.notas ? `
        <div class="notes">
          <strong>Notas:</strong><br>
          ${escapeHtml(cotizacion.notas).replace(/\n/g, '<br>')}
        </div>
      ` : ''}
      
      <div class="footer">
        <p>Cotización generada el ${new Date().toLocaleString('es-MX')}</p>
        <p>Comercio Global Logístico - Sistema de Gestión</p>
      </div>
    </body>
    </html>
  `;
  
  const opt = {
    margin:       10,
    filename:     `Cotizacion_${cotizacion?.numero || Date.now()}.pdf`,
    image:        { type: 'jpeg', quality: 0.98 },
    html2canvas:  { scale: 2 },
    jsPDF:        { unit: 'mm', format: 'letter', orientation: 'portrait' }
  };
  
  const element = document.createElement('div');
  element.innerHTML = contenido;
  
  html2pdf().set(opt).from(element).save();
};

export default function Cotizaciones() {
  const [cotizaciones, setCotizaciones] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedCotizacion, setSelectedCotizacion] = useState(null);
  const [clientes, setClientes] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [busqueda, setBusqueda] = useState('');
  const { addToast } = useToast();
  const confirm = useConfirm();
  const { usuario } = useAuth();
  
  const { categorias: optsReferencia, calidades: optsCalidad } = useCatalog();

  const [formData, setFormData] = useState({
    cliente_id: '',
    validez_dias: 15,
    notas: '',
    descuento: '',
    tipo_descuento: 'valor_fijo',
    transporte_unitario: '',
    tasa: '',
    tipo_transporte: '',
    destinatario: '',
    direccion_entrega: '',
    ciudad_entrega: '',
    celular: '',
  });

  const [items, setItems] = useState([
    { referencia: '', calidad: '', cantidad: 1, precio_unitario: 0, subtotal: 0, precio_promocion: null, disponibles: null }
  ]);

  // Conversión a venta (abono + cuenta)
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [convertForm, setConvertForm] = useState({ abono: '', metodo_pago: 'efectivo', cuenta_id: '' });
  const [convertSubmitting, setConvertSubmitting] = useState(false);
  const [cuentasBanco, setCuentasBanco] = useState([]);
  // Tabla de precios preestablecidos, para resolver el precio del ítem sin
  // depender de una petición por cada cambio de referencia o calidad.
  const [precios, setPrecios] = useState([]);
  const [listaPrecios, setListaPrecios] = useState([]);
  // Nº de consulta vigente por fila de ítem. Cambiar referencia o calidad lanza
  // peticiones de precio y de disponibilidad; si el usuario cambiaba dos veces
  // seguidas quedaban dos en vuelo y ganaba la que respondiera última, dejando
  // el precio de la referencia anterior. Sólo se aplica la respuesta cuyo
  // número sigue siendo el último pedido para esa fila.
  const consultaItemSeq = useRef({});
  // El número sale de un contador global que nunca se reinicia. Si cada fila
  // llevara su propio contador, al borrar una fila (que vacía el mapa) la
  // siguiente consulta volvería a valer 1 y una petición vieja con el 1 en la
  // mano se daría por vigente y escribiría precio o stock sobre la fila que
  // ahora ocupa ese índice. Con un contador que sólo sube, ningún número se
  // recicla y una respuesta invalidada lo queda para siempre.
  const consultaSeqCounter = useRef(0);

  useEffect(() => {
    loadCotizaciones();
    loadClientes();
  }, [filtroEstado]);

  useEffect(() => {
    cuentasApi.getAll().then(setCuentasBanco).catch(() => {});
    preciosApi.getAll().then(p => setPrecios(p || [])).catch(() => {});
    // Precio real del inventario: es el que se fijó al finalizar el contenedor.
    listaPreciosApi.getAll().then(l => setListaPrecios(l || [])).catch(() => {});
  }, []);

  // Deep-link: ?focus=<id> abre el detalle de esa cotización (trazabilidad)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus) return;
    cotizacionesApi.getOne(focus)
      .then(data => { setSelectedCotizacion(data); setViewModalOpen(true); })
      .catch(() => addToast('No se encontró la cotización', 'error'));
    setSearchParams({}, { replace: true });
  }, [searchParams]);

  const loadCotizaciones = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      const data = await cotizacionesApi.getAll(params);
      setCotizaciones(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const loadClientes = async () => {
    try {
      const data = await clientesApi.getAll({ estado: 'activo' });
      setClientes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const openCreateModal = () => {
    setFormData({ cliente_id: '', validez_dias: 15, notas: '', descuento: '', tipo_descuento: 'valor_fijo', transporte_unitario: '', tasa: '',
      tipo_transporte: '', destinatario: '', direccion_entrega: '', ciudad_entrega: '', celular: '' });
    setItems([{ referencia: '', calidad: '', cantidad: 1, precio_unitario: 0, subtotal: 0, precio_promocion: null, disponibles: null }]);
    // El formulario arranca de cero, así que las consultas de la cotización
    // anterior ya no son de nadie: si no se invalidan aquí, la que siga en vuelo
    // sigue teniendo el número vigente de la fila 0 y escribe su precio, su
    // marca de promoción o su stock sobre la primera fila —vacía— de la
    // cotización nueva.
    consultaItemSeq.current = {};
    setModalOpen(true);
  };

  const openViewModal = async (cotizacion) => {
    try {
      const data = await cotizacionesApi.getOne(cotizacion.id);
      setSelectedCotizacion(data);
      setViewModalOpen(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const addItem = () => {
    setItems([...items, { referencia: '', calidad: '', cantidad: 1, precio_unitario: 0, subtotal: 0, precio_promocion: null, disponibles: null }]);
  };

  const removeItem = (index) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
      // Al borrar una fila se corren los índices: cualquier respuesta en vuelo
      // escribiría sobre la fila equivocada, así que se invalidan todas.
      consultaItemSeq.current = {};
    }
  };

  // Rellena el destino con los datos del cliente elegido, que es el caso normal.
  const copiarDatosCliente = () => {
    const cli = clientes.find(c => String(c.id) === String(formData.cliente_id));
    if (!cli) return;
    setFormData(f => ({
      ...f,
      destinatario: cli.nombre || '',
      ciudad_entrega: cli.ciudad || '',
      direccion_entrega: cli.direccion || '',
      celular: cli.telefono || '',
    }));
  };

  // Prioridad: 1° promoción activa (referencia+calidad), 2° precio preestablecido (categoria+calidad)
  const recheckPrices = async (index, item, seq) => {
    const { referencia, calidad } = item;
    // La respuesta sólo se aplica si sigue siendo la última consulta de la fila.
    const vigente = () => consultaItemSeq.current[index] === seq;
    // Comparación tolerante: la referencia escrita y la del catálogo vienen de
    // tablas distintas y difieren en mayúsculas y acentos. Con === exacto no
    // encontraba la temporada y el precio preestablecido nunca se buscaba.
    const referenciaObj = optsReferencia.find(r => normTxt(r.nombre) === normTxt(referencia));
    const categoria = referenciaObj?.temporada_nombre || null;

    // 1. Buscar promoción activa
    if (referencia && calidad) {
      try {
        const promo = await preciosPromocionApi.getActiva({ referencia, calidad, clasificacion: item.clasificacion || '' });
        if (!vigente()) return;
        if (promo) {
          setItems(prev => {
            const next = [...prev];
            next[index] = {
              ...next[index],
              precio_unitario: parseFloat(promo.precio_promocional),
              subtotal: (next[index].cantidad || 0) * parseFloat(promo.precio_promocional),
              precio_promocion: parseFloat(promo.precio_promocional),
            };
            return next;
          });
          return; // promoción gana, no seguir
        }
      } catch (_) {}
    }

    // Sin promoción: limpiar marca
    if (!vigente()) return;
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], precio_promocion: null };
      return next;
    });

    // 2. Precio preestablecido. Se resuelve contra la tabla de Precios ya cargada
    //    (comparación sin acentos ni mayúsculas) y, si el servidor la tiene, se
    //    consulta como respaldo. Antes bastaba con que la referencia no tuviera
    //    temporada asignada para que no se buscara ningún precio y el campo
    //    quedara en 0 sin decir nada.
    if (!calidad) return;

    let precio = null;

    // 2a. Precio del INVENTARIO: el que se fijó al finalizar el contenedor, por
    //     referencia + calidad. Es el que la gente ve en el contenedor y el que
    //     espera encontrar aquí, así que manda sobre el preestablecido genérico.
    const enInventario = listaPrecios.find(
      l => normTxt(l.referencia) === normTxt(referencia) && normTxt(l.calidad) === normTxt(calidad)
    );
    const pInv = parseFloat(enInventario?.precio);
    if (Number.isFinite(pInv) && pInv > 0) precio = pInv;

    // 2b. Precio preestablecido por categoría + calidad (tabla de Precios).
    if (precio == null && categoria) {
      const fila = precios.find(
        p => normTxt(p.categoria) === normTxt(categoria) && normTxt(p.calidad) === normTxt(calidad)
      );
      const v = parseFloat(fila?.precio);
      if (Number.isFinite(v) && v > 0) precio = v;

      if (precio == null) {
        try {
          const preset = await preciosApi.buscar({ categoria, calidad });
          const pv = parseFloat(preset?.precio);
          if (Number.isFinite(pv) && pv > 0) precio = pv;
        } catch (_) { /* sin precio configurado */ }
      }
    }

    if (!vigente()) return;

    if (precio != null) {
      setItems(prev => {
        const next = [...prev];
        if (next[index].precio_promocion != null) return prev; // por si llegó promo en paralelo
        next[index] = {
          ...next[index],
          precio_unitario: precio,
          subtotal: (next[index].cantidad || 0) * precio,
        };
        return next;
      });
      return;
    }

    // No se pudo resolver: se avisa en vez de dejar el campo en 0 en silencio.
    setItems(prev => {
      const next = [...prev];
      if (parseFloat(next[index].precio_unitario) > 0) return prev; // ya tiene precio escrito a mano
      next[index] = {
        ...next[index],
        _avisoPrecio: `No hay unidades disponibles de ${referencia} / ${calidad} con precio, ni precio preestablecido${categoria ? ` para ${categoria} / ${calidad}` : ''}. Escríbelo a mano o revísalo en Lista de Precios.`,
      };
      return next;
    });
  };

  const fetchDisponibilidad = async (index, item, seq) => {
    const params = {};
    if (item.referencia) params.referencia = item.referencia;
    if (item.calidad)    params.calidad    = item.calidad;
    if (Object.keys(params).length === 0) return;
    try {
      const { disponibles } = await pacasApi.getDisponibilidad(params);
      // Llegó tarde: la fila ya se cambió otra vez, este stock ya no es el suyo.
      if (consultaItemSeq.current[index] !== seq) return;
      setItems(prev => {
        const next = [...prev];
        next[index] = { ...next[index], disponibles };
        return next;
      });
    } catch (_) {}
  };

  const updateItem = (index, field, value) => {
    const newItems = [...items];
    newItems[index][field] = value;
    if (field === 'cantidad' || field === 'precio_unitario') {
      newItems[index].subtotal = (newItems[index].cantidad || 0) * (newItems[index].precio_unitario || 0);
    }
    if (field === 'precio_unitario') {
      newItems[index].precio_promocion = null;
    }
    setItems(newItems);

    if (['referencia', 'calidad'].includes(field)) {
      // Se numera la consulta para que sólo se aplique la respuesta de la última
      // referencia/calidad elegida, no la que resulte más lenta en volver.
      const seq = ++consultaSeqCounter.current;
      consultaItemSeq.current[index] = seq;
      recheckPrices(index, newItems[index], seq);
      fetchDisponibilidad(index, newItems[index], seq);
    }
  };

  // Un ítem sólo cuenta para los totales si handleSubmit lo va a enviar. Las
  // filas que crea "Agregar Item" nacen vacías pero con cantidad 1, así que al
  // contarlas cada fila en blanco sumaba una unidad fantasma al descuento por
  // unidad y al transporte, y el total del modal no coincidía con lo guardado.
  const esItemValido = (i) => (parseFloat(i.precio_unitario) || 0) > 0 && Boolean(i.referencia || i.calidad);

  // La fila sí muestra su propio subtotal, así que si queda fuera de los totales
  // hay que decirlo: si no, el usuario ve $90.000 en la línea y no los encuentra
  // en el pie ni en la cotización guardada, sin explicación alguna.
  const filaNoCuenta = (i) => (parseFloat(i.precio_unitario) || 0) > 0 && !esItemValido(i);

  // Precio final por unidad de un ítem según el descuento configurado.
  // Ésta es la ÚNICA fórmula del descuento: la etiqueta "c/desc:" de la fila y
  // el total del pie salen de aquí. Antes el pie calculaba
  // descuento × unidades y sólo topaba el total contra el subtotal, de modo que
  // un descuento mayor que el precio de un ítem se comía el descuento de los
  // demás y el total cobraba menos de lo que sumaban las filas.
  const precioConDescuento = (precioUnitario) => {
    const precio = parseFloat(precioUnitario) || 0;
    const raw = parseFloat(formData.descuento) || 0;
    if (raw <= 0) return precio;
    if (formData.tipo_descuento === 'porcentaje') {
      return Math.max(0, Math.round(precio * (1 - raw / 100)));
    }
    return Math.max(0, Math.round(precio - raw)); // valor fijo por unidad, topado al precio del ítem
  };

  // Lo que se le descuenta a UNA unidad del ítem. Es la resta del helper
  // anterior, por eso fila y total siempre cuadran.
  const descuentoPorUnidad = (precioUnitario) =>
    (parseFloat(precioUnitario) || 0) - precioConDescuento(precioUnitario);

  const calcularTotales = () => {
    const validos = items.filter(esItemValido);
    const subtotalConPromo = validos
      .filter(i => i.precio_promocion != null)
      .reduce((s, i) => s + (i.subtotal || 0), 0);
    const subtotalSinPromo = validos
      .filter(i => i.precio_promocion == null)
      .reduce((s, i) => s + (i.subtotal || 0), 0);
    const subtotal = subtotalConPromo + subtotalSinPromo;

    // El descuento se topa POR ÍTEM y luego se suma: ningún ítem puede
    // descontar más de lo que vale, ni prestarle descuento a otro.
    const descuentoAmount = validos
      .filter(i => i.precio_promocion == null)
      .reduce((s, i) => s + descuentoPorUnidad(i.precio_unitario) * (parseInt(i.cantidad) || 0), 0);

    // Transporte por unidad × total de unidades, sumado al total
    const totalCantidades = validos.reduce((s, i) => s + (parseInt(i.cantidad) || 0), 0);
    const transporteUnit = parseFloat(formData.transporte_unitario) || 0;
    const transporteTotal = transporteUnit * totalCantidades;

    const tasa = parseFloat(formData.tasa) || 1;
    const total = subtotal - descuentoAmount + transporteTotal;
    const totalUsd = tasa > 0 ? total / tasa : 0;

    return {
      subtotal, descuento: descuentoAmount, subtotalSinPromo,
      totalCantidades, transporteUnit, transporteTotal, tasa, total, totalUsd,
    };
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!formData.cliente_id) {
      addToast('Selecciona un cliente', 'error');
      return;
    }
    
    // Mismo criterio que usan los totales del pie, para que lo que se guarda sea
    // exactamente lo que la pantalla venía mostrando.
    const validItems = items.filter(esItemValido);
    if (validItems.length === 0) {
      addToast('Agrega al menos un ítem con precio y referencia o calidad seleccionada', 'error');
      return;
    }

    try {
      // El descuento se aplica UNA sola vez como monto total (no se baja el precio por
      // unidad y se vuelve a restar). Los detalles llevan el precio unitario original.
      const { descuento } = calcularTotales();
      const detalles = validItems.map(i => {
        const tienePromo = i.precio_promocion != null;
        const precioUnit = parseFloat(i.precio_unitario);
        return {
          ...i,
          precio_unitario: precioUnit,
          // Misma cuenta que el pie del modal (parseInt, sin fallback a 1): lo
          // que se guarda es exactamente el subtotal que la fila mostraba.
          subtotal: (parseInt(i.cantidad) || 0) * precioUnit,
          tiene_promocion: tienePromo,
        };
      });

      await cotizacionesApi.create({
        cliente_id: formData.cliente_id,
        vendedor_id: usuario?.id,
        validez_dias: formData.validez_dias,
        notas: formData.notas,
        descuento,
        tipo_descuento: formData.tipo_descuento,
        transporte_unitario: parseFloat(formData.transporte_unitario) || 0,
        tipo_transporte:   formData.tipo_transporte?.trim()   || null,
        destinatario:      formData.destinatario?.trim()      || null,
        direccion_entrega: formData.direccion_entrega?.trim() || null,
        ciudad_entrega:    formData.ciudad_entrega?.trim()    || null,
        celular:           formData.celular?.trim()           || null,
        tasa: parseFloat(formData.tasa) || 1,
        detalles,
      });
      
      addToast('Cotización creada', 'success');
      setModalOpen(false);
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleAprobar = async (id) => {
    try {
      await cotizacionesApi.updateEstado(id, 'aprobada');
      addToast('Cotización aprobada', 'success');
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleRechazar = async (id) => {
    const ok = await confirm({
      title: '¿Rechazar cotización?',
      message: 'Las pacas reservadas volverán a estar disponibles en el inventario.',
      confirmText: 'Rechazar',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cotizacionesApi.updateEstado(id, 'rechazada');
      addToast('Cotización rechazada — pacas liberadas al inventario', 'success');
      setViewModalOpen(false);
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEliminar = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar cotización?',
      message: 'Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await cotizacionesApi.delete(id);
      addToast('Cotización eliminada', 'success');
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleConvertirVenta = () => {
    setConvertForm({ abono: '', metodo_pago: 'efectivo', cuenta_id: '' });
    setConvertModalOpen(true);
  };

  const submitConvertirVenta = async () => {
    try {
      setConvertSubmitting(true);
      const result = await cotizacionesApi.convertirAVenta(selectedCotizacion.id, usuario?.id, {
        abono: convertForm.abono ? parseFloat(convertForm.abono) : 0,
        metodo_pago: convertForm.metodo_pago || null,
        cuenta_id: convertForm.cuenta_id ? parseInt(convertForm.cuenta_id) : null,
      });
      addToast(
        `Venta creada — despacho ${result.despacho_numero} generado${result.abono_registrado > 0 ? ` · abono ${formatCurrency(result.abono_registrado)}` : ''}`,
        'success'
      );
      setConvertModalOpen(false);
      setViewModalOpen(false);
      loadCotizaciones();
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setConvertSubmitting(false);
    }
  };

  const getEstadoBadge = (estado) => {
    const variants = {
      pendiente: 'warning',
      aprobada: 'success',
      rechazada: 'error',
      vencida: 'default'
    };
    return <Badge variant={variants[estado] || 'default'}>{estado}</Badge>;
  };

  const { subtotal, descuento, total, totalUsd, transporteTotal, transporteUnit, totalCantidades, tasa } = calcularTotales();
  const hayDescuento = (parseFloat(formData.descuento) || 0) > 0;

  // Búsqueda client-side por número o cliente (el filtro de estado es por servidor)
  const cotizacionesFiltradas = cotizaciones.filter((c) => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return true;
    return (c.numero || '').toLowerCase().includes(q) ||
           (c.cliente_nombre || '').toLowerCase().includes(q);
  });

  const exportarListaExcel = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Cotizaciones');
    ws.columns = [
      { header: 'Número',          key: 'numero',  width: 14 },
      { header: 'Cliente',         key: 'cliente', width: 26 },
      { header: 'Total',           key: 'total',   width: 18 },
      { header: 'Estado',          key: 'estado',  width: 14 },
      { header: 'Fecha Creación',  key: 'creada',  width: 16 },
      { header: 'Fecha Venc.',     key: 'vence',   width: 16 },
    ];
    ws.getRow(1).font = { bold: true };
    cotizaciones.forEach(c => {
      ws.addRow({
        numero:  c.numero,
        cliente: c.cliente_nombre || '—',
        total:   parseFloat(c.total) || 0,
        estado:  c.estado,
        creada:  c.created_at ? new Date(c.created_at).toLocaleDateString('es-CO') : '—',
        vence:   c.fecha_vencimiento ? new Date(c.fecha_vencimiento).toLocaleDateString('es-CO') : '—',
      });
    });
    ws.getColumn('total').numFmt = '#,##0.00';
    const buffer = await wb.xlsx.writeBuffer();
    const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `cotizaciones-${hoy()}.xlsx`;
    link.click();
    URL.revokeObjectURL(link.href);
  };

  return (
    <Layout title="Cotizaciones" subtitle="Gestión de cotizaciones y propuestas de precio">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex gap-2 items-center flex-wrap">
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                value={busqueda}
                onChange={(e) => setBusqueda(e.target.value)}
                placeholder="Buscar por número o cliente..."
                className="pl-9 pr-3 py-2.5 rounded-xl border border-border bg-surface text-sm w-60 focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
            </div>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-4 py-2.5 rounded-xl border border-border bg-surface"
            >
              <option value="">Todas</option>
              <option value="pendiente">Pendientes</option>
              <option value="aprobada">Aprobadas</option>
              <option value="rechazada">Rechazadas</option>
              <option value="vencida">Vencidas</option>
            </select>
            <span className="text-sm text-muted">
              {cotizacionesFiltradas.length} cotización(es)
            </span>
          </div>
          <div className="flex gap-2">
            <button onClick={exportarListaExcel}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-border text-sm font-medium text-muted hover:text-primary hover:bg-primary/5 transition-colors">
              <Download size={15} /> Excel
            </button>
            <Button onClick={openCreateModal} icon={Plus}>
              Nueva Cotización
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="bg-surface rounded-2xl border border-border/50 p-5 animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-primary/8" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-primary/8 rounded-full" />
                      <div className="h-3 w-24 bg-primary/8 rounded-full" />
                    </div>
                  </div>
                  <div className="h-7 w-28 bg-primary/8 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : cotizacionesFiltradas.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <FileText className="w-16 h-16 mx-auto text-muted mb-4" />
              <h3 className="text-lg font-medium mb-2">{busqueda ? 'Sin resultados' : 'No hay cotizaciones'}</h3>
              <p className="text-muted mb-4">{busqueda ? `Ninguna cotización coincide con "${busqueda}"` : 'Crea tu primera cotización'}</p>
              {!busqueda && <Button onClick={openCreateModal} icon={Plus}>Crear Cotización</Button>}
            </CardBody>
          </Card>
        ) : (
          <div className="space-y-3">
            {cotizacionesFiltradas.map((cot) => (
              <Card key={cot.id} hover className="cursor-pointer" onClick={() => openViewModal(cot)}>
                <CardBody>
                  <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="p-3 bg-primary/10 rounded-xl">
                        <FileText className="w-6 h-6 text-muted" />
                      </div>
                      <div>
                        <p className="font-display font-bold text-lg text-primary">{cot.numero}</p>
                        <p className="text-sm text-muted flex items-center gap-1">
                          <User className="w-3 h-3" />
                          {cot.cliente_nombre || 'Sin cliente'}
                        </p>
                        <p className="text-xs text-muted">
                          {new Date(cot.created_at).toLocaleDateString('es-MX')} • Vence: {new Date(cot.fecha_vencimiento).toLocaleDateString('es-MX')}
                        </p>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-2xl font-display font-bold text-primary">{formatCurrency(cot.total)}</p>
                        <p className="text-xs text-muted">{cot.num_items} item(s)</p>
                      </div>
                      {getEstadoBadge(cot.estado)}
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Modal Crear Cotización */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Nueva Cotización" size="xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Cliente *</label>
                <select
                  value={formData.cliente_id}
                  onChange={(e) => {
                    const clienteId = e.target.value;
                    const cliente = clientes.find(c => String(c.id) === clienteId);
                    setFormData(f => ({
                      ...f,
                      cliente_id: clienteId,
                      // Descuento del cliente en PESOS por unidad (sobre pacas sin promo)
                      descuento: cliente?.descuento > 0 ? String(cliente.descuento) : f.descuento,
                      tipo_descuento: cliente?.descuento > 0 ? 'valor_fijo' : f.tipo_descuento,
                    }));
                  }}
                  className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  required
                >
                  <option value="">Seleccionar cliente...</option>
                  {clientes.map(c => (
                    <option key={c.id} value={c.id}>{c.nombre}{c.descuento > 0 ? ` (-${formatCurrency(c.descuento)}/u)` : ''}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-primary mb-1">Descuento</label>
                <div className="flex gap-2">
                  <select
                    value={formData.tipo_descuento}
                    onChange={(e) => setFormData(f => ({ ...f, tipo_descuento: e.target.value, descuento: '' }))}
                    className="px-3 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 text-sm bg-surface"
                  >
                    <option value="valor_fijo">$ Valor fijo</option>
                    <option value="porcentaje">% Porcentaje</option>
                  </select>
                  <input
                    type="number"
                    value={formData.descuento}
                    onChange={(e) => setFormData(f => ({ ...f, descuento: e.target.value }))}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 text-sm"
                    min="0"
                    max={formData.tipo_descuento === 'porcentaje' ? 100 : undefined}
                    step={formData.tipo_descuento === 'porcentaje' ? 1 : 1000}
                    placeholder={formData.tipo_descuento === 'porcentaje' ? 'Ej: 10' : 'Ej: 50000'}
                  />
                </div>
                {items.some(i => i.precio_promocion != null) && (
                  <p className="text-xs text-amber-600 mt-1 flex items-center gap-1">
                    <Info size={11} /> El descuento solo aplica a ítems sin precio de promoción
                  </p>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Transporte por unidad ($)</label>
                  <input
                    type="number"
                    value={formData.transporte_unitario}
                    onChange={(e) => setFormData(f => ({ ...f, transporte_unitario: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 text-sm"
                    min="0" step="500" placeholder="Ej: 2000"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-primary mb-1">Tasa (COP por USD)</label>
                  <input
                    type="number"
                    value={formData.tasa}
                    onChange={(e) => setFormData(f => ({ ...f, tasa: e.target.value }))}
                    className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 text-sm"
                    min="0" step="1" placeholder="Ej: 4000"
                  />
                </div>
              </div>
            </div>
            
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Validez (días)</label>
              <input
                type="number"
                value={formData.validez_dias}
                onChange={(e) => setFormData({ ...formData, validez_dias: parseInt(e.target.value) || 15 })}
                className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                min="1"
                max="90"
              />
            </div>
          </div>

          {/* Datos de destino — se acuerdan al cotizar y el despacho los hereda.
              El destinatario no siempre es el cliente: se factura a uno y se
              envía a otra persona o local. */}
          <div className="rounded-xl border border-border bg-primary/[0.02] p-4 space-y-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <p className="text-xs font-bold text-muted uppercase tracking-widest">Datos de destino</p>
              {formData.cliente_id && (
                <button type="button" onClick={copiarDatosCliente}
                  className="text-xs font-semibold text-secondary hover:underline underline-offset-2">
                  Usar los datos del cliente
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Nombre de destino</label>
                <input type="text" value={formData.destinatario}
                  onChange={(e) => setFormData(f => ({ ...f, destinatario: e.target.value }))}
                  placeholder="Si es distinto al cliente…"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Tipo de transporte</label>
                <input type="text" list="cot-transportes" value={formData.tipo_transporte}
                  onChange={(e) => setFormData(f => ({ ...f, tipo_transporte: e.target.value }))}
                  placeholder="Elige o escribe uno nuevo…" autoComplete="off"
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
                <datalist id="cot-transportes">
                  {['terrestre', 'maritimo', 'aereo', 'recoge_cliente', 'paqueteria', 'mensajero', 'flota', 'contenedor']
                    .map(t => <option key={t} value={t} />)}
                </datalist>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Ciudad</label>
                <input type="text" value={formData.ciudad_entrega}
                  onChange={(e) => setFormData(f => ({ ...f, ciudad_entrega: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
              </div>
              <div>
                <label className="block text-xs font-medium text-muted mb-1">Celular</label>
                <input type="text" value={formData.celular}
                  onChange={(e) => setFormData(f => ({ ...f, celular: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-muted mb-1">Dirección de entrega</label>
                <input type="text" value={formData.direccion_entrega}
                  onChange={(e) => setFormData(f => ({ ...f, direccion_entrega: e.target.value }))}
                  className="w-full px-3 py-2 rounded-lg border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
              </div>
            </div>
            <p className="text-xs text-muted">
              Opcional. Lo que escribas aquí lo hereda el despacho cuando la cotización se convierta en venta.
            </p>
          </div>

          {/* Aviso inventario */}
          <div className="flex items-start gap-2 p-3 bg-blue-50 border border-blue-200 rounded-xl text-xs text-blue-800">
            <Info size={14} className="flex-shrink-0 mt-0.5 text-blue-500" />
            <span>Al crear la cotización, las pacas se reservarán automáticamente en el inventario (estado <strong>separada</strong>) hasta que la cotización sea confirmada o rechazada.</span>
          </div>

          {/* Items */}
          <div>
            <div className="flex justify-between items-center mb-2">
              <label className="text-sm font-medium text-primary">Items</label>
              <Button type="button" variant="ghost" size="sm" onClick={addItem} icon={Plus}>
                Agregar Item
              </Button>
            </div>

            <div className="border border-border rounded-xl overflow-hidden">
              {/* Cabecera de columnas */}
              <div className="grid grid-cols-[1fr_1fr_56px_116px_84px_32px] gap-2 px-3 py-2 bg-primary/5 border-b border-border/60 text-xs font-medium text-muted select-none">
                <span>Referencia</span>
                <span>Calidad</span>
                <span className="text-center">Cant.</span>
                <span className="text-right">Precio unit.</span>
                <span className="text-right">Subtotal</span>
                <span />
              </div>

              {/* Filas de ítems */}
              <div className="divide-y divide-border/50 max-h-72 overflow-y-auto">
                {items.map((item, index) => (
                  <div
                    key={index}
                    className={`px-3 py-2.5 transition-colors ${item.precio_promocion != null ? 'bg-amber-50/70' : 'hover:bg-primary/[0.02]'}`}
                  >
                    {/* Fila principal */}
                    <div className="grid grid-cols-[1fr_1fr_56px_116px_84px_32px] gap-2 items-center">
                      <select
                        value={item.referencia}
                        onChange={(e) => updateItem(index, 'referencia', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 truncate"
                      >
                        <option value="">Referencia…</option>
                        {optsReferencia.map(o => (
                          <option key={o.id} value={o.nombre}>{o.nombre.charAt(0).toUpperCase() + o.nombre.slice(1)}</option>
                        ))}
                      </select>

                      <select
                        value={item.calidad}
                        onChange={(e) => updateItem(index, 'calidad', e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border text-sm bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
                      >
                        <option value="">Calidad…</option>
                        {optsCalidad.map(o => (
                          <option key={o.id} value={o.nombre}>{o.nombre.charAt(0).toUpperCase() + o.nombre.slice(1)}</option>
                        ))}
                      </select>

                      <input
                        type="number"
                        value={item.cantidad}
                        onChange={(e) => updateItem(index, 'cantidad', parseInt(e.target.value) || 1)}
                        className="w-full px-2 py-1.5 rounded-lg border border-border text-sm text-center focus:outline-none focus:ring-2 focus:ring-secondary/30"
                        min="1"
                      />

                      <PriceInput
                        value={item.precio_unitario}
                        onChange={(v) => updateItem(index, 'precio_unitario', v)}
                        placeholder="Precio"
                        className={`w-full px-2 py-1.5 rounded-lg border text-sm text-right focus:outline-none focus:ring-2 focus:ring-secondary/30 ${
                          item.precio_promocion != null
                            ? 'border-amber-400 bg-amber-100 font-semibold'
                            : 'border-border'
                        }`}
                      />

                      <span className="text-right text-sm font-semibold tabular-nums text-primary">
                        {formatCurrency(item.subtotal)}
                      </span>

                      <button
                        type="button"
                        onClick={() => removeItem(index)}
                        className="flex items-center justify-center w-7 h-7 rounded-lg text-muted hover:text-red-500 hover:bg-red-50 transition-colors mx-auto"
                      >
                        <XIcon size={14} />
                      </button>
                    </div>

                    {/* Por qué no se autocompletó el precio */}
                    {item._avisoPrecio && !(item.precio_unitario > 0) && (
                      <p className="mt-1.5 text-xs text-amber-700 flex items-start gap-1.5">
                        <AlertCircle size={12} className="flex-shrink-0 mt-0.5" />
                        <span>{item._avisoPrecio}</span>
                      </p>
                    )}

                    {/* Fila de metadatos: stock · promo · precio con descuento */}
                    {(item.disponibles !== null || item.precio_promocion != null || filaNoCuenta(item) || (hayDescuento && item.precio_promocion == null && item.precio_unitario > 0)) && (
                      <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                        {item.disponibles !== null && (
                          <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full ${
                            item.disponibles === 0
                              ? 'bg-red-50 text-red-600'
                              : item.disponibles <= 5
                                ? 'bg-amber-50 text-amber-700'
                                : 'bg-green-50 text-green-700'
                          }`}>
                            <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                              item.disponibles === 0 ? 'bg-red-500' : item.disponibles <= 5 ? 'bg-amber-500' : 'bg-green-500'
                            }`} />
                            {item.disponibles === 0 ? 'Sin stock' : `${item.disponibles} disponibles`}
                          </span>
                        )}
                        {item.precio_promocion != null && (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-700 bg-amber-100 px-2 py-0.5 rounded-full">
                            <AlertCircle size={10} /> Precio promoción
                          </span>
                        )}
                        {filaNoCuenta(item) && (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full">
                            <AlertCircle size={10} /> Elige referencia o calidad — esta fila no suma al total
                          </span>
                        )}
                        {hayDescuento && item.precio_promocion == null && item.precio_unitario > 0 && (
                          <span className="ml-auto text-xs text-green-700 font-medium tabular-nums">
                            c/desc: {formatCurrency(precioConDescuento(item.precio_unitario))}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Totales */}
          <div className="flex justify-end">
            <div className="w-full max-w-xs space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted">Subtotal:</span>
                <span className="font-medium">{formatCurrency(subtotal)}</span>
              </div>
              {descuento > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">
                    Descuento {formData.tipo_descuento === 'porcentaje' ? `(${formData.descuento}%)` : `(${formatCurrency(parseFloat(formData.descuento) || 0)}/u)`}:
                  </span>
                  <span className="text-red-500 font-medium">-{formatCurrency(descuento)}</span>
                </div>
              )}
              {transporteTotal > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">
                    Transporte ({formatCurrency(transporteUnit)} × {totalCantidades}):
                  </span>
                  <span className="text-blue-600 font-medium">+{formatCurrency(transporteTotal)}</span>
                </div>
              )}
              <div className="flex justify-between text-lg font-bold border-t pt-2">
                <span>Total:</span>
                <span className="text-primary">{formatCurrency(total)}</span>
              </div>
              {tasa > 1 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted">Total USD (tasa {formatCurrency(tasa)}):</span>
                  <span className="font-medium">${totalUsd.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                </div>
              )}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">Notas</label>
            <textarea
              value={formData.notas}
              onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 resize-none"
              rows={2}
              placeholder="Notas adicionales..."
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" variant="secondary">
              Crear Cotización
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Ver Cotización */}
      <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title={`Cotización ${selectedCotizacion?.numero}`} size="xl">
        {selectedCotizacion && (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3 sm:p-4 bg-primary/5 rounded-xl">
              <div>
                <p className="text-xs sm:text-sm text-muted">Cliente</p>
                {selectedCotizacion.cliente_id ? (
                  <RefLink to="/cartera" id={selectedCotizacion.cliente_id} title="Ver cartera del cliente"
                    className="font-medium text-sm sm:text-base">
                    {selectedCotizacion.cliente_nombre}
                  </RefLink>
                ) : (
                  <p className="font-medium text-sm sm:text-base">{selectedCotizacion.cliente_nombre}</p>
                )}
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted">Vendedor</p>
                <p className="font-medium text-sm sm:text-base">{selectedCotizacion.vendedor_nombre || 'N/A'}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted">Fecha</p>
                <p className="font-medium text-sm sm:text-base">{new Date(selectedCotizacion.created_at).toLocaleDateString('es-MX')}</p>
              </div>
              <div>
                <p className="text-xs sm:text-sm text-muted">Vence</p>
                <p className="font-medium text-sm sm:text-base">{new Date(selectedCotizacion.fecha_vencimiento).toLocaleDateString('es-MX')}</p>
              </div>
              {selectedCotizacion.despachos?.length > 0 && (
                <div>
                  <p className="text-xs sm:text-sm text-muted">Despacho{selectedCotizacion.despachos.length > 1 ? 's' : ''}</p>
                  <div className="flex flex-wrap gap-2">
                    {selectedCotizacion.despachos.map(d => (
                      <RefLink key={d.id} to="/despachos" id={d.id} title="Ver despacho"
                        className="font-medium text-sm sm:text-base">{d.numero}</RefLink>
                    ))}
                  </div>
                </div>
              )}
              {selectedCotizacion.cliente_id && (
                <div>
                  <p className="text-xs sm:text-sm text-muted">Cartera</p>
                  <RefLink to="/cartera" id={selectedCotizacion.cliente_id} title="Ver la cartera del cliente"
                    className="font-medium text-sm sm:text-base">Ver cartera del cliente</RefLink>
                </div>
              )}
            </div>

            <div>
              <h4 className="font-medium mb-2 text-sm sm:text-base">Items</h4>
              <div className="border rounded-xl overflow-x-auto">
                <table className="w-full text-xs sm:text-sm min-w-[400px]">
                  <thead className="bg-primary/5">
                    <tr>
                      <th className="px-2 sm:px-4 py-2 text-left">Referencia</th>
                      <th className="px-2 sm:px-4 py-2 text-left hidden sm:table-cell">Calidad</th>
                      <th className="px-2 sm:px-4 py-2 text-right">Cant.</th>
                      <th className="px-2 sm:px-4 py-2 text-right">Precio</th>
                      <th className="px-2 sm:px-4 py-2 text-right">Subtotal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {selectedCotizacion.detalles?.map((item, i) => (
                      <tr key={i}>
                        <td className="px-2 sm:px-4 py-2">{item.referencia || item.tipo || '-'}</td>
                        <td className="px-2 sm:px-4 py-2 text-muted hidden sm:table-cell">{item.calidad || item.categoria || '-'}</td>
                        <td className="px-2 sm:px-4 py-2 text-right">{item.cantidad}</td>
                        <td className="px-2 sm:px-4 py-2 text-right">{formatCurrency(item.precio_unitario)}</td>
                        <td className="px-2 sm:px-4 py-2 text-right font-medium">{formatCurrency(item.subtotal)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Pacas vinculadas al inventario */}
            {selectedCotizacion.pacas_vinculadas?.length > 0 ? (
              <div className="p-3 bg-success/5 border border-success/20 rounded-xl">
                <div className="flex items-center gap-2 mb-2">
                  <Package size={14} className="text-success" />
                  <span className="text-xs font-semibold text-success uppercase tracking-wide">
                    Pacas reservadas en inventario ({selectedCotizacion.pacas_vinculadas.reduce((s, p) => s + p.cantidad, 0)} pacas)
                  </span>
                </div>
                <div className="space-y-1">
                  {selectedCotizacion.pacas_vinculadas.map((p, i) => (
                    <div key={i} className="flex items-center justify-between text-xs text-primary">
                      <span className="font-medium capitalize">{p.tipo}{p.categoria ? ` / ${p.categoria}` : ''}</span>
                      <span className="text-muted">{p.cantidad} paca{p.cantidad !== 1 ? 's' : ''} · {formatCurrency(p.precio_unitario)} c/u</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : selectedCotizacion.estado === 'pendiente' && (
              <div className="flex items-center gap-2 p-3 bg-warning/10 border border-warning/30 rounded-xl text-xs text-warning-dark">
                <AlertCircle size={14} className="flex-shrink-0 text-warning" />
                <span>Esta cotización no tiene pacas vinculadas al inventario. No podrá convertirse a venta.</span>
              </div>
            )}

            <div className="flex justify-end">
              <div className="w-full max-w-xs space-y-1 sm:space-y-2 text-right">
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-muted">Subtotal:</span>
                  <span>{formatCurrency(selectedCotizacion.subtotal)}</span>
                </div>
                <div className="flex justify-between text-xs sm:text-sm">
                  <span className="text-muted">Descuento:</span>
                  <span>-{formatCurrency(selectedCotizacion.descuento)}</span>
                </div>
                <div className="flex justify-between text-base sm:text-xl font-bold border-t pt-2">
                  <span>Total:</span>
                  <span className="text-primary">{formatCurrency(selectedCotizacion.total)}</span>
                </div>
              </div>
            </div>

            {selectedCotizacion.notas && (
              <div className="p-3 sm:p-4 bg-primary/5 rounded-xl">
                <p className="text-xs sm:text-sm text-muted mb-1">Notas:</p>
                <p className="text-xs sm:text-sm">{selectedCotizacion.notas}</p>
              </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-3 pt-4 border-t">
              <div className="flex flex-wrap gap-2">
                {getEstadoBadge(selectedCotizacion.estado)}
                <Button variant="outline" size="sm" onClick={() => generarPDF(selectedCotizacion)} icon={Download}>
                  PDF
                </Button>
              </div>
              {selectedCotizacion.estado === 'pendiente' && (
                <div className="flex flex-wrap gap-2 sm:justify-end">
                  <Button variant="ghost" size="sm" onClick={() => handleEliminar(selectedCotizacion.id)} icon={Trash2} className="text-error">
                    Eliminar
                  </Button>
                  <Button variant="secondary" size="sm" onClick={() => handleRechazar(selectedCotizacion.id)} icon={X}>
                    Rechazar
                  </Button>
                  <Button size="sm" onClick={handleConvertirVenta} icon={ShoppingCart}>
                    Convertir a Venta
                  </Button>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal: Convertir a venta (abono inicial) */}
      <Modal isOpen={convertModalOpen} onClose={() => setConvertModalOpen(false)} title="Convertir a venta" size="sm">
        <div className="space-y-4">
          <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-800 flex items-start gap-2">
            <Info size={14} className="flex-shrink-0 mt-0.5" />
            <span>Al convertir, las pacas pasan a <strong>vendida</strong> y se crea el despacho. Si registras un abono, se reflejará en la cartera del cliente. La salida física se confirma luego en Despachos.</span>
          </div>

          <div>
            <label className="block text-sm font-medium text-primary mb-1">Abono inicial (opcional)</label>
            <input type="number" min="0" step="0.01"
              value={convertForm.abono}
              onChange={(e) => setConvertForm({ ...convertForm, abono: e.target.value })}
              placeholder="0"
              className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Método</label>
              <select
                value={convertForm.metodo_pago}
                onChange={(e) => setConvertForm({ ...convertForm, metodo_pago: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30">
                <option value="efectivo">Efectivo</option>
                <option value="transferencia">Transferencia</option>
                <option value="cheque">Cheque</option>
                <option value="otro">Otro</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-primary mb-1">Cuenta</label>
              <select
                value={convertForm.cuenta_id}
                onChange={(e) => setConvertForm({ ...convertForm, cuenta_id: e.target.value })}
                className="w-full px-3 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30">
                <option value="">— Sin cuenta —</option>
                {cuentasBanco.map((cu) => <option key={cu.id} value={cu.id}>{cu.nombre}</option>)}
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setConvertModalOpen(false)}>Cancelar</Button>
            <Button size="sm" onClick={submitConvertirVenta} disabled={convertSubmitting} icon={ShoppingCart}>
              {convertSubmitting ? 'Convirtiendo…' : 'Confirmar venta'}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
