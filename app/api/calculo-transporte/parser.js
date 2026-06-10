// Parser de proformas en texto plano (extraído del PDF).
// Maneja los dos formatos de proforma (con precio unitario o solo total):
// la estructura cantidad + "CODIGO - DESCRIPCION" es la misma, no dependemos
// de las columnas de precio.

const MESES = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
const FIN_BLOQUE = ['Valor en letras', 'Valor en Letras', 'Subtotal', 'SUBTOTAL']

// cantidad: parseFloat sin separador de miles (la coma es miles, el punto decimal)
function parseCantidad(raw) {
  return parseFloat(String(raw).replace(/,/g, ''))
}

// Devuelve el índice donde termina el bloque del producto: la siguiente
// cantidad, o el primer marcador de cierre, o el fin del texto.
function finDeBloque(texto, desde, siguienteCantidadIdx) {
  let fin = siguienteCantidadIdx >= 0 ? siguienteCantidadIdx : texto.length
  for (const marca of FIN_BLOQUE) {
    const i = texto.indexOf(marca, desde)
    if (i >= 0 && i < fin) fin = i
  }
  return fin
}

export function parseProforma(textoPaginas) {
  // textoPaginas: array de strings (una por página) o string único.
  // Ignoramos páginas en blanco (la primera a veces viene vacía).
  const paginas = Array.isArray(textoPaginas) ? textoPaginas : [textoPaginas]
  const texto = paginas.filter(p => p && p.trim().length > 0).join('\n')

  // ── Cabecera ──
  const proforma = (texto.match(/Proforma No\s*(\d+)/i) || [])[1] || null
  const cliente  = (texto.match(/Cliente:\s*(\d+)/i) || [])[1] || null
  const hechoPor = (texto.match(/Hecho por:\s*([A-Za-zÁÉÍÓÚÑáéíóúñ]+)/i) || [])[1] || null
  const fechaM   = texto.match(new RegExp(`(\\d{1,2})\\s+(${MESES.join('|')})\\s+(\\d{4})`, 'i'))
  const fecha    = fechaM ? `${fechaM[1]} ${fechaM[2]} ${fechaM[3]}` : null

  // ── Líneas de producto ──
  // Partimos por cada cantidad "NN.00 UDS".
  const re = /(\d[\d.,]*)\s*UDS/gi
  const matches = []
  let m
  while ((m = re.exec(texto)) !== null) {
    matches.push({ raw: m[1], start: m.index, end: m.index + m[0].length })
  }

  const lineas = []
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]
    const cantidad = parseCantidad(cur.raw)
    const siguiente = i + 1 < matches.length ? matches[i + 1].start : -1
    const finBloque = finDeBloque(texto, cur.end, siguiente)
    const bloque = texto.slice(cur.end, finBloque)

    // codigo = texto ANTES del primer " - " (espacio-guion-espacio).
    const sep = bloque.indexOf(' - ')
    if (sep === -1) continue
    let codigo = bloque.slice(0, sep).trim()
    if (!codigo) continue
    // Si quedó con espacios (texto colado de la columna anterior), tomar el último token.
    if (/\s/.test(codigo)) {
      const toks = codigo.split(/\s+/)
      codigo = toks[toks.length - 1]
    }
    // Excluir el flete y servicios.
    if (codigo.toUpperCase() === 'TRANSPORTE') continue

    // Descripción cruda del PDF (fallback; el nombre real se toma del catálogo).
    let descripcion = bloque.slice(sep + 3).replace(/\s+/g, ' ').trim()
    // Cortar antes de la primera ráfaga de precios para no arrastrar montos.
    const corte = descripcion.search(/\s\d[\d.,]*\.\d{2}\b/)
    if (corte > 0) descripcion = descripcion.slice(0, corte).trim()
    if (descripcion.length > 80) descripcion = descripcion.slice(0, 80).trim()

    lineas.push({ cantidad, codigo, descripcion })
  }

  return { proforma, cliente, hechoPor, fecha, lineas }
}
