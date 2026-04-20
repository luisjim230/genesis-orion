import { NextResponse } from 'next/server'
import { ejecutarMatch } from '../../lib/procesar-match.js'

export async function POST() {
  try {
    const res = await ejecutarMatch()
    console.log('[procesar-match]', res)
    return NextResponse.json(res)
  } catch (e) {
    console.error('[procesar-match] Error:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
