import { NextResponse } from 'next/server';
import { getClubActor, getClubDb } from '../../../lib/club-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Datos del panel admin del Club: saldos/ranking, registros recientes,
// productos participantes y KPIs. Todo desde el servidor con service role.
export async function GET() {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = getClubDb();

  // Inicio del mes actual (para KPI de facturas del mes).
  const now = new Date();
  const inicioMes = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [saldosR, registrosR, productosR, mesR] = await Promise.all([
    db.from('club_saldos').select('cedula,nombre,telefono,estado,puntos').order('puntos', { ascending: false }),
    db.from('club_registros').select('id,cedula,factura,monto_declarado,monto_real,puntos,detalle,fecha_registro').order('fecha_registro', { ascending: false }).limit(60),
    db.from('club_productos_participan').select('codigo_interno,descripcion,puntos_por_unidad,activo').order('descripcion', { ascending: true }),
    db.from('club_registros').select('id', { count: 'exact', head: true }).gte('fecha_registro', inicioMes),
  ]);

  const err = saldosR.error || registrosR.error || productosR.error || mesR.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const saldos = saldosR.data || [];
  const puntosCirculacion = saldos.reduce((acc, s) => acc + (Number(s.puntos) || 0), 0);

  return NextResponse.json({
    saldos,
    registros: registrosR.data || [],
    productos: productosR.data || [],
    kpis: {
      totalMiembros: saldos.length,
      puntosCirculacion,
      facturasMes: mesR.count || 0,
    },
  });
}
