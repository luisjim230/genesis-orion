// app/api/kommo/enviar-oc/route.js
import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

let _admin;
function supabaseAdmin() {
  if (!_admin) _admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
  return _admin;
}

const KOMMO_TOKEN = process.env.KOMMO_TOKEN
const KOMMO_SUBDOMAIN = process.env.KOMMO_SUBDOMAIN || 'depositojimenez'
const KOMMO_BASE = `https://${KOMMO_SUBDOMAIN}.kommo.com/api/v4`

async function kommo(path, method = 'GET', body = null) {
  const opts = {
    method,
    headers: { 'Authorization': `Bearer ${KOMMO_TOKEN}`, 'Content-Type': 'application/json' },
  }
  if (body) opts.body = JSON.stringify(body)
  const res = await fetch(`${KOMMO_BASE}${path}`, opts)
  if (!res.ok) { const err = await res.text(); throw new Error(`Kommo ${method} ${path} → ${res.status}: ${err}`) }
  const text = await res.text()
  return text ? JSON.parse(text) : {}
}

async function buscarContactoPorTelefono(telefono) {
  try {
    const data = await kommo(`/contacts?query=${telefono}&limit=1`)
    return data?._embedded?.contacts?.[0] || null
  } catch { return null }
}

async function crearContacto(nombre, telefono) {
  const data = await kommo('/contacts', 'POST', [{
    name: nombre,
    custom_fields_values: [{ field_code: 'PHONE', values: [{ value: telefono, enum_code: 'WORK' }] }],
  }])
  return data?._embedded?.contacts?.[0]
}

async function crearNota(contactId, texto) {
  try {
    await kommo('/notes/contacts', 'POST', [{ entity_id: contactId, note_type: 'common', params: { text: texto } }])
  } catch (e) { console.warn('[Kommo] nota:', e.message) }
}

function formatearMensaje(proveedor, items, fechaOC) {
  const fecha = new Date(fechaOC || Date.now()).toLocaleDateString('es-CR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const lineas = items.map(i => `• ${i.nombre || i.codigo} × ${i.cantidad} uds`).join('\n')
  return `📦 *Orden de Compra - Depósito Jiménez*\nProveedor: *${proveedor}*\nFecha: ${fecha}\n\n*Productos:*\n${lineas}\n\n_Total: ${items.length} producto(s)_\n_Enviado desde SOL · Sistema de Operaciones_`
}

export async function POST(req) {
  try {
    const { proveedor, items, telefono, fecha_oc } = await req.json()
    if (!proveedor || !items?.length) return NextResponse.json({ error: 'proveedor e items requeridos' }, { status: 400 })
    if (!telefono) return NextResponse.json({ error: 'telefono requerido' }, { status: 400 })
    if (!KOMMO_TOKEN) return NextResponse.json({ error: 'KOMMO_TOKEN no configurado' }, { status: 500 })

    let contacto = await buscarContactoPorTelefono(telefono)
    let contactoId = contacto?.id
    if (!contactoId) {
      const nuevo = await crearContacto(proveedor, telefono)
      contactoId = nuevo?.id
    }

    if (contactoId) {
      await supabaseAdmin().from('kommo_proveedores').upsert({
        nombre_proveedor: proveedor, whatsapp: telefono,
        kommo_contact_id: String(contactoId), actualizado_en: new Date().toISOString(),
      }, { onConflict: 'nombre_proveedor' })
    }

    const mensaje = formatearMensaje(proveedor, items, fecha_oc)
    if (contactoId) await crearNota(contactoId, mensaje)

    return NextResponse.json({ ok: true, contacto_id: contactoId, mensaje_enviado: mensaje.slice(0, 80) + '...' })
  } catch (e) {
    console.error('[kommo/enviar-oc]', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
