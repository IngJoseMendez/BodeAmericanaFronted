import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast } from '../components/common';
import { pacasApi } from '../services/api';
import { PACA_TIPOS, PACA_CATEGORIAS, PACA_ESTADOS } from '../types';
import { Plus, Search, Edit2, Trash2, Layers, Hash } from 'lucide-react';

export default function Pacas() {
  const [pacas, setPacas] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState({
    tipo: '', categoria: '', peso: '', costo_base: '', precio_venta: '', notas: '', cantidad: 1
  });
  const [error, setError] = useState('');
  const { addToast } = useToast();

  useEffect(() => {
    loadPacas();
  }, [filtroEstado, filtroTipo]);

  const loadPacas = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroTipo) params.tipo = filtroTipo;
      if (search) params.buscar = search;
      
      const [data, resumenData] = await Promise.all([
        pacasApi.getAll(params),
        pacasApi.getResumen()
      ]);
      
      setPacas(data.data || data);
      setResumen(resumenData || []);
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
        tipo: formData.tipo,
        categoria: formData.categoria,
        peso: parseFloat(formData.peso) || 0,
        costo_base: parseFloat(formData.costo_base) || 0,
        precio_venta: parseFloat(formData.precio_venta) || 0,
        notas: formData.notas,
        cantidad: parseInt(formData.cantidad) || 1
      };
      
      if (editando) {
        await pacasApi.update(editando.id, payload);
        addToast('Paca actualizada', 'success');
      } else {
        const result = await pacasApi.create(payload);
        if (result.cantidad > 1) {
          addToast(`${result.cantidad} pacas creadas exitosamente`, 'success');
        } else {
          addToast('Paca creada', 'success');
        }
      }
      
      setModalOpen(false);
      resetForm();
      loadPacas();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleEdit = (paca) => {
    setEditando(paca);
    setFormData({
      tipo: paca.tipo,
      categoria: paca.categoria,
      peso: paca.peso,
      costo_base: paca.costo_base,
      precio_venta: paca.precio_venta,
      notas: paca.notas || '',
      cantidad: 1
    });
    setModalOpen(true);
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta paca?')) return;
    try {
      await pacasApi.delete(id);
      loadPacas();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const resetForm = () => {
    setEditando(null);
    setFormData({ tipo: '', categoria: '', peso: '', costo_base: '', precio_venta: '', notas: '', cantidad: 1 });
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value);
  };

  return (
    <Layout title="Inventario" subtitle={`${pacas.length} pacas`}>
      <div className="space-y-6">
        {/* Resumen por tipo */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {loading ? (
            [...Array(4)].map((_, i) => (
              <Card key={i} className="animate-pulse">
                <CardBody className="p-4">
                  <div className="h-4 w-20 bg-gray-100 rounded" />
                  <div className="h-6 w-12 bg-gray-100 rounded mt-2" />
                </CardBody>
              </Card>
            ))
          ) : (
            resumen.map((r, i) => (
              <Card 
                key={i} 
                hover 
                className="cursor-pointer"
                onClick={() => { setFiltroTipo(r.tipo); setModalOpen(false); }}
              >
                <CardBody className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <Layers className="w-4 h-4 text-secondary" />
                    <span className="font-medium text-sm">{r.tipo}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div>
                      <p className="text-muted">Disp</p>
                      <p className="font-bold text-success">{r.disponibles || 0}</p>
                    </div>
                    <div>
                      <p className="text-muted">Vend</p>
                      <p className="font-bold text-accent">{r.vendidas || 0}</p>
                    </div>
                    <div>
                      <p className="text-muted">Total</p>
                      <p className="font-bold text-primary">{r.cantidad || 0}</p>
                    </div>
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>

        {/* Filtros */}
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
            <input
              type="text"
              placeholder="Buscar por UUID o notas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadPacas()}
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div className="flex gap-2 flex-wrap">
            <select
              value={filtroEstado}
              onChange={(e) => setFiltroEstado(e.target.value)}
              className="px-4 py-3 rounded-xl border border-border bg-white"
            >
              <option value="">Todos los estados</option>
              {PACA_ESTADOS.map(s => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
            <select
              value={filtroTipo}
              onChange={(e) => setFiltroTipo(e.target.value)}
              className="px-4 py-3 rounded-xl border border-border bg-white"
            >
              <option value="">Todos los tipos</option>
              {PACA_TIPOS.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
            </select>
            <Button onClick={() => { resetForm(); setModalOpen(true); }} variant="secondary">
              <Plus size={16} /> Nueva Paca
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>
        )}

        {/* Tabla */}
        <Card padding={false}>
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="bg-primary/3 border-b border-border/50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">UUID</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Tipo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Categoría</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Peso</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Costo</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Precio</th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Estado</th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/50">
                {loading ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">Cargando...</td></tr>
                ) : pacas.length === 0 ? (
                  <tr><td colSpan={8} className="px-4 py-8 text-center text-muted">No hay pacas</td></tr>
                ) : (
                  pacas.map((paca) => (
                    <tr key={paca.id} className="hover:bg-primary/3 transition-colors">
                      <td className="px-4 py-3 text-sm text-muted font-mono">{paca.uuid?.slice(0, 8)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">{paca.tipo}</td>
                      <td className="px-4 py-3 text-sm text-muted">{paca.categoria}</td>
                      <td className="px-4 py-3 text-sm text-muted">{paca.peso} kg</td>
                      <td className="px-4 py-3 text-sm text-muted">{formatCurrency(paca.costo_base)}</td>
                      <td className="px-4 py-3 text-sm font-medium text-primary">{formatCurrency(paca.precio_venta)}</td>
                      <td className="px-4 py-3"><Badge variant={paca.estado}>{paca.estado}</Badge></td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => handleEdit(paca)} className="p-2 rounded-lg text-muted hover:text-primary hover:bg-primary/5 transition-all">
                            <Edit2 size={16} />
                          </button>
                          <button onClick={() => handleDelete(paca.id)} className="p-2 rounded-lg text-muted hover:text-accent hover:bg-accent/5 transition-all" disabled={paca.estado === 'vendida'}>
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>

      {/* Modal */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar Paca' : 'Nueva Paca'}>
        <form onSubmit={handleSubmit} className="space-y-5">
          {error && <div className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>}
          
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Tipo"
              value={formData.tipo}
              onChange={(e) => setFormData({ ...formData, tipo: e.target.value })}
              options={PACA_TIPOS.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
              placeholder="Seleccionar..."
              required
            />
            <Select
              label="Categoría"
              value={formData.categoria}
              onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              options={PACA_CATEGORIAS.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
              placeholder="Seleccionar..."
              required
            />
          </div>
          
          <Input
            label="Peso (kg)"
            type="number"
            step="0.01"
            value={formData.peso}
            onChange={(e) => setFormData({ ...formData, peso: e.target.value })}
            placeholder="0.00"
            suffix="kg"
            required
          />
          
          <div className="grid grid-cols-2 gap-4">
            <Input
              label="Costo Base"
              type="currency"
              value={formData.costo_base}
              onChange={(e) => setFormData({ ...formData, costo_base: e.target.value })}
              placeholder="0"
              required
            />
            <Input
              label="Precio Venta"
              type="currency"
              value={formData.precio_venta}
              onChange={(e) => setFormData({ ...formData, precio_venta: e.target.value })}
              placeholder="0"
              required
            />
          </div>

          {!editando && (
            <div className="flex items-center gap-3 p-4 bg-secondary/10 rounded-xl border border-secondary/20">
              <Hash className="w-5 h-5 text-secondary" />
              <div className="flex-1">
                <label className="block text-sm font-medium text-primary">Cantidad</label>
                <p className="text-xs text-muted">Número de pacas del mismo tipo</p>
              </div>
              <input
                type="number"
                min="1"
                max="100"
                value={formData.cantidad}
                onChange={(e) => setFormData({ ...formData, cantidad: e.target.value })}
                className="w-20 px-3 py-2 rounded-xl border border-border text-center font-bold"
              />
            </div>
          )}
          
          <Input
            label="Notas"
            value={formData.notas}
            onChange={(e) => setFormData({ ...formData, notas: e.target.value })}
            placeholder="Notas adicionales..."
          />
          
          <div className="flex justify-end gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit" variant="secondary">
              {editando ? 'Actualizar' : `Crear ${formData.cantidad > 1 ? formData.cantidad + ' pacas' : 'Paca'}`}
            </Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}