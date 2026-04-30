import { useEffect, useState, useRef } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Badge, Button, Modal, useToast } from '../components/common';
import { pedidosApi, clientesApi } from '../services/api';
import { Package, Clock, CheckCircle, XCircle, ChevronDown, ChevronUp, Search, X, User } from 'lucide-react';

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
  const clienteListRef = useRef(null);
  const { addToast } = useToast();

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

  const seleccionarCliente = (cliente) => {
    setFiltroCliente(cliente.id);
    setSearchCliente(cliente.nombre);
    setShowClienteList(false);
  };

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
    try {
      await pedidosApi.actualizar(id, { estado: 'rechazado' });
      addToast('Pedido rechazado', 'success');
      setModalDetalle(false);
      loadPedidos();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
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
                <label className="block text-sm font-medium text-primary mb-1">Cliente</label>
                
                {/* Si ya hay cliente seleccionado, mostrar tag */}
                {filtroCliente ? (
                  <div className="flex items-center gap-2 p-3 bg-secondary/10 border border-secondary/30 rounded-xl">
                    <div className="p-2 bg-secondary/20 rounded-lg">
                      <User className="w-4 h-4 text-secondary" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm text-secondary truncate">{searchCliente}</p>
                    </div>
                    <button
                      type="button"
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
                      type="text"
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
                {!filtroCliente && searchCliente && (
                  <div className="absolute z-10 mt-1 w-full bg-surface border border-border rounded-xl shadow-lg max-h-64 overflow-y-auto">
                    {clientesFiltrados.length > 0 ? (
                      clientesFiltrados.slice(0, 10).map(cliente => (
                        <div
                          key={cliente.id}
                          onClick={() => seleccionarCliente(cliente)}
                          className="px-4 py-3 cursor-pointer hover:bg-primary/5 border-b border-border last:border-b-0"
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
                <label className="block text-sm font-medium text-primary mb-1">Estado</label>
                <select
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
            </div>

            {/* Tags de filtros activos */}
            {(filtroCliente || filtroEstado) && (
              <div className="flex gap-2 mt-3">
                {filtroCliente && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-secondary/10 text-secondary text-sm rounded-full">
                    Cliente: {searchCliente}
                    <button onClick={limpiarFiltroCliente} className="hover:text-secondary">
                      <X size={14} />
                    </button>
                  </span>
                )}
                {filtroEstado && (
                  <span className="inline-flex items-center gap-1 px-3 py-1 bg-gray-200 text-gray-700 text-sm rounded-full capitalize">
                    Estado: {filtroEstado}
                    <button onClick={() => setFiltroEstado('')} className="hover:text-gray-900">
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
                <Button variant="secondary" onClick={() => aprobarPedido(detallePedido.id)} className="bg-success hover:bg-success/90">
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