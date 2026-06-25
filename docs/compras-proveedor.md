# Módulo: Control de Compras a Proveedor

Controla el "limbo" documental entre que se **paga** a un proveedor (transferencia)
y que llega la **factura** fiscal (días o semanas después). Registra compras,
pagos con comprobante PDF, facturas con PDF, y la conciliación N:M factura↔pago.
Avisa cuándo una compra queda incompleta.

Ruta: `/compras-proveedor` · permiso (key): `compras-proveedor` (gateable en Admin).

## Datos (Supabase, prefijo `cp_`)

| Tabla | Rol |
|---|---|
| `cp_proveedores` | proveedores + `dias_alerta_pago_sin_factura` (default 8) |
| `cp_compras` | la unidad de control (estado ABIERTA→PAGADA→FACTURADA→CERRADA) |
| `cp_pagos` | una transferencia por fila, con `comprobante_archivo_id` |
| `cp_facturas` | factura del proveedor (UNIQUE proveedor+número) |
| `cp_factura_pago_link` | N:M; `UNIQUE(pago_id)` ⇒ un pago va a una sola factura |
| `cp_archivos` | metadata de PDFs (binario en Storage); nunca se borran |
| `cp_alertas` | log idempotente de alertas |

RLS: habilitado **sin políticas** → sólo el `service_role` (vía las API routes)
accede. El navegador nunca toca estas tablas directo.

### Funciones SQL
- `cp_recompute_estado(compra_id)` — recalcula estado + banderas, maneja la
  alerta de discrepancia y resuelve `PAGO_SIN_FACTURA` al quedar facturada.
- `cp_generar_alertas()` — corre 1×/día; genera alertas idempotentes
  (PAGO_SIN_FACTURA[_CRITICO], COMPRA_SIN_PAGO, COTIZACION_VENCIDA,
  FACTURA_HUERFANA) y devuelve sólo las nuevas de la corrida.

## Almacenamiento
Bucket privado `compras-proveedor` (PDF, máx 10 MB). Subida y descarga van por
las API routes con `service_role`. Se calcula SHA-256 al subir y se rechaza un
PDF duplicado. Los PDFs se sirven inline vía `GET /api/compras-proveedor/archivos/:id`.

## API (`/api/compras-proveedor/...`)
```
GET/POST   /proveedores            PATCH /proveedores/:id
GET/POST   /compras                GET/PATCH/DELETE /compras/:id
POST       /compras/:id/pagos      (multipart: pdf + campos)
DELETE     /pagos/:id
GET/POST   /facturas               GET /facturas/:id/sugerencias-match
POST       /facturas/:id/match     DELETE /facturas/:id/links/:linkId
GET        /archivos/:id           (streamea el PDF)
GET        /alertas                PATCH /alertas/:id
GET        /reportes               (saldo documental + aging + por proveedor)
```

## Cron de alertas
`.github/workflows/compras-proveedor-alertas.yml` corre `0 15 * * 1-6`
(9am Costa Rica, lun–sáb) → `scripts/cp_alertas_cron.mjs`, que llama
`cp_generar_alertas()` y manda un resumen por Telegram **sólo si hay alertas
nuevas**. Usa los secrets ya existentes: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Flujo típico
1. **Proveedores** → crear el proveedor.
2. **Compras** → Nueva compra (ligada a la venta del cliente) → Registrar pago
   (adjunta el PDF del comprobante). La compra pasa a PAGADA.
3. **Subir factura** → cargás el PDF de la factura; el sistema sugiere qué
   pago(s) cubre (match exacto / subset-sum hasta 5 pagos). Confirmás y la(s)
   compra(s) pasan a FACTURADA.
4. **Alertas / Reportes** → seguimiento del saldo documental y aging.
