# Módulo: Control de Compras a Proveedor

Controla el "limbo" documental entre que se **paga** a un proveedor (transferencia)
y que llega la **factura** fiscal (días o semanas después). La compra arranca como
**solicitud de pago** (con el respaldo de la venta al cliente y la cotización del
proveedor, en PDF o foto), después se registra el pago con comprobante y al final
la factura del proveedor, que se concilia N:M contra los pagos. En cada compra se
ve **qué documento falta** — el 99% de las veces, la factura del proveedor.

Ruta: `/compras-proveedor` · permiso (key): `compras-proveedor` (gateable en Admin).

## Datos (Supabase, prefijo `cp_`)

| Tabla | Rol |
|---|---|
| `cp_proveedores` | proveedores + `dias_alerta_pago_sin_factura` (default 8) |
| `cp_compras` | la unidad de control (estado ABIERTA→PAGADA→FACTURADA→CERRADA) + `venta_archivo_id`, `cotizacion_archivo_id`, `solicitado_por`, `urgente` |
| `cp_pagos` | una transferencia por fila, con `comprobante_archivo_id` |
| `cp_facturas` | factura del proveedor (UNIQUE proveedor+número) |
| `cp_factura_pago_link` | N:M; `UNIQUE(pago_id)` ⇒ un pago va a una sola factura |
| `cp_archivos` | metadata de PDFs y fotos (binario en Storage); nunca se borran |
| `cp_alertas` | log idempotente de alertas |

RLS: habilitado **sin políticas** → sólo el `service_role` (vía las API routes)
accede. El navegador nunca toca estas tablas directo.

### Funciones SQL
- `cp_recompute_estado(compra_id)` — recalcula estado + banderas, maneja la
  alerta de discrepancia y resuelve `PAGO_SIN_FACTURA` al quedar facturada.
- `cp_generar_alertas()` — corre 1×/día; genera alertas idempotentes
  (PAGO_SIN_FACTURA[_CRITICO], SOLICITUD_SIN_PAGAR, COMPRA_SIN_PAGO,
  COTIZACION_VENCIDA, FACTURA_HUERFANA) y devuelve sólo las nuevas de la corrida.
- `cp_resolver_solicitud_al_pagar()` — trigger en `cp_pagos`: al registrarse el
  pago, resuelve SOLICITUD_SIN_PAGAR / COMPRA_SIN_PAGO de esa compra.

### Documentos pendientes (`docsDeCompra` en `_lib.js`)
Cuatro documentos por compra: **venta al cliente**, **cotización del proveedor**,
**comprobante de pago** y **factura del proveedor**. La factura recién se cuenta
como pendiente cuando ya hubo un pago (antes, lo pendiente es el pago). El cálculo
vive en la API y viaja en `faltantes` / `docs` de cada compra.

## Almacenamiento
Bucket privado `compras-proveedor` (PDF + fotos JPG/PNG/WEBP/HEIC, máx 15 MB).
Subida y descarga van por las API routes con `service_role`. Se calcula SHA-256 al
subir: en comprobantes y facturas un duplicado se rechaza (anti doble-carga); en
respaldos (venta / cotización) se reusa la fila, porque el mismo papel puede servir
a varias compras. Los archivos se sirven inline vía
`GET /api/compras-proveedor/archivos/:id`.

## API (`/api/compras-proveedor/...`)
```
GET/POST   /proveedores            PATCH /proveedores/:id
GET/POST   /compras                GET/PATCH/DELETE /compras/:id
           (POST acepta JSON o multipart con venta_file / cotizacion_file)
           (GET acepta ?falta=factura|pago|venta|cotizacion)
POST       /compras/:id/documentos (multipart: tipo=venta|cotizacion + file)
POST       /compras/:id/pagos      (multipart: pdf + campos)
DELETE     /pagos/:id
GET/POST   /facturas               GET /facturas/:id/sugerencias-match
POST       /facturas/:id/match     DELETE /facturas/:id/links/:linkId
GET        /archivos/:id           (streamea el PDF)
GET        /alertas                PATCH /alertas/:id
GET        /reportes               (saldo documental + aging + por proveedor)
GET        /alerts/pendientes      (resumen para el dashboard: solicitudes sin
                                    pagar + compras sin la factura del proveedor)
```

## Cron de alertas
`.github/workflows/compras-proveedor-alertas.yml` corre `31 15 * * 1-6`
(9am Costa Rica, lun–sáb) → `scripts/cp_alertas_cron.mjs`, que llama
`cp_generar_alertas()` y manda un resumen por Telegram **sólo si hay alertas
nuevas**. Usa los secrets ya existentes: `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`,
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.

## Flujo típico
1. **Proveedores** → crear el proveedor.
2. **Compras y pagos** → *Nueva compra / solicitud de pago*: se adjunta la venta al
   cliente y la cotización del proveedor (PDF o foto). Queda ABIERTA = pidiendo plata.
3. **Registrar pago** (dentro de la compra) con el comprobante. Pasa a PAGADA y
   arranca el reloj de la factura del proveedor.
4. **Subir factura del proveedor** — desde la lista de compras o desde el detalle
   de la compra (ya no hay pestaña aparte). El sistema sugiere qué pago(s) cubre
   (match exacto / subset-sum hasta 5 pagos). Confirmás y pasa a FACTURADA.
5. **Alertas / Reportes** → seguimiento del saldo documental y aging.

## Dónde se ve la alerta
- En el **dashboard de SOL** (`/`), igual que las devoluciones a clientes: tarjeta
  "Compras proveedor" + filas en *Pendientes de hoy* (solicitudes sin pagar y
  compras pagadas sin la factura del proveedor). Lo alimenta `/alerts/pendientes`.
- En la **lista de compras**, columna *Qué falta* con un chip por documento.
- En el **detalle de la compra**, panel 📎 Documentos con ✅ / ⏳ y el botón para
  subir cada respaldo.
- Por **Telegram**, con el cron diario.
