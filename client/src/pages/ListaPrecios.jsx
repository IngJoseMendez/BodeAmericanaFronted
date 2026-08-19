import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, Input, useToast } from '../components/common';
import { listaPreciosApi } from '../services/api';
import ExcelJS from 'exceljs';
import { Tag, Search, Download, AlertCircle } from 'lucide-react';
import { hoy } from '../lib/fecha';
import { formatCOP } from '../lib/money';

const formatCurrency = formatCOP;

export default function ListaPrecios() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [buscar, setBuscar] = useState('');
  const { addToast } = useToast();

  const load = async () => {
    try {
      setLoading(true);
      const data = await listaPreciosApi.getAll(buscar ? { buscar } : {});
      setRows(data);
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [buscar]);

  const exportar = async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Lista de Precios');
    ws.columns = [
      { header: 'Referencia', key: 'referencia', width: 18 },
      { header: 'Calidad', key: 'calidad', width: 18 },
      { header: 'Precio', key: 'precio', width: 16 },
      { header: 'Precio de Promoción', key: 'precio_promocion', width: 20 },
      { header: 'Disponibles', key: 'disponibles', width: 14 },
    ];
    rows.forEach(r => ws.addRow({
      referencia: r.referencia,
      calidad: r.calidad,
      precio: parseFloat(r.precio) || 0,
      precio_promocion: r.precio_promocion != null ? parseFloat(r.precio_promocion) : '',
      disponibles: r.disponibles,
    }));
    ws.getRow(1).font = { bold: true };
    const buf = await wb.xlsx.writeBuffer();
    const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `lista-precios-${hoy()}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="text-2xl font-display text-primary flex items-center gap-2">
              <Tag className="w-6 h-6" /> Lista de Precios
            </h1>
            <p className="text-sm text-muted">Precios sobre el inventario disponible (físico − despachadas − separadas)</p>
          </div>
          <button onClick={exportar} className="flex items-center gap-2 px-4 py-2 rounded-xl bg-secondary text-white text-sm font-medium">
            <Download size={16} /> Exportar Excel
          </button>
        </div>

        <Card>
          <CardBody>
            <div className="relative mb-4 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <Input
                value={buscar}
                onChange={(e) => setBuscar(e.target.value)}
                placeholder="Buscar referencia, calidad o clasificación..."
                className="pl-9"
              />
            </div>

            {loading ? (
              <p className="text-center text-muted py-8">Cargando...</p>
            ) : rows.length === 0 ? (
              <p className="text-center text-muted py-8 flex items-center justify-center gap-2">
                <AlertCircle size={16} /> Sin inventario disponible
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-muted">
                      <th className="px-3 py-2">Referencia</th>
                      <th className="px-3 py-2">Calidad</th>
                      <th className="px-3 py-2 text-right">Precio</th>
                      <th className="px-3 py-2 text-right">Precio de Promoción</th>
                      <th className="px-3 py-2 text-right">Disponibles</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r, idx) => (
                      <tr key={idx} className="border-b border-border/50 hover:bg-surface/50">
                        <td className="px-3 py-2 font-medium">{r.referencia}</td>
                        <td className="px-3 py-2">{r.calidad || '—'}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatCurrency(r.precio)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {r.precio_promocion != null ? (
                            <span className="text-amber-600 font-semibold">{formatCurrency(r.precio_promocion)}</span>
                          ) : '—'}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{r.disponibles}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardBody>
        </Card>
      </div>
    </Layout>
  );
}
