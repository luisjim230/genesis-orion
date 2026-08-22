import { NextResponse } from 'next/server';
import { getClubActor, getClubDb } from '../../../lib/club-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Datos del panel admin de la Rifa: ranking por acciones, registros, patrocinadores,
// config (perillas), ganadores y KPIs. Todo desde el servidor con service role.
export async function GET() {
  const actor = await getClubActor();
  if (!actor) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const db = getClubDb();

  const [saldosR, registrosR, patroR, configR, ganadoresR, pendientesR] = await Promise.all([
    db.from('rifa_saldos').select('cedula,nombre,telefono,acciones,ya_gano').order('acciones', { ascending: false }),
    db.from('rifa_registros').select('id,cedula,factura,monto_real,base_acciones,multiplicador,acciones,tuvo_patrocinador,es_web,vendedor,detalle,fecha_registro').order('fecha_registro', { ascending: false }).limit(80),
    db.from('rifa_patrocinadores').select('id,nombre,tier,aporte_colones,neo_proveedor,detecta_credix,logo_url,activo,orden').order('orden', { ascending: true }),
    db.from('rifa_config').select('clave,valor,descripcion').order('clave', { ascending: true }),
    db.from('rifa_ganadores').select('id,cedula,nombre,premio,ronda,seed,nota,fecha').order('fecha', { ascending: false }),
    db.from('rifa_pendientes').select('id,cedula,nombre,telefono,ult_factura,monto_declarado,estado,intentos,ultimo_error,fecha_creacion,fecha_procesada').order('fecha_creacion', { ascending: false }).limit(120),
  ]);

  const err = saldosR.error || registrosR.error || patroR.error || configR.error || ganadoresR.error || pendientesR.error;
  if (err) return NextResponse.json({ error: err.message }, { status: 500 });

  const saldos = saldosR.data || [];
  const accionesCirculacion = saldos.reduce((a, s) => a + (Number(s.acciones) || 0), 0);
  const elegibles = saldos.filter((s) => (Number(s.acciones) || 0) > 0 && !s.ya_gano);
  const accionesElegibles = elegibles.reduce((a, s) => a + (Number(s.acciones) || 0), 0);

  const config = {};
  (configR.data || []).forEach((c) => { config[c.clave] = c.valor; });

  const pendientes = pendientesR.data || [];
  const pendientesEnCola = pendientes.filter((p) => p.estado === 'pendiente').length;

  return NextResponse.json({
    saldos,
    registros: registrosR.data || [],
    patrocinadores: patroR.data || [],
    config,
    configRows: configR.data || [],
    ganadores: ganadoresR.data || [],
    pendientes,
    kpis: {
      totalParticipantes: saldos.length,
      accionesCirculacion,
      facturasRegistradas: (registrosR.data || []).length,
      elegibles: elegibles.length,
      accionesElegibles,
      pendientesEnCola,
    },
  });
}
