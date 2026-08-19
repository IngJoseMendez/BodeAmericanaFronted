import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Button, TableSkeleton, EmptyState, RefLink } from '../components/common';
import { auditoriaApi } from '../services/api';
import { useToast } from '../components/common';
import { useAuth } from '../context/AuthContext';
import { Shield, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import ExcelJS from 'exceljs';
import { aFecha, hoy } from '../lib/fecha';

const ACTION_COLORS = {
  CREATE:   'bg-success/15 text-success',
  UPDATE:   'bg-secondary/15 text-secondary',
  DELETE:   'bg-error/15 text-error',
  FINALIZAR:'bg-accent/15 text-accent',
};

const ENTIDADES = ['precio', 'contenedor', 'venta', 'paca'];
const ACCIONES  = ['CREATE', 'UPDATE', 'DELETE', 'FINALIZAR'];

// Entidades que tienen panel destino para seguir el rastro
const ENTIDAD_RUTA = {
  contenedor: '/contenedores',
  cotizacion: '/cotizaciones',
  cliente:    '/cartera',
  despacho:   '/despachos',
};

// Se usa aFecha() del helper para no repetir el parseo a mano; aquí sí hace
// falta la hora, por eso no se usa formatFecha() directamente.
const formatDate = (d) => {
  const f = aFecha(d);
  return f
    ? f.toLocaleString('es-CO', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '—';
};

// Cuántos registros se piden al exportar. La tabla pagina de 50 en 50, pero el
// Excel debe traer todo lo que casa con los filtros, no solo la página visible.
const LIMITE_EXPORT = 5000;

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

  const [exportando, setExportando] = useState(false);

  const { addToast }  = useToast();
  const { tieneRol }  = useAuth();

  const LIMITE = 50;

  // Los hooks se registran siempre, así que el "Acceso restringido" de más
  // abajo llegaba tarde: el efecto ya había disparado GET /auditoria y un
  // vendedor veía el toast de error encima de la pantalla de acceso denegado.
  const esAdmin = tieneRol('admin');

  useEffect(() => {
    if (!esAdmin) return;
    loadLogs();
  }, [esAdmin, pagina, filtroEntidad, filtroAccion, filtroDesde, filtroHasta]);

  // Filtros activos en el formato del servidor. Los comparten la tabla y la
  // exportación, para que el Excel salga con exactamente lo que se ve.
  const filtrosActivos = () => {
    const params = {};
    if (filtroEntidad) params.entidad = filtroEntidad;
    if (filtroAccion)  params.accion  = filtroAccion;
    if (filtroDesde)   params.desde   = filtroDesde;
    if (filtroHasta)   params.hasta   = filtroHasta;
    return params;
  };

  // Cambiar un filtro tiene que volver a la página 1. Antes eso se hacía en un
  // efecto aparte y se pedían los registros dos veces: una con la página vieja y
  // otra con la 1, y a veces ganaba la carrera la respuesta equivocada.
  const cambiarFiltro = (setter) => (e) => {
    setter(e.target.value);
    setPagina(1);
  };

  const loadLogs = async () => {
    setLoading(true);
    try {
      const data = await auditoriaApi.getAll({ page: pagina, limit: LIMITE, ...filtrosActivos() });
      setLogs(data.data || []);
      setTotal(data.total || 0);
      setTotalPaginas(data.total_paginas || 1);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const exportarExcel = async () => {
    setExportando(true);
    try {
      const data = await auditoriaApi.getAll({ page: 1, limit: LIMITE_EXPORT, ...filtrosActivos() });
      const filas = data.data || [];
      if (filas.length === 0) {
        addToast('No hay registros para exportar con estos filtros', 'info');
        return;
      }

      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet('Auditoría');
      ws.columns = [
        { header: 'Fecha / Hora', key: 'fecha',       width: 22 },
        { header: 'Usuario',      key: 'usuario',     width: 24 },
        { header: 'Acción',       key: 'accion',      width: 14 },
        { header: 'Entidad',      key: 'entidad',     width: 22 },
        { header: 'Descripción',  key: 'descripcion', width: 60 },
        { header: 'IP',           key: 'ip',          width: 18 },
      ];
      ws.getRow(1).font = { bold: true };
      filas.forEach(log => {
        ws.addRow({
          fecha:       formatDate(log.created_at),
          usuario:     log.usuario_nombre || '—',
          accion:      log.accion || '—',
          entidad:     `${log.entidad || '—'}${log.entidad_id ? ` #${log.entidad_id}` : ''}`,
          descripcion: log.descripcion || '—',
          ip:          log.ip_address || '—',
        });
      });

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `auditoria-${hoy()}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);

      // El servidor puede recortar el `limit` que le pedimos. Si eso pasa, el
      // Excel sale incompleto y en un registro de auditoría nadie tiene cómo
      // notarlo: hay que decirlo, no dar por bueno el archivo.
      const totalFiltrado = Number(data.total) || filas.length;
      if (totalFiltrado > filas.length) {
        addToast(
          `Se exportaron ${filas.length} de ${totalFiltrado} registros. Acota las fechas para bajar el resto.`,
          'info'
        );
      } else {
        addToast(`${filas.length} registros exportados`, 'success');
      }
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setExportando(false);
    }
  };

  if (!esAdmin) {
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
        <div className="flex flex-wrap items-center gap-3">
          <select value={filtroEntidad} onChange={cambiarFiltro(setFiltroEntidad)} className={inp} aria-label="Filtrar por entidad">
            <option value="">Todas las entidades</option>
            {ENTIDADES.map(e => <option key={e} value={e}>{e.charAt(0).toUpperCase() + e.slice(1)}</option>)}
          </select>
          <select value={filtroAccion} onChange={cambiarFiltro(setFiltroAccion)} className={inp} aria-label="Filtrar por acción">
            <option value="">Todas las acciones</option>
            {ACCIONES.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <input type="date" value={filtroDesde} onChange={cambiarFiltro(setFiltroDesde)} className={inp} aria-label="Desde" title="Desde" />
          <input type="date" value={filtroHasta} onChange={cambiarFiltro(setFiltroHasta)} className={inp} aria-label="Hasta" title="Hasta" />
          <Button
            variant="outline"
            size="sm"
            icon={Download}
            onClick={exportarExcel}
            loading={exportando}
            disabled={loading}
            className="ml-auto"
          >
            Exportar
          </Button>
        </div>

        {/* Tabla */}
        <Card>
          <CardBody className="p-0">
            {loading ? (
              // TableSkeleton emite <tr>: sin la tabla alrededor, el navegador
              // saca esas filas del <div> y el esqueleto se ve descuadrado.
              <table className="w-full text-sm"><tbody><TableSkeleton rows={10} cols={5} /></tbody></table>
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
                        <td className="px-4 py-3 capitalize text-muted">
                          {ENTIDAD_RUTA[log.entidad] && log.entidad_id ? (
                            <RefLink to={ENTIDAD_RUTA[log.entidad]} id={log.entidad_id} title={`Ver ${log.entidad}`}>
                              {log.entidad} #{log.entidad_id}
                            </RefLink>
                          ) : (
                            <span>{log.entidad}{log.entidad_id ? ` #${log.entidad_id}` : ''}</span>
                          )}
                        </td>
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
                title="Página anterior"
                aria-label="Página anterior"
                className="p-2 rounded-lg border border-border hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              ><ChevronLeft size={15} /></button>
              <button
                disabled={pagina >= totalPaginas}
                onClick={() => setPagina(p => p + 1)}
                title="Página siguiente"
                aria-label="Página siguiente"
                className="p-2 rounded-lg border border-border hover:bg-primary/5 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              ><ChevronRight size={15} /></button>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
}
