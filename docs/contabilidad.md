# Módulo Contabilidad (`/contabilidad`)

Panel para armar asientos contables en Génesis Orión y mandarlos a la cola de
NEO. El robot (Playwright) que sube los asientos se construye aparte: el panel
termina su trabajo cuando un asiento queda en estado `aprobado`.

## Alcance de esta entrega

- Solo panel web. **No** incluye el robot de NEO ni la conexión a Gmail.
- Trabaja sobre las tablas `conta_*` que **ya existían** en Supabase. No crea ni
  migra tablas.

## Estructura

### Frontend — `app/contabilidad/`
- `page.js` — módulo con 4 pestañas, buscador universal (`⌘K`) y ayuda (`?`).
- `lib.js` — helpers de cliente (formato ₡, normalización, fetch, hook de
  catálogos, constructores de items para los comboboxes, paleta de marca).
- `Combobox.js` — combobox accesible (teclado + mouse, sin acentos, por código y
  nombre, agrupado por cuenta título, prioriza las más usadas).
- `AsientoEditor.js` — editor de asiento línea por línea (reutilizado en Bandeja
  y Montar). Totales en vivo, control de gasto inusual, atajos y aprobación.
- `BandejaTab.js` — dropzone XML/PDF, lista de borradores y vista dividida
  (visor de PDF o resumen legible del XML + editor).
- `MontarTab.js` — captura manual, con precarga desde plantilla.
- `EnviadosTab.js` — enviados, panel de atención, filtros, reintentar y export.
- `CatalogosTab.js` — mantenimiento de proveedores, cuentas, centros y plantillas.

### Backend — `app/api/contabilidad/`
Todas las rutas usan el `service_role` key (bypassa RLS) vía `_lib.js`.
- `_lib.js` — parser XML v4.4, clasificación, armado de asiento, reglas de IVA y
  CABYS (leídas de las tablas, **nunca hardcodeadas**), persistencia y bitácora.
- `catalogos/` — GET de todos los catálogos + rol del usuario; `mantenimiento/`
  para edición (solo admin).
- `asientos/` — listar/crear; `asientos/[id]` ver/editar/descartar/reintentar;
  `asientos/[id]/aprobar` aprueba con validación de rol, monto máximo,
  imputabilidad y cuadre, y deja rastro en `conta_bitacora`.
- `procesar/` — recibe XML y/o PDF (multipart), clasifica y crea borradores.
- `archivo/` — URL firmada para el visor. `gasto-historico/` — gasto por cuenta
  (mes actual/anterior) y estadística del proveedor. `exportar/` — Excel.

## Reglas de negocio implementadas

- Módulo **solo de gastos**: los selectores ofrecen únicamente cuentas
  `imputable = true AND activa = true AND permitida_en_gastos = true` (283 de 340;
  quedan fuera Ingreso, Costo y Patrimonio). La aprobación valida lo mismo.
- IVA: una línea por cada tarifa distinta del desglose (separa 13% / 1% / 2%),
  con la cuenta que sale de `conta_reglas_iva`.
- Clasificación en orden: OC → mercadería (ignora) → proveedor mercadería
  (ignora) → preguntar (avisa) → gasto (usa cuenta/centro sugeridos) →
  desconocido (borrador con la cuenta de gasto sin clasificar).
- Se rechaza cualquier factura cuyo receptor no sea la cédula `3101317661`.
- El XML manda sobre el PDF si existe para la misma clave.
- Aprendizaje: al aprobar, se guarda la cédula del emisor en el centro de costo
  usado (si estaba en blanco).
- Los totales (`total_debe` / `total_haber`) los calcula un trigger: el front no
  los escribe. Los errores de los triggers/constraints se muestran en claro.

### Cuenta placeholder para gasto sin clasificar

La columna `conta_asiento_lineas.cuenta` es `NOT NULL` con FK a `conta_cuentas`,
así que una cuenta "en blanco" no se puede guardar. Para proveedores nuevos se
usa la cuenta **`00-SIN-CLASIFICAR` (imputable=false)** como placeholder:
satisface el FK pero, al no ser imputable, la aprobación queda bloqueada hasta
que un humano elija la cuenta de detalle real. En la interfaz se muestra en
ámbar con "Falta clasificar" para que no se confunda con una cuenta real.

### Facturas ignoradas

Las facturas de mercadería o con orden de compra no se descartan: se guardan en
`conta_facturas` con `clasificacion = 'mercaderia'` y `procesada = false`, y
aparecen en la sección plegable **"Ignoradas (N)"** de la Bandeja. Desde ahí, el
botón **"Convertir en gasto"** crea el borrador y marca la factura como
procesada. Una factura leída nunca se borra.

### Contrapartida por proveedor

`conta_proveedores.cuenta_contrapartida` (editable en Catálogos → Proveedores)
define la cuenta del haber. Si es `null`, se usa `10-10-10-01` Caja General.

### Avisos de cuenta (`notas`)

Si la cuenta seleccionada tiene texto en `conta_cuentas.notas`, se muestra debajo
del campo en ámbar con ⚠️ (informativo, no bloquea). Aplica en Bandeja y Montar.

### Gestión de aprobadores

Sub-pestaña **Catálogos → Aprobadores**, visible y editable solo para rol
`admin`. Alta/edición/activar-desactivar sobre `conta_aprobadores`. Candados: email
único y válido, un admin no puede quitarse a sí mismo el rol, y no se puede dejar
el sistema sin admin activo. Todo cambio queda en `conta_bitacora` (se hizo
`asiento_id` nullable para poder registrar cambios de catálogo).

### Modo prueba

Interruptor global en la cabecera (solo admin lo cambia; el estado vive en
`conta_config.modo_prueba`, igual para todos). Mientras está activo, todo asiento
nuevo se crea con `es_prueba = true` y se muestra con etiqueta **PRUEBA** en ámbar
(Bandeja y Enviados). En Enviados hay filtro "Incluir pruebas" y botón admin
"Descartar pruebas" (con confirmación).

### Semáforo y conciliación (Enviados)

El semáforo y el panel de atención salen de la vista `v_conta_conciliacion`
(no se calculan en el front). Estados: ⏳ aprobado · 🔄 enviando · 📝 sincronizado
(en NEO como Registrado, esperando a Marcela) · ✅ conciliado (Marcela lo aplicó)
· ❌ rechazado (Marcela lo anuló) · ⚠️ error. Van al panel de atención: error,
rechazado, sincronizado con +48h, y —solo cuando la conciliación está activa—
"no aparece en NEO". Mientras `neo_asientos_estado` esté vacía (falta el
descargador), se muestra un aviso discreto de que la conciliación aún no está
activa, sin alarmar.

## Variables de entorno

- `SUPABASE_SERVICE_ROLE_KEY` — ya usada por otros módulos (Vercel).
- `ANTHROPIC_API_KEY` — **nueva, opcional**. Solo se necesita para leer **PDFs**
  (usa el modelo Haiku). Los **XML funcionan sin ella**. Si falta, la carga de
  PDF devuelve un mensaje claro pidiendo configurarla en Vercel.

## Storage

Bucket privado `contabilidad` (creado): guarda los XML/PDF de las facturas. El
visor los abre con URL firmada temporal.

## Atajos de teclado

`⌘S` guardar · `⌘Enter` aprobar · `⌘K` buscador · `Enter` nueva línea ·
`⌘⌫` borrar línea · `⌘↓/⌘↑` navegar facturas · `Esc` cerrar · `?` ayuda.
Toda acción con atajo tiene también su botón visible en pantalla.
