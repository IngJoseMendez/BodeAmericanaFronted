import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Badge, TableSkeleton, EmptyState } from '../components/common';
import { auditoriaApi } from '../services/api';
import { useToast } from '../components/common';
import { useAuth } from '../context/AuthContext';
import { Shield, ChevronLeft, ChevronRight } from 'lucide-react';

const ACTION_COLORS = {
  CREATE:   'bg-success/15 text-success',
  UPDATE:   'bg-secondary/15 text-secondary',
  DELETE:   'bg-error/15 text-error',
  FINALIZAR:'bg-accent/15 text-accent',
};

const ENTIDADES = ['precio', 'contenedor', 'venta', 'paca'];
const ACCIONES  = ['CREATE', 'UPDATE', 'DELETE', 'FINALIZAR'];

const formatDate = (d) =>
  d ? new Date(d).toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—';

export default function Auditoria() {
  const [logs, setLogs]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [pagina, setPagina]     = useState(1);
  const [total, setTotal]       = useState(0);
  const [totalPaginas, setTotalPaginas] = useState(1);

  const [filtroEntidad, setFiltroEntidad] = useState('');
  const [filtroAccion,  setFiltroAccion]  = useState('');
  const [filtroDesde,   setFiltroDesde]   = useState('');
  const [filtroHasta,   setFiltroHasta]   = useState('');

  const { addToast }  = useToast();
  const { tieneRol }  = useAuth();

  const LIMITE = 50;

  useEffect(() => {
    setPagina(1);
  }, [filtroEntidad, filtroAccion, filtroDesde, filtroHasta]);

  useEffect(() => {
    loadLogs();
  }, [pagina, filtroEntidad, filtroAccion, filtroDesde, filtroHasta]);

  const loadLogs = async () => {
    setLoading(true);
    try {
      const params = { page: pagina, limit: LIMITE };
      if (filtroEntidad) params.entidad = filtroEntidad;
      if (filtroAccion)  params.accion  = filtroAccion;
      if (filtroDesde)   params.desde   = filtroDesde;
      if (filtroHasta)   params.hasta   = filtroHasta;
      const data = await auditoriaApi.getAll(params);
      setLogs(data.data || []);
      setTotal(data.total || 0);
      setTotalPaginas(data.total_paginas || 1);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  if (!tieneRol('admin')) {
    return (
      <Layout title="Auditoría">
        <Card><CardBody className="text-center py-12 text-muted">Acceso restringido a administradores.</CardBody></Card>
      </Layout>
    );
  }

  const inp = 'px-3 py-2 rounded-xl border border-border bg-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/30';

  return (
    <Layout title="Auditoría" subtitle={`${total} registros encontrados`}>
      <div className="space-y-4">

        {/* Filtros */}
        <div className="flex flex-wrap gap-3">
          <select value={filtroEntidad} onChange={e => setFiltroEntidad(e.target.value)} className={inp}>
            <option value="">Todas las entidades</option>
            {ENTIDADES.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
          </select>
          <select value={filtroAccion} onChange={e => setFiltroAccion(e.target.value)} className={inp}>
            <option value="">Todas las acciones</option>
            {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" value={filtroDesde} onChange={e => setFiltroDesde(e.target.value)} className={inp} placeholder="Desde" />
          <input type="date" value={filtroHasta} onChange={e => setFiltroHasta(e.target.value)} className={inp} placeholder="Hasta" />
        </div>

        {/* Tabla */}
        <Card>
          <CardBody className="p-0">
            {loading ? (
              <TableSkeleton rows={10} cols={5} />
            ) : logs.length === 0 ? (
              <EmptyState icon={Shield} title="Sin registros" description="No hay actividad que coincida con los filtros." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left px-4 py-3 text-muted font-medium whitespace-nowrap">Fecha / Hora</th>
                      <th className="text-left px-4 py-3 text-muted font-medium">Usuario</th>
                      <th className="text-left px-4 py-3 text-muted font-medium">Acción</th>
                      <th className="text-left px-4 py-3 text-muted font-medium">Entidad</th>
                      <th className="text-left px-4 py-3 text-muted font-medium">Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map(log => (
                      <tr key={log.id} className="border-b border-border/50 hover:bg-primary/3 transition-colors">
                        <td className="px-4 py-3 text-muted text-xs whitespace-nowrap">{formatDate(log.created_at)}</td>
                        <td className="px-4 py-3 font-medium">{log.usuario_nombre || '—'}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${ACTION_COLORS[log.accion] || 'bg-primary/10 text-primary'}`}>
                            {log.accion}
                          </span>
                        </td>
                        <td className="px-4 py-3 capitalize text-muted">{log.entidad}{log.entidad_id ? ` #${log.entidad_id}` : ''}</td>
                        <td className="px-4 py-3 text-muted max-w-xs truncate">{log.descripcion || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>

        {/* Paginación */}
        {totalPaginas > 1 && (
          <div className="flex items-center justify-between text-sm text-muted">
            <span>Página {pagina} de {totalPaginas}</span>
            <div className="flex gap-2">
              <button
                disabled={pagina <= 1}
                onClick={() => setPagina(p => p - 1)}
                className="p-2 rounded-lg border border-border hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              ><ChevronLeft size={15} /></button>
              <button
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina(p => p + 1)}
                className="p-2 rounded-lg border border-border hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              ><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
