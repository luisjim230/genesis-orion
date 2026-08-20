import { NextResponse } from 'next/server'
import { autoCancelarVencidas } from '../../lib/procesar-match.js'
import { DIAS_LIMITE_OC } from '../../../lib/transito.js'

// Da por perdidas las OC pendientes de más de DIAS_LIMITE_OC días. Corre con la
// service key (RLS no la frena) y es idempotente: si no hay nada vencido
// devuelve 0 sin tocar la base.
export async function POST() {
  try {
    const res = await autoCancelarVencidas()
    if (res.cancelados > 0) console.log('[auto-cancelar-oc]', res)
    return NextResponse.json({ ...res, dias_limite: DIAS_LIMITE_OC })
  } catch (e) {
    console.error('[auto-cancelar-oc] Error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
