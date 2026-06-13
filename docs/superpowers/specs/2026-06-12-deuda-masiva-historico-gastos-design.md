# Diseño: Deuda masiva, Histórico para reportes y Módulo de Gastos

- **Fecha:** 2026-06-12
- **Proyecto:** BodegaAmericana (React + Vite + Express + PostgreSQL)
- **Rama actual:** feature/contenedores
- **Estado:** Aprobado el diseño por el usuario; pendiente revisión de esta especificación.

---

## 1. Contexto y objetivo

La dueña del negocio necesita cargar información de años anteriores (2024, 2025) para
tener **reportes históricos** y para llevar **seguimiento de gastos** de la empresa, sin
que nada nuevo rompa lo que ya funciona.

Tras explorar el sistema se confirmó:

- La **carga de deuda histórica por cliente YA existe**: el importador de "cartera legacy"
  (`client/src/pages/Cartera.jsx` → `handleLegacyFile`) lee Excel/CSV en el navegador con
  ExcelJS y lo envía a `POST /api/cartera/legacy`, que inserta filas en `movimientos` con
  `es_legacy = true`. La deuda se calcula como
  `saldo = saldo_inicial + Σ(movimientos venta) − Σ(movimientos abono)`. `saldo_inicial` es
  inmutable y NO se debe tocar.
- **No existe** ningún módulo de gastos operativos. Los módulos `cuentas`, `cuentas-pagar` y
  `pagos` son de **bancos/proveedores/clientes**, NO de gastos de la empresa.
- Hay librerías de Excel ya instaladas en el cliente (`exceljs`, `xlsx`); el parseo es siempre
  **del lado del navegador** (no hay `multer` en el server).

Este documento define **tres entregables independientes**:

1. **Carga masiva de deuda** — una pantalla rápida para fijar la deuda de muchos clientes a la vez (reusa el backend existente).
2. **Histórico para reportes** — importar un Excel de años anteriores a una **tabla nueva y aislada** que alimenta reportes; la información de cliente es **opcional**.
3. **Gastos** — módulo nuevo para registrar gastos fijos y libres y ver totales por mes/categoría.

### Fuera de alcance (YAGNI por ahora)

- Que el histórico se convierta en ventas/contenedores reales (se eligió la opción A: solo reportes).
- Presupuesto por categoría en Gastos (se puede agregar después).
- Salarios por empleado (se registra como monto; el empleado va en el campo "concepto").
- Flujos de aprobación de gastos.

---

## 2. Principios de aislamiento ("que lo nuevo no choque con lo viejo")

- **Tablas nuevas e independientes:** `registros_historicos` y `gastos`. No modifican ninguna
  tabla existente.
- **Llaves foráneas opcionales:** `cliente_id` es NULL-able y `ON DELETE SET NULL`. Borrar un
  cliente nunca rompe el histórico ni los gastos.
- **Migración idempotente** dentro de `initDatabase()` en `server/src/index.js`, siguiendo el
  patrón existente: `CREATE TABLE IF NOT EXISTS`, `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`,
  `CREATE INDEX IF NOT EXISTS`. Re-ejecutable sin errores.
- **Rutas nuevas** (`/api/historico`, `/api/gastos`); la deuda masiva **reusa** `/api/cartera/legacy`
  y `GET /api/cartera` sin cambios de lógica.
- **Convenciones del repo:** snake_case, `uuid VARCHAR(36) UNIQUE NOT NULL DEFAULT uuid_generate_v4()`,
  `created_at`/`updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP`, `DECIMAL` para montos, autenticación
  con `autentificar` + `requiereRol('admin')`.

---

## 3. Entregable 1 — Carga masiva de deuda

**Objetivo:** fijar/agregar la deuda de muchos clientes en una sola pantalla, en vez de uno por uno.

### UI (`client/src/pages/DeudaMasiva.jsx`, enlazada desde Cartera y Sidebar)

- Tabla con **todos los clientes hacia abajo**. Columnas:
  - Cliente (nombre).
  - **Saldo actual** (solo lectura, de referencia) — obtenido de `GET /api/cartera`.
  - **Deuda a registrar** (input numérico editable, a la derecha).
- Arriba:
  - Campo **"Fecha de corte"** (por defecto hoy) que se aplica a todas las filas.
  - **Buscador** para filtrar la lista por nombre.
  - Botón **"Guardar todo"**.
- Solo se envían las filas con un valor escrito (> 0). Las vacías se ignoran.

### Comportamiento

- Al guardar, se construye un arreglo `registros` y se llama **`POST /api/cartera/legacy`** (sin
  backend nuevo): por cada cliente con valor →
  `{ cliente_id, tipo: 'venta', fecha: <fecha de corte>, monto: <deuda>, referencia: 'CARGA_MASIVA' }`.
- Esto **agrega** un movimiento de deuda fechado; **no pisa** `saldo_inicial`.
- **Robustez:** la respuesta `{ insertados, errores }` se muestra al usuario: cuántos se
  guardaron y, si alguno falló, en qué fila y por qué. El proceso no muere por una fila mala.

### Decisión

- "Deuda a registrar" **agrega** (no reemplaza). Se muestra el saldo actual al lado para que la
  usuaria decida con contexto. (Si en el futuro quiere "fijar exacto", se agrega un toggle.)

---

## 4. Entregable 2 — Histórico para reportes de años anteriores

**Objetivo:** importar un Excel de años anteriores a una tabla aislada y ver reportes por año.
Columnas esperadas del Excel: **fecha, contenedor #, proveedor, precio, costo, cantidad,
precio total, costo total** (+ **cliente** opcional).

### Tabla nueva `registros_historicos`

```sql
CREATE TABLE IF NOT EXISTS registros_historicos (
  id                SERIAL PRIMARY KEY,
  uuid              VARCHAR(36) UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  fecha             DATE,
  anio              INTEGER,                 -- derivado de fecha (para filtrar rápido)
  contenedor_numero VARCHAR(50),
  proveedor         VARCHAR(200),
  cliente_id        INTEGER REFERENCES clientes(id) ON DELETE SET NULL,  -- opcional
  cliente_nombre    VARCHAR(150),            -- nombre original del Excel (aunque no se enlace)
  precio_unitario   DECIMAL(15,2) DEFAULT 0,
  costo_unitario    DECIMAL(15,2) DEFAULT 0,
  cantidad          DECIMAL(12,2) DEFAULT 0,
  precio_total      DECIMAL(15,2) DEFAULT 0, -- del Excel; si falta = precio_unitario * cantidad
  costo_total       DECIMAL(15,2) DEFAULT 0, -- del Excel; si falta = costo_unitario * cantidad
  utilidad          DECIMAL(15,2) DEFAULT 0, -- precio_total - costo_total (calculada al insertar)
  lote_importacion  VARCHAR(36),             -- agrupa cada carga; permite deshacer
  notas             TEXT,
  es_legacy         BOOLEAN DEFAULT true,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_hist_anio ON registros_historicos (anio);
CREATE INDEX IF NOT EXISTS idx_hist_fecha ON registros_historicos (fecha);
CREATE INDEX IF NOT EXISTS idx_hist_proveedor ON registros_historicos (proveedor);
CREATE INDEX IF NOT EXISTS idx_hist_contenedor ON registros_historicos (contenedor_numero);
CREATE INDEX IF NOT EXISTS idx_hist_cliente ON registros_historicos (cliente_id);
CREATE INDEX IF NOT EXISTS idx_hist_lote ON registros_historicos (lote_importacion);
```

### Flujo de importación (UI `client/src/pages/Historico.jsx`)

1. Botón **"Subir Excel"** (`<input type="file" accept=".xlsx,.xls,.csv">`).
2. **Parseo en el navegador** con ExcelJS (mismo patrón que `Cartera.jsx → handleLegacyFile`):
   - Primera fila = encabezados; se mapean por nombre de columna (tolerante a mayúsculas/acentos
     y a sinónimos comunes: "precio"/"precio unitario", "costo"/"costo unitario", "contenedor"/"contenedor #").
   - Fechas: soporta `dd/mm/aaaa`, `dd-mm-aaaa`, `aaaa-mm-dd`.
3. **Vista previa con validación tolerante** (no muere si falta un dato):
   - Tabla con todas las filas; las que tienen problemas se marcan en amarillo con el motivo.
   - Reglas de relleno por defecto (y aviso): sin fecha → se deja vacía / año = "sin año";
     totales faltantes → se calculan; números no válidos → 0.
   - Resumen: "N filas OK, M con avisos, K clientes nuevos por crear, J clientes encontrados".
4. **Confirmar** → `POST /api/historico/importar`.

### Auto-creación de clientes (opcional, del lado del servidor)

- Si una fila trae `cliente_nombre`:
  - El servidor normaliza el nombre (`LOWER(TRIM(...))`, sin acentos) y busca un cliente existente.
  - Si **existe** → enlaza `cliente_id` (no duplica).
  - Si **no existe** → crea el cliente con lo mínimo (`nombre`, `tipo_cliente = 'mayorista'`) y enlaza.
  - Se usa una **caché dentro del lote** para no crear el mismo nombre dos veces.
- Si la fila no trae cliente, `cliente_id` queda NULL (es válido).
- Al terminar, la respuesta informa `clientes_creados` y `clientes_encontrados`; la UI ofrece un
  botón **"Exportar clientes"** (creados + encontrados) a Excel — opcional, la usuaria decide.

### Reporte histórico (misma pantalla `Historico.jsx`)

- Filtro por **año** (y opcional: mes, proveedor, contenedor, cliente).
- **Tarjetas de totales:** Ventas (`Σ precio_total`), Costo (`Σ costo_total`),
  Utilidad (`Σ utilidad`), Unidades (`Σ cantidad`).
- **Desgloses** (tabla + gráfica Recharts, que ya existe en el proyecto):
  - Por **mes** del año seleccionado.
  - Por **proveedor**.
  - Por **contenedor**.
  - Por **cliente** (cuando aplica).
- **Exportar a Excel** del reporte (patrón ExcelJS de `Reportes.jsx`/`Clientes.jsx`).
- **Plantilla descargable** con las columnas exactas esperadas (botón "Descargar plantilla").
- **Deshacer importación:** poder borrar un `lote_importacion` completo (`DELETE /api/historico/lote/:lote`)
  por si una carga salió mal.

---

## 5. Entregable 3 — Módulo de Gastos

**Objetivo:** registrar gastos de la empresa de forma rápida, tipo lista, **sin campos obligatorios**.

### Tabla nueva `gastos`

```sql
CREATE TABLE IF NOT EXISTS gastos (
  id          SERIAL PRIMARY KEY,
  uuid        VARCHAR(36) UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
  fecha       DATE DEFAULT CURRENT_DATE,
  categoria   VARCHAR(50),     -- arriendo|servicios|salarios|transporte|soporte|caja_menor|otro
  concepto    VARCHAR(200),    -- descripción libre (p. ej. nombre del empleado, detalle de "otro")
  monto       DECIMAL(15,2) DEFAULT 0,
  metodo_pago VARCHAR(50),     -- opcional
  cuenta_id   INTEGER REFERENCES cuentas(id) ON DELETE SET NULL,  -- opcional (banco/caja)
  es_fijo     BOOLEAN DEFAULT false,
  notas       TEXT,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos (fecha);
CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos (categoria);
```

- **Nada es NOT NULL** (todo tiene default). La fecha se autocompleta a hoy. Lo único que la
  usuaria realmente escribe es el valor (y opcionalmente la categoría/concepto).

### UI (`client/src/pages/Gastos.jsx`, solo admin)

- **Agregar rápido tipo lista:** una fila/formulario liviano con:
  - **Botones rápidos** para los fijos: Arriendo, Servicios, Salarios, Transporte, Soporte,
    Caja menor (marcan `es_fijo = true` y la `categoria`).
  - O escribir una **categoría/concepto libre** (`es_fijo = false`).
  - **Valor**, **fecha** (default hoy), método/cuenta opcionales.
  - Botón **"Agregar"** que inserta y deja el formulario listo para el siguiente (flujo de
    captura continua).
- **Lista** de gastos debajo, filtrable por **mes** y **categoría**, con editar/eliminar.
- **Totales:** por **mes** y por **categoría**, separando **fijos vs variables**.
- **Exportar a Excel**.

---

## 6. Contratos de API (nuevos)

### Histórico — `server/src/routes/historico.js` (admin)

- `POST /api/historico/importar`
  - Body: `{ registros: [ { fecha, contenedor_numero, proveedor, cliente_nombre?, precio_unitario, costo_unitario, cantidad, precio_total?, costo_total? } ], crear_clientes: boolean }`
  - Inserta en `registros_historicos` dentro de una transacción; genera un `lote_importacion`
    (uuid) común; calcula `anio`, totales faltantes y `utilidad`; auto-crea/enlaza clientes si
    `crear_clientes`.
  - Respuesta: `{ lote, insertados, errores: [{ fila, error }], clientes_creados, clientes_encontrados }`.
  - Política de errores: por fila; las filas válidas se insertan, las inválidas se reportan (no
    se aborta todo por una mala). (Se confirma vista previa antes de enviar.)
- `GET /api/historico?anio=&mes=&proveedor=&contenedor=&cliente_id=` → filas filtradas.
- `GET /api/historico/reporte?anio=` → agregados (totales, por mes, por proveedor, por contenedor, por cliente).
- `DELETE /api/historico/lote/:lote` → borra una importación completa.

### Gastos — `server/src/routes/gastos.js` (admin)

- `GET /api/gastos?anio=&mes=&categoria=` → lista filtrada.
- `POST /api/gastos` → crea (todos los campos opcionales).
- `PUT /api/gastos/:id` → edita.
- `DELETE /api/gastos/:id` → elimina.
- `GET /api/gastos/reporte?anio=&mes=` → totales por categoría y fijos vs variables.

### Reusados (sin cambios)

- `GET /api/cartera` (poblar grilla de deuda masiva).
- `POST /api/cartera/legacy` (guardar deuda masiva).
- `GET /api/clientes?buscar=` (apoyo a deduplicación, si se necesita en cliente).

---

## 7. Cambios por archivo

### Backend
- `server/src/index.js`
  - En `initDatabase()`: agregar DDL idempotente de `registros_historicos` y `gastos`.
  - Registrar rutas: `app.use('/api/historico', require('./routes/historico'))` y
    `app.use('/api/gastos', require('./routes/gastos'))`.
- `server/src/routes/historico.js` (nuevo).
- `server/src/routes/gastos.js` (nuevo).

### Frontend
- `client/src/pages/DeudaMasiva.jsx` (nuevo).
- `client/src/pages/Historico.jsx` (nuevo).
- `client/src/pages/Gastos.jsx` (nuevo).
- `client/src/App.jsx`: importar las 3 páginas y añadir `<Route>` en **RutasAdmin**.
- `client/src/components/layout/Sidebar.jsx`: añadir ítems de navegación.
  - "Deuda masiva" con la misma visibilidad que Cartera.
  - "Histórico" y "Gastos" como **admin** (`rol: 'admin'`).
- `client/src/services/api.js`: añadir `historicoApi` y `gastosApi`; "Deuda masiva" reusa
  `carteraApi` (`getAll` / `importarLegacy`).

---

## 8. Manejo de errores y casos borde

- **Importación tolerante:** filas con datos faltantes se completan con defaults y se avisan; una
  fila inválida no detiene a las demás. Siempre hay **vista previa + confirmación** antes de guardar.
- **Deduplicación de clientes:** por nombre normalizado; caché dentro del lote para no duplicar;
  nombres iguales reales se enlazan al primero existente (se informa para que la usuaria revise).
- **Números:** se aceptan con separadores de miles/decimales comunes; valores no numéricos → 0.
- **Fechas:** varios formatos; si no se puede parsear, se deja la fila marcada (no rompe).
- **Deshacer:** `lote_importacion` permite borrar una carga completa si quedó mal.
- **Concurrencia/duplicados de deuda masiva:** se muestra el saldo actual como referencia para
  evitar cargar dos veces; los movimientos quedan marcados con `referencia = 'CARGA_MASIVA'`.

---

## 9. Pruebas

- **Backend (manual/integración):** importar un lote con clientes mixtos (existentes/nuevos/sin
  cliente), verificar inserciones, auto-creación, cálculo de totales y `anio`, y el `DELETE` por lote.
  Crear/editar/eliminar gastos y comprobar agregados del reporte.
- **Frontend (Playwright, ya configurado):**
  - Deuda masiva: cargar grilla, escribir valores, guardar, ver resumen de insertados/errores.
  - Histórico: subir Excel de ejemplo, ver vista previa con avisos, confirmar, ver reporte por año
    y exportar.
  - Gastos: agregar varios gastos rápidos (fijos y libres), filtrar por mes/categoría, ver totales.
- **No regresión:** Cartera, Clientes, Ventas, Reportes y Cuentas siguen funcionando igual
  (las tablas nuevas no tocan las existentes).

---

## 10. Decisiones tomadas

1. Histórico = **solo reportes** (opción A); tabla aislada `registros_historicos`.
2. Deuda masiva **reusa** `/api/cartera/legacy`; **agrega** movimiento fechado, no toca `saldo_inicial`.
3. Cliente nuevo desde Excel → `tipo_cliente = 'mayorista'` por defecto; deduplicación por nombre normalizado.
4. Gastos → **registro + reportes mensuales**, **sin campos obligatorios**, captura tipo lista.
5. Cliente en el histórico es **opcional**; exportar clientes tras importar es **opcional**.

## 11. Riesgos / notas

- Si el Excel real trae nombres de columnas muy distintos, el mapeo tolerante puede no reconocer
  alguna; mitigación: la plantilla descargable define el formato y la vista previa permite revisar
  antes de guardar.
- `unaccent` puede no estar disponible en la BD; la normalización de nombres se hará en JS antes de
  comparar (y/o `LOWER(TRIM())` en SQL) para no depender de extensiones.
- Posible mejora futura: por-empleado en salarios, presupuesto por categoría, y unir histórico con
  reportes vivos en una sola vista.
