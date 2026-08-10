import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, Input, Modal, useToast, useConfirm } from '../components/common';
import { cuentasApi } from '../services/api';
import { Wallet, Plus, Trash2, Pencil, Landmark, Building2 } from 'lucide-react';

// Tipos base. La lista se amplía sola con cualquier tipo que ya se haya usado,
// así que se pueden crear tipos nuevos desde esta misma pantalla.
const TIPOS_BASE = [
  { value: 'banco', label: 'Banco' },
  { value: 'caja', label: 'Caja' },
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'billetera', label: 'Billetera digital' },
  { value: 'tarjeta', label: 'Tarjeta' },
];

// Semilla de entidades colombianas frecuentes. No es una lista cerrada: lo que se
// escriba aquí queda disponible para las siguientes cuentas.
const BANCOS_SUGERIDOS = [
  'Bancolombia', 'Davivienda', 'Banco de Bogotá', 'BBVA Colombia', 'Banco de Occidente',
  'Banco Popular', 'Banco Caja Social', 'Banco Agrario', 'Scotiabank Colpatria',
  'Itaú', 'Banco AV Villas', 'Banco Falabella', 'Bancoomeva',
  'Nequi', 'Daviplata', 'Nu Colombia', 'Lulo Bank', 'Movii',
];

const capitalizar = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : '');

export default function Cuentas() {
  const [cuentas, setCuentas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState(null);
  const [form, setForm] = useState({ nombre: '', tipo: 'banco', banco: '', numero_cuenta: '' });
  const { addToast } = useToast();
  const confirm = useConfirm();

  // Catálogos vivos: se arman con las semillas más todo lo ya registrado, de modo
  // que cada banco o tipo nuevo que se escriba queda disponible desde el panel.
  const bancosDisponibles = Array.from(new Set([
    ...cuentas.map(c => (c.banco || '').trim()).filter(Boolean),
    ...BANCOS_SUGERIDOS,
  ])).sort((a, b) => a.localeCompare(b, 'es'));

  const tiposDisponibles = Array.from(new Set([
    ...TIPOS_BASE.map(t => t.value),
    ...cuentas.map(c => (c.tipo || '').trim().toLowerCase()).filter(Boolean),
  ]));

  const bancosEnUso = Array.from(new Set(
    cuentas.filter(c => c.activo !== false).map(c => (c.banco || '').trim()).filter(Boolean)
  )).sort((a, b) => a.localeCompare(b, 'es'));

  // Deep-link: ?focus=<id> resalta la cuenta referenciada (trazabilidad)
  const [searchParams, setSearchParams] = useSearchParams();
  const [highlightId, setHighlightId] = useState(null);
  useEffect(() => {
    const focus = searchParams.get('focus');
    if (!focus) return;
    setHighlightId(Number(focus));
    setSearchParams({}, { replace: true });
    const t = setTimeout(() => setHighlightId(null), 3000);
    return () => clearTimeout(t);
  }, [searchParams]);

  const load = async () => {
    try {
      setLoading(true);
      const data = await cuentasApi.getAll({ todas: 'true' });
      setCuentas(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const openCreate = () => {
    setEditando(null);
    setForm({ nombre: '', tipo: 'banco', banco: '', numero_cuenta: '' });
    setModalOpen(true);
  };
  const openEdit = (c) => {
    setEditando(c);
    setForm({ nombre: c.nombre, tipo: c.tipo, banco: c.banco || '', numero_cuenta: c.numero_cuenta || '' });
    setModalOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.nombre.trim()) { addToast('Nombre requerido', 'error'); return; }
    if (form.tipo === 'banco' && !form.banco.trim()) {
      addToast('Indica de qué banco es la cuenta', 'error');
      return;
    }
    const datos = {
      ...form,
      nombre: form.nombre.trim(),
      // Solo las cuentas de banco guardan entidad y número.
      banco: form.tipo === 'banco' ? form.banco.trim() : '',
      numero_cuenta: form.tipo === 'banco' ? form.numero_cuenta.trim() : '',
    };
    try {
      if (editando) await cuentasApi.update(editando.id, datos);
      else await cuentasApi.create(datos);
      addToast(editando ? 'Cuenta actualizada' : 'Cuenta creada', 'success');
      setModalOpen(false);
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  const handleDelete = async (c) => {
    const ok = await confirm({ title: '¿Desactivar cuenta?', message: `Se desactivará "${c.nombre}".`, confirmText: 'Desactivar', variant: 'danger' });
    if (!ok) return;
    try {
      await cuentasApi.delete(c.id);
      addToast('Cuenta desactivada', 'success');
      load();
    } catch (err) {
      addToast(err.message, 'error');
    }
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-primary flex items-center gap-2">
              <Wallet className="w-6 h-6" /> Cuentas
            </h1>
            <p className="text-sm text-muted">Bancos y cajas por donde entra y sale la plata. Se usan al registrar abonos y gastos.</p>
          </div>
          <Button onClick={openCreate}><Plus size={16} /> Nueva cuenta</Button>
        </div>

        {bancosEnUso.length > 0 && (
          <Card>
            <CardBody className="py-3">
              <p className="text-[11px] font-bold text-muted uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <Building2 size={13} /> Bancos registrados ({bancosEnUso.length})
              </p>
              <div className="flex flex-wrap gap-1.5">
                {bancosEnUso.map(b => {
                  const n = cuentas.filter(c => c.activo !== false && (c.banco || '').trim() === b).length;
                  return (
                    <span key={b} className="inline-flex items-center gap-1.5 text-xs bg-secondary/10 text-secondary font-medium px-2.5 py-1 rounded-full">
                      {b}
                      {n > 1 && <span className="text-[10px] bg-secondary/20 px-1.5 rounded-full tabular-nums">{n}</span>}
                    </span>
                  );
                })}
              </div>
              <p className="text-xs text-muted mt-2">
                Para agregar un banco nuevo, créale una cuenta y escríbelo en el campo <b>Banco</b>: queda disponible desde ese momento.
              </p>
            </CardBody>
          </Card>
        )}

        <Card>
          <CardBody>
            {loading ? (
              <p className="text-center text-muted py-8">Cargando...</p>
            ) : cuentas.length === 0 ? (
              <p className="text-center text-muted py-8">Sin cuentas registradas</p>
            ) : (
              <div className="space-y-2">
                {cuentas.map(c => (
                  <div key={c.id} className={`flex items-center justify-between p-3 rounded-xl border transition-colors ${highlightId === c.id ? 'border-secondary bg-secondary/10 ring-2 ring-secondary/30' : 'border-border'} ${!c.activo ? 'opacity-50' : ''}`}>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium">{c.nombre}</span>
                        <span className="text-[10px] font-bold uppercase tracking-wide text-muted bg-primary/5 px-1.5 py-0.5 rounded">{c.tipo}</span>
                        {!c.activo && <span className="text-xs text-red-500">(inactiva)</span>}
                      </div>
                      {c.banco && (
                        <p className="text-xs text-muted mt-0.5 flex items-center gap-1">
                          <Landmark size={12} className="flex-shrink-0" />
                          <span className="font-medium text-secondary">{c.banco}</span>
                          {c.numero_cuenta && <span className="font-mono">· N.º {c.numero_cuenta}</span>}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => openEdit(c)} className="p-2 text-muted hover:text-primary"><Pencil size={16} /></button>
                      {c.activo && <button onClick={() => handleDelete(c)} className="p-2 text-muted hover:text-red-500"><Trash2 size={16} /></button>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardBody>
        </Card>
      </div>

      <Modal isOpen={modalOpen} onClose={() => setModalOpen(false)} title={editando ? 'Editar cuenta' : 'Nueva cuenta'}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-primary mb-1">Tipo de cuenta</label>
            <select
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
            >
              {tiposDisponibles.map(t => (
                <option key={t} value={t}>
                  {TIPOS_BASE.find(b => b.value === t)?.label || capitalizar(t)}
                </option>
              ))}
            </select>
          </div>

          {form.tipo === 'banco' && (
            <>
              <div>
                <label className="block text-sm font-medium text-primary mb-1" htmlFor="cuenta-banco">
                  Banco <span className="text-error">*</span>
                </label>
                <input
                  id="cuenta-banco"
                  list="lista-bancos"
                  value={form.banco}
                  onChange={(e) => setForm({ ...form, banco: e.target.value })}
                  placeholder="Escribe o elige: Bancolombia, Nequi…"
                  autoComplete="off"
                  className="w-full px-4 py-2.5 rounded-xl border border-border focus:outline-none focus:ring-2 focus:ring-secondary/30"
                  required
                />
                <datalist id="lista-bancos">
                  {bancosDisponibles.map(b => <option key={b} value={b} />)}
                </datalist>
                <p className="text-xs text-muted mt-1">
                  Si el banco no está en la lista, escríbelo: queda guardado y aparecerá como opción la próxima vez.
                </p>
              </div>

              <Input
                label="Número de cuenta (opcional)"
                value={form.numero_cuenta}
                onChange={(e) => setForm({ ...form, numero_cuenta: e.target.value })}
                placeholder="Ej: 123-456789-01"
              />
            </>
          )}

          <Input
            label="Nombre con el que la verás"
            value={form.nombre}
            onChange={(e) => setForm({ ...form, nombre: e.target.value })}
            placeholder={form.tipo === 'banco' ? 'Ej: Bancolombia ahorros gerencia' : 'Ej: Caja principal'}
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setModalOpen(false)}>Cancelar</Button>
            <Button type="submit">{editando ? 'Guardar' : 'Crear'}</Button>
          </div>
        </form>
      </Modal>
    </Layout>
  );
}
