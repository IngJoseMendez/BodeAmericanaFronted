import { useEffect, useState } from 'react';
import { Layout } from '../components/layout/Layout';
import { Card, CardBody, useToast } from '../components/common';
import { clienteApi } from '../services/api';
import { Wallet, TrendingUp, TrendingDown, Loader } from 'lucide-react';

export default function CarteraCliente() {
  const [cartera, setCartera] = useState(null);
  const [loading, setLoading] = useState(true);
  const { addToast } = useToast();

  useEffect(() => {
    loadCartera();
  }, []);

  const loadCartera = async () => {
    try {
      const data = await clienteApi.getCartera();
      setCartera({
        saldo_inicial: data.saldo_inicial || 0,
        total_vendido: data.total_vendido,
        total_abonado: data.total_abonado,
        saldo_pendiente: data.saldo_pendiente,
        movimientos: data.movimientos
      });
    } catch (err) {
      addToast(err.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0 }).format(value || 0);
  };

  if (loading) {
    return (
      <Layout title="Mi Cartera">
        <Card><CardBody className="text-center text-muted">Cargando...</CardBody></Card>
      </Layout>
    );
  }

  return (
    <Layout title="Mi Cartera" subtitle="Resumen de cuenta">
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {parseFloat(cartera?.saldo_inicial) > 0 && (
          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-orange-100">
                <Wallet className="w-5 h-5 text-orange-500" />
              </div>
              <div>
                <p className="text-xs text-orange-500 uppercase font-medium">Deuda Migración</p>
                <p className="text-2xl font-bold text-orange-600">{formatCurrency(cartera?.saldo_inicial)}</p>
                <p className="text-xs text-muted">Saldo anterior al sistema</p>
              </div>
            </CardBody>
          </Card>
        )}

          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-primary/10">
                <TrendingUp className="w-5 h-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted uppercase">Total Comprado</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(cartera?.total_vendido)}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-success/10">
                <TrendingDown className="w-5 h-5 text-success" />
              </div>
              <div>
                <p className="text-xs text-muted uppercase">Total Abonado</p>
                <p className="text-2xl font-bold text-success">{formatCurrency(cartera?.total_abonado)}</p>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardBody className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-warning/10">
                <Wallet className="w-5 h-5 text-warning" />
              </div>
              <div>
                <p className="text-xs text-muted uppercase">Saldo Pendiente</p>
                <p className="text-2xl font-bold text-primary">{formatCurrency(cartera?.saldo_pendiente)}</p>
              </div>
            </CardBody>
          </Card>
        </div>

        {(cartera?.total_vendido || 0) > 0 && (
          <Card>
            <CardBody>
              <h3 className="font-medium text-primary mb-4">Estado de Cuenta</h3>
              <div className="space-y-3">
              {parseFloat(cartera?.saldo_inicial) > 0 && (
                <div className="flex justify-between p-3 bg-orange-50 rounded-xl border border-orange-200">
                  <span className="text-orange-500 font-medium">Deuda de migración</span>
                  <span className="font-semibold text-orange-600">{formatCurrency(cartera?.saldo_inicial)}</span>
                </div>
              )}
                <div className="flex justify-between p-3 bg-primary/5 rounded-xl">
                  <span className="text-muted">Total comprador</span>
                  <span className="font-medium text-primary">{formatCurrency(cartera?.total_vendido)}</span>
                </div>
                <div className="flex justify-between p-3 bg-success/10 rounded-xl">
                  <span className="text-muted">Total abonado</span>
                  <span className="font-medium text-success">{formatCurrency(cartera?.total_abonado)}</span>
                </div>
                <div className="flex justify-between p-3 bg-warning/10 rounded-xl border border-warning/20">
                  <span className="text-muted">Saldo pendiente</span>
                  <span className="font-bold text-primary">{formatCurrency(cartera?.saldo_pendiente)}</span>
                </div>
              </div>
            </CardBody>
          </Card>
        )}
      </div>
    </Layout>
  );
}