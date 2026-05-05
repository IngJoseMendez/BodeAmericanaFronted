import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm } from '../components/common';
import { clientesApi } from '../services/api';
import { CLIENTE_TIPOS, CLIENTE_ESTADOS } from '../types';
import { Plus, Search, Edit2, Trash2, Users, Phone, MapPin, CreditCard } from 'lucide-react';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);

  return debouncedValue;
}

export default function Clientes() {
  const [clientes, setClientes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState({
    nombre: '', telefono: '', direccion: '', ciudad: '', tipo_cliente: 'mayorista', limite_credito: '', descuento: '0', estado: 'activo',
    crear_usuario: false, username: '', password: '', saldo_inicial: ''
  });
  const [error, setError] = useState('');
  const { addToast } = useToast();
  const confirm = useConfirm();
  
  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    loadClientes();
  }, [filtroTipo, filtroEstado, debouncedSearch]);

  const loadClientes = async () => {
    try {
      const params = {};
      if (filtroTipo) params.tipo_cliente = filtroTipo;
      if (filtroEstado) params.estado = filtroEstado;
      if (debouncedSearch) params.buscar = debouncedSearch;
      const data = await clientesApi.getAll(params);
      setClientes(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    try {
      const payload = {
        nombre: formData.nombre,
        telefono: formData.telefono,
        direccion: formData.direccion,
        ciudad: formData.ciudad,
        tipo_cliente: formData.tipo_cliente,
        limite_credito: parseFloat(formData.limite_credito) || 0,
        descuento: parseFloat(formData.descuento) || 0,
        estado: formData.estado,
        saldo_inicial: parseFloat(formData.saldo_inicial) || 0,
      };
      
      if (!editando && formData.crear_usuario) {
        payload.crear_usuario = true;
        payload.username = formData.username;
        payload.password = formData.password;
      }
      
      if (editando) {
        await clientesApi.update(editando.id, payload);
        addToast(`Cliente "${formData.nombre}" actualizado`, 'success');
      } else {
        const result = await clientesApi.create(payload);
        if (result.usuario_creado) {
          addToast(`Cliente creado con usuario: ${formData.username}`, 'success');
        } else {
          addToast(`Cliente "${formData.nombre}" creado`, 'success');
        }
      }
      
      setModalOpen(false);
      resetForm();
      loadClientes();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEdit = (cliente) => {
    setEditando(cliente);
    setFormData({
      nombre: cliente.nombre,
      telefono: cliente.telefono || '',
      direccion: cliente.direccion || '',
      ciudad: cliente.ciudad || '',
      tipo_cliente: cliente.tipo_cliente,
      limite_credito: cliente.limite_credito || '',
      descuento: cliente.descuento != null ? String(cliente.descuento) : '0',
      estado: cliente.estado,
      saldo_inicial: cliente.saldo_inicial || '',
      crear_usuario: false,
      username: '',
      password: ''
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    const ok = await confirm({
      title: '¿Eliminar cliente?',
      message: 'Se eliminará el cliente y todos sus datos asociados. Esta acción no se puede deshacer.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await clientesApi.delete(id);
      addToast('Cliente eliminado', 'success');
      loadClientes();
    } catch (err) {
      addToast('Error al eliminar: ' + err.message, 'error');
    }
  };

  const resetForm = () => {
    setEditando(null);
    setFormData({
      nombre: '', telefono: '', direccion: '', ciudad: '', tipo_cliente: 'mayorista',
      limite_credito: '', descuento: '0', estado: 'activo', crear_usuario: false, username: '', password: '', saldo_inicial: ''
    });
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value);
  };

  return (
    <Layout title="Clientes" subtitle={`${clientes.length} clientes registrados`}>
      <div className="space-y-6">
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Buscar clientes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadClientes()}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-surface focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            >
              <option value="">Todos los tipos</option>
              {CLIENTE_TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-4 py-3 rounded-xl border border-border bg-surface"
            >
              <option value="">Todos los estados</option>
              {CLIENTE_ESTADOS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <Button onClick={() => { resetForm(); setModalOpen(true); }} variant="secondary">
              <Plus size={16} /> Nuevo Cliente
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>
        )}

        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardBody className="space-y-3">
                  <div className="h-5 w-3/4 bg-primary/8 rounded" />
                  <div className="h-4 w-1/2 bg-primary/8 rounded" />
                </CardBody>
              </Card>
            ))}
          </div>
        ) : clientes.length === 0 ? (
          <Card>
            <CardBody className="flex flex-col items-center gap-4 py-12">
              <Users className="w-12 h-12 text-muted/30" />
              <p className="text-muted text-center">No hay clientes</p>
              <Button onClick={() => { resetForm(); setModalOpen(true); }} variant="ghost">
                Agregar cliente
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {clientes.map((cliente, index) => (
              <Card key={cliente.id} hover className="animate-fade-in-up" style={{ animationDelay: `${index * 50}ms` }}>
                <CardBody>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                        <Users className="w-5 h-5 text-primary" />
                      </div>
                      <div>
                        <h3 className="font-display text-lg text-primary">{cliente.nombre}</h3>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <Badge variant={cliente.tipo_cliente} size="sm">{cliente.tipo_cliente}</Badge>
                          {parseFloat(cliente.descuento) > 0 && (
                            <span className="text-xs bg-secondary/15 text-secondary px-2 py-0.5 rounded-full font-semibold">
                              -{parseFloat(cliente.descuento)}%
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <Badge variant={cliente.estado} size="sm">{cliente.estado}</Badge>
                  </div>
                  
                  <div className="space-y-2 text-sm">
                    {cliente.telefono && (
                      <div className="flex items-center gap-2 text-muted">
                        <Phone className="w-4 h-4" />
                        <span>{cliente.telefono}</span>
                      </div>
                    )}
                    {cliente.ciudad && (
                      <div className="flex items-center gap-2 text-muted">
                        <MapPin className="w-4 h-4" />
                        <span>{cliente.ciudad}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-muted">
                      <CreditCard className="w-4 h-4" />
                      <span>Límite: {formatCurrency(cliente.limite_credito)}</span>
                    </div>
                  </div>

                  <div className="flex justify-end gap-1 mt-4 pt-3 border-t border-border/50">
                    <button onClick={() => handleEdit(cliente)} className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-all">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => handleDelete(cliente.id)} className="p-2 rounded-lg text-muted hover:text-accent hover:bg-accent/5 transition-all">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </CardBody>
              </Card>
            ))}
          </div>
        )}
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Cliente' : 'Nuevo Cliente'} size="lg">
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>}
          
          <Input
            label="Nombre"
            value={formData.nombre}
            onChange={(e) => setFormData({ ...formData, nombre: e.target.value })}
            placeholder="Nombre completo"
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Teléfono"
              value={formData.telefono}
              onChange={(e) => setFormData({ ...formData, telefono: e.target.value })}
              placeholder="5512345678"
            />
            <Input
              label="Ciudad"
              value={formData.ciudad}
              onChange={(e) => setFormData({ ...formData, ciudad: e.target.value })}
              placeholder="Ciudad"
            />
          </div>
          
          <Input
            label="Dirección"
            value={formData.direccion}
            onChange={(e) => setFormData({ ...formData, direccion: e.target.value })}
            placeholder="Dirección completa"
          />
          
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Tipo de Cliente"
              value={formData.tipo_cliente}
              onChange={(e) => setFormData({ ...formData, tipo_cliente: e.target.value })}
              options={CLIENTE_TIPOS.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
            />
            <Input
              label="Límite de Crédito"
              type="number"
              value={formData.limite_credito}
              onChange={(e) => setFormData({ ...formData, limite_credito: e.target.value })}
              placeholder="$0.00"
            />
          </div>

          <div className="space-y-1">
            <Input
              label="Descuento (%)"
              type="number"
              min="0"
              max="100"
              step="0.5"
              value={formData.descuento}
              onChange={(e) => setFormData({ ...formData, descuento: e.target.value })}
              placeholder="0"
            />
            <p className="text-xs text-muted">Se aplica automáticamente en cotizaciones</p>
          </div>
          
          {!editando && (
            <div className="p-4 bg-secondary/10 rounded-xl border border-secondary/20 space-y-3">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={formData.crear_usuario}
                  onChange={(e) => setFormData({ ...formData, crear_usuario: e.target.checked })}
                  className="w-4 h-4 rounded border-border text-secondary focus:ring-secondary"
                />
                <span className="text-sm font-medium text-primary">Crear usuario para login</span>
              </label>
              
              {formData.crear_usuario && (
                <div className="grid grid-cols-2 gap-3">
                  <Input
                    label="Usuario"
                    value={formData.username}
                    onChange={(e) => setFormData({ ...formData, username: e.target.value })}
                    placeholder="Username"
                  />
                  <Input
                    label="Contraseña"
                    type="password"
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    placeholder="Cliente@2024"
                  />
                </div>
              )}
            </div>
          )}
          
          {/* Saldo inicial - mostrar siempre (crear y editar) */}
          <div className="space-y-2">
            <Input
              label="Saldo Deuda Inicial"
              type="number"
              value={formData.saldo_inicial}
              onChange={(e) => setFormData({ ...formData, saldo_inicial: e.target.value })}
              placeholder="0.00"
            />
            <p className="text-xs text-muted">
              Deuda que el cliente tenía antes de usar el sistema. Se suma al saldo pendiente en cartera.
            </p>
          </div>

          {/* Estado solo al editar */}
          {editando && (
            <Select
              label="Estado"
              value={formData.estado}
              onChange={(e) => setFormData({ ...formData, estado: e.target.value })}
              options={CLIENTE_ESTADOS.map(s => ({ value: s, label: s.charAt(0).toUpperCase() + s.slice(1) }))}
            />
          )}
          
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary">{editando ? 'Actualizar' : 'Crear Cliente'}</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}