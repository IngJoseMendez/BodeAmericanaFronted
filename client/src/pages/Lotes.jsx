import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Badge, Modal, Input, Select, useToast, useConfirm } from '../components/common';
import { lotesApi } from '../services/api';
import { PACA_TIPOS, PACA_CATEGORIAS } from '../types';
import { Package, Plus, Edit, Trash2, DollarSign, TrendingUp, Calendar, User, Eye, Link, Unlink, Hash, Layers } from 'lucide-react';

const formatCurrency = (value) => {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0 }).format(value || 0);
};

export default function Lotes() {
  const [lotes, setLotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedLote, setSelectedLote] = useState(null);
  const [lotePacas, setLotePacas] = useState([]);
  const [pacasSinLote, setPacasSinLote] = useState([]);
  const [selectedPacas, setSelectedPacas] = useState([]);
  const [editMode, setEditMode] = useState(false);
  const { addToast } = useToast();
  const confirm = useConfirm();

  const [form, setForm] = useState({
    numero: '',
    proveedor: '',
    fecha_compra: '',
    costo_total: '',
    notas: ''
  });

  const [pacaForm, setPacaForm] = useState({
    tipo: '',
    categoria: '',
    cantidad: 1,
    precio_venta: '',
    costo_base: '',
    notas: ''
  });

  useEffect(() => {
    loadLotes();
  }, []);

  const loadLotes = async () => {
    setLoading(true);
    try {
      const data = await lotesApi.getAll();
      setLotes(data);
    } catch (err) {
      console.error(err);
      addToast('Error al cargar lotes', 'error');
    } finally {
      setLoading(false);
    }
  };

  const openCreateModal = () => {
    setEditMode(false);
    setForm({ numero: '', proveedor: '', fecha_compra: '', costo_total: '', notas: '' });
    setModalOpen(true);
  };

  const openEditModal = (lote) => {
    setEditMode(true);
    setSelectedLote(lote);
    setForm({
      numero: lote.numero || '',
      proveedor: lote.proveedor || '',
      fecha_compra: lote.fecha_compra || '',
      costo_total: lote.costo_total || '',
      notas: lote.notas || ''
    });
    setModalOpen(true);
  };

  const openViewModal = async (lote) => {
    setSelectedLote(lote);
    try {
      const pacas = await lotesApi.getPacas(lote.id);
      setLotePacas(pacas);
    } catch (err) {
      console.error(err);
      setLotePacas([]);
    }
    setViewModalOpen(true);
  };

  const openAssignModal = async (lote) => {
    setSelectedLote(lote);
    setSelectedPacas([]);
    try {
      const pacas = await lotesApi.getPacasSinLote();
      setPacasSinLote(pacas);
    } catch (err) {
      console.error(err);
      setPacasSinLote([]);
    }
    setAssignModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      const data = {
        ...form,
        costo_total: parseFloat(form.costo_total) || 0
      };

      if (editMode) {
        await lotesApi.update(selectedLote.id, data);
        addToast('Lote actualizado', 'success');
      } else {
        await lotesApi.create(data);
        addToast('Lote creado', 'success');
      }
      setModalOpen(false);
      loadLotes();
    } catch (err) {
      console.error(err);
      addToast('Error al guardar lote', 'error');
    }
  };

  const handleDelete = async (lote) => {
    const ok = await confirm({
      title: `¿Eliminar lote "${lote.numero}"?`,
      message: 'Las pacas serán desasignadas pero no eliminadas.',
      confirmText: 'Sí, eliminar',
      variant: 'danger',
    });
    if (!ok) return;
    try {
      await lotesApi.delete(lote.id);
      addToast('Lote eliminado', 'success');
      loadLotes();
    } catch (err) {
      console.error(err);
      addToast(err.message || 'No se puede eliminar', 'error');
    }
  };

  const handleCreatePacas = async (e) => {
    e.preventDefault();
    if (!pacaForm.tipo || !pacaForm.categoria) {
      addToast('Selecciona tipo y categoría', 'error');
      return;
    }

    try {
      const pacas = [];
      for (let i = 0; i < (parseInt(pacaForm.cantidad) || 1); i++) {
        pacas.push({
          tipo: pacaForm.tipo,
          categoria: pacaForm.categoria,
          precio_venta: parseFloat(pacaForm.precio_venta) || 0,
          costo_base: parseFloat(pacaForm.costo_base) || 0,
          notas: pacaForm.notas
        });
      }

      const result = await lotesApi.agregarPacas(selectedLote.id, pacas);
      addToast(result.mensaje, 'success');

      setPacaForm({ tipo: '', categoria: '', cantidad: 1, precio_venta: '', costo_base: '', notas: '' });
      loadLotes();

      const pacasActualizadas = await lotesApi.getPacas(selectedLote.id);
      setLotePacas(pacasActualizadas);
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Error al crear pacas', 'error');
    }
  };

  const handleAssignPacas = async () => {
    if (selectedPacas.length === 0) {
      addToast('Selecciona al menos una paca', 'error');
      return;
    }

    try {
      const result = await lotesApi.asignarPacas(selectedLote.id, selectedPacas);
      addToast(result.mensaje, 'success');

      setAssignModalOpen(false);
      setSelectedPacas([]);
      loadLotes();

      const pacasActualizadas = await lotesApi.getPacas(selectedLote.id);
      setLotePacas(pacasActualizadas);
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Error al asignar pacas', 'error');
    }
  };

  const handleDesasignarPaca = async (pacaId) => {
    const ok = await confirm({
      title: '¿Desasignar paca?',
      message: 'La paca quedará sin lote asignado.',
      confirmText: 'Desasignar',
      variant: 'warning',
    });
    if (!ok) return;

    try {
      await lotesApi.desasignarPaca(selectedLote.id, pacaId);
      addToast('Paca desasignada', 'success');

      const pacasActualizadas = await lotesApi.getPacas(selectedLote.id);
      setLotePacas(pacasActualizadas);
      loadLotes();
    } catch (err) {
      console.error(err);
      addToast(err.message || 'Error', 'error');
    }
  };

  const togglePacaSelection = (pacaId) => {
    setSelectedPacas(prev =>
      prev.includes(pacaId)
        ? prev.filter(id => id !== pacaId)
        : [...prev, pacaId]
    );
  };

  const getMargen = (lote) => {
    const costo = parseFloat(lote.costo_total) || 0;
    const vendido = parseFloat(lote.vendido_total || 0);
    if (costo === 0) return 0;
    return Math.round(((vendido - costo) / costo) * 100);
  };

  const totalPacaValue = lotePacas.reduce((sum, p) => sum + (parseFloat(p.precio_venta) || 0), 0);
  const totalCostoPacas = lotePacas.reduce((sum, p) => sum + (parseFloat(p.costo_base) || 0), 0);

  return (
    <Layout title="Lotes" subtitle="Gestión de lotes de inventario">
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <p className="text-muted">Administra los lotes de pacas compradas a proveedores</p>
            <p className="text-xs text-muted mt-1">
              Un lote agrupa pacas de una misma compra. Asigna pacas existentes o crea nuevas.
            </p>
          </div>
          <Button onClick={openCreateModal} icon={Plus}>
            Nuevo Lote
          </Button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-secondary"></div>
          </div>
        ) : lotes.length === 0 ? (
          <Card>
            <CardBody className="text-center py-12">
              <Layers className="w-16 h-16 mx-auto text-muted mb-4" />
              <h3 className="text-lg font-medium mb-2">No hay lotes registrados</h3>
              <p className="text-muted mb-4">Crea tu primer lote para comenzar a gestionar tu inventario</p>
              <Button onClick={openCreateModal} icon={Plus}>
                Crear Primer Lote
              </Button>
            </CardBody>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {lotes.map((lote) => {
              const margen = getMargen(lote);
              return (
                <Card key={lote.id} hover>
                  <CardBody>
                    <div className="flex justify-between items-start mb-4">
                      <div>
                        <h3 className="font-display text-xl font-bold text-primary">{lote.numero}</h3>
                        <p className="text-sm text-muted">{lote.proveedor || 'Sin proveedor'}</p>
                      </div>
                      <Badge variant={lote.estado === 'activo' ? 'success' : 'default'}>
                        {lote.estado}
                      </Badge>
                    </div>

                    <div className="space-y-3 mb-4">
                      <div className="flex items-center gap-2 text-sm">
                        <Package className="w-4 h-4 text-muted" />
                        <span>{lote.total_pacas || 0} pacas</span>
                        <span className="text-muted">|</span>
                        <span className="text-success">{lote.pacas_disponibles || 0} disp.</span>
                        <span className="text-muted">|</span>
                        <span className="text-accent">{lote.pacas_vendidas || 0} vend.</span>
                      </div>

                      <div className="flex items-center gap-2 text-sm">
                        <DollarSign className="w-4 h-4 text-muted" />
                        <span>Costo: {formatCurrency(lote.costo_total)}</span>
                      </div>

                      {lote.vendido_total && (
                        <div className="flex items-center gap-2 text-sm">
                          <TrendingUp className="w-4 h-4 text-muted" />
                          <span>Vendido: {formatCurrency(lote.vendido_total)}</span>
                          <Badge variant={margen >= 0 ? 'success' : 'error'}>
                            {margen >= 0 ? '+' : ''}{margen}%
                          </Badge>
                        </div>
                      )}

                      {lote.fecha_compra && (
                        <div className="flex items-center gap-2 text-sm">
                          <Calendar className="w-4 h-4 text-muted" />
                          <span>{new Date(lote.fecha_compra).toLocaleDateString('es-MX')}</span>
                        </div>
                      )}
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <Button variant="secondary" size="sm" onClick={() => openViewModal(lote)} icon={Eye}>
                        Ver Pacas
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openAssignModal(lote)} icon={Link}>
                        Asignar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => openEditModal(lote)} icon={Edit}>
                        Editar
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => handleDelete(lote)} icon={Trash2} className="text-error hover:bg-error/10">
                        Eliminar
                      </Button>
                    </div>
                  </CardBody>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal Crear/Editar Lote */}
      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editMode ? 'Editar Lote' : 'Nuevo Lote'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <Input
            label="Número de Lote"
            value={form.numero}
            onChange={(e) => setForm({ ...form, numero: e.target.value })}
            placeholder="Ej: LOTE-2024-001"
            required
          />

          <Input
            label="Proveedor"
            value={form.proveedor}
            onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
            placeholder="Nombre del proveedor"
          />

          <Input
            label="Fecha de Compra"
            type="date"
            value={form.fecha_compra}
            onChange={(e) => setForm({ ...form, fecha_compra: e.target.value })}
          />

          <Input
            label="Costo Total del Lote"
            type="number"
            value={form.costo_total}
            onChange={(e) => setForm({ ...form, costo_total: e.target.value })}
            placeholder="0.00"
            step="0.01"
          />

          <div>
            <label className="block text-sm font-medium text-primary mb-1">Notas</label>
            <textarea
              value={form.notas}
              onChange={(e) => setForm({ ...form, notas: e.target.value })}
              placeholder="Notas adicionales..."
              className="w-full px-4 py-2.5 rounded-xl border border-border focus:border-secondary focus:ring-2 focus:ring-secondary/20 outline-none transition-all resize-none"
              rows={3}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)} className="flex-1">
              Cancelar
            </Button>
            <Button type="submit" className="flex-1">
              {editMode ? 'Actualizar' : 'Crear Lote'}
            </Button>
          </div>
        </form>
      </Modal>

      {/* Modal Ver Detalle + Crear Pacas */}
      <Modal isOpen={viewModalOpen} onClose={() => setViewModalOpen(false)} title={`Lote: ${selectedLote?.numero}`} size="xl">
        {selectedLote && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="p-3 bg-primary/5 rounded-xl text-center">
                <p className="text-xs text-muted">Pacas</p>
                <p className="text-xl font-bold text-primary">{lotePacas.length}</p>
              </div>
              <div className="p-3 bg-primary/5 rounded-xl text-center">
                <p className="text-xs text-muted">Valor Total</p>
                <p className="text-xl font-bold text-primary">{formatCurrency(totalPacaValue)}</p>
              </div>
              <div className="p-3 bg-primary/5 rounded-xl text-center">
                <p className="text-xs text-muted">Costo Pacas</p>
                <p className="text-xl font-bold text-secondary">{formatCurrency(totalCostoPacas)}</p>
              </div>
              <div className="p-3 bg-primary/5 rounded-xl text-center">
                <p className="text-xs text-muted">Ganancia Est.</p>
                <p className="text-xl font-bold text-success">{formatCurrency(totalPacaValue - totalCostoPacas)}</p>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="p-4 bg-primary/5 rounded-xl">
                <p className="text-sm text-muted">Proveedor</p>
                <p className="font-medium">{selectedLote.proveedor || 'No especificado'}</p>
              </div>
              <div className="p-4 bg-primary/5 rounded-xl">
                <p className="text-sm text-muted">Fecha de Compra</p>
                <p className="font-medium">
                  {selectedLote.fecha_compra
                    ? new Date(selectedLote.fecha_compra).toLocaleDateString('es-MX')
                    : 'No especificada'}
                </p>
              </div>
              <div className="p-4 bg-primary/5 rounded-xl">
                <p className="text-sm text-muted">Costo Total del Lote</p>
                <p className="font-medium font-display">{formatCurrency(selectedLote.costo_total)}</p>
              </div>
              <div className="p-4 bg-primary/5 rounded-xl">
                <p className="text-sm text-muted">Total Vendido</p>
                <p className="font-medium font-display text-success">{formatCurrency(selectedLote.vendido_total || 0)}</p>
              </div>
            </div>

            {selectedLote.notas && (
              <div className="p-4 bg-secondary/5 rounded-xl">
                <p className="text-sm text-muted mb-1">Notas</p>
                <p className="text-sm">{selectedLote.notas}</p>
              </div>
            )}

            {/* Formulario para crear pacas */}
            <div className="border-t pt-6">
              <h4 className="font-medium mb-4 flex items-center gap-2">
                <Plus className="w-4 h-4" />
                Agregar Pacas a este Lote
              </h4>
              <form onSubmit={handleCreatePacas} className="space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <Select
                    label="Tipo"
                    value={pacaForm.tipo}
                    onChange={(e) => setPacaForm({ ...pacaForm, tipo: e.target.value })}
                    options={PACA_TIPOS.map(t => ({ value: t, label: t.charAt(0).toUpperCase() + t.slice(1) }))}
                    placeholder="Tipo..."
                  />
                  <Select
                    label="Categoría"
                    value={pacaForm.categoria}
                    onChange={(e) => setPacaForm({ ...pacaForm, categoria: e.target.value })}
                    options={PACA_CATEGORIAS.map(c => ({ value: c, label: c.charAt(0).toUpperCase() + c.slice(1) }))}
                    placeholder="Categoría..."
                  />
                  <Input
                    label="Precio Venta"
                    type="number"
                    value={pacaForm.precio_venta}
                    onChange={(e) => setPacaForm({ ...pacaForm, precio_venta: e.target.value })}
                    placeholder="0"
                  />
                  <Input
                    label="Costo Base"
                    type="number"
                    value={pacaForm.costo_base}
                    onChange={(e) => setPacaForm({ ...pacaForm, costo_base: e.target.value })}
                    placeholder="0"
                  />
                </div>

                <div className="flex items-end gap-3">
                  <div className="flex items-center gap-2 p-3 bg-secondary/10 rounded-xl border border-secondary/20">
                    <Hash className="w-4 h-4 text-secondary" />
                    <div>
                      <label className="block text-xs font-medium text-primary">Cantidad</label>
                      <input
                        type="number"
                        min="1"
                        max="100"
                        value={pacaForm.cantidad}
                        onChange={(e) => setPacaForm({ ...pacaForm, cantidad: e.target.value })}
                        className="w-16 px-2 py-1 rounded border text-center font-bold"
                      />
                    </div>
                  </div>
                  <Input
                    label="Notas"
                    value={pacaForm.notas}
                    onChange={(e) => setPacaForm({ ...pacaForm, notas: e.target.value })}
                    placeholder="Notas..."
                    className="flex-1"
                  />
                  <Button type="submit" variant="secondary" icon={Plus}>
                    Crear {pacaForm.cantidad > 1 ? `${pacaForm.cantidad} Pacas` : 'Paca'}
                  </Button>
                </div>
              </form>
            </div>

            {/* Lista de pacas del lote */}
            <div>
              <h4 className="font-medium mb-3">Pacas del Lote ({lotePacas.length})</h4>
              {lotePacas.length === 0 ? (
                <p className="text-center text-muted py-8 bg-primary/5 rounded-xl">
                  Este lote aún no tiene pacas. Usa el formulario de arriba para agregar.
                </p>
              ) : (
                <div className="overflow-x-auto max-h-80 overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-primary/10 sticky top-0">
                      <tr>
                        <th className="px-4 py-2 text-left">Tipo</th>
                        <th className="px-4 py-2 text-left">Categoría</th>
                        <th className="px-4 py-2 text-right">Costo</th>
                        <th className="px-4 py-2 text-right">Precio Venta</th>
                        <th className="px-4 py-2 text-center">Estado</th>
                        <th className="px-4 py-2 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {lotePacas.map((paca) => (
                        <tr key={paca.id} className="hover:bg-primary/5">
                          <td className="px-4 py-2 font-medium">{paca.tipo}</td>
                          <td className="px-4 py-2 text-muted">{paca.categoria}</td>
                          <td className="px-4 py-2 text-right text-muted">{formatCurrency(paca.costo_base)}</td>
                          <td className="px-4 py-2 text-right font-medium">{formatCurrency(paca.precio_venta)}</td>
                          <td className="px-4 py-2 text-center">
                            <Badge
                              variant={
                                paca.estado === 'vendida' ? 'success' :
                                paca.estado === 'disponible' ? 'info' : 'default'
                              }
                            >
                              {paca.estado}
                            </Badge>
                          </td>
                          <td className="px-4 py-2 text-right">
                            {paca.estado !== 'vendida' && (
                              <button
                                onClick={() => handleDesasignarPaca(paca.id)}
                                className="p-1.5 rounded-lg text-muted hover:text-error hover:bg-error/10"
                                title="Desasignar del lote"
                              >
                                <Unlink size={14} />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      {/* Modal Asignar Pacas Existentes */}
      <Modal isOpen={assignModalOpen} onClose={() => setAssignModalOpen(false)} title={`Asignar Pacas al Lote: ${selectedLote?.numero}`} size="lg">
        <div className="space-y-4">
          <p className="text-sm text-muted">
            Selecciona las pacas que quieres asignar a este lote. Solo se muestran pacas sin lote asignado.
          </p>

          {pacasSinLote.length === 0 ? (
            <div className="text-center py-8 bg-primary/5 rounded-xl">
              <Package className="w-12 h-12 mx-auto text-muted mb-3" />
              <p className="text-muted">No hay pacas sin asignar</p>
              <p className="text-xs text-muted mt-1">Todas las pacas ya pertenecen a un lote</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 bg-secondary/10 rounded-xl">
                <span className="text-sm">
                  {selectedPacas.length} de {pacasSinLote.length} seleccionadas
                </span>
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedPacas(pacasSinLote.map(p => p.id))}
                    className="text-xs text-secondary hover:underline"
                  >
                    Seleccionar todas
                  </button>
                  <span className="text-muted">|</span>
                  <button
                    onClick={() => setSelectedPacas([])}
                    className="text-xs text-muted hover:text-primary hover:underline"
                  >
                    Limpiar
                  </button>
                </div>
              </div>

              <div className="overflow-x-auto max-h-96 overflow-y-auto border rounded-xl">
                <table className="w-full text-sm">
                  <thead className="bg-primary/5 sticky top-0">
                    <tr>
                      <th className="px-4 py-2 text-left w-10"></th>
                      <th className="px-4 py-2 text-left">Tipo</th>
                      <th className="px-4 py-2 text-left">Categoría</th>
                      <th className="px-4 py-2 text-right">Precio</th>
                      <th className="px-4 py-2 text-center">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {pacasSinLote.map((paca) => (
                      <tr
                        key={paca.id}
                        className={`hover:bg-primary/5 cursor-pointer ${selectedPacas.includes(paca.id) ? 'bg-secondary/5' : ''}`}
                        onClick={() => togglePacaSelection(paca.id)}
                      >
                        <td className="px-4 py-2">
                          <input
                            type="checkbox"
                            checked={selectedPacas.includes(paca.id)}
                            onChange={() => togglePacaSelection(paca.id)}
                            className="rounded border-border"
                          />
                        </td>
                        <td className="px-4 py-2 font-medium">{paca.tipo}</td>
                        <td className="px-4 py-2 text-muted">{paca.categoria}</td>
                        <td className="px-4 py-2 text-right">{formatCurrency(paca.precio_venta)}</td>
                        <td className="px-4 py-2 text-center">
                          <Badge variant={paca.estado}>{paca.estado}</Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="flex gap-3 pt-2">
                <Button type="button" variant="ghost" onClick={() => setAssignModalOpen(false)} className="flex-1">
                  Cancelar
                </Button>
                <Button onClick={handleAssignPacas} className="flex-1" disabled={selectedPacas.length === 0}>
                  Asignar {selectedPacas.length > 0 ? `${selectedPacas.length} Paca(s)` : 'Pacas'}
                </Button>
              </div>
            </>
          )}
        </div>
      </Modal>
    </Layout>
  );
}
