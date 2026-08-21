# Cargas en tránsito — archivos y mercadería

Módulo `/contenedores` (Jonás). Antes se llenaba todo a mano; ahora se le pueden
subir las proformas / facturas de cada orden y el módulo las lee.

## Qué hace

1. **Subir el archivo** (PDF o Excel) desde el expediente del contenedor, o
   varios juntos desde la pestaña **📎 Documentos**.
2. **Lo lee con IA** (`claude-sonnet-5`) y saca: proveedor, N° de PI, incoterm,
   puertos, CBM, términos de pago (% de adelanto y saldo), tiempo de producción,
   un resumen de qué viene y **la lista de productos línea por línea**.
3. **Propone a qué contenedor pertenece** cuando se sube sin asignar. El match se
   apoya en la plata (adelanto, saldo, total) y en el nombre del proveedor.
   Confirmar es siempre un click de Luis.
4. **Compara contra lo cargado a mano** campo por campo y marca cada dato como
   *coincide* / *no coincide* / *lo tenés vacío*.
5. **Estima los impuestos de aduana** por partida arancelaria del TLC China.

## La regla que no se rompe

**Nada se sobrescribe solo.** La lectura del archivo se guarda en
`neptuno_docs.extraido` y se muestra como propuesta. Aplicar un valor al
expediente es siempre un click, y el valor propuesto se puede editar antes de
aplicarlo. Lo mismo con la mercadería: cada línea es editable, y una línea que
Luis toca queda marcada `editado = true` para que nada la vuelva a pisar.

## Cálculo de impuestos (referencial)

```
CIF   = valor de mercadería + flete   (si el incoterm es CIF, el flete ya va adentro)
DAI   = por línea, según la partida de tlc_china_partidas (0% para casi todo bajo TLC,
        14% para loza sanitaria que quedó como MFN E)
Ley 6946 = 1% del CIF
IVA      = 13% sobre (CIF + DAI + Ley 6946)
Impuestos estimados = DAI + Ley 6946 + IVA
```

No incluye agente aduanal, almacenaje ni gastos portuarios (~$500–900 por
contenedor). El IVA se paga en aduana aunque después se acredite: por eso entra
en el estimado, que es plata que hay que poner.

El estimado vive en `neptuno_envios.impuestos_estimado` (+ el desglose en
`impuestos_detalle`). **El monto que manda sigue siendo `impuestos_monto`**, que
Luis fija a mano; cuando lo hace, se marca `impuestos_fijado = true`.

## Tablas

| Tabla / vista | Para qué |
|---|---|
| `neptuno_envios` | Cabecera del contenedor (la de siempre, + columnas nuevas del documento) |
| `neptuno_docs` | Archivos subidos: metadata + lectura cruda (`extraido` jsonb) + candidatos de match |
| `neptuno_items` | Mercadería línea por línea (`origen`: archivo o manual, `editado`: tocada a mano) |
| `v_neptuno_transito` | Un producto en camino por fila, con el contexto de su contenedor |
| `v_neptuno_envios_resumen` | Un contenedor por fila, con costo total, líneas y unidades |

Los binarios van al bucket privado `contenedores` (25 MB máx.). **El browser los
sube directo al bucket con una URL firmada**, no a través de la API: el body de
una función de Vercel tope en 4.5 MB y una proforma con fotos adentro pesa más
(la de Barana pesa 7,4 MB). La API recibe solo la ruta del archivo ya guardado,
lo baja, lo deduplica por `sha256` y lo manda a leer. Por eso el bucket no
restringe mime types: la extensión se valida antes de firmar la URL.

## API

| Ruta | Qué hace |
|---|---|
| `POST /api/contenedores/upload-url` | Firma la URL para que el browser suba el archivo directo al bucket |
| `POST /api/contenedores/docs` | Registra y lee archivos ya subidos (JSON `archivos[]`) o un multipart `files[]` |
| `GET /api/contenedores/docs?envio_id=` | Lista documentos (o `?sin_asignar=1`) |
| `GET /api/contenedores/docs/:id` | Documento + comparativo contra su envío |
| `PATCH /api/contenedores/docs/:id` | Asigna el documento a un contenedor |
| `DELETE /api/contenedores/docs/:id` | Borra el archivo (deja las líneas editadas a mano) |
| `GET /api/contenedores/docs/:id/archivo` | Sirve el archivo original |
| `POST /api/contenedores/docs/:id/releer` | Vuelve a leer un archivo ya guardado |
| `POST /api/contenedores/docs/:id/aplicar` | Aplica al envío solo los campos marcados |
| `GET/POST /api/contenedores/estimar` | Calcula (y guarda) el estimado de impuestos |

Requiere `ANTHROPIC_API_KEY` y `SUPABASE_SERVICE_ROLE_KEY` en Vercel (las mismas
que ya usa Contabilidad).

## Notas

- Cada archivo se manda en su propio request desde el browser: leer una proforma
  con IA tarda, y así ni se cae por timeout ni un archivo malo arrastra al resto.
- **El archivo se sube siempre, se lea o no.** Si la lectura falla (falta la clave,
  se cayó la conexión, el PDF es una foto ilegible) el documento queda con
  `estado = 'error'` y se reintenta con **Leer de nuevo**, sin volver a subirlo.
  Al releer se rehacen solo las líneas que no tocó Luis (`editado = false`).
- Los archivos se sueltan arrastrándolos, con click o pegando con Ctrl/Cmd+V.
- Las líneas sin cantidad (filas de encabezado o vacías del Excel) se descartan.
- Si la IA no logra ubicar la partida de una línea, se asume 0% de DAI y el
  módulo muestra qué porcentaje del valor quedó con partida identificada.
