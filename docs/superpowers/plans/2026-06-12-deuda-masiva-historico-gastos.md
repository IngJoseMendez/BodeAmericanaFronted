# Deuda masiva, Histórico para reportes y Gastos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add three independent capabilities to BodegaAmericana — a bulk debt-entry screen (reusing the existing cartera-legacy backend), an isolated "Histórico" module that imports a multi-year Excel into a new table and shows reports, and a lightweight "Gastos" (company expenses) module — without modifying any existing table or breaking current behavior.

**Architecture:** Two new isolated PostgreSQL tables (`registros_historicos`, `gastos`) added to the idempotent `initDatabase()` schema block in `server/src/index.js`. Two new Express routers (`/api/historico`, `/api/gastos`). The bulk-debt screen reuses `POST /api/cartera/legacy` and `GET /api/cartera` with no backend change. Three new React pages registered in `RutasAdmin` + Sidebar, plus two new API clients in `services/api.js`. Excel is parsed client-side with ExcelJS (existing pattern). Client auto-creation/dedup for the importer happens server-side, dependency-free (name normalized in JS).

**Tech Stack:** Express 4 + `pg` (raw SQL, `pool`), React 18 + Vite, ExcelJS (client), Recharts, Tailwind, lucide-react. Auth via `autentificar` + `requiereRol('admin')`. UUIDs via `uuid` (`uuidv4()`) / `uuid_generate_v4()` default.

**Testing note (adapted to this codebase):** There is **no backend unit-test DB harness** (jest is installed but no DB-backed suite). Backend verification is **integration-style**: boot the server (creates tables, mounts routes) and smoke-test endpoints. Frontend verification is **`npm run build`** (catches every JSX/import error, no DB needed) plus **Playwright smoke specs** mirroring `client/tests/*.spec.js` (require the app running). This is a deliberate, honest adaptation of strict TDD to the existing tooling.

---

## Scope / independence

Three **independent** parts, each shippable on its own. Build order chosen so the simplest, lowest-risk goes first:

- **Part A — Gastos** (new table + router + page). Fully self-contained.
- **Part B — Histórico** (new table + router + page). Self-contained; optionally creates clientes.
- **Part C — Deuda masiva** (new page only; reuses existing endpoints). Depends on nothing new.

Shared integration files touched by all parts (do these edits carefully, additive only): `server/src/index.js` (schema + `app.use`), `client/src/services/api.js`, `client/src/App.jsx`, `client/src/components/layout/Sidebar.jsx`.

## File structure map

**Create:**
- `server/src/routes/gastos.js` — CRUD + `/reporte` for `gastos`.
- `server/src/routes/historico.js` — `/importar`, `/`, `/reporte`, `/anios`, `/lote/:lote` for `registros_historicos`.
- `client/src/pages/Gastos.jsx` — expense capture list + totals + export.
- `client/src/pages/Historico.jsx` — Excel import (preview + confirm) + yearly report.
- `client/src/pages/DeudaMasiva.jsx` — bulk debt grid.
- `client/tests/gastos.spec.js`, `client/tests/historico.spec.js`, `client/tests/deuda-masiva.spec.js` — smoke specs.

**Modify (additive):**
- `server/src/index.js` — add two `CREATE TABLE` blocks inside `schemaSql`; add two `app.use(...)` lines.
- `client/src/services/api.js` — add `gastosApi`, `historicoApi`.
- `client/src/App.jsx` — import 3 pages; add 3 routes in `RutasAdmin`.
- `client/src/components/layout/Sidebar.jsx` — add 3 lucide icons; add 3 nav items (`rol: 'admin'`).

---

## PART A — GASTOS

### Task A1: Create the `gastos` table

**Files:** Modify `server/src/index.js` (inside `schemaSql`, immediately before the closing `` ` `` that ends at the line after `ADD COLUMN IF NOT EXISTS es_legacy BOOLEAN DEFAULT false;`).

- [ ] **Step 1: Add DDL** — insert this block at the end of `schemaSql` (after the `movimientos` ALTERs, before the closing backtick). `cuentas` and `clientes` are already created earlier in the same block, so the FK is valid.

```sql
      -- ── Gastos operativos de la empresa (módulo nuevo, aislado) ──
      CREATE TABLE IF NOT EXISTS gastos (
        id          SERIAL PRIMARY KEY,
        uuid        VARCHAR(36) UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
        fecha       DATE DEFAULT CURRENT_DATE,
        categoria   VARCHAR(50),
        concepto    VARCHAR(200),
        monto       DECIMAL(15,2) DEFAULT 0,
        metodo_pago VARCHAR(50),
        cuenta_id   INTEGER REFERENCES cuentas(id) ON DELETE SET NULL,
        es_fijo     BOOLEAN DEFAULT false,
        notas       TEXT,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);
      CREATE INDEX IF NOT EXISTS idx_gastos_categoria ON gastos(categoria);
```

- [ ] **Step 2: Verify** — `cd server && node -e "require('dotenv').config(); const p=require('./src/config/db'); p.query('CREATE TABLE IF NOT EXISTS _t()').then(()=>console.log('db ok')).then(()=>process.exit(0)).catch(e=>{console.error(e.message);process.exit(1)})"` then boot the server (Task A4 verify) and confirm log `✅ Tablas verificadas/creadas` with no error. (Table presence is verified end-to-end when the route returns `[]` in A4.)

### Task A2: Create `server/src/routes/gastos.js`

**Files:** Create `server/src/routes/gastos.js`.

- [ ] **Step 1: Write the router** (full content):

```js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { autentificar, requiereRol } = require('../middleware/auth');

// GET / — listar con filtros opcionales ?anio=&mes=&categoria=
router.get('/', autentificar, async (req, res) => {
  try {
    const { anio, mes, categoria } = req.query;
    const conds = []; const params = []; let i = 1;
    if (anio)      { conds.push(`EXTRACT(YEAR FROM fecha) = $${i++}`);  params.push(parseInt(anio)); }
    if (mes)       { conds.push(`EXTRACT(MONTH FROM fecha) = $${i++}`); params.push(parseInt(mes)); }
    if (categoria) { conds.push(`categoria = $${i++}`);                params.push(categoria); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const result = await pool.query(
      `SELECT g.*, c.nombre AS cuenta_nombre
       FROM gastos g LEFT JOIN cuentas c ON c.id = g.cuenta_id
       ${where} ORDER BY g.fecha DESC, g.id DESC`, params);
    res.json(result.rows);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message });
  }
});

// GET /reporte — totales por categoría y fijos vs variables ?anio=&mes=
router.get('/reporte', autentificar, async (req, res) => {
  try {
    const { anio, mes } = req.query;
    const conds = []; const params = []; let i = 1;
    if (anio) { conds.push(`EXTRACT(YEAR FROM fecha) = $${i++}`);  params.push(parseInt(anio)); }
    if (mes)  { conds.push(`EXTRACT(MONTH FROM fecha) = $${i++}`); params.push(parseInt(mes)); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const porCategoria = await pool.query(
      `SELECT COALESCE(categoria,'otro') AS categoria, COALESCE(SUM(monto),0) AS total, COUNT(*) AS cantidad
       FROM gastos ${where} GROUP BY COALESCE(categoria,'otro') ORDER BY total DESC`, params);
    const totales = await pool.query(
      `SELECT COALESCE(SUM(CASE WHEN es_fijo THEN monto ELSE 0 END),0) AS fijos,
              COALESCE(SUM(CASE WHEN NOT es_fijo THEN monto ELSE 0 END),0) AS variables,
              COALESCE(SUM(monto),0) AS total
       FROM gastos ${where}`, params);
    const porMes = await pool.query(
      `SELECT EXTRACT(YEAR FROM fecha) AS anio, EXTRACT(MONTH FROM fecha) AS mes, COALESCE(SUM(monto),0) AS total
       FROM gastos ${where} GROUP BY 1,2 ORDER BY 1,2`, params);
    res.json({ por_categoria: porCategoria.rows, totales: totales.rows[0], por_mes: porMes.rows });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message });
  }
});

// POST / — crear (todo opcional; monto se coacciona a número)
router.post('/', autentificar, requiereRol('admin'), async (req, res) => {
  try {
    const { fecha, categoria, concepto, monto, metodo_pago, cuenta_id, es_fijo, notas } = req.body;
    const m = parseFloat(monto);
    const result = await pool.query(
      `INSERT INTO gastos (uuid, fecha, categoria, concepto, monto, metodo_pago, cuenta_id, es_fijo, notas)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [uuidv4(), fecha || new Date().toISOString().split('T')[0], categoria || null, concepto || null,
       isNaN(m) ? 0 : m, metodo_pago || null, cuenta_id || null, !!es_fijo, notas || null]
    );
    res.status(201).json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message });
  }
});

// PUT /:id
router.put('/:id', autentificar, requiereRol('admin'), async (req, res) => {
  try {
    const { fecha, categoria, concepto, monto, metodo_pago, cuenta_id, es_fijo, notas } = req.body;
    const result = await pool.query(
      `UPDATE gastos SET
         fecha       = COALESCE($1, fecha),
         categoria   = COALESCE($2, categoria),
         concepto    = COALESCE($3, concepto),
         monto       = COALESCE($4, monto),
         metodo_pago = COALESCE($5, metodo_pago),
         cuenta_id   = $6,
         es_fijo     = COALESCE($7, es_fijo),
         notas       = COALESCE($8, notas),
         updated_at  = CURRENT_TIMESTAMP
       WHERE id = $9 RETURNING *`,
      [fecha || null, categoria || null, concepto || null,
       (monto !== undefined && monto !== null && monto !== '') ? parseFloat(monto) : null,
       metodo_pago || null, cuenta_id || null,
       (typeof es_fijo === 'boolean') ? es_fijo : null, notas || null, req.params.id]
    );
    if (!result.rows.length) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.json(result.rows[0]);
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message });
  }
});

// DELETE /:id
router.delete('/:id', autentificar, requiereRol('admin'), async (req, res) => {
  try {
    const result = await pool.query('DELETE FROM gastos WHERE id = $1 RETURNING *', [req.params.id]);
    if (!result.rows.length) return res.status(404).json({ error: 'Gasto no encontrado' });
    res.json({ message: 'Gasto eliminado' });
  } catch (err) {
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message });
  }
});

module.exports = router;
```

### Task A3: Register the router

**Files:** Modify `server/src/index.js` (after line `app.use('/api/auditoria', require('./routes/auditoria'));`).

- [ ] **Step 1:** add `app.use('/api/gastos', require('./routes/gastos'));`

### Task A4: Add `gastosApi` to the API client

**Files:** Modify `client/src/services/api.js` (append near `cuentasApi`).

- [ ] **Step 1:**

```js
export const gastosApi = {
  getAll(params = {}) { const q = new URLSearchParams(params).toString(); return api.get(`/gastos${q ? '?' + q : ''}`); },
  getReporte(params = {}) { const q = new URLSearchParams(params).toString(); return api.get(`/gastos/reporte${q ? '?' + q : ''}`); },
  create(data) { return api.post('/gastos', data); },
  update(id, data) { return api.put(`/gastos/${id}`, data); },
  delete(id) { return api.delete(`/gastos/${id}`); },
};
```

- [ ] **Step 2: Backend smoke test.** Start the server (`cd server && npm run dev`), wait for `Server running on port 3001`. Get an admin token then hit the endpoint:

```bash
# login (uses the admin user seeded by initDatabase; password = $ADMIN_PASSWORD from server/.env)
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login -H "Content-Type: application/json" -d '{"username":"admin","password":"<ADMIN_PASSWORD>"}' | sed -E 's/.*"token":"([^"]+)".*/\1/')
curl -s http://localhost:3001/api/gastos -H "Authorization: Bearer $TOKEN"          # expect []
curl -s -X POST http://localhost:3001/api/gastos -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"categoria":"arriendo","concepto":"Arriendo junio","monto":1500000,"es_fijo":true}'  # expect created row
curl -s "http://localhost:3001/api/gastos/reporte?anio=2026" -H "Authorization: Bearer $TOKEN"  # expect totals object
```
Expected: `[]`, then a created gasto with `id`, then a reporte object with `por_categoria`, `totales`, `por_mes`.

### Task A5: Create `client/src/pages/Gastos.jsx`

**Files:** Create `client/src/pages/Gastos.jsx`. Test: `client/tests/gastos.spec.js`.

Spec (reuse common components exactly as `Cuentas.jsx`/`Cartera.jsx` do):
- Imports: `Layout`; `{ Card, CardBody, Button, Input, useToast, useConfirm }` from `../components/common`; `{ gastosApi, cuentasApi }` from `../services/api`; `ExcelJS` from `exceljs`; icons `Coins, Plus, Trash2, Download` from `lucide-react`.
- Constant `CATEGORIAS_FIJAS = [{value:'arriendo',label:'Arriendo'},{value:'servicios',label:'Servicios'},{value:'salarios',label:'Salarios'},{value:'transporte',label:'Transporte'},{value:'soporte',label:'Soporte'},{value:'caja_menor',label:'Caja menor'}]`.
- Helpers: `hoy = () => new Date().toISOString().split('T')[0]`; `fmt = (n) => '$' + (parseFloat(n)||0).toLocaleString('es-CO')`.
- State: `gastos`, `cuentas`, `loading`, `form` (`{categoria:'',concepto:'',monto:'',fecha:hoy(),metodo_pago:'',cuenta_id:'',es_fijo:false}`), `filtroMes` (`''` = `YYYY-MM`), `filtroCategoria`.
- `load()` builds params: if `filtroMes` → split into `anio`,`mes`; if `filtroCategoria` → `categoria`. `Promise.all([gastosApi.getAll(params), cuentasApi.getAll().catch(()=>[])])`. `useEffect(load, [filtroMes, filtroCategoria])`.
- Quick-pick fixed buttons set `categoria`+`concepto`(label)+`es_fijo:true`.
- `agregar()`: coerce `monto = parseFloat(String(form.monto).replace(/[^0-9.-]/g,''))`; if `!monto||monto<=0` toast "Escribe un valor"; POST `{categoria: form.categoria||'otro', concepto: form.concepto||null, monto, fecha: form.fecha||hoy(), metodo_pago: form.metodo_pago||null, cuenta_id: form.cuenta_id?parseInt:null, es_fijo:!!form.es_fijo}`; on success reset `concepto/monto/categoria/es_fijo`, keep `fecha`, reload. (Capture-continuo.)
- `eliminar(g)`: `useConfirm` then `gastosApi.delete`.
- Derived totals (`useMemo`): `total`, `totalFijos`, `totalVariables = total - totalFijos`, `porCategoria` (sorted desc).
- `exportar()`: ExcelJS workbook with columns Fecha/Categoría/Concepto/Fijo/Método/Monto (numFmt `$#,##0`), bold header, one row per gasto, download via Blob (mime `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`), filename `Gastos_<hoy>.xlsx`.
- Layout: header (`Coins` icon, "Gastos"); a capture Card with the fixed-category quick buttons, then inputs (Concepto, Monto, Fecha, optional Método select [efectivo/transferencia/otro], optional Cuenta select from `cuentas`), and an "Agregar" button; a totals Card (Total, Fijos, Variables + per-category list); filters (month `<input type="month">`, category select) + Export button; the list of gastos (fecha, categoría/concepto, monto, delete button).

- [ ] **Step 1:** Write the full component per the spec above (functional Tailwind, mirroring `Cuentas.jsx` structure).
- [ ] **Step 2: Build check** — `cd client && npm run build`. Expected: build succeeds (no unresolved import / JSX error).
- [ ] **Step 3:** Write `client/tests/gastos.spec.js`:

```js
import { test, expect } from '@playwright/test';

test.describe('Gastos E2E', () => {
  test('should load gastos page', async ({ page }) => {
    await page.goto('/gastos');
    await expect(page.getByRole('heading', { name: /gasto/i }).first()).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add server/src/index.js server/src/routes/gastos.js client/src/services/api.js client/src/pages/Gastos.jsx client/tests/gastos.spec.js
git commit -m "feat(gastos): módulo de gastos operativos (tabla, API y página)"
```

(App.jsx route + Sidebar entry for Gastos are added together for all three pages in Task INT below, to keep those edits in one place.)

---

## PART B — HISTÓRICO

### Task B1: Create the `registros_historicos` table

**Files:** Modify `server/src/index.js` (`schemaSql`, right after the gastos block from A1).

- [ ] **Step 1: Add DDL:**

```sql
      -- ── Histórico de años anteriores para reportes (aislado, solo reportes) ──
      CREATE TABLE IF NOT EXISTS registros_historicos (
        id                SERIAL PRIMARY KEY,
        uuid              VARCHAR(36) UNIQUE NOT NULL DEFAULT uuid_generate_v4(),
        fecha             DATE,
        anio              INTEGER,
        contenedor_numero VARCHAR(50),
        proveedor         VARCHAR(200),
        cliente_id        INTEGER REFERENCES clientes(id) ON DELETE SET NULL,
        cliente_nombre    VARCHAR(150),
        precio_unitario   DECIMAL(15,2) DEFAULT 0,
        costo_unitario    DECIMAL(15,2) DEFAULT 0,
        cantidad          DECIMAL(12,2) DEFAULT 0,
        precio_total      DECIMAL(15,2) DEFAULT 0,
        costo_total       DECIMAL(15,2) DEFAULT 0,
        utilidad          DECIMAL(15,2) DEFAULT 0,
        lote_importacion  VARCHAR(36),
        notas             TEXT,
        es_legacy         BOOLEAN DEFAULT true,
        created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS idx_hist_anio       ON registros_historicos(anio);
      CREATE INDEX IF NOT EXISTS idx_hist_fecha      ON registros_historicos(fecha);
      CREATE INDEX IF NOT EXISTS idx_hist_proveedor  ON registros_historicos(proveedor);
      CREATE INDEX IF NOT EXISTS idx_hist_contenedor ON registros_historicos(contenedor_numero);
      CREATE INDEX IF NOT EXISTS idx_hist_cliente    ON registros_historicos(cliente_id);
      CREATE INDEX IF NOT EXISTS idx_hist_lote       ON registros_historicos(lote_importacion);
```

### Task B2: Create `server/src/routes/historico.js`

**Files:** Create `server/src/routes/historico.js`.

- [ ] **Step 1: Write the router** (full content):

```js
const express = require('express');
const router = express.Router();
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const { autentificar, requiereRol } = require('../middleware/auth');

const normaliza = (s) => String(s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .trim().toLowerCase().replace(/\s+/g, ' ');

const num = (v) => {
  if (v === null || v === undefined || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.-]/g, ''));
  return isNaN(n) ? 0 : n;
};

const parseFecha = (val) => {
  if (!val) return null;
  if (val instanceof Date) return val.toISOString().split('T')[0];
  const s = String(val).trim();
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) { const yyyy = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${yyyy}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`; }
  if (/^\d{4}-\d{1,2}-\d{1,2}/.test(s)) return s.slice(0,10);
  return null;
};

// POST /importar — carga masiva de registros históricos. Body: { registros:[...], crear_clientes?:bool }
router.post('/importar', autentificar, requiereRol('admin'), async (req, res) => {
  const body = req.body || {};
  const registros = Array.isArray(body) ? body : (Array.isArray(body.registros) ? body.registros : []);
  const crearClientes = body.crear_clientes !== false; // por defecto true
  if (!registros.length) return res.status(400).json({ error: 'Sin registros para importar' });

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const lote = uuidv4();

    const mapa = new Map(); // nombre normalizado → cliente_id
    const cli = await client.query('SELECT id, nombre FROM clientes');
    for (const c of cli.rows) mapa.set(normaliza(c.nombre), c.id);

    let clientesCreados = 0, clientesEncontrados = 0, insertados = 0;
    const errores = [];

    for (let idx = 0; idx < registros.length; idx++) {
      const r = registros[idx] || {};
      try {
        const fecha = parseFecha(r.fecha);
        const anio = fecha ? parseInt(fecha.slice(0,4)) : null;
        const precio_unitario = num(r.precio_unitario ?? r.precio);
        const costo_unitario  = num(r.costo_unitario  ?? r.costo);
        const cantidad        = num(r.cantidad);
        const precio_total    = num(r.precio_total) || (precio_unitario * cantidad);
        const costo_total     = num(r.costo_total)  || (costo_unitario  * cantidad);
        const utilidad        = precio_total - costo_total;

        let clienteId = null;
        const nombreCli = (r.cliente_nombre ?? r.cliente);
        if (crearClientes && nombreCli && String(nombreCli).trim()) {
          const key = normaliza(nombreCli);
          if (mapa.has(key)) { clienteId = mapa.get(key); clientesEncontrados++; }
          else {
            const ins = await client.query(
              `INSERT INTO clientes (uuid, nombre, tipo_cliente) VALUES ($1,$2,$3) RETURNING id`,
              [uuidv4(), String(nombreCli).trim().slice(0,100), 'mayorista']
            );
            clienteId = ins.rows[0].id; mapa.set(key, clienteId); clientesCreados++;
          }
        }

        await client.query(
          `INSERT INTO registros_historicos
             (uuid, fecha, anio, contenedor_numero, proveedor, cliente_id, cliente_nombre,
              precio_unitario, costo_unitario, cantidad, precio_total, costo_total, utilidad, lote_importacion, notas)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
          [uuidv4(), fecha, anio,
           r.contenedor_numero ? String(r.contenedor_numero).slice(0,50) : null,
           r.proveedor ? String(r.proveedor).slice(0,200) : null,
           clienteId, nombreCli ? String(nombreCli).slice(0,150) : null,
           precio_unitario, costo_unitario, cantidad, precio_total, costo_total, utilidad, lote, r.notas || null]
        );
        insertados++;
      } catch (e) {
        errores.push({ fila: idx + 1, error: e.message });
      }
    }

    if (insertados === 0) { await client.query('ROLLBACK'); return res.status(400).json({ error: 'No se importó ningún registro', errores }); }
    await client.query('COMMIT');
    res.status(201).json({ lote, insertados, errores, clientes_creados: clientesCreados, clientes_encontrados: clientesEncontrados });
  } catch (err) {
    await client.query('ROLLBACK');
    res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message });
  } finally {
    client.release();
  }
});

// GET /anios — años disponibles
router.get('/anios', autentificar, async (req, res) => {
  try {
    const r = await pool.query(`SELECT DISTINCT anio FROM registros_historicos WHERE anio IS NOT NULL ORDER BY anio DESC`);
    res.json(r.rows.map(x => x.anio));
  } catch (err) { res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message }); }
});

// GET /reporte?anio= — agregados
router.get('/reporte', autentificar, async (req, res) => {
  try {
    const { anio } = req.query;
    const params = []; let cond = '';
    if (anio) { params.push(parseInt(anio)); cond = `WHERE anio = $1`; }
    const totales = await pool.query(
      `SELECT COALESCE(SUM(precio_total),0) AS ventas, COALESCE(SUM(costo_total),0) AS costo,
              COALESCE(SUM(utilidad),0) AS utilidad, COALESCE(SUM(cantidad),0) AS unidades, COUNT(*) AS registros
       FROM registros_historicos ${cond}`, params);
    const porMes = await pool.query(
      `SELECT EXTRACT(MONTH FROM fecha) AS mes,
              COALESCE(SUM(precio_total),0) AS ventas, COALESCE(SUM(costo_total),0) AS costo, COALESCE(SUM(utilidad),0) AS utilidad
       FROM registros_historicos ${cond} ${cond ? 'AND' : 'WHERE'} fecha IS NOT NULL
       GROUP BY 1 ORDER BY 1`, params);
    const porProveedor = await pool.query(
      `SELECT COALESCE(proveedor,'(sin proveedor)') AS proveedor,
              COALESCE(SUM(precio_total),0) AS ventas, COALESCE(SUM(costo_total),0) AS costo, COALESCE(SUM(utilidad),0) AS utilidad
       FROM registros_historicos ${cond} GROUP BY 1 ORDER BY ventas DESC LIMIT 100`, params);
    const porContenedor = await pool.query(
      `SELECT COALESCE(contenedor_numero,'(sin contenedor)') AS contenedor,
              COALESCE(SUM(precio_total),0) AS ventas, COALESCE(SUM(costo_total),0) AS costo, COALESCE(SUM(utilidad),0) AS utilidad
       FROM registros_historicos ${cond} GROUP BY 1 ORDER BY ventas DESC LIMIT 100`, params);
    res.json({ totales: totales.rows[0], por_mes: porMes.rows, por_proveedor: porProveedor.rows, por_contenedor: porContenedor.rows });
  } catch (err) { res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message }); }
});

// GET / — listar registros con filtros ?anio=&mes=&proveedor=&contenedor=&cliente_id=
router.get('/', autentificar, async (req, res) => {
  try {
    const { anio, mes, proveedor, contenedor, cliente_id } = req.query;
    const conds = []; const params = []; let i = 1;
    if (anio)       { conds.push(`anio = $${i++}`);                      params.push(parseInt(anio)); }
    if (mes)        { conds.push(`EXTRACT(MONTH FROM fecha) = $${i++}`); params.push(parseInt(mes)); }
    if (proveedor)  { conds.push(`proveedor ILIKE $${i++}`);            params.push(`%${proveedor}%`); }
    if (contenedor) { conds.push(`contenedor_numero ILIKE $${i++}`);    params.push(`%${contenedor}%`); }
    if (cliente_id) { conds.push(`cliente_id = $${i++}`);              params.push(parseInt(cliente_id)); }
    const where = conds.length ? `WHERE ${conds.join(' AND ')}` : '';
    const r = await pool.query(`SELECT * FROM registros_historicos ${where} ORDER BY fecha DESC NULLS LAST, id DESC LIMIT 2000`, params);
    res.json(r.rows);
  } catch (err) { res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message }); }
});

// DELETE /lote/:lote — deshacer una importación completa
router.delete('/lote/:lote', autentificar, requiereRol('admin'), async (req, res) => {
  try {
    const r = await pool.query('DELETE FROM registros_historicos WHERE lote_importacion = $1 RETURNING id', [req.params.lote]);
    res.json({ eliminados: r.rowCount });
  } catch (err) { res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Error interno' : err.message }); }
});

module.exports = router;
```

### Task B3: Register the router

**Files:** Modify `server/src/index.js` (after the gastos `app.use`).

- [ ] **Step 1:** add `app.use('/api/historico', require('./routes/historico'));`

- [ ] **Step 2: Backend smoke test** (server running, `$TOKEN` from A4):

```bash
curl -s -X POST http://localhost:3001/api/historico/importar -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" \
  -d '{"crear_clientes":true,"registros":[{"fecha":"15/03/2024","contenedor_numero":"C-12","proveedor":"Prov A","cliente_nombre":"Tienda La 80","precio":10,"costo":6,"cantidad":100,"precio_total":1000,"costo_total":600}]}'
# expect { lote, insertados:1, errores:[], clientes_creados:1, clientes_encontrados:0 }
curl -s "http://localhost:3001/api/historico/reporte?anio=2024" -H "Authorization: Bearer $TOKEN"   # totals ventas 1000 costo 600 utilidad 400
curl -s http://localhost:3001/api/historico/anios -H "Authorization: Bearer $TOKEN"                  # [2024]
```

### Task B4: Add `historicoApi`

**Files:** Modify `client/src/services/api.js`.

- [ ] **Step 1:**

```js
export const historicoApi = {
  importar(payload) { return api.post('/historico/importar', payload); },
  getAll(params = {}) { const q = new URLSearchParams(params).toString(); return api.get(`/historico${q ? '?' + q : ''}`); },
  getReporte(params = {}) { const q = new URLSearchParams(params).toString(); return api.get(`/historico/reporte${q ? '?' + q : ''}`); },
  getAnios() { return api.get('/historico/anios'); },
  deleteLote(lote) { return api.delete(`/historico/lote/${lote}`); },
};
```

### Task B5: Create `client/src/pages/Historico.jsx`

**Files:** Create `client/src/pages/Historico.jsx`. Test: `client/tests/historico.spec.js`.

Spec:
- Imports: `Layout`; `{ Card, CardBody, Button, useToast, useConfirm }`; `{ historicoApi }`; `ExcelJS`; Recharts `{ BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid }`; icons `History, Upload, Download, FileSpreadsheet, Trash2`.
- Helpers: `fmt`, `hoy` (as in Gastos). `MESES = ['Ene',...,'Dic']`.
- **Column mapping (tolerant):** function `mapHeaders(headerRow)` → returns index map by scanning normalized header cells; match: `fecha`→/fecha/, `contenedor`→/contenedor/, `proveedor`→/proveedor/, `cliente`→/cliente/, `precio_total`→/precio.*total|total.*precio/, `costo_total`→/costo.*total|total.*costo/, `precio_unitario`→/precio/ (not total), `costo_unitario`→/costo/ (not total), `cantidad`→/cantidad|cant/. Use the same `normaliza` (strip accents/lowercase) as the server.
- **Parse (ExcelJS):** mirror `Cartera.jsx handleLegacyFile`: `wb.xlsx.load(await file.arrayBuffer())`, `ws.eachRow`, header on row 1 → build index map; rows ≥2 → object `{fecha, contenedor_numero, proveedor, cliente_nombre, precio_unitario, costo_unitario, cantidad, precio_total, costo_total}`. CSV branch: split `/\r?\n/`, cells split `/[,;]/`, first line = headers. Coerce numbers with the same `[^0-9.-]` strip. Compute `precio_total`/`costo_total` fallback = unit × cantidad. Build `preview` array; mark each row `_warn` if no fecha or both totals 0. Keep `cliente_nombre` for the "nuevos clientes" count (unique normalized names not currently known — but we don't have the client list; show count of distinct non-empty names instead).
- State: `tab` ('subir' | 'reporte'), `preview` (parsed rows), `crearClientes` (default true), `importing`, `result` (last import response incl. `lote`), `anios`, `anio`, `reporte`, file ref.
- After parse: show preview table (first ~50 rows + "… y N más"), a summary line (`N filas, M con avisos, K nombres de cliente`), checkbox "Crear clientes nuevos automáticamente", and "Confirmar importación" button → `historicoApi.importar({ registros: preview, crear_clientes: crearClientes })`. On success: toast, store `result`, clear preview, refresh `anios`, switch behaviour to show result panel with `clientes_creados`/`clientes_encontrados`/`errores` and two buttons: "Deshacer importación" (`deleteLote(result.lote)`) and "Descargar plantilla".
- "Descargar plantilla": ExcelJS workbook one sheet, header row `Fecha, Contenedor #, Proveedor, Cliente, Precio, Costo, Cantidad, Precio total, Costo total`, one example row, download `Plantilla_Historico.xlsx`.
- "Exportar clientes" (optional, after import): only if `result` present — build Excel from `historicoApi.getAll({anio})`-derived distinct client names, OR simpler: from the just-parsed names. Provide a button that exports distinct `cliente_nombre` from the current `anio` registros (`getAll`). (Acceptable minimal implementation.)
- **Reporte tab:** year `<select>` from `anios` (default first). `useEffect` on `anio` → `historicoApi.getReporte({anio})`. Render 4 total cards (Ventas, Costo, Utilidad, Unidades), a Recharts `BarChart` of `por_mes` (Ventas vs Costo by month label `MESES[mes-1]`), and two tables (por proveedor, por contenedor) with ventas/costo/utilidad. "Exportar reporte" → ExcelJS (totals + the three breakdowns as sheets/sections).
- File input: `<input type="file" accept=".xlsx,.xls,.csv">`.

- [ ] **Step 1:** Write the full component per spec.
- [ ] **Step 2: Build check** — `cd client && npm run build`. Expected: success.
- [ ] **Step 3:** Write `client/tests/historico.spec.js`:

```js
import { test, expect } from '@playwright/test';

test.describe('Histórico E2E', () => {
  test('should load historico page', async ({ page }) => {
    await page.goto('/historico');
    await expect(page.getByRole('heading', { name: /hist[oó]rico/i }).first()).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add server/src/index.js server/src/routes/historico.js client/src/services/api.js client/src/pages/Historico.jsx client/tests/historico.spec.js
git commit -m "feat(historico): importar Excel de años anteriores y reportes (tabla, API y página)"
```

---

## PART C — DEUDA MASIVA

### Task C1: Create `client/src/pages/DeudaMasiva.jsx`

**Files:** Create `client/src/pages/DeudaMasiva.jsx`. Test: `client/tests/deuda-masiva.spec.js`. **No backend changes** — reuses `clientesApi.getAll`, `carteraApi.getAll`, `carteraApi.importarLegacy`.

Spec:
- Imports: `Layout`; `{ Card, CardBody, Button, Input, useToast, useConfirm }`; `{ clientesApi, carteraApi }`; icons `ListChecks, Search, Save`.
- Helpers `hoy`, `fmt`.
- State: `clientes` (full list), `saldos` (map id→saldo_pendiente from cartera), `montos` (map id→string input), `fechaCorte` (default `hoy()`), `buscar`, `loading`, `saving`.
- `load()`: `Promise.all([clientesApi.getAll({estado:'activo'}), carteraApi.getAll()])`; build `saldos` map from cartera rows (`row.id → row.saldo_pendiente`). `useEffect(load, [])`.
- Filtered list by `buscar` (nombre ILIKE client-side).
- Each row: nombre · saldo actual (`fmt(saldos[id]||0)`) · `<Input type="number">` bound to `montos[id]`.
- `guardar()`: build `registros` from entries with `parseFloat(monto)>0`: `{ cliente_id:id, tipo:'venta', fecha: fechaCorte, monto, referencia:'CARGA_MASIVA' }`. If none → toast "Escribe al menos una deuda". `useConfirm` (`¿Registrar deuda para N cliente(s) con corte <fecha>?`). Then `carteraApi.importarLegacy(registros)`; on success toast `${insertados} registrada(s)` + show `errores.length` if any; clear `montos`; reload.
- Header: `ListChecks` icon, "Deuda masiva", subtitle "Registra de una vez lo que cada cliente debe a una fecha de corte". Top controls: fecha de corte input, buscador, "Guardar todo".

- [ ] **Step 1:** Write the full component per spec.
- [ ] **Step 2: Build check** — `cd client && npm run build`. Expected: success.
- [ ] **Step 3:** Write `client/tests/deuda-masiva.spec.js`:

```js
import { test, expect } from '@playwright/test';

test.describe('Deuda masiva E2E', () => {
  test('should load deuda masiva page', async ({ page }) => {
    await page.goto('/deuda-masiva');
    await expect(page.getByRole('heading', { name: /deuda masiva/i }).first()).toBeVisible({ timeout: 5000 });
  });
});
```

- [ ] **Step 4: Commit**

```bash
git add client/src/pages/DeudaMasiva.jsx client/tests/deuda-masiva.spec.js
git commit -m "feat(deuda-masiva): carga masiva de deuda por cliente (reusa /cartera/legacy)"
```

---

## TASK INT — Wire routes & sidebar for the 3 pages

**Files:** Modify `client/src/App.jsx`, `client/src/components/layout/Sidebar.jsx`.

- [ ] **Step 1: App.jsx imports** — after `import Auditoria from './pages/Auditoria';`:

```js
import DeudaMasiva from './pages/DeudaMasiva';
import Historico from './pages/Historico';
import Gastos from './pages/Gastos';
```

- [ ] **Step 2: App.jsx routes** — inside `RutasAdmin`'s `<Routes>`, immediately before `<Route path="*" element={<Navigate to="/" replace />} />`:

```jsx
        <Route path="/deuda-masiva" element={<DeudaMasiva />} />
        <Route path="/historico" element={<Historico />} />
        <Route path="/gastos" element={<Gastos />} />
```

- [ ] **Step 3: Sidebar.jsx icons** — add `ListChecks`, `BarChart3`, `Coins` to the existing `lucide-react` import block.

- [ ] **Step 4: Sidebar.jsx nav items** — in `adminNavItems`, add (deuda-masiva right after the `/cartera` item; historico + gastos right after the `/cuentas` item):

```js
  { path: '/deuda-masiva',         icon: ListChecks,      label: 'Deuda masiva',     key: null, rol: 'admin' },
```
```js
  { path: '/historico',            icon: BarChart3,       label: 'Histórico',        key: null, rol: 'admin' },
  { path: '/gastos',               icon: Coins,           label: 'Gastos',           key: null, rol: 'admin' },
```

- [ ] **Step 5: Build check** — `cd client && npm run build`. Expected: success.

- [ ] **Step 6: Commit**

```bash
git add client/src/App.jsx client/src/components/layout/Sidebar.jsx
git commit -m "feat: registrar rutas y menú de Deuda masiva, Histórico y Gastos"
```

---

## FINAL VERIFICATION

- [ ] **V1: Server boots & creates tables** — `cd server && npm run dev`; confirm logs `✅ Tablas verificadas/creadas`, `🎉 Base de datos lista!`, `Server running on port 3001`, no error.
- [ ] **V2: Client builds** — `cd client && npm run build` → success.
- [ ] **V3: Endpoint smoke** — run the A4 + B3 curl checks; all return expected shapes.
- [ ] **V4 (optional): Playwright smoke** — with server + `npm --prefix client run dev` running: `cd client && npx playwright test gastos historico deuda-masiva` (each page heading visible). Skip if Playwright browsers aren't installed.
- [ ] **V5: Manual UI pass** — log in as admin; confirm three new sidebar items; add a gasto; upload a small Excel in Histórico (preview → confirm → report shows year); enter a debt for one client in Deuda masiva and confirm it appears in Cartera.
- [ ] **V6: No-regression** — open Cartera, Clientes, Ventas, Reportes, Cuentas; all still load.

---

## Self-review checklist (done)

- **Spec coverage:** Deuda masiva (Part C) ✓; Histórico import + auto-create clients + reports + plantilla + deshacer (Part B) ✓; Gastos no-mandatory list + totals + export (Part A) ✓; isolation via new tables + optional FKs ✓; sidebar/routes admin-gated ✓.
- **Placeholders:** none — all code is complete; the three page components are specified with exact state/handlers/API calls and follow the read patterns (`Cuentas.jsx`, `Cartera.jsx handleLegacyFile`, `Reportes.jsx` export).
- **Type/contract consistency:** `historicoApi.importar` posts `{ registros, crear_clientes }` and the route reads exactly those; `gastosApi`/`historicoApi` method names match the routes; `carteraApi.importarLegacy(registros)` posts an array, and `/cartera/legacy` accepts an array — verified against the read source.
- **Risks:** column-name variance in the Excel → mitigated by tolerant header mapping + plantilla + preview; `unaccent` not needed (JS normalization); `express.json` limit is 10kb on the server — **large imports must be chunked client-side** (see note below).

> **Important runtime note for execution:** `server/src/index.js` sets `express.json({ limit: '10kb' })`. A big Excel import or a big bulk-debt save can exceed 10kb. In `Historico.jsx` (importar) and `DeudaMasiva.jsx` (guardar), **send in batches of ~150 rows** (loop calling the API per chunk, accumulate `insertados`/`errores`) so the payload stays under the limit. This avoids a 413/parse error without changing the server config.
