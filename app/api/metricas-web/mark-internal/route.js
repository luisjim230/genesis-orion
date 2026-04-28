// Endpoint que envía a GA4 un evento manual con traffic_type=internal usando
// el Measurement Protocol. Se usa desde /marcar-interno cuando un empleado
// quiere registrar su navegador como "interno" para que GA4 deje de contarlo
// como visita externa.
//
// Body JSON:
//   client_id   (requerido) — el cliente persistente generado en localStorage
//   device_label (opcional)
//   marked_by   (opcional)
//
// Variables de entorno:
//   GA4_MEASUREMENT_ID         (G-237EPSVR3Z)
//   GA4_MEASUREMENT_API_SECRET (jnTUBYNNRO2xlLAs71hg_A)
import { NextResponse } from 'next/server';

export async function POST(req) {
  try {
    const body = await req.json();
    const client_id = String(body?.client_id || '').trim();
    if (!client_id) return NextResponse.json({ error: 'client_id requerido' }, { status: 400 });

    const measurementId = process.env.GA4_MEASUREMENT_ID || 'G-237EPSVR3Z';
    const apiSecret = process.env.GA4_MEASUREMENT_API_SECRET || 'jnTUBYNNRO2xlLAs71hg_A';

    if (!measurementId || !apiSecret) {
      return NextResponse.json({
        error: 'GA4 Measurement Protocol no configurado',
        hint: 'Definir GA4_MEASUREMENT_ID y GA4_MEASUREMENT_API_SECRET',
      }, { status: 503 });
    }

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${encodeURIComponent(measurementId)}&api_secret=${encodeURIComponent(apiSecret)}`;
    const payload = {
      client_id,
      events: [{
        name: 'mark_internal',
        params: {
          traffic_type: 'internal',
          device_label: String(body?.device_label || '').slice(0, 100) || 'sin_etiqueta',
          marked_by: String(body?.marked_by || '').slice(0, 100) || 'anónimo',
          engagement_time_msec: 1,
        },
      }],
      user_properties: {
        traffic_type: { value: 'internal' },
      },
    };

    const r = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });

    // GA4 MP devuelve 204 vacío en éxito; 4xx con errores en validate.
    if (!r.ok) {
      const txt = await r.text().catch(() => '');
      return NextResponse.json({ error: `GA4 MP devolvió ${r.status}`, detail: txt }, { status: 502 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
