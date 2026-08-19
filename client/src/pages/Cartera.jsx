import { useEffect, useMemo, useState, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm, RefLink } from '../components/common';
import { api, qs, carteraApi, clientesApi, pagosApi, cuentasApi } from '../services/api';
import { METODOS_PAGO } from '../types';
import ExcelJS from 'exceljs';
import html2pdf from 'html2pdf.js';
import { Plus, Search, Wallet, TrendingDown, TrendingUp, Download, FileSpreadsheet, Upload, User, X, Edit2, Trash2, AlertTriangle, CheckCircle, Calendar } from 'lucide-react';
import { parseMonto, formatCOP } from '../lib/money';
import { hoy, aInputDate, formatFecha, formatFechaCorta } from '../lib/fecha';

// Agrupa los movimientos por cotización para el desglose de pagos (Nivel 2).
// Devuelve cada cotización con su venta, abonado, saldo y % pagado,
// más los movimientos "generales" (sin cotización atribuida).
function resumenPorCotizacion(movimientos = [], saldoInicial = 0) {
  const grupos = new Map();
  let generalAbonado = 0, generalVenta = 0;
  for (const m of movimientos) {
    const monto = parseFloat(m.monto) || 0;
    if (m.cotizacion_id) {
      if (!grupos.has(m.cotizacion_id)) {
        grupos.set(m.cotizacion_id, { cotizacion_id: m.cotizacion_id, cotizacion_numero: m.cotizacion_numero || null, venta: 0, abonadoDirecto: 0, fecha: m.fecha });
      }
      const g = grupos.get(m.cotizacion_id);
      if (m.cotizacion_numero && !g.cotizacion_numero) g.cotizacion_numero = m.cotizacion_numero;
      if (m.tipo === 'venta') g.venta += monto;
      else if (m.tipo === 'abono') g.abonadoDirecto += monto;
      if (m.fecha && (!g.fecha || new Date(m.fecha) < new Date(g.fecha))) g.fecha = m.fecha;
    } else {
      if (m.tipo === 'venta') generalVenta += monto;
      else if (m.tipo === 'abono') generalAbonado += monto;
    }
  }
  // Los abonos "generales" (sin cotización) se reparten sobre la deuda pendiente,
  // de la más antigua a la más nueva: 1º deuda de migración, 2º cotizaciones.
  // El sobrante queda como saldo a favor del cliente.
  let pool = generalAbonado;
  // 1) Deuda de migración (la más antigua de todas)
  const migDeuda = parseFloat(saldoInicial) || 0;
  const migAbonado = migDeuda > 0 ? Math.min(pool, migDeuda) : 0;
  pool -= migAbonado;
  const migracion = {
    deuda: migDeuda, abonado: migAbonado, saldo: migDeuda - migAbonado,
    pct: migDeuda > 0 ? Math.round((migAbonado / migDeuda) * 100) : 0,
  };
  // 2) Cotizaciones (más antigua primero)
  const ordenadas = [...grupos.values()].sort((a, b) => new Date(a.fecha || 0) - new Date(b.fecha || 0));
  const cotizaciones = ordenadas.map(g => {
    const saldoDirecto = g.venta - g.abonadoDirecto;
    let aplicadoGeneral = 0;
    if (pool > 0 && saldoDirecto > 0) {
      aplicadoGeneral = Math.min(pool, saldoDirecto);
      pool -= aplicadoGeneral;
    }
    const abonado = g.abonadoDirecto + aplicadoGeneral;
    const saldo = g.venta - abonado;
    return {
      cotizacion_id: g.cotizacion_id, cotizacion_numero: g.cotizacion_numero,
      venta: g.venta, abonado, abonadoDirecto: g.abonadoDirecto, aplicadoGeneral, saldo,
      pct: g.venta > 0 ? Math.round((abonado / g.venta) * 100) : (abonado > 0 ? 100 : 0),
    };
  });
  // Lo que sobró del pool tras cubrir migración + cotizaciones es el remanente (a favor).
  return { cotizaciones, migracion, generalAbonado, generalVenta, generalAbonadoRemanente: pool };
}

// Helpers de búsqueda universal dentro del detalle del cliente.
const _txt = (s) => String(s ?? '').toLowerCase();
const _digits = (s) => String(s ?? '').replace(/[^0-9]/g, '');
// Coincidencia de una venta-cotización contra la búsqueda (número, montos).
function matchVenta(c, q) {
  if (!q) return true;
  const ql = q.toLowerCase().trim();
  const qd = _digits(q);
  if (_txt(c.cotizacion_numero).includes(ql)) return true;
  if (qd && [c.venta, c.abonado, c.saldo, c.pct].some(v => _digits(v).includes(qd))) return true;
  return false;
}
// Coincidencia de un abono contra la búsqueda (fecha, monto, método, cuenta, cotización, referencia).
function matchAbono(m, q) {
  if (!q) return true;
  const ql = q.toLowerCase().trim();
  const qd = _digits(q);
  // formatFechaCorta ancla la fecha al mediodía; con new Date('2026-08-11') el
  // navegador restaba un día y buscar "11/08" no encontraba el abono de ese día.
  const fechaStr = `${String(m.fecha || '')} ${m.fecha ? formatFechaCorta(m.fecha) : ''}`.toLowerCase();
  const campos = [m.metodo_pago, m.cuenta_nombre, m.cotizacion_numero, m.despacho_numero, m.referencia, fechaStr];
  if (campos.some(v => _txt(v).includes(ql))) return true;
  if (qd && _digits(m.monto).includes(qd)) return true;
  return false;
}

// ── Lectura de CSV ───────────────────────────────────
// Un CSV exportado de Excel en Colombia usa ';' para separar columnas, porque la
// coma es el separador decimal ("1.500.000,50"). Partir por coma Y punto y coma
// rompía esos montos en dos celdas y corría todas las columnas siguientes.
function detectarDelimitador(primeraLinea = '') {
  let mejor = ',', maxConteo = 0;
  for (const d of [';', ',', '\t', '|']) {
    let conteo = 0, enComillas = false;
    for (const ch of primeraLinea) {
      if (ch === '"') enComillas = !enComillas;
      else if (ch === d && !enComillas) conteo++;
    }
    if (conteo > maxConteo) { maxConteo = conteo; mejor = d; }
  }
  return mejor;
}

// Parte una línea respetando las comillas: una razón social como
// "Textiles Cali, S.A.S." es UNA celda, no dos; sin esto se descuadraba el monto.
function partirLineaCSV(linea, delim) {
  const celdas = [];
  let actual = '', enComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const ch = linea[i];
    if (enComillas) {
      if (ch === '"') {
        if (linea[i + 1] === '"') { actual += '"'; i++; }  // comilla escapada ("")
        else enComillas = false;
      } else actual += ch;
    } else if (ch === '"' && actual === '') {
      // La comilla solo abre campo si es el PRIMER carácter de la celda. Si va
      // a mitad, es una pulgada: "Comercial 5\" x 3" es texto normal y antes
      // se tragaba el resto de la línea como si fuera un campo entrecomillado.
      enComillas = true;
    } else if (ch === delim) {
      celdas.push(actual.trim()); actual = '';
    } else actual += ch;
  }
  celdas.push(actual.trim());
  return celdas;
}

// parseMonto (lib/money) resuelve bien "1.500.000,50", pero devuelve 1.25 para
// "1,250,000": trata la coma como decimal y además solo reemplaza la primera.
// En un CSV exportado en inglés eso convierte una deuda de un millón en $1,25
// y la importa sin avisar (1.25 > 0, así que pasa la validación).
// Con DOS o más comas y ningún punto la coma solo puede ser separador de miles,
// así que se quitan antes de parsear. El caso ambiguo de una sola coma
// ("1,250") se deja tal cual para no contradecir a lib/money.
function parseMontoCSV(valor) {
  const s = String(valor ?? '').trim();
  const comas = (s.match(/,/g) || []).length;
  return comas >= 2 && !s.includes('.')
    ? parseMonto(s.replace(/,/g, ''))
    : parseMonto(s);
}

export default function Cartera() {
  const [carteraOriginal, setCarteraOriginal] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [detalleCliente, setDetalleCliente] = useState(null);
  const [editandoAbono, setEditandoAbono] = useState(null); // { id, monto, fecha, metodo_pago, referencia, cotizacion_id }
  const [formData, setFormData] = useState({
    cliente_id: '', monto: '', fecha: hoy(), metodo_pago: 'efectivo', cuenta_id: '', cotizacion_id: '', referencia: '', clase: 'pago', descripcion: ''
  });
  const [cotizacionesCliente, setCotizacionesCliente] = useState([]); // cotizaciones-venta del cliente (para atribuir abono)
  const [detalleTab, setDetalleTab] = useState('ventas'); // pestaña activa del modal de detalle: 'ventas' | 'abonos'
  const [detalleBusqueda, setDetalleBusqueda] = useState(''); // búsqueda dentro del detalle del cliente
  const [saldoCliente, setSaldoCliente] = useState(null); // saldo pendiente del cliente seleccionado
  const [clientes, setClientes] = useState([]);
  const [cuentasBanco, setCuentasBanco] = useState([]);
  const [clienteSearch, setClienteSearch] = useState('');
  const [showClienteList, setShowClienteList] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [fechaCorte, setFechaCorte] = useState(''); // '' = saldo de hoy; 'YYYY-MM-DD' = foto al pasado
  const [error, setError] = useState('');
  const [enviando, setEnviando] = useState(false);

  // Carga histórica (legacy)
  const [legacyModalOpen, setLegacyModalOpen] = useState(false);
  const [legacyTab, setLegacyTab] = useState('manual'); // 'manual' | 'csv'
  const [legacyRows, setLegacyRows] = useState([]); // [{ cliente_id, tipo, fecha, monto, cuenta_id, referencia }]
  const [legacyManual, setLegacyManual] = useState({ cliente_id: '', tipo: 'venta', fecha: hoy(), monto: '', cuenta_id: '', referencia: '' });
  const [legacySubmitting, setLegacySubmitting] = useState(false);
  const legacyFileRef = useRef(null);

  const clienteListRef = useRef(null);
  // Última foto pedida. Cambiar la fecha dos veces seguidas lanza dos consultas;
  // si la primera (más lenta) contestaba de última, la pantalla quedaba con los
  // saldos de julio mientras el aviso decía otra fecha. Se descarta la tardía.
  const corteEnCursoRef = useRef('');
  const { addToast } = useToast();
  const confirm = useConfirm();

  // Cerrar lista de clientes al hacer click fuera
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (clienteListRef.current && !clienteListRef.current.contains(event.target)) {
        setShowClienteList(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    cuentasApi.getAll().then(setCuentasBanco).catch(() => {});
  }, []);

  // Al cambiar la fecha de corte se recarga la cartera con esa foto.
  // Con el corte vacío (montaje inicial) trae el saldo de hoy, como siempre.
  useEffect(() => {
    loadCartera(fechaCorte);
  }, [fechaCorte]);

  // Deep-link: ?focus=<cliente_id> abre el detalle de cartera de ese cliente (trazabilidad)
  const [searchParams, setSearchParams] = useSearchParams();
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus) return;
    openDetalle(focus);
    setSearchParams({}, { replace: true });
  }, [searchParams]);

  // La búsqueda era estado derivado (useEffect + setCartera): cada tecla
  // provocaba DOS renders y obligaba a mantener dos copias de la lista.
  // Con useMemo se filtra durante el render y el texto se pasa a minúsculas
  // una sola vez, no tres veces por cliente.
  const cartera = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return carteraOriginal;
    return carteraOriginal.filter(c =>
      c.nombre?.toLowerCase().includes(q) ||
      c.ciudad?.toLowerCase().includes(q) ||
      c.telefono?.toLowerCase().includes(q)
    );
  }, [searchQuery, carteraOriginal]);

  // El detalle recalculaba resumenPorCotizacion en CADA render (recorre todos
  // los movimientos y ordena por fecha). Memoizado, solo se rehace cuando
  // cambian los movimientos del cliente o el texto de búsqueda.
  const vistaVentas = useMemo(() => {
    if (!detalleCliente) return null;
    const resumen = resumenPorCotizacion(detalleCliente.movimientos, detalleCliente.saldo_inicial);
    const q = detalleBusqueda.trim();
    const qd = _digits(q);
    const ql = q.toLowerCase();
    const cotizaciones = resumen.cotizaciones.filter(c => matchVenta(c, q));
    const mostrarMig = resumen.migracion.deuda > 0 && (!q
      || 'migracion migración deuda inicial'.includes(ql)
      || (!!qd && (_digits(resumen.migracion.deuda).includes(qd) || _digits(resumen.migracion.saldo).includes(qd))));
    const mostrarGeneral = (resumen.generalVenta > 0 || resumen.generalAbonadoRemanente > 0) && (!q
      || 'general sin cotizacion otras remanente'.includes(ql)
      || (!!qd && (_digits(resumen.generalVenta).includes(qd) || _digits(resumen.generalAbonadoRemanente).includes(qd))));
    return { resumen, cotizaciones, mostrarMig, mostrarGeneral, q };
  }, [detalleCliente, detalleBusqueda]);

  // El mismo filtro de abonos se ejecutaba dos veces por render (una para saber
  // si estaba vacío y otra para pintarlo), y matchAbono formatea una fecha por
  // movimiento, que es de lo más caro que hay.
  const abonosFiltrados = useMemo(
    () => (detalleCliente?.movimientos || []).filter(m => m.tipo === 'abono' && matchAbono(m, detalleBusqueda)),
    [detalleCliente, detalleBusqueda]
  );

  // corte vacío = saldo de hoy (comportamiento de siempre); con fecha, el
  // backend reconstruye el saldo con los movimientos hasta ese día.
  const loadCartera = async (corte = '') => {
    corteEnCursoRef.current = corte;
    try {
      setLoading(true);
      const data = await api.get('/cartera' + qs({ fecha_corte: corte }));
      // Respuesta de una foto que ya nadie está mirando: pintarla mostraría
      // saldos de otra fecha bajo el aviso equivocado.
      if (corteEnCursoRef.current !== corte) return;
      setCarteraOriginal(data);
    } catch (err) {
      if (corteEnCursoRef.current !== corte) return;
      addToast(err.message, 'error');
    } finally {
      if (corteEnCursoRef.current === corte) setLoading(false);
    }
  };

  const openDetalle = async (clienteId) => {
    try {
      const data = await carteraApi.getOne(clienteId);
      setDetalleCliente(data);
      setDetalleTab('ventas');
      setDetalleBusqueda('');
    } catch (err) {
      setError(err.message);
    }
  };

  const openPagoModal = async () => {
    try {
      const data = await clientesApi.getAll({ estado: 'activo' });
      setClientes(data);
      setFormData({
        cliente_id: '',
        monto: '',
        fecha: hoy(),
        metodo_pago: 'efectivo',
        cuenta_id: '',
        cotizacion_id: '',
        referencia: ''
      });
      setClienteSearch('');
      setSaldoCliente(null);
      setCotizacionesCliente([]);
      setError('');
      setModalOpen(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Abrir el modal de abono con el cliente ya seleccionado (desde su cartera)
  const openPagoModalParaCliente = async (cliente) => {
    try {
      const data = await clientesApi.getAll({ estado: 'activo' });
      setClientes(data);
      setFormData({
        cliente_id: cliente.id, monto: '', fecha: hoy(),
        metodo_pago: 'efectivo', cuenta_id: '', cotizacion_id: '', referencia: '', clase: 'pago', descripcion: ''
      });
      setClienteSearch(cliente.nombre || '');
      setError('');
      await cargarSaldoCliente(cliente.id);
      setModalOpen(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  // Abrir el modal de abono pre-atribuido a una cotización específica
  const openPagoModalConCotizacion = async (cliente, cotizacionId) => {
    await openPagoModalParaCliente(cliente);
    setFormData(prev => ({ ...prev, cotizacion_id: cotizacionId ? String(cotizacionId) : '' }));
  };

  // Cargar saldo del cliente seleccionado para mostrar aviso de sobreabono
  const cargarSaldoCliente = async (clienteId) => {
    if (!clienteId) { setSaldoCliente(null); setCotizacionesCliente([]); return; }
    try {
      const data = await carteraApi.getOne(clienteId);
      setSaldoCliente(data.saldo_pendiente);
      setCotizacionesCliente(resumenPorCotizacion(data.movimientos, data.saldo_inicial).cotizaciones);
    } catch {
      setSaldoCliente(null);
      setCotizacionesCliente([]);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Sin esta bandera, un doble clic registra el abono dos veces: el botón es
    // type="submit" y el guard del componente Button no alcanza a frenar el
    // submit nativo del formulario.
    if (enviando) return;
    setError('');

    if (!formData.cliente_id) {
      setError('Selecciona un cliente');
      return;
    }
    if (!formData.monto || parseFloat(formData.monto) <= 0) {
      setError('El monto debe ser mayor a cero');
      return;
    }

    try {
      setEnviando(true);
      await pagosApi.create({
        cliente_id: parseInt(formData.cliente_id),
        monto: parseFloat(formData.monto),
        fecha: formData.fecha,
        metodo_pago: formData.metodo_pago,
        cuenta_id: formData.cuenta_id ? parseInt(formData.cuenta_id) : null,
        cotizacion_id: formData.cotizacion_id ? parseInt(formData.cotizacion_id) : null,
        referencia: formData.referencia,
        clase: formData.clase,
        descripcion: formData.descripcion,
      });

      addToast(
        `${formData.clase === 'descuento' ? 'Descuento' : 'Abono'} de ${new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(parseFloat(formData.monto))} registrado correctamente`,
        'success'
      );

      setModalOpen(false);
      setSaldoCliente(null);
      loadCartera(fechaCorte);
      // Si el detalle del mismo cliente está abierto detrás, refrescarlo
      if (detalleCliente?.cliente?.id === parseInt(formData.cliente_id)) {
        try {
          const data = await carteraApi.getOne(detalleCliente.cliente.id);
          setDetalleCliente(data);
        } catch {}
      }
    } catch (err) {
      setError(err.message);
      addToast('Error al registrar el abono: ' + err.message, 'error');
    } finally {
      setEnviando(false);
    }
  };

  // Eliminar abono desde el modal de detalle
  const handleEliminarAbono = async (abonoId) => {
    const ok = await confirm({
      title: '¿Eliminar abono?',
      message: 'Esta acción no se puede deshacer. El saldo del cliente se recalculará automáticamente.',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await pagosApi.delete(abonoId);
      addToast('Abono eliminado', 'success');
      // Recargar detalle
      const data = await carteraApi.getOne(detalleCliente.cliente.id);
      setDetalleCliente(data);
      loadCartera(fechaCorte);
    } catch (err) {
      addToast('Error al eliminar: ' + err.message, 'error');
    }
  };

  // Guardar edición de abono
  const handleGuardarEdicionAbono = async () => {
    if (!editandoAbono || !editandoAbono.monto || parseFloat(editandoAbono.monto) <= 0) {
      addToast('El monto debe ser mayor a cero', 'error');
      return;
    }
    try {
      await pagosApi.update(editandoAbono.id, {
        monto: parseFloat(editandoAbono.monto),
        fecha: editandoAbono.fecha,
        metodo_pago: editandoAbono.metodo_pago,
        cotizacion_id: editandoAbono.cotizacion_id || null,
        referencia: editandoAbono.referencia,
      });
      addToast('Abono actualizado', 'success');
      setEditandoAbono(null);
      const data = await carteraApi.getOne(detalleCliente.cliente.id);
      setDetalleCliente(data);
      loadCartera(fechaCorte);
    } catch (err) {
      addToast('Error al actualizar: ' + err.message, 'error');
    }
  };

  const exportarExcel = async (clienteId, clienteNombre) => {
    try {
      const data = await carteraApi.exportOne(clienteId);
      
      const wb = new ExcelJS.Workbook();
      wb.creator = 'Comercio Global Logístico';
      wb.created = new Date();
      
      const primaryColor = '0f172a';
      const secondaryColor = '6366f1';
      const accentColor = 'ef4444';
      const successColor = '16a34a';
      
      const fmt = (val) => formatCurrency(val);
      
      const ws = wb.addWorksheet('Estado de Cuenta');
      ws.properties.tabColor = secondaryColor;
      
      ws.mergeCells('A1:I1');
      const titleCell = ws.getCell('A1');
      titleCell.value = '🌐 Comercio Global Logístico - Estado de Cuenta';
      titleCell.font = { size: 18, bold: true, color: { argb: 'FFFFFF' } };
      titleCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };
      ws.getRow(1).height = 30;
      
      ws.mergeCells('A2:I2');
      ws.getCell('A2').value = data.cliente.nombre;
      ws.getCell('A2').font = { size: 14, bold: true, color: { argb: primaryColor } };
      ws.getCell('A2').alignment = { horizontal: 'center' };
      
      ws.mergeCells('A3:I3');
      ws.getCell('A3').value = `Generado: ${new Date().toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' })}`;
      ws.getCell('A3').font = { size: 10, italic: true, color: { argb: '666666' } };
      ws.getCell('A3').alignment = { horizontal: 'center' };
      
      ws.getColumn(1).width = 14;
      ws.getColumn(2).width = 12;
      ws.getColumn(3).width = 25;
      ws.getColumn(4).width = 14;
      ws.getColumn(5).width = 14;
      ws.getColumn(6).width = 16;
      ws.getColumn(7).width = 14;
      ws.getColumn(8).width = 16;
      ws.getColumn(9).width = 16;
      
      let row = 5;
      
      ws.getCell(`A${row}`).value = 'Información del Cliente';
      ws.getCell(`A${row}`).font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
      ws.mergeCells(`A${row}:I${row}`);
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row++;
      
      const infoFields = [
        ['Teléfono:', data.cliente.telefono || '-', 'Ciudad:', data.cliente.ciudad || '-'],
        ['Dirección:', data.cliente.direccion || '-', 'Tipo:', data.cliente.tipo_cliente?.toUpperCase() || '-'],
      ];
      
      for (const [label1, val1, label2, val2] of infoFields) {
        ws.getCell(`A${row}`).value = label1;
        ws.getCell(`A${row}`).font = { bold: true };
        ws.getCell(`B${row}`).value = val1;
        ws.getCell(`C${row}`).value = label2;
        ws.getCell(`C${row}`).font = { bold: true };
        ws.getCell(`D${row}`).value = val2;
        ws.mergeCells(`B${row}:B${row}`);
        ws.mergeCells(`D${row}:I${row}`);
        row++;
      }
      
      row++;
      
      ws.getCell(`A${row}`).value = 'Resumen de Cuenta';
      ws.getCell(`A${row}`).font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: secondaryColor } };
      ws.mergeCells(`A${row}:I${row}`);
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row++;
      
      const kpis = [
        { label: 'Total Vendido', value: data.total_vendido, color: primaryColor },
        { label: 'Total Abonado', value: data.total_abonado, color: successColor },
        { label: 'SALDO PENDIENTE', value: data.saldo_pendiente, color: accentColor },
      ];
      
      for (const kpi of kpis) {
        ws.getCell(`A${row}`).value = kpi.label;
        ws.getCell(`A${row}`).font = { bold: true, size: 11 };
        ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'f5f5f5' } };
        
        ws.getCell(`B${row}`).value = kpi.value;
        ws.getCell(`B${row}`).font = { bold: true, size: 14, color: { argb: kpi.color } };
        ws.getCell(`B${row}`).numFmt = '$#,##0.00';
        ws.getCell(`B${row}`).alignment = { horizontal: 'right' };
        ws.mergeCells(`B${row}:I${row}`);
        row++;
      }
      
      row++;
      
      ws.getCell(`A${row}`).value = 'Movimientos';
      ws.getCell(`A${row}`).font = { size: 12, bold: true, color: { argb: 'FFFFFF' } };
      ws.getCell(`A${row}`).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
      ws.mergeCells(`A${row}:I${row}`);
      ws.getCell(`A${row}`).alignment = { horizontal: 'center' };
      row++;
      
      // Cada venta se abre en sus líneas de producto, para que el cliente vea
      // exactamente QUÉ compró y no solo cuánto debe.
      const headers = ['Fecha', 'Tipo', 'Descripción', 'Referencia', 'Calidad', 'Cantidad', 'Precio unit.', 'Monto', 'Saldo'];
      headers.forEach((h, i) => {
        const cell = ws.getCell(`${String.fromCharCode(65 + i)}${row}`);
        cell.value = h;
        cell.font = { bold: true, color: { argb: 'FFFFFF' } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: primaryColor } };
        cell.alignment = { horizontal: 'center' };
      });
      row++;

      for (const m of data.movimientos) {
        const esVenta = m.tipo === 'VENTA';
        ws.getCell(`A${row}`).value = new Date(m.fecha);
        ws.getCell(`A${row}`).numFmt = 'dd/mm/yyyy';

        ws.getCell(`B${row}`).value = m.tipo;
        ws.getCell(`B${row}`).font = { bold: true, color: { argb: esVenta ? primaryColor : successColor } };

        ws.getCell(`C${row}`).value = esVenta
          ? m.descripcion.split(' - ')[0]                       // solo "Venta #1a2b3c4d"
          : `${m.descripcion}${m.metodo_pago ? ` · ${m.metodo_pago}` : ''}${m.referencia ? ` · ${m.referencia}` : ''}`;

        ws.getCell(`H${row}`).value = parseFloat(m.monto);
        ws.getCell(`H${row}`).numFmt = '$#,##0';
        ws.getCell(`H${row}`).font = { bold: true, color: { argb: esVenta ? primaryColor : successColor } };
        ws.getCell(`H${row}`).alignment = { horizontal: 'right' };

        ws.getCell(`I${row}`).value = parseFloat(m.saldo);
        ws.getCell(`I${row}`).numFmt = '$#,##0';
        ws.getCell(`I${row}`).font = { bold: true };
        ws.getCell(`I${row}`).alignment = { horizontal: 'right' };

        // Fondo suave en la fila de la venta para separarla de su detalle
        if (esVenta) {
          for (let c = 0; c < 9; c++) {
            const cell = ws.getCell(`${String.fromCharCode(65 + c)}${row}`);
            if (!cell.fill || cell.fill.type !== 'pattern') {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'eef0fe' } };
            }
          }
        }
        row++;

        // Detalle: una línea por referencia + calidad con su cantidad
        for (const d of (m.detalles || [])) {
          ws.getCell(`C${row}`).value = '↳';
          ws.getCell(`C${row}`).alignment = { horizontal: 'right' };
          ws.getCell(`C${row}`).font = { color: { argb: '94a3b8' } };

          ws.getCell(`D${row}`).value = d.referencia || '—';
          ws.getCell(`E${row}`).value = d.calidad || '—';

          ws.getCell(`F${row}`).value = d.cantidad;
          ws.getCell(`F${row}`).alignment = { horizontal: 'center' };
          ws.getCell(`F${row}`).font = { bold: true };

          ws.getCell(`G${row}`).value = d.precio_unitario;
          ws.getCell(`G${row}`).numFmt = '$#,##0';
          ws.getCell(`G${row}`).alignment = { horizontal: 'right' };

          ws.getCell(`H${row}`).value = d.subtotal;
          ws.getCell(`H${row}`).numFmt = '$#,##0';
          ws.getCell(`H${row}`).alignment = { horizontal: 'right' };
          ws.getCell(`H${row}`).font = { color: { argb: '64748b' } };

          for (let c = 0; c < 9; c++) {
            ws.getCell(`${String.fromCharCode(65 + c)}${row}`).font = {
              size: 10,
              color: { argb: '475569' },
              bold: c === 5,
            };
          }
          row++;
        }
      }
      
      row++;
      ws.getCell(`A${row}`).value = `Documento generado el ${new Date().toLocaleString('es-MX')}`;
      ws.getCell(`A${row}`).font = { size: 9, italic: true, color: { argb: '999999' } };
      ws.mergeCells(`A${row}:I${row}`);
      
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `Estado_Cuenta_${data.cliente.nombre.replace(/\s+/g, '_')}_${hoy()}.xlsx`;
      link.click();
      
      addToast('Excel descargado correctamente', 'success');
    } catch (err) {
      setError('Error al exportar: ' + err.message);
    }
  };
  
  const exportarPDF = async (clienteId, clienteNombre) => {
    try {
      const data = await carteraApi.exportOne(clienteId);
      
      const contenido = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <title>Estado de Cuenta - ${data.cliente.nombre}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { font-family: 'Segoe UI', Arial, sans-serif; padding: 20px; color: #0f172a; }
            .header { text-align: center; margin-bottom: 20px; padding-bottom: 15px; border-bottom: 2px solid #6366f1; }
            .header h1 { color: #0f172a; font-size: 24px; margin-bottom: 5px; }
            .header .subtitle { color: #64748b; font-size: 14px; }
            .info-cliente { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .info-cliente h3 { color: #6366f1; margin-bottom: 10px; }
            .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
            .info-grid span { font-size: 13px; }
            .info-grid strong { color: #333; }
            .resumen { background: #0f172a; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
            .resumen h3 { color: #818cf8; margin-bottom: 15px; }
            .resumen-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; text-align: center; }
            .resumen-item .label { font-size: 12px; opacity: 0.8; }
            .resumen-item .value { font-size: 20px; font-weight: bold; }
            .resumen-item.total .value { color: #818cf8; }
            .resumen-item.abonado .value { color: #16a34a; }
            .resumen-item.pendiente .value { color: #ef4444; }
            table { width: 100%; border-collapse: collapse; margin-top: 20px; }
            th { background: #0f172a; color: white; padding: 12px; text-align: left; font-size: 12px; }
            td { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 12px; }
            tr.venta td { color: #0f172a; }
            tr.abono td { color: #16a34a; }
            tr.venta td:nth-child(4) { font-weight: bold; }
            tr.abono td:nth-child(4) { font-weight: bold; }
            .saldo-col { text-align: right; font-weight: bold; }
            .footer { margin-top: 30px; text-align: center; color: #999; font-size: 10px; }
            @media print { body { padding: 0; } }
          </style>
        </head>
        <body>
          <div class="header">
            <h1>🌐 Comercio Global Logístico</h1>
            <div class="subtitle">Estado de Cuenta</div>
          </div>
          
          <div class="info-cliente">
            <h3>Información del Cliente</h3>
            <div class="info-grid">
              <span><strong>Nombre:</strong> ${data.cliente.nombre}</span>
              <span><strong>Teléfono:</strong> ${data.cliente.telefono || '-'}</span>
              <span><strong>Ciudad:</strong> ${data.cliente.ciudad || '-'}</span>
              <span><strong>Tipo:</strong> ${data.cliente.tipo_cliente || '-'}</span>
              <span><strong>Dirección:</strong> ${data.cliente.direccion || '-'}</span>
            </div>
          </div>
          
          <div class="resumen">
            <h3>Resumen de Cuenta</h3>
            <div class="resumen-grid">
              <div class="resumen-item total">
                <div class="label">Total Vendido</div>
                <div class="value">${formatCurrency(data.total_vendido)}</div>
              </div>
              <div class="resumen-item abonado">
                <div class="label">Total Abonado</div>
                <div class="value">${formatCurrency(data.total_abonado)}</div>
              </div>
              <div class="resumen-item pendiente">
                <div class="label">Saldo Pendiente</div>
                <div class="value">${formatCurrency(data.saldo_pendiente)}</div>
              </div>
            </div>
          </div>
          
          <table>
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th>Descripción</th>
                <th style="text-align:right">Monto</th>
                <th>Método</th>
                <th>Referencia</th>
                <th style="text-align:right">Saldo</th>
              </tr>
            </thead>
            <tbody>
              ${data.movimientos.map(m => `
                <tr class="${m.tipo === 'VENTA' ? 'venta' : 'abono'}">
                  <td>${new Date(m.fecha).toLocaleDateString('es-MX')}</td>
                  <td>${m.tipo}</td>
                  <td>${m.descripcion}</td>
                  <td style="text-align:right">${m.tipo === 'VENTA' ? '+' : '-'}${formatCurrency(m.monto)}</td>
                  <td>${m.metodo_pago || '-'}</td>
                  <td>${m.referencia || '-'}</td>
                  <td class="saldo-col">${formatCurrency(m.saldo)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
          
          <div class="footer">
            Documento generado el ${new Date().toLocaleString('es-MX')}
          </div>
        </body>
        </html>
      `;
      
      const opt = {
        margin:       10,
        filename:     `Cartera_${data.cliente.nombre.replace(/\s+/g, '_')}_${hoy()}.pdf`,
        image:        { type: 'jpeg', quality: 0.98 },
        html2canvas:  { scale: 2 },
        jsPDF:        { unit: 'mm', format: 'letter', orientation: 'landscape' }
      };
      
      const element = document.createElement('div');
      element.innerHTML = contenido;
      
      html2pdf().set(opt).from(element).save().then(() => {
        addToast('PDF descargado', 'success');
      }).catch(e => {
        setError('Error al generar PDF: ' + e.message);
      });
    } catch (err) {
      setError('Error al exportar PDF: ' + err.message);
    }
  };

  const formatCurrency = formatCOP;

  // ── Carga histórica (legacy) ──────────────────────────────────
  const openLegacyModal = async () => {
    try {
      const data = await clientesApi.getAll({ estado: 'activo' });
      setClientes(data);
      setLegacyTab('manual');
      setLegacyRows([]);
      setLegacyManual({ cliente_id: '', tipo: 'venta', fecha: hoy(), monto: '', cuenta_id: '', referencia: '' });
      setError('');
      setLegacyModalOpen(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const clienteNombre = (id) => clientes.find(c => String(c.id) === String(id))?.nombre || `#${id}`;
  const cuentaNombre = (id) => cuentasBanco.find(c => String(c.id) === String(id))?.nombre || '';

  const addLegacyManualRow = () => {
    if (!legacyManual.cliente_id) { addToast('Selecciona un cliente', 'error'); return; }
    if (!legacyManual.monto || parseFloat(legacyManual.monto) <= 0) { addToast('Monto inválido', 'error'); return; }
    setLegacyRows(prev => [...prev, {
      cliente_id: parseInt(legacyManual.cliente_id),
      tipo: legacyManual.tipo,
      fecha: legacyManual.fecha,
      monto: parseFloat(legacyManual.monto),
      cuenta_id: legacyManual.cuenta_id ? parseInt(legacyManual.cuenta_id) : null,
      referencia: legacyManual.referencia || 'LEGACY',
    }]);
    setLegacyManual(m => ({ ...m, monto: '', referencia: '' }));
  };

  const removeLegacyRow = (idx) => setLegacyRows(prev => prev.filter((_, i) => i !== idx));

  // Importa CSV o Excel. Columnas esperadas: cliente, tipo, fecha, monto, cuenta, referencia.
  const handleLegacyFile = async (file) => {
    if (!file) return;
    try {
      const matchCliente = (val) => {
        if (val == null) return null;
        const s = String(val).trim();
        if (/^\d+$/.test(s)) return parseInt(s);
        const c = clientes.find(cl => cl.nombre?.trim().toLowerCase() === s.toLowerCase());
        return c ? c.id : null;
      };
      const matchCuenta = (val) => {
        if (!val) return null;
        const s = String(val).trim();
        if (/^\d+$/.test(s)) return parseInt(s);
        const c = cuentasBanco.find(cb => cb.nombre?.trim().toLowerCase() === s.toLowerCase());
        return c ? c.id : null;
      };
      const parseFecha = (val) => {
        if (!val) return hoy();
        // Las celdas de fecha de Excel llegan como Date: se leen en local para
        // que un 11/08 no se registre como 10/08.
        if (val instanceof Date) return aInputDate(val);
        const s = String(val).trim();
        // dd/mm/yyyy → yyyy-mm-dd
        const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
        if (m) {
          const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3];
          return `${yyyy}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
        }
        return s;
      };

      const rawRows = [];
      const isExcel = /\.(xlsx|xls)$/i.test(file.name);
      if (isExcel) {
        const wb = new ExcelJS.Workbook();
        await wb.xlsx.load(await file.arrayBuffer());
        const ws = wb.worksheets[0];
        ws.eachRow((row, rowNumber) => {
          if (rowNumber === 1) return; // header
          const vals = row.values; // 1-indexed
          rawRows.push([vals[1], vals[2], vals[3], vals[4], vals[5], vals[6]]);
        });
      } else {
        // \uFEFF: Excel antepone una marca invisible que ensuciaba la 1ª columna.
        const text = (await file.text()).replace(/^\uFEFF/, '');
        const lines = text.split(/\r?\n/).filter(l => l.trim());
        // Excel escribe a veces una línea "sep=;" antes del encabezado.
        if (/^sep=./i.test(lines[0] || '')) lines.shift();
        const delim = detectarDelimitador(lines[0] || '');
        lines.slice(1).forEach(line => rawRows.push(partirLineaCSV(line, delim)));
      }

      const parsed = [];
      const errores = [];
      rawRows.forEach((cells, i) => {
        const [cli, tipo, fecha, monto, cuenta, ref] = cells;
        const cliente_id = matchCliente(cli);
        const tipoNorm = String(tipo || '').trim().toLowerCase().startsWith('v') ? 'venta' : 'abono';
        const montoNum = parseMontoCSV(monto);
        if (!cliente_id) { errores.push(`Fila ${i + 2}: cliente "${cli}" no encontrado`); return; }
        if (!montoNum || montoNum <= 0) { errores.push(`Fila ${i + 2}: monto inválido`); return; }
        parsed.push({
          cliente_id,
          tipo: tipoNorm,
          fecha: parseFecha(fecha),
          monto: montoNum,
          cuenta_id: matchCuenta(cuenta),
          referencia: (ref && String(ref).trim()) || 'LEGACY',
        });
      });

      if (errores.length) addToast(`${errores.length} fila(s) con errores omitidas`, 'warning');
      if (!parsed.length) { addToast('No se pudo leer ningún registro válido', 'error'); return; }
      setLegacyRows(prev => [...prev, ...parsed]);
      addToast(`${parsed.length} registro(s) cargado(s) del archivo`, 'success');
    } catch (err) {
      addToast('Error al leer el archivo: ' + err.message, 'error');
    } finally {
      if (legacyFileRef.current) legacyFileRef.current.value = '';
    }
  };

  const submitLegacy = async () => {
    if (!legacyRows.length) { addToast('No hay registros para importar', 'error'); return; }
    try {
      setLegacySubmitting(true);
      await carteraApi.importarLegacy(legacyRows);
      addToast(`${legacyRows.length} movimiento(s) histórico(s) importado(s)`, 'success');
      setLegacyModalOpen(false);
      setLegacyRows([]);
      loadCartera(fechaCorte);
    } catch (err) {
      addToast('Error al importar: ' + err.message, 'error');
    } finally {
      setLegacySubmitting(false);
    }
  };

  return (
    <Layout title="Cartera" subtitle="Estado de cuentas por cobrar" actions={
      <div className="flex items-center gap-2">
        <Button onClick={openLegacyModal} variant="ghost" title="Cargar histórico">
          <Upload size={18} /> <span className="hidden sm:inline">Cargar histórico</span>
        </Button>
        <Button onClick={openPagoModal} variant="secondary" title="Registrar abono">
          <Plus size={18} /> <span className="hidden sm:inline">Registrar Abono</span>
        </Button>
      </div>
    }>
      <div className="space-y-4">
        {error && (
          <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>
        )}

        {/* Cartera a una fecha pasada: hace falta poder ver cuánto debía cada
            cliente el 31 de julio, no solo hoy. Vacío = saldo de hoy. */}
        <div className="flex flex-wrap items-center gap-3 p-3 rounded-xl border border-border bg-surface">
          <label htmlFor="fecha-corte" className="flex items-center gap-2 text-sm font-medium text-primary">
            <Calendar size={18} className="text-secondary shrink-0" />
            Ver saldos al día
          </label>
          <input
            id="fecha-corte"
            type="date"
            value={fechaCorte}
            max={hoy()}
            onChange={(e) => setFechaCorte(e.target.value)}
            className="px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
          />
          {fechaCorte ? (
            <Button size="sm" variant="ghost" onClick={() => setFechaCorte('')}>
              <X size={14} /> Volver a hoy
            </Button>
          ) : (
            <span className="text-xs text-muted">Déjalo vacío para ver el saldo de hoy.</span>
          )}
        </div>

        {fechaCorte && (
          <div className="flex items-start gap-2 p-3 rounded-xl border border-amber-300 bg-amber-50 text-amber-800 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <span>
              Estás viendo una <strong>foto del pasado</strong>: estos son los saldos del{' '}
              <strong>{formatFecha(fechaCorte)}</strong>, no los de hoy. No incluye las ventas ni los
              abonos posteriores a esa fecha. Si abres un cliente, su detalle sí muestra la situación actual.
            </span>
          </div>
        )}

        {/* Barra de búsqueda */}
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            placeholder="Buscar cliente por nombre, ciudad o teléfono..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-12 pr-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-4 top-1/2 -translate-y-1/2 text-muted hover:text-primary"
            >
              <X size={18} />
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {loading ? (
            <div className="col-span-3 flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
          ) : cartera.length === 0 ? (
            /* Antes decía siempre "No hay cartera": con una búsqueda sin
               resultados parecía que se hubieran perdido todos los clientes. */
            <div className="col-span-3 text-center py-10 text-muted">
              {searchQuery.trim() ? (
                <>
                  <p className="text-sm">Ningún cliente coincide con "<strong>{searchQuery.trim()}</strong>".</p>
                  <button onClick={() => setSearchQuery('')} className="mt-2 text-sm text-secondary hover:underline">
                    Limpiar la búsqueda
                  </button>
                </>
              ) : (
                <p className="text-sm">
                  {fechaCorte
                    ? `Ningún cliente tenía cartera al ${formatFecha(fechaCorte)}.`
                    : 'Todavía no hay clientes con cartera.'}
                </p>
              )}
            </div>
          ) : (
            cartera.map((c) => (
              <Card key={c.id} hover className="animate-fade-in" onClick={() => openDetalle(c.id)}>
                <CardBody>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="font-display text-lg text-primary">{c.nombre}</h3>
                      <p className="text-sm text-gray-500">{c.ciudad || 'Sin ciudad'}</p>
                    </div>
                    <Badge variant={c.tipo_cliente}>{c.tipo_cliente}</Badge>
                  </div>
                  <div className="space-y-2 pt-3 border-t border-gray-100">
                    {parseFloat(c.saldo_inicial) > 0 && (
                      <div className="flex justify-between items-start text-sm gap-2 pb-2 border-b border-orange-100">
                        <span className="text-orange-500 shrink-0 font-medium">Deuda migración</span>
                        <span className="text-orange-600 font-semibold text-right break-all">{formatCurrency(c.saldo_inicial)}</span>
                      </div>
                    )}
                    <div className="flex justify-between items-start text-sm gap-2">
                      <span className="text-gray-500 shrink-0">Total Vendido</span>
                      <span className="text-primary text-right break-all">{formatCurrency(c.total_vendido)}</span>
                    </div>
                    <div className="flex justify-between items-start text-sm gap-2">
                      <span className="text-gray-500 shrink-0">Total Abonado</span>
                      <span className="text-success text-right break-all">{formatCurrency(c.total_abonado)}</span>
                    </div>
                    <div className="flex justify-between items-start pt-2 border-t border-gray-100 gap-2">
                      <span className="font-medium shrink-0">Saldo Pendiente</span>
                      <span className="font-display text-lg text-accent text-right break-all">{formatCurrency(c.saldo_pendiente)}</span>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>
      </div>

      <Modal isOpen={!!detalleCliente} onClose={() => setDetalleCliente(null)} title={detalleCliente?.cliente?.nombre} size="lg">
        {detalleCliente && (
          <div className="space-y-4">
            {/* Resumen de cuenta */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-gray-50 rounded-lg">
              {parseFloat(detalleCliente.saldo_inicial) > 0 && (
                <div className="col-span-2 sm:col-span-1 bg-orange-50 border border-orange-200 rounded-lg p-3">
                  <p className="text-xs text-orange-500 font-medium uppercase tracking-wide">Deuda Migración</p>
                  <p className="text-lg font-display text-orange-600 break-all">{formatCurrency(detalleCliente.saldo_inicial)}</p>
                </div>
              )}
              <div className={parseFloat(detalleCliente.saldo_inicial) > 0 ? '' : 'col-span-2 sm:col-span-1'}>
                <p className="text-sm text-gray-500">Total Vendido</p>
                <p className="text-lg font-display text-primary break-all">{formatCurrency(detalleCliente.total_vendido)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Total Abonado</p>
                <p className="text-lg font-display text-success break-all">{formatCurrency(detalleCliente.total_abonado)}</p>
              </div>
              <div>
                <p className="text-sm text-gray-500">Saldo Pendiente</p>
                <p className="text-lg font-display text-accent break-all">{formatCurrency(detalleCliente.saldo_pendiente)}</p>
              </div>
            </div>

            {/* Buscador universal del detalle (cotización, fecha, monto, método...) */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
              <input
                value={detalleBusqueda}
                onChange={(e) => setDetalleBusqueda(e.target.value)}
                placeholder="Buscar por cotización, fecha, monto, método, cuenta..."
                className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30"
              />
              {detalleBusqueda && (
                <button onClick={() => setDetalleBusqueda('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-primary" title="Limpiar">
                  <X size={14} />
                </button>
              )}
            </div>

            {/* Pestañas: Ventas | Abonos */}
            <div className="flex gap-1 border-b border-border">
              <button type="button" onClick={() => setDetalleTab('ventas')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${detalleTab === 'ventas' ? 'border-secondary text-secondary' : 'border-transparent text-muted hover:text-primary'}`}>
                Ventas
              </button>
              <button type="button" onClick={() => setDetalleTab('abonos')}
                className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${detalleTab === 'abonos' ? 'border-secondary text-secondary' : 'border-transparent text-muted hover:text-primary'}`}>
                Abonos
              </button>
            </div>

            {/* PESTAÑA VENTAS: cada cotización con su saldo, abonable directamente */}
            {detalleTab === 'ventas' && vistaVentas && (() => {
              const { resumen, cotizaciones, mostrarMig, mostrarGeneral, q } = vistaVentas;
              const { generalVenta, generalAbonadoRemanente, migracion } = resumen;
              if (resumen.cotizaciones.length === 0 && generalVenta === 0 && migracion.deuda === 0) {
                return <p className="text-center text-muted py-6 text-sm">Este cliente no tiene ventas registradas.</p>;
              }
              if (q && cotizaciones.length === 0 && !mostrarMig) {
                return <p className="text-center text-muted py-6 text-sm">Ninguna venta coincide con "{q}".</p>;
              }
              return (
                <div className="space-y-2 max-h-80 overflow-y-auto">
                  {mostrarMig && (
                    <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-orange-700">📋 Deuda de migración</span>
                        <span className={`text-xs font-bold ${migracion.saldo > 0 ? 'text-accent' : 'text-success'}`}>
                          {migracion.saldo > 0 ? 'Pendiente' : 'Pagada'}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 text-xs mt-1.5 flex-wrap">
                        <span className="text-muted">Deuda <strong className="text-primary">{formatCurrency(migracion.deuda)}</strong></span>
                        <span className="text-success">Abonado <strong>{formatCurrency(migracion.abonado)}</strong></span>
                        <span className={migracion.saldo > 0 ? 'text-accent' : 'text-success'}>Saldo <strong>{formatCurrency(migracion.saldo)}</strong></span>
                      </div>
                      {migracion.abonado > 0 && (
                        <p className="text-[10px] text-muted/80 mt-0.5">Cubierta con {formatCurrency(migracion.abonado)} de abono(s) general(es)</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-orange-200/60 overflow-hidden">
                          <div className={`h-full rounded-full ${migracion.pct >= 100 ? 'bg-success' : 'bg-orange-400'}`} style={{ width: `${Math.min(migracion.pct, 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-muted tabular-nums w-10 text-right">{migracion.pct}%</span>
                      </div>
                    </div>
                  )}
                  {cotizaciones.map((c) => (
                    <div key={c.cotizacion_id} className="rounded-xl border border-border/60 p-3 hover:border-secondary/40 transition-colors">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <RefLink to="/cotizaciones" id={c.cotizacion_id} title="Ver la cotización en su panel"
                          className="text-sm font-semibold">
                          {c.cotizacion_numero || `Cotización #${c.cotizacion_id}`}
                        </RefLink>
                        <Button size="sm" variant="secondary" icon={Plus}
                          onClick={() => openPagoModalConCotizacion(detalleCliente.cliente, c.cotizacion_id)}>
                          Abonar
                        </Button>
                      </div>
                      <div className="flex items-center gap-3 text-xs mt-1.5 flex-wrap">
                        <span className="text-muted">Venta <strong className="text-primary">{formatCurrency(c.venta)}</strong></span>
                        <span className="text-success">Abonado <strong>{formatCurrency(c.abonado)}</strong></span>
                        <span className={c.saldo > 0 ? 'text-accent' : 'text-success'}>Saldo <strong>{formatCurrency(c.saldo)}</strong></span>
                      </div>
                      {c.aplicadoGeneral > 0 && (
                        <p className="text-[10px] text-muted/80 mt-0.5">Incluye {formatCurrency(c.aplicadoGeneral)} de abono(s) general(es)</p>
                      )}
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="flex-1 h-1.5 rounded-full bg-border/50 overflow-hidden">
                          <div className={`h-full rounded-full ${c.pct >= 100 ? 'bg-success' : 'bg-secondary'}`} style={{ width: `${Math.min(c.pct, 100)}%` }} />
                        </div>
                        <span className="text-[11px] font-bold text-muted tabular-nums w-10 text-right">{c.pct}%</span>
                      </div>
                    </div>
                  ))}
                  {mostrarGeneral && (
                    <div className="rounded-xl border border-dashed border-border/60 p-3 flex items-center justify-between gap-2 flex-wrap">
                      <div>
                        <p className="text-sm font-medium text-muted">Sin cotización específica</p>
                        <div className="flex items-center gap-3 text-xs mt-0.5">
                          {generalVenta > 0 && <span className="text-muted">Venta <strong className="text-primary">{formatCurrency(generalVenta)}</strong></span>}
                          <span className="text-success">Abono a favor <strong>{formatCurrency(generalAbonadoRemanente)}</strong></span>
                        </div>
                        {generalAbonadoRemanente > 0 && (
                          <p className="text-[10px] text-muted/80 mt-0.5">Saldo a favor del cliente (no aplicado a ninguna cotización)</p>
                        )}
                      </div>
                      <Button size="sm" variant="ghost" icon={Plus}
                        onClick={() => openPagoModalConCotizacion(detalleCliente.cliente, null)}>
                        Abono general
                      </Button>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* PESTAÑA ABONOS: historial de abonos del cliente */}
            {detalleTab === 'abonos' && (
            <div className="max-h-72 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    <th className="px-3 py-2 text-left">Fecha</th>
                    <th className="px-3 py-2 text-left">Tipo</th>
                    <th className="px-3 py-2 text-right">Monto</th>
                    <th className="px-3 py-2 text-left">Método</th>
                    <th className="px-3 py-2 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {abonosFiltrados.length === 0 && (
                    <tr><td colSpan={5} className="px-3 py-6 text-center text-muted text-sm">
                      {detalleBusqueda.trim() ? `Ningún abono coincide con "${detalleBusqueda.trim()}"` : 'Sin abonos registrados para este cliente'}
                    </td></tr>
                  )}
                  {abonosFiltrados.map(m => (
                    <tr key={m.id} className={editandoAbono?.id === m.id ? 'bg-secondary/5' : ''}>
                      {editandoAbono?.id === m.id ? (
                        // Fila en modo edición
                        <>
                          <td className="px-2 py-1" colSpan={4}>
                            <div className="grid grid-cols-4 gap-2">
                              <input
                                type="number" step="0.01" min="0.01"
                                value={editandoAbono.monto}
                                onChange={e => setEditandoAbono({ ...editandoAbono, monto: e.target.value })}
                                className="px-2 py-1 rounded border border-secondary/40 text-sm w-full"
                                placeholder="Monto"
                              />
                              <input
                                type="date"
                                value={editandoAbono.fecha?.split('T')[0]}
                                onChange={e => setEditandoAbono({ ...editandoAbono, fecha: e.target.value })}
                                className="px-2 py-1 rounded border border-secondary/40 text-sm w-full"
                              />
                              <select
                                value={editandoAbono.metodo_pago || 'efectivo'}
                                onChange={e => setEditandoAbono({ ...editandoAbono, metodo_pago: e.target.value })}
                                className="px-2 py-1 rounded border border-secondary/40 text-sm w-full"
                              >
                                {METODOS_PAGO.map(mp => <option key={mp} value={mp}>{mp}</option>)}
                              </select>
                              <input
                                type="text"
                                value={editandoAbono.referencia || ''}
                                onChange={e => setEditandoAbono({ ...editandoAbono, referencia: e.target.value })}
                                className="px-2 py-1 rounded border border-secondary/40 text-sm w-full"
                                placeholder="Referencia"
                              />
                            </div>
                          </td>
                          <td className="px-2 py-1 text-right">
                            <div className="flex justify-end gap-1">
                              <button onClick={handleGuardarEdicionAbono} className="p-1.5 rounded text-success hover:bg-success/10" title="Guardar">
                                <CheckCircle size={15} />
                              </button>
                              <button onClick={() => setEditandoAbono(null)} className="p-1.5 rounded text-gray-400 hover:bg-gray-100" title="Cancelar">
                                <X size={15} />
                              </button>
                            </div>
                          </td>
                        </>
                      ) : (
                        // Fila normal
                        <>
                          <td className="px-3 py-2">{formatFechaCorta(m.fecha)}</td>
                          <td className="px-3 py-2">
                            <Badge variant={m.tipo === 'venta' ? 'vendida' : 'disponible'}>
                              {m.tipo === 'venta' ? <TrendingUp size={12} className="mr-1" /> : <TrendingDown size={12} className="mr-1" />}
                              {m.tipo}
                            </Badge>
                            {/* Origen: cotización + despacho para saber de dónde proviene */}
                            {m.cotizacion_id && (
                              <RefLink to="/cotizaciones" id={m.cotizacion_id} title="Ver cotización"
                                className="block text-[11px] mt-0.5 font-semibold" icon={false}>
                                {m.cotizacion_numero || `Cot. #${m.cotizacion_id}`}
                              </RefLink>
                            )}
                            {m.despacho_id ? (
                              <RefLink to="/despachos" id={m.despacho_id} title="Ver despacho"
                                className="block text-[10px] text-gray-400" icon={false}>
                                {m.despacho_numero}
                              </RefLink>
                            ) : (m.referencia && !m.es_legacy && (
                              <span className="block text-[10px] text-gray-400">{m.referencia}</span>
                            ))}
                            {m.es_legacy && <span className="block text-[10px] font-bold text-amber-600">LEGACY</span>}
                          </td>
                          <td className={`px-3 py-2 text-right ${m.tipo === 'venta' ? 'text-primary' : 'text-success'}`}>
                            {m.tipo === 'venta' ? '+' : '-'}{formatCurrency(m.monto)}
                          </td>
                          <td className="px-3 py-2 text-gray-500">
                            {m.metodo_pago || '-'}
                            {m.cuenta_nombre && (
                              <RefLink to="/cuentas" id={m.cuenta_id} title="Ver cuenta" icon={false} className="block text-[11px]">{m.cuenta_nombre}</RefLink>
                            )}
                          </td>
                          <td className="px-3 py-2 text-right">
                            {m.tipo === 'abono' && (
                              <div className="flex justify-end gap-1">
                                <button
                                  onClick={() => setEditandoAbono({ id: m.id, monto: m.monto, fecha: m.fecha, metodo_pago: m.metodo_pago, referencia: m.referencia, cotizacion_id: m.cotizacion_id })}
                                  className="p-1.5 rounded text-gray-400 hover:text-secondary hover:bg-secondary/10"
                                  title="Editar abono"
                                >
                                  <Edit2 size={13} />
                                </button>
                                <button
                                  onClick={() => handleEliminarAbono(m.id)}
                                  className="p-1.5 rounded text-gray-400 hover:text-error hover:bg-error/10"
                                  title="Eliminar abono"
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            )}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            )}

            <div className="flex justify-between pt-2">
              <div className="flex gap-2">
                <Button 
                  variant="secondary" 
                  onClick={() => exportarExcel(detalleCliente.cliente.id, detalleCliente.cliente.nombre)}
                  icon={FileSpreadsheet}
                >
                  Excel
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => exportarPDF(detalleCliente.cliente.id, detalleCliente.cliente.nombre)}
                  icon={Download}
                >
                  PDF
                </Button>
              </div>
              <div className="flex gap-2">
                <Button onClick={() => openPagoModalParaCliente(detalleCliente.cliente)} icon={Plus}>
                  Registrar abono
                </Button>
                <Button variant="ghost" onClick={() => setDetalleCliente(null)}>Cerrar</Button>
              </div>
            </div>
          </div>
        )}
      </Modal>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title="Registrar Abono">
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && <div className="p-3 bg-error/10 text-error rounded-lg text-sm">{error}</div>}

          {/* Selector de cliente con búsqueda */}
          <div className="relative" ref={clienteListRef}>
            <label className="block text-sm font-medium text-primary mb-1">
              Cliente <span className="text-error">*</span>
            </label>
            
            {/* Si ya hay cliente seleccionado, mostrar tag */}
            {formData.cliente_id ? (
              <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-xl">
                <div className="p-2 bg-secondary/20 rounded-lg">
                  <User className="w-4 h-4 text-secondary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium text-sm text-secondary">
                    {clientes.find(c => c.id === formData.cliente_id)?.nombre || 'Cliente'}
                  </p>
                  <p className="text-xs text-gray-500">
                    {clientes.find(c => c.id === formData.cliente_id)?.ciudad || ''}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setFormData({ ...formData, cliente_id: '' });
                    setClienteSearch('');
                  }}
                  className="p-1.5 rounded-lg hover:bg-secondary/20 text-secondary"
                >
                  <X size={18} />
                </button>
              </div>
            ) : (
              /* Si no hay cliente, mostrar buscador */
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                  <Search className="h-5 w-5 text-gray-400" />
                </div>
                <input
                  type="text"
                  placeholder="Buscar cliente por nombre..."
                  value={clienteSearch}
                  onChange={(e) => {
                    setClienteSearch(e.target.value);
                    setShowClienteList(true);
                  }}
                  onFocus={() => clienteSearch && setShowClienteList(true)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
                />
              </div>
            )}
            
            {/* Lista de clientes filtrados - solo mostrar si hay texto y no hay cliente seleccionado */}
            {!formData.cliente_id && clienteSearch && (
              <div className="absolute z-20 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-48 overflow-y-auto">
                {clientes
                  .filter(c => 
                    c.nombre?.toLowerCase().includes(clienteSearch.toLowerCase()) ||
                    c.ciudad?.toLowerCase().includes(clienteSearch.toLowerCase()) ||
                    c.telefono?.toLowerCase().includes(clienteSearch.toLowerCase())
                  )
                  .slice(0, 10)
                  .map(c => (
                    <div
                      key={c.id}
                      onClick={() => {
                        setFormData({ ...formData, cliente_id: c.id });
                        setClienteSearch('');
                        setShowClienteList(false);
                        cargarSaldoCliente(c.id);
                      }}
                      className={`px-4 py-3 cursor-pointer hover:bg-gray-50 border-b border-gray-100 last:border-b-0 ${
                        formData.cliente_id === c.id ? 'bg-secondary/10' : ''
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-gray-100 rounded-lg">
                          <User className="w-4 h-4 text-gray-500" />
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{c.nombre}</p>
                          <p className="text-xs text-gray-500">{c.ciudad || 'Sin ciudad'} • {c.telefono || 'Sin teléfono'}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                {clientes.filter(c => 
                  c.nombre?.toLowerCase().includes(clienteSearch.toLowerCase()) ||
                  c.ciudad?.toLowerCase().includes(clienteSearch.toLowerCase())
                ).length === 0 && (
                  <div className="px-4 py-6 text-center text-gray-500 text-sm">
                    No se encontraron clientes
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Input
                label="Monto"
                type="number"
                step="0.01"
                value={formData.monto}
                onChange={(e) => setFormData({ ...formData, monto: e.target.value })}
                required
              />
              {/* Validación de monto vs saldo */}
              {saldoCliente !== null && formData.monto && parseFloat(formData.monto) > 0 && (() => {
                const monto = parseFloat(formData.monto);
                if (saldoCliente <= 0) {
                  return (
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-error bg-error/5 rounded-lg px-3 py-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>Este cliente no tiene deuda pendiente. No se puede registrar un abono.</span>
                    </div>
                  );
                } else if (monto > saldoCliente) {
                  return (
                    <div className="mt-1 flex items-start gap-1.5 text-xs text-error bg-error/5 rounded-lg px-3 py-2">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>El abono no puede exceder el saldo pendiente ({formatCurrency(saldoCliente)}).</span>
                    </div>
                  );
                } else {
                  return (
                    <div className="mt-1 flex items-center gap-1.5 text-xs text-success bg-success/5 rounded-lg px-3 py-2">
                      <CheckCircle size={13} className="shrink-0" />
                      <span>Saldo pendiente: {formatCurrency(saldoCliente)}. Quedaría {formatCurrency(saldoCliente - monto)} por cobrar.</span>
                    </div>
                  );
                }
              })()}
            </div>
            <Input
              label="Fecha"
              type="date"
              value={formData.fecha}
              onChange={(e) => setFormData({ ...formData, fecha: e.target.value })}
            />
          </div>

          {/* Un descuento baja el saldo igual que un abono, pero no entró plata:
              por eso no lleva método de pago ni cuenta. */}
          <Select
            label="Tipo de movimiento"
            value={formData.clase}
            onChange={(e) => setFormData({ ...formData, clase: e.target.value })}
            options={[
              { value: 'pago', label: 'Abono — entró plata' },
              { value: 'descuento', label: 'Descuento — se le rebaja la deuda' },
            ]}
          />

          {formData.clase === 'descuento' && (
            <p className="text-xs text-warning bg-warning/10 rounded-lg px-3 py-2">
              El descuento baja el saldo del cliente igual que un abono, pero queda marcado
              aparte porque no ingresó dinero. No afecta ninguna cuenta ni banco.
            </p>
          )}

          <Input
            label={formData.clase === 'descuento' ? 'Motivo del descuento' : 'Descripción (opcional)'}
            value={formData.descripcion}
            onChange={(e) => setFormData({ ...formData, descripcion: e.target.value })}
            placeholder={formData.clase === 'descuento'
              ? 'Ej: rebaja por mercancía averiada'
              : 'Ej: consignación del lunes'}
          />

          {formData.clase !== 'descuento' && (
            <div className="grid grid-cols-2 gap-4">
              <Select
                label="Método de Pago"
                value={formData.metodo_pago}
                onChange={(e) => setFormData({ ...formData, metodo_pago: e.target.value })}
                options={METODOS_PAGO.map(m => ({ value: m, label: m.charAt(0).toUpperCase() + m.slice(1) }))}
              />
              <Input
                label="Referencia"
                value={formData.referencia}
                onChange={(e) => setFormData({ ...formData, referencia: e.target.value })}
                placeholder="No. transacción"
              />
            </div>
          )}

          {formData.clase !== 'descuento' && (
            <Select
              label="Cuenta (banco / caja)"
              value={formData.cuenta_id}
              onChange={(e) => setFormData({ ...formData, cuenta_id: e.target.value })}
              options={[{ value: '', label: '— Sin cuenta —' }, ...cuentasBanco.map(c => ({ value: String(c.id), label: c.nombre }))]}
            />
          )}

          {formData.cliente_id && (
            <div>
              <Select
                label="Aplicar a cotización"
                value={formData.cotizacion_id}
                onChange={(e) => setFormData({ ...formData, cotizacion_id: e.target.value })}
                options={[
                  { value: '', label: '— Abono general (sin cotización específica) —' },
                  ...cotizacionesCliente.map(c => ({
                    value: String(c.cotizacion_id),
                    label: `${c.cotizacion_numero || `Cot. #${c.cotizacion_id}`} · saldo ${formatCurrency(c.saldo)} (${c.pct}% pagado)`,
                  })),
                ]}
              />
              {cotizacionesCliente.length === 0 && (
                <p className="text-xs text-muted mt-1">Este cliente no tiene ventas por cotización; se registrará como abono general.</p>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-4">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button
              type="submit"
              variant="secondary"
              disabled={enviando || (saldoCliente !== null && parseFloat(formData.monto) > saldoCliente)}
            >
              {enviando ? 'Registrando…' : 'Registrar Abono'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal: Carga histórica (legacy) */}
      <Modal isOpen={legacyModalOpen} onClose={() => setLegacyModalOpen(false)} title="Cargar histórico de cartera" size="lg">
        <div className="space-y-4">
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-800 flex items-start gap-2">
            <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
            <span>Estos movimientos se registran como <strong>histórico</strong> (no validan saldo) y respetan la fecha indicada. Útil para migrar deudas y abonos antiguos.</span>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 border-b border-border">
            <button onClick={() => setLegacyTab('manual')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${legacyTab === 'manual' ? 'border-secondary text-secondary' : 'border-transparent text-muted hover:text-primary'}`}>
              Manual
            </button>
            <button onClick={() => setLegacyTab('csv')}
              className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${legacyTab === 'csv' ? 'border-secondary text-secondary' : 'border-transparent text-muted hover:text-primary'}`}>
              Archivo (CSV / Excel)
            </button>
          </div>

          {legacyTab === 'manual' ? (
            <div className="grid grid-cols-2 gap-3 items-end">
              <Select
                label="Cliente"
                value={legacyManual.cliente_id}
                onChange={(e) => setLegacyManual({ ...legacyManual, cliente_id: e.target.value })}
                options={[{ value: '', label: 'Selecciona…' }, ...clientes.map(c => ({ value: String(c.id), label: c.nombre }))]}
              />
              <Select
                label="Tipo"
                value={legacyManual.tipo}
                onChange={(e) => setLegacyManual({ ...legacyManual, tipo: e.target.value })}
                options={[{ value: 'venta', label: 'Venta (deuda)' }, { value: 'abono', label: 'Abono (pago)' }]}
              />
              <Input label="Fecha" type="date" value={legacyManual.fecha}
                onChange={(e) => setLegacyManual({ ...legacyManual, fecha: e.target.value })} />
              <Input label="Monto" type="number" min="0" step="0.01" value={legacyManual.monto}
                onChange={(e) => setLegacyManual({ ...legacyManual, monto: e.target.value })} placeholder="0" />
              <Select
                label="Cuenta"
                value={legacyManual.cuenta_id}
                onChange={(e) => setLegacyManual({ ...legacyManual, cuenta_id: e.target.value })}
                options={[{ value: '', label: '— Sin cuenta —' }, ...cuentasBanco.map(c => ({ value: String(c.id), label: c.nombre }))]}
              />
              <Input label="Referencia" value={legacyManual.referencia}
                onChange={(e) => setLegacyManual({ ...legacyManual, referencia: e.target.value })} placeholder="Opcional" />
              <div className="col-span-2 flex justify-end">
                <Button type="button" variant="ghost" onClick={addLegacyManualRow}>
                  <Plus size={16} className="mr-1" /> Agregar a la lista
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-muted">
                Columnas (en orden): <strong>cliente, tipo, fecha, monto, cuenta, referencia</strong>.
                Cliente y cuenta pueden ser por nombre o ID. Tipo: venta o abono. La primera fila se ignora (encabezado).
              </p>
              <input ref={legacyFileRef} type="file" accept=".csv,.xlsx,.xls"
                onChange={(e) => handleLegacyFile(e.target.files?.[0])}
                className="block w-full text-sm text-muted file:mr-3 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-secondary file:text-white file:text-sm file:font-medium hover:file:bg-secondary/85 cursor-pointer" />
            </div>
          )}

          {/* Lista de registros a importar */}
          {legacyRows.length > 0 && (
            <div className="rounded-xl border border-border/60 overflow-hidden">
              <div className="px-4 py-2 bg-primary/3 border-b border-border/40 flex items-center justify-between">
                <p className="text-xs font-bold text-muted uppercase tracking-wider">{legacyRows.length} registro(s)</p>
                <button onClick={() => setLegacyRows([])} className="text-xs text-error hover:underline">Limpiar todo</button>
              </div>
              <div className="max-h-60 overflow-y-auto divide-y divide-border/30">
                {legacyRows.map((r, idx) => (
                  <div key={idx} className="flex items-center justify-between px-4 py-2 text-sm">
                    <div className="min-w-0">
                      <span className="font-medium text-primary">{clienteNombre(r.cliente_id)}</span>
                      <span className={`ml-2 text-xs font-semibold ${r.tipo === 'venta' ? 'text-primary' : 'text-success'}`}>{r.tipo}</span>
                      <span className="ml-2 text-xs text-muted">{r.fecha}</span>
                      {r.cuenta_id && <span className="ml-2 text-xs text-muted">· {cuentaNombre(r.cuenta_id)}</span>}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className="font-mono font-semibold text-primary">{formatCurrency(r.monto)}</span>
                      <button onClick={() => removeLegacyRow(idx)} className="p-1 text-muted hover:text-error"><X size={14} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="ghost" onClick={() => setLegacyModalOpen(false)}>Cancelar</Button>
            <Button type="button" variant="secondary" onClick={submitLegacy} disabled={legacySubmitting || legacyRows.length === 0}>
              {legacySubmitting ? 'Importando…' : `Importar ${legacyRows.length || ''} registro(s)`}
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}