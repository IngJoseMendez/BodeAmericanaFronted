import { useEffect, useState, useMemo } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Select, Badge, Modal, useToast, useConfirm } from '../components/common';
import { pacasApi, lotesApi, tiposPacaApi } from '../services/api';
import { PACA_ESTADOS } from '../types';
import { Plus, Search, Edit2, Trash2, Layers, Hash, Grid, List, ChevronDown, ChevronRight, Package, Eye, EyeOff, Link, Unlink } from 'lucide-react';

function useDebounce(value, delay) {
  const [debouncedValue, setDebouncedValue] = useState(value);
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedValue(value), delay);
    return () => clearTimeout(handler);
  }, [value, delay]);
  return debouncedValue;
}

export default function Pacas() {
  const [pacas, setPacas] = useState([]);
  const [resumen, setResumen] = useState([]);
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroEstado, setFiltroEstado] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedPaca, setSelectedPaca] = useState(null);
  const [editando, setEditando] = useState(null);
  const [formData, setFormData] = useState({
    tipo: '', categoria: '', peso: '', costo_base: '', precio_venta: '', notas: '', cantidad: 1, lote_id: ''
  });
  const [error, setError] = useState('');
  const [vistaAgrupada, setVistaAgrupada] = useState(true);
  const [tiposExpandidos, setTiposExpandidos] = useState({});
  const [tiposList, setTiposList] = useState([]);
  const [categoriasList, setCategoriasList] = useState([]);
  const { addToast } = useToast();
  const confirm = useConfirm();

  const debouncedSearch = useDebounce(search, 300);

  useEffect(() => {
    loadPacas();
  }, [filtroEstado, filtroTipo, debouncedSearch]);

  useEffect(() => {
    loadLotes();
    loadTiposYCategorias();
  }, []);

  const loadPacas = async () => {
    try {
      setLoading(true);
      const params = {};
      if (filtroEstado) params.estado = filtroEstado;
      if (filtroTipo) params.tipo = filtroTipo;
      if (debouncedSearch) params.buscar = debouncedSearch;

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

  const loadLotes = async () => {
    try {
      const data = await lotesApi.getAll();
      setLotes(data);
    } catch (err) {
      console.error(err);
    }
  };

  const loadTiposYCategorias = async () => {
    try {
      const [tipos, cats] = await Promise.all([
        tiposPacaApi.getTipos(),
        tiposPacaApi.getCategorias(),
      ]);
      setTiposList(tipos.map(t => t.nombre));
      setCategoriasList(cats.map(c => c.nombre));
    } catch (err) {
      // fallback a hardcodeados si falla
      setTiposList(['premium', 'jeans', 'mixta', 'playera', 'formal', 'deportiva', 'americana']);
      setCategoriasList(['hombre', 'mujer', 'niño', 'unisex']);
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
    const ok = await confirm({
      title: '¿Eliminar paca?',
      message: 'La paca será eliminada del inventario permanentemente.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await pacasApi.delete(id);
      loadPacas();
      addToast('Paca eliminada', 'success');
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const openAssignModal = async (paca) => {
    setSelectedPaca(paca);
    setFormData(prev => ({ ...prev, lote_id: pacas.lote_id || '' }));
    setAssignModalOpen(true);
  };

  const handleAssignLote = async () => {
    try {
      const loteId = formData.lote_id === '' ? null : formData.lote_id;
      await pacasApi.update(selectedPaca.id, { lote_id: loteId });
      addToast(loteId ? 'Paca asignada al lote' : 'Paca desasignada del lote', 'success');
      setAssignModalOpen(false);
      loadPacas();
      loadLotes();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const getLoteNumero = (loteId) => {
    const lote = lotes.find(l => l.id === loteId);
    return lote ? lote.numero : null;
  };

  const resetForm = () => {
    setEditando(null);
    setFormData({ tipo: '', categoria: '', peso: '', costo_base: '', precio_venta: '', notas: '', cantidad: 1 });
  };

  const formatCurrency = (value) => {
    const num = parseFloat(value) || 0;
    return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(num);
  };

  const pacasAgrupadas = useMemo(() => {
    const grupos = {};
    pacas.forEach(paca => {
      if (!grupos[paca.tipo]) {
        grupos[paca.tipo] = { tipo: paca.tipo, pacas: [] };
      }
      grupos[paca.tipo].pacas.push(paca);
    });
    return Object.values(grupos).sort((a, b) => a.tipo.localeCompare(b.tipo));
  }, [pacas]);

  const toggleTipo = (tipo) => {
    setTiposExpandidos(prev => ({ ...prev, [tipo]: !prev[tipo] }));
  };

  return (
    <Layout title="Inventario" subtitle={`${pacas.length} pacas`}>
      <div className="space-y-6">
        {/* Resumen stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {resumen.slice(0, 4).map((r, i) => (
            <Card key={i} hover className="cursor-pointer" onClick={() => setFiltroTipo(r.tipo)}>
              <CardBody className="p-4">
                <div className="flex items-center gap-2 mb-2">
                  <Package className="w-4 h-4 text-secondary" />
                  <span className="font-medium text-sm">{r.tipo}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted">Disp</p>
                    <p className="font-bold text-success">{parseInt(r.disponibles) || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">Vend</p>
                    <p className="font-bold text-accent">{parseInt(r.vendidas) || 0}</p>
                  </div>
                  <div>
                    <p className="text-muted">Total</p>
                    <p className="font-bold text-primary">{parseInt(r.cantidad) || 0}</p>
                  </div>
                </div>
              </CardBody>
            </Card>
          ))}
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
              className="w-full pl-11 pr-4 py-3 rounded-xl border border-border bg-white focus:outline-none focus:ring-2 focus:ring-secondary/30"
            />
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="flex rounded-xl border border-border overflow-hidden">
              <button
                onClick={() => setVistaAgrupada(true)}
                className={`px-3 py-2 flex items-center gap-2 text-sm transition-colors ${vistaAgrupada ? 'bg-secondary text-primary font-medium' : 'bg-white text-muted hover:bg-gray-50'}`}
              >
                <Grid size={16} />
                <span className="hidden sm:inline">Agrupado</span>
              </button>
              <button
                onClick={() => setVistaAgrupada(false)}
                className={`px-3 py-2 flex items-center gap-2 text-sm transition-colors ${!vistaAgrupada ? 'bg-secondary text-primary font-medium' : 'bg-white text-muted hover:bg-gray-50'}`}
              >
                <List size={16} />
                <span className="hidden sm:inline">Lista</span>
              </button>
            </div>
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
              {tiposList.map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}

            </select>
            <Button onClick={() => { resetForm(); setModalOpen(true); }} variant="secondary">
              <Plus size={16} /> Nueva Paca
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-4 bg-accent/10 text-accent rounded-xl text-sm border border-accent/20">{error}</div>
        )}

        {/* Vista Agrupada */}
        {vistaAgrupada ? (
          <div className="space-y-3">
            {loading ? (
              [...Array(3)].map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardBody className="p-4"><div className="h-8 bg-gray-100 rounded" /></CardBody>
                </Card>
              ))
            ) : pacasAgrupadas.map((grupo, idx) => (
              <Card key={idx} className="overflow-hidden">
                <div 
                  className="flex items-center justify-between p-4 bg-primary/5 cursor-pointer hover:bg-primary/10 transition-colors"
                  onClick={() => toggleTipo(grupo.tipo)}
                >
                  <div className="flex items-center gap-3">
                    {tiposExpandidos[grupo.tipo] ? (
                      <ChevronDown className="w-5 h-5 text-muted" />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-muted" />
                    )}
                    <Layers className="w-5 h-5 text-secondary" />
                    <div>
                      <p className="font-bold text-primary">{grupo.tipo}</p>
                      <p className="text-xs text-muted">{grupo.pacas.length} pacas</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6 text-sm">
                    <div className="text-center">
                      <p className="text-xs text-muted">Disp</p>
                      <p className="font-bold text-success">{grupo.pacas.filter(p => p.estado === 'disponible').length}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted">Vend</p>
                      <p className="font-bold text-accent">{grupo.pacas.filter(p => p.estado === 'vendida').length}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted">Precio</p>
                      <p className="font-bold text-primary">{formatCurrency(grupo.pacas[0]?.precio_venta)}</p>
                    </div>
                  </div>
                </div>
                
                {tiposExpandidos[grupo.tipo] && (
                  <div className="border-t border-border/50">
                    <table className="w-full">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted">UUID</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted">Categoría</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted">Peso</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted">Costo</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted">Precio</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted">Lote</th>
                          <th className="px-4 py-2 text-left text-xs font-medium text-muted">Estado</th>
                          <th className="px-4 py-2 text-right text-xs font-medium text-muted">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border/50">
                        {grupo.pacas.map((paca) => (
                          <tr key={paca.id} className="hover:bg-primary/3">
                            <td className="px-4 py-2 text-xs text-muted font-mono">{paca.uuid?.slice(0, 8)}</td>
                            <td className="px-4 py-2 text-sm text-muted">{paca.categoria}</td>
                            <td className="px-4 py-2 text-sm text-muted">{paca.peso} kg</td>
                            <td className="px-4 py-2 text-sm text-muted">{formatCurrency(paca.costo_base)}</td>
                            <td className="px-4 py-2 text-sm font-medium text-primary">{formatCurrency(paca.precio_venta)}</td>
                            <td className="px-4 py-2">
                              {paca.lote_id ? (
                                <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">
                                  {getLoteNumero(paca.lote_id) || `#${paca.lote_id}`}
                                </span>
                              ) : (
                                <span className="text-xs text-muted">Sin lote</span>
                              )}
                            </td>
                            <td className="px-4 py-2"><Badge variant={paca.estado}>{paca.estado}</Badge></td>
                            <td className="px-4 py-2 text-right">
                              <div className="flex justify-end gap-1">
                                {paca.estado !== 'vendida' && (
                                  <button onClick={(e) => { e.stopPropagation(); openAssignModal(paca); }} className="p-1.5 rounded-lg text-muted hover:text-secondary hover:bg-secondary/10" title="Asignar a lote">
                                    <Link size={14} />
                                  </button>
                                )}
                                <button onClick={(e) => { e.stopPropagation(); handleEdit(paca); }} className="p-1.5 rounded-lg text-muted hover:text-primary hover:bg-primary/5">
                                  <Edit2 size={14} />
                                </button>
                                <button onClick={(e) => { e.stopPropagation(); handleDelete(paca.id); }} className="p-1.5 rounded-lg text-muted hover:text-accent hover:bg-accent/5" disabled={paca.estado === 'vendida'}>
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            ))}
          </div>
        ) : (
          /* Vista Lista/Tabla */
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
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Lote</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-muted uppercase">Estado</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-muted uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {loading ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">Cargando...</td></tr>
                  ) : pacas.length === 0 ? (
                    <tr><td colSpan={9} className="px-4 py-8 text-center text-muted">No hay pacas</td></tr>
                  ) : (
                    pacas.map((paca) => (
                      <tr key={paca.id} className="hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 text-sm text-muted font-mono">{paca.uuid?.slice(0, 8)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-primary">{paca.tipo}</td>
                        <td className="px-4 py-3 text-sm text-muted">{paca.categoria}</td>
                        <td className="px-4 py-3 text-sm text-muted">{paca.peso} kg</td>
                        <td className="px-4 py-3 text-sm text-muted">{formatCurrency(paca.costo_base)}</td>
                        <td className="px-4 py-3 text-sm font-medium text-primary">{formatCurrency(paca.precio_venta)}</td>
                        <td className="px-4 py-3">
                          {paca.lote_id ? (
                            <span className="text-xs bg-secondary/10 text-secondary px-2 py-0.5 rounded-full">
                              {getLoteNumero(paca.lote_id) || `#${paca.lote_id}`}
                            </span>
                          ) : (
                            <span className="text-xs text-muted">Sin lote</span>
                          )}
                        </td>
                        <td className="px-4 py-3"><Badge variant={paca.estado}>{paca.estado}</Badge></td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            {paca.estado !== 'vendida' && (
                              <button onClick={() => openAssignModal(paca)} className="p-2 rounded-lg text-muted hover:text-secondary hover:bg-secondary/10 transition-all" title="Asignar a lote">
                                <Link size={16} />
                              </button>
                            )}
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
        )}
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
              options={tiposList.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
              placeholder="Seleccionar..."
              required
            />
            <Select
              label="Categoría"
              value={formData.categoria}
              onChange={(e) => setFormData({ ...formData, categoria: e.target.value })}
              options={categoriasList.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
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

      {/* Modal Asignar a Lote */}
      <Modal isOpen={assignModalOpen} onClose={() => setAssignModalOpen(false)} title="Asignar a Lote">
        <div className="space-y-4">
          {selectedPaca && (
            <div className="p-4 bg-gray-50 rounded-xl">
              <p className="text-sm text-muted">Paca seleccionada</p>
              <p className="font-medium">{selectedPaca.tipo} - {selectedPaca.categoria}</p>
              <p className="text-sm text-muted">Precio: {formatCurrency(selectedPaca.precio_venta)}</p>
            </div>
          )}

          <Select
            label="Lote"
            value={formData.lote_id}
            onChange={(e) => setFormData({ ...formData, lote_id: e.target.value })}
            options={[
              { value: '', label: 'Sin asignar' },
              ...lotes.map(l => ({ value: l.id, label: `${l.numero} (${l.total_pacas || 0} pacas)` }))
            ]}
            placeholder="Seleccionar lote..."
          />

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setAssignModalOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button onClick={handleAssignLote} className="flex-1">
              Asignar
            </Button>
          </div>
        </div>
      </Modal>
    </Layout>
  );
}
