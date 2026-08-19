import { useEffect, useState, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Badge, Button, Modal, useToast, useConfirm } from '../components/common';
import { pedidosApi, clientesApi } from '../services/api';
import ExcelJS from 'exceljs';
import { Package, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Search, X, User, Download } from 'lucide-react';
import { formatCOP } from '../lib/money';
import { hoy } from '../lib/fecha';

export default function GestionarPedidos() {
  const [pedidos, setPedidos] = useState([]);
  const [pedidosOriginal, setPedidosOriginal] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroCliente, setFiltroCliente] = useState('');
  const [searchCliente, setSearchCliente] = useState('');
  const [showClienteList, setShowClienteList] = useState(false);
  const [detallePedido, setDetallePedido] = useState(null);
  const [modalDetalle, setModalDetalle] = useState(false);
  const [exportando, setExportando] = useState(false);
  const clienteListRef = useRef(null);
  const quitarClienteRef = useRef(null);
  const devolverFocoRef = useRef(false);
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
    loadPedidos();
    loadClientes();
  }, [filtroEstado]);

  useEffect(() => {
    filtrarPedidos();
  }, [filtroCliente, pedidosOriginal]);

  const loadClientes = async () => {
    try {
      const data = await clientesApi.getAll({ estado: 'activo' });
      setClientes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadPedidos = async () => {
    try {
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      const data = await pedidosApi.getAll(params);
      setPedidos(data);
      setPedidosOriginal(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const filtrarPedidos = () => {
    if (!filtroCliente) {
      setPedidos(pedidosOriginal);
    } else {
      setPedidos(pedidosOriginal.filter(p => p.cliente_id === filtroCliente));
    }
  };

  const seleccionarCliente = (cliente, { conTeclado = false } = {}) => {
    // Al elegir con el teclado la lista y el buscador desaparecen del DOM y el
    // foco caía en <body>: el usuario volvía al principio de la página. La
    // bandera hace que, ya montado el tag del cliente, el foco pase al botón
    // que ocupa ese lugar.
    devolverFocoRef.current = conTeclado;
    setFiltroCliente(cliente.id);
    setSearchCliente(cliente.nombre);
    setShowClienteList(false);
  };

  useEffect(() => {
    if (!filtroCliente || !devolverFocoRef.current) return;
    devolverFocoRef.current = false;
    quitarClienteRef.current?.focus();
  }, [filtroCliente]);

  const limpiarFiltroCliente = () => {
    setFiltroCliente('');
    setSearchCliente('');
    setShowClienteList(false);
  };

  const clientesFiltrados = clientes.filter(c =>
    !searchCliente ||
    c.nombre?.toLowerCase().includes(searchCliente.toLowerCase()) ||
    c.ciudad?.toLowerCase().includes(searchCliente.toLowerCase())
  );

  // `showClienteList` se escribía en cinco sitios pero no se leía en ninguno: la
  // lista se pintaba con `!filtroCliente && searchCliente`, así que el efecto de
  // "cerrar al hacer clic fuera" no cerraba nada y el desplegable tapaba la
  // pantalla hasta borrar el texto.
  const listaAbierta = !filtroCliente && !!searchCliente && showClienteList;

  const verDetalles = async (pedido) => {
    try {
      const detalles = await pedidosApi.getOne(pedido.id);
      setDetallePedido(detalles);
      setModalDetalle(true);
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const aprobarPedido = async (id) => {
    // Aprobar genera una venta: sin confirmación, un clic accidental dejaba
    // movimiento contable que después hay que deshacer a mano.
    const ok = await confirm({
      title: '¿Aprobar el pedido?',
      message: `El pedido #${id} se convertirá en una venta y las pacas quedarán marcadas como vendidas.`,
      confirmText: 'Aprobar y crear venta',
      variant: 'success',
    });
    if (!ok) return;
    try {
      await pedidosApi.actualizar(id, { estado: 'aprobado' });
      addToast('Pedido aprobado y convertido en venta', 'success');
      setModalDetalle(false);
      loadPedidos();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const rechazarPedido = async (id) => {
    // Desde esta pantalla no hay forma de revertir un rechazo, por eso se pregunta.
    const ok = await confirm({
      title: '¿Rechazar el pedido?',
      message: `El pedido #${id} quedará rechazado. Desde esta pantalla no se puede volver atrás.`,
      confirmText: 'Rechazar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await pedidosApi.actualizar(id, { estado: 'rechazado' });
      addToast('Pedido rechazado', 'success');
      setModalDetalle(false);
      loadPedidos();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const formatCurrency = formatCOP;

  // Exportación a Excel con los filtros activos (mismo estilo que Clientes.jsx para
  // que todos los Excel del sistema se vean igual). La lista de pedidos no trae la
  // cantidad de ítems, así que se pide el detalle de cada pedido en tandas de 5
  // para no lanzar cientos de peticiones a la vez.
  const exportarExcel = async () => {
    if (!pedidos.length) { addToast('No hay pedidos para exportar', 'info'); return; }
    try {
      setExportando(true);
      const conteos = new Map();
      for (let i = 0; i < pedidos.length; i += 5) {
        const tanda = pedidos.slice(i, i + 5);
        const detalles = await Promise.all(tanda.map(p => pedidosApi.getOne(p.id).catch(() => null)));
        detalles.forEach((d, j) => conteos.set(tanda[j].id, d ? (d.detalles || []).length : null));
      }

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Pedidos');
      ws.columns = [
        { header: 'Pedido #', key: 'numero',  width: 12 },
        { header: 'Cliente',  key: 'cliente', width: 28 },
        { header: 'Fecha',    key: 'fecha',   width: 16 },
        { header: 'Estado',   key: 'estado',  width: 14 },
        { header: 'Ítems',    key: 'items',   width: 10 },
        { header: 'Total',    key: 'total',   width: 18 },
      ];
      ws.getRow(1).font = { bold: true };
      const labels = { pendiente: 'Pendiente', aprobado: 'Aprobado', rechazado: 'Rechazado', convertido: 'Completado' };
      pedidos.forEach(p => {
        const items = conteos.get(p.id);
        ws.addRow({
          numero:  p.id,
          cliente: p.cliente_nombre || '—',
          fecha:   p.created_at ? new Date(p.created_at).toLocaleDateString('es-CO') : '—',
          estado:  labels[p.estado] || p.estado,
          items:   items == null ? '—' : items,
          total:   parseFloat(p.total_estimado) || 0,
        });
      });
      ws.getColumn('total').numFmt = '#,##0.00';
      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `pedidos-${hoy()}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
      addToast('Excel descargado', 'success');
    } catch (err) {
      addToast('Error al exportar: ' + err.message, 'error');
    } finally {
      setExportando(false);
    }
  };

  const getEstadoBadge = (estado) => {
    const variants = {
      pendiente: 'warning',
      aprobado: 'success',
      rechazado: 'error',
      convertido: 'success'
    };
    const labels = {
      pendiente: 'Pendiente',
      aprobado: 'Aprobado',
      rechazado: 'Rechazado',
      convertido: 'Completado'
    };
    return <Badge variant={variants[estado] || 'default'}>{labels[estado] || estado}</Badge>;
  };

  return (
    <Layout title="Gestionar Pedidos" subtitle="Aprobar o rechazar pedidos de clientes">
      <div className="space-y-4">
        {/* Filtros */}
        <Card>
          <CardBody>
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Filtro Cliente */}
              <div className="flex-1 relative" ref={clienteListRef}>
                {/* El <label> era hermano suelto del input, sin htmlFor: el lector de
                    pantalla no decía qué se estaba buscando */}
                <label htmlFor="filtro-cliente" className="block text-sm font-medium text-primary mb-1">Cliente</label>

                {/* Si ya hay cliente seleccionado, mostrar tag */}
                {filtroCliente ? (
                  <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-xl">
                    <div className="p-2 bg-secondary/20 rounded-lg">
                      <User className="w-4 h-4 text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-secondary truncate">{searchCliente}</p>
                    </div>
                    {/* Botón de solo icono: sin aria-label el lector lo anunciaba como "botón" a secas */}
                    <button
                      type="button"
                      ref={quitarClienteRef}
                      aria-label="Quitar el filtro de cliente"
                      title="Quitar el filtro de cliente"
                      onClick={limpiarFiltroCliente}
                      className="p-1.5 rounded-lg hover:bg-secondary/20 text-secondary flex-shrink-0"
                    >
                      <X size={18} />
                    </button>
                  </div>
                ) : (
                  /* Si no hay cliente, mostrar buscador */
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                    <input
                      id="filtro-cliente"
                      type="text"
                      role="combobox"
                      aria-expanded={listaAbierta}
                      aria-controls="lista-clientes"
                      aria-autocomplete="list"
                      placeholder="Buscar cliente..."
                      value={searchCliente}
                      onChange={(e) => {
                        setSearchCliente(e.target.value);
                        setShowClienteList(true);
                      }}
                      onFocus={() => searchCliente && setShowClienteList(true)}
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
                    />
                  </div>
                )}
                
                {/* Lista desplegable de clientes - solo mostrar si hay texto y no hay filtro */}
                {listaAbierta && (
                  /* Cada resultado era un <div onClick> sin teclado: con Tab/Enter no había forma de elegir cliente */
                  <div id="lista-clientes" role="listbox" aria-label="Clientes encontrados" className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {clientesFiltrados.length > 0 ? (
                      clientesFiltrados.slice(0, 10).map(cliente => (
                        <div
                          key={cliente.id}
                          role="option"
                          tabIndex={0}
                          aria-selected={filtroCliente === cliente.id}
                          onClick={() => seleccionarCliente(cliente)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); seleccionarCliente(cliente, { conTeclado: true }); }
                          }}
                          className="px-4 py-3 cursor-pointer hover:bg-primary/5 focus:bg-primary/5 focus:outline-none focus:ring-2 focus:ring-inset focus:ring-secondary/40 border-b border-border last:border-b-0"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/5 rounded-lg">
                              <User className="w-4 h-4 text-muted" />
                            </div>
                            <div className="flex-1">
                              <p className="font-medium text-sm">{cliente.nombre}</p>
                              <p className="text-xs text-gray-500">{cliente.ciudad || 'Sin ciudad'}</p>
                            </div>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="px-4 py-6 text-center text-gray-500 text-sm">
                        No se encontraron clientes
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Filtro Estado */}
              <div className="w-full lg:w-48">
                <label htmlFor="filtro-estado" className="block text-sm font-medium text-primary mb-1">Estado</label>
                <select
                  id="filtro-estado"
                  value={filtroEstado}
                  onChange={(e) => setFiltroEstado(e.target.value)}
                  className="w-full px-4 py-2.5 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30 focus:border-secondary"
                >
                  <option value="">Todos</option>
                  <option value="pendiente">Pendientes</option>
                  <option value="aprobado">Aprobados</option>
                  <option value="rechazado">Rechazados</option>
                  <option value="convertido">Convertidos</option>
                </select>
              </div>

              {/* Contador */}
              <div className="flex items-end">
                <div className="px-4 py-2.5 bg-gray-100 rounded-xl text-center">
                  <p className="text-2xl font-bold text-primary">{pedidos.length}</p>
                  <p className="text-xs text-gray-500">pedidos</p>
                </div>
              </div>

              {/* Exportar: descarga lo que se ve en pantalla, con los filtros aplicados */}
              <div className="flex items-end">
                <button
                  onClick={exportarExcel}
                  disabled={exportando}
                  className="flex items-center gap-2 px-4 py-3 rounded-xl border border-border text-sm font-medium text-muted hover:text-primary hover:bg-primary/5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Download size={15} /> {exportando ? 'Generando…' : 'Exportar'}
                </button>
              </div>
            </div>

            {/* Tags de filtros activos */}
            {(filtroCliente || filtroEstado) && (
              <div className="flex gap-2 mt-3">
                {filtroCliente && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-secondary/10 text-secondary text-sm rounded-full">
                    Cliente: {searchCliente}
                    <button type="button" aria-label={`Quitar el filtro de cliente ${searchCliente}`} onClick={limpiarFiltroCliente} className="hover:text-secondary">
                      <X size={14} />
                    </button>
                  </span>
                )}
                {filtroEstado && (
                  /* text-gray-700 quedaba casi invisible en modo oscuro; los tokens del tema sí se invierten */
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary/10 text-primary text-sm rounded-full capitalize">
                    Estado: {filtroEstado}
                    <button type="button" aria-label={`Quitar el filtro de estado ${filtroEstado}`} onClick={() => setFiltroEstado('')} className="hover:opacity-70">
                      <X size={14} />
                    </button>
                  </span>
                )}
              </div>
            )}
          </CardBody>
        </Card>

        {loading ? (
          <Card><CardBody className="text-center text-muted">Cargando...</CardBody></Card>
        ) : pedidos.length === 0 ? (
          <Card><CardBody className="text-center text-muted">No hay pedidos</CardBody></Card>
        ) : (
          pedidos.map((pedido) => (
            <Card key={pedido.id} hover className="cursor-pointer" onClick={() => verDetalles(pedido)}>
              <CardBody>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <Package className="w-5 h-5 text-muted" />
                    <div>
                      <p className="font-medium text-primary">Pedido #{pedido.id}</p>
                      <p className="text-sm text-muted">
                        {pedido.cliente_nombre} • {new Date(pedido.created_at).toLocaleDateString('es-MX')}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-xl font-bold text-primary">{formatCurrency(pedido.total_estimado)}</p>
                      {getEstadoBadge(pedido.estado)}
                    </div>
                    <ChevronDown className="w-5 h-5 text-muted" />
                  </div>
                </div>
              </CardBody>
            </Card>
          ))
        )}
      </div>

      <Modal isOpen={modalDetalle} onClose={() => setModalDetalle(false)} title={`Pedido #${detallePedido?.id}`} size="lg">
        {detallePedido && (
          <div className="space-y-4">
            <div className="flex justify-between items-center p-4 bg-primary/5 rounded-xl">
              <div>
                <p className="text-sm text-muted">Cliente</p>
                <p className="font-medium text-primary">{detallePedido.cliente_nombre}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted">Fecha</p>
                <p className="font-medium text-primary">{new Date(detallePedido.created_at).toLocaleDateString('es-MX')}</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-muted">Total</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(detallePedido.total_estimado)}</p>
              </div>
            </div>

            <div>
              <p className="font-medium text-primary mb-2">Detalles del Pedido</p>
              <div className="space-y-2">
                {(detallePedido.detalles || []).map((item, i) => (
                  <div key={i} className="flex justify-between p-3 bg-primary/3 rounded-xl">
                    <div className="flex items-center gap-2">
                      <Package className="w-4 h-4 text-muted" />
                      <span className="text-sm text-primary">{item.clasificacion} ({item.referencia})</span>
                    </div>
                    <span className="font-medium text-primary">{formatCurrency(item.precio)}</span>
                  </div>
                ))}
              </div>
            </div>

            {detallePedido.estado === 'pendiente' && (
              <div className="flex gap-2 justify-end pt-4 border-t border-border">
                <Button variant="ghost" onClick={() => rechazarPedido(detallePedido.id)} className="text-error hover:bg-error/10">
                  <XCircle size={18} /> Rechazar
                </Button>
                <Button variant="success" onClick={() => aprobarPedido(detallePedido.id)}>
                  <CheckCircle size={18} /> Aprobar y Crear Venta
                </Button>
              </div>
            )}
          </div>
        )}
      </Modal>
    </Layout>
  );
}