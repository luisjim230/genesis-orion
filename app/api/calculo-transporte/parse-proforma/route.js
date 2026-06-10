import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { extractText, getDocumentProxy } from 'unpdf'
import { parseProforma } from '../parser.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

let _sb
function getDb() {
  if (!_sb) _sb = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  return _sb
}

export async function POST(request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file')
    if (!file) return NextResponse.json({ error: 'No se recibió ningún archivo.' }, { status: 400 })

    // ── Extraer texto de TODAS las páginas (server-side) ──
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdf = await getDocumentProxy(new Uint8Array(buffer))
    const { text } = await extractText(pdf, { mergePages: false })

    const { proforma, cliente, hechoPor, fecha, lineas } = parseProforma(text)

    if (!lineas.length) {
      return NextResponse.json(
        { error: 'No se pudieron leer productos de este PDF. ¿Es una proforma válida?' },
        { status: 422 }
      )
    }

    // ── Lookup de pesos y nombres ──
    const codigos = [...new Set(lineas.map(l => l.codigo))]
    const db = getDb()
    const [{ data: pesos }, { data: catalogo }] = await Promise.all([
      db.from('item_pesos').select('codigo_interno, peso_kg, estado, clase').in('codigo_interno', codigos),
      db.from('v_catalogo_activo').select('codigo_interno, item').in('codigo_interno', codigos),
    ])

    const pesoMap = new Map((pesos || []).map(p => [p.codigo_interno, p]))
    const nombreMap = new Map((catalogo || []).map(c => [c.codigo_interno, c.item]))

    // ── Armar filas y totales ──
    let pesoTotal = 0
    let sinPeso = 0
    const porClase = {} // clase -> peso kg
    const filas = lineas.map(l => {
      const info = pesoMap.get(l.codigo)
      const pesoUnit = info && info.peso_kg != null ? Number(info.peso_kg) : null
      const tienePeso = pesoUnit != null
      const pesoLinea = tienePeso ? l.cantidad * pesoUnit : null
      if (tienePeso) {
        pesoTotal += pesoLinea
        const clase = info.clase || 'Sin clase'
        porClase[clase] = (porClase[clase] || 0) + pesoLinea
      } else {
        sinPeso += 1
      }
      return {
        cantidad: l.cantidad,
        codigo: l.codigo,
        producto: nombreMap.get(l.codigo) || l.descripcion || l.codigo,
        peso_unit: pesoUnit,
        peso_linea: pesoLinea,
        estado: tienePeso ? (info.estado || 'Asignado') : 'Sin peso',
        clase: tienePeso ? (info.clase || null) : null,
        sin_peso: !tienePeso,
      }
    })

    const mezcla = Object.entries(porClase)
      .map(([clase, kg]) => ({ clase, kg, pct: pesoTotal > 0 ? (kg / pesoTotal) * 100 : 0 }))
      .sort((a, b) => b.kg - a.kg)

    return NextResponse.json({
      cabecera: { proforma, cliente, hechoPor, fecha },
      filas,
      peso_total: pesoTotal,
      sin_peso: sinPeso,
      mezcla,
    })
  } catch (err) {
    return NextResponse.json({ error: 'Error al procesar el PDF: ' + err.message }, { status: 500 })
  }
}
