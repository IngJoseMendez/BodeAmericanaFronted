import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { clienteSchema } from '../schemas/validation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertCircle, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function ClienteForm({ onSubmit, defaultValues, isLoading }) {
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting, isValid },
  } = useForm({
    resolver: zodResolver(clienteSchema),
    defaultValues: defaultValues || {
      nombre: '',
      telefono: '',
      email: '',
      direccion: '',
      limiteCredito: 0,
      rfc: '',
    },
    mode: 'onChange',
  });

  const formValues = watch();

  return (
    <Card className="w-full max-w-2xl mx-auto">
      <CardHeader>
        <CardTitle>Nuevo Cliente</CardTitle>
        <CardDescription>
          Complete los datos del cliente. Los campos marcados con * son requeridos.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="nombre">
                Nombre completo *
              </Label>
              <Input
                id="nombre"
                placeholder="Juan Pérez López"
                {...register('nombre')}
                className={cn(errors.nombre && 'border-red-500 focus-visible:ring-red-500')}
              />
              {errors.nombre && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.nombre.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="telefono">
                Teléfono *
              </Label>
              <Input
                id="telefono"
                placeholder="33 1234 5678"
                {...register('telefono')}
                className={cn(errors.telefono && 'border-red-500 focus-visible:ring-red-500')}
              />
              {errors.telefono && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.telefono.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input
                id="email"
                type="email"
                placeholder="juan@ejemplo.com"
                {...register('email')}
                className={cn(errors.email && 'border-red-500 focus-visible:ring-red-500')}
              />
              {errors.email && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.email.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="rfc">RFC</Label>
              <Input
                id="rfc"
                placeholder="XAXX010101000"
                {...register('rfc')}
                className={cn(
                  errors.rfc && 'border-red-500 focus-visible:ring-red-500',
                  !errors.rfc && formValues.rfc?.length === 13 && 'border-green-500 focus-visible:ring-green-500'
                )}
              />
              {errors.rfc ? (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.rfc.message}
                </p>
              ) : formValues.rfc?.length === 13 ? (
                <p className="text-sm text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="w-4 h-4" />
                  RFC válido
                </p>
              ) : null}
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="direccion">Dirección</Label>
              <Input
                id="direccion"
                placeholder="Av. Vallarta 1234, Guadalajara, Jalisco"
                {...register('direccion')}
                className={cn(errors.direccion && 'border-red-500')}
              />
              {errors.direccion && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.direccion.message}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="limiteCredito">Límite de crédito</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="limiteCredito"
                  type="number"
                  placeholder="0.00"
                  className="pl-7"
                  {...register('limiteCredito', { valueAsNumber: true })}
                />
              </div>
              {errors.limiteCredito && (
                <p className="text-sm text-red-500 flex items-center gap-1">
                  <AlertCircle className="w-4 h-4" />
                  {errors.limiteCredito.message}
                </p>
              )}
            </div>
          </div>

          {isValid && (
            <Alert className="bg-green-50 border-green-200">
              <CheckCircle2 className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                Todos los campos requeridos están completos
              </AlertDescription>
            </Alert>
          )}

          <div className="flex gap-4 justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={() => window.history.back()}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={isSubmitting || isLoading}
            >
              {isSubmitting || isLoading ? 'Guardando...' : 'Guardar Cliente'}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
