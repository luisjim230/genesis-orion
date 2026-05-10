'use client';
import { useState } from 'react';

const SECCIONES = [
  {
    titulo: 'Madurez del SKU',
    items: [
      { e: '🆕', t: 'Recién nacido', d: '0–30 días desde la primera venta' },
      { e: '🌱', t: 'Validación', d: '31–90 días' },
      { e: '📈', t: 'Joven', d: '91–180 días' },
      { e: '🏛️', t: 'Maduro', d: 'Más de 180 días — proyección confiable' },
      { e: '⚪', t: 'Sin ventas', d: 'Nunca se vendió aún' },
    ],
  },
  {
    titulo: 'Semáforo',
    items: [
      { e: '⚫', t: 'Quebrado', d: 'Existencias en 0', c: '#9B2C2C' },
      { e: '🔴', t: 'Pedir YA', d: 'Se va a quebrar antes de que llegue el pedido', c: '#E53E3E' },
      { e: '🟡', t: 'Pedir pronto', d: 'Por debajo del punto de reorden', c: '#D69E2E' },
      { e: '🟢', t: 'Saludable', d: 'Cobertura adecuada', c: '#38A169' },
      { e: '🟦', t: 'Sobre-stock', d: 'Más de 12 meses de cobertura', c: '#3182CE' },
      { e: '⚪', t: 'Sin datos / sin demanda', d: 'No hay suficiente histórico para proyectar' },
    ],
  },
  {
    titulo: 'Banderas (columna ⚑)',
    items: [
      { e: '🔬', t: 'Datos insuficientes', d: 'Menos de 7 días de vida — la proyección automática queda en NULL, requiere decisión humana' },
      { e: '📊', t: 'Outliers detectados', d: 'Hay facturas atípicas (mayoreo) en los últimos 90 días. El "Ritmo Ajustado" las excluye y la proyección se calcula sin ellas' },
      { e: '🔄', t: 'Stockout', d: 'Vino un cliente, no había stock' },
      { e: '⚠️', t: 'Posible discontinuar', d: 'Hace mucho que no se vende pero todavía hay existencias' },
      { e: '⏸️', t: 'Proveedor pausado', d: 'No se le compra a este proveedor por ahora' },
      { e: '🙈', t: 'Oculto de compras', d: 'Marcado para que el sistema no sugiera comprar este SKU' },
    ],
  },
  {
    titulo: 'Confianza',
    items: [
      { e: 'Alta',   t: 'Verde',    d: 'SKU maduro (180+ días) con histórico estable', c: '#38A169', pill: true },
      { e: 'Media',  t: 'Azul',     d: 'SKU joven (91–180 días)',                       c: '#3182CE', pill: true },
      { e: 'Baja',   t: 'Amarillo', d: 'SKU en validación (31–90 días)',                c: '#D69E2E', pill: true },
      { e: 'Manual', t: 'Morado',   d: 'Recién nacido o datos insuficientes — tu criterio manda', c: '#805AD5', pill: true },
    ],
  },
  {
    titulo: 'Estado de aprobación',
    items: [
      { e: '✓ APROBADO', t: 'Verde', d: 'Ya está pre-aprobado — aparece en Plan por Proveedor esperando que generes la orden', c: '#38A169', pill: true },
    ],
  },
];

export default function LeyendaPanel() {
  const [abierto, setAbierto] = useState(false);

  return (
    <div style={{ marginBottom: 12 }}>
      <button onClick={() => setAbierto(!abierto)} style={{
        padding: '6px 12px', borderRadius: 6, border: '1px solid #cbd5e0',
        background: abierto ? '#fff' : 'transparent', cursor: 'pointer',
        fontSize: 12, color: '#4a5568', display: 'inline-flex', alignItems: 'center', gap: 6,
      }}>
        <span>❓</span>
        <span>{abierto ? 'Ocultar leyenda' : '¿Qué significa cada emoji?'}</span>
      </button>

      {abierto && (
        <div style={{
          marginTop: 8, padding: 14, background: '#fff',
          border: '1px solid #e2e8f0', borderRadius: 8,
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 16,
        }}>
          {SECCIONES.map((s) => (
            <div key={s.titulo}>
              <div style={{
                fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: 0.5, color: '#1c1f26', marginBottom: 6, paddingBottom: 4,
                borderBottom: '2px solid #c8a84b',
              }}>{s.titulo}</div>
              <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                {s.items.map((it) => (
                  <li key={it.t + it.e} style={{ display: 'flex', gap: 8, padding: '5px 0', alignItems: 'flex-start' }}>
                    <span style={it.pill ? {
                      display: 'inline-block', padding: '2px 8px', borderRadius: 4,
                      fontSize: 10, fontWeight: 700, color: '#fff', background: it.c,
                      flexShrink: 0, minWidth: 60, textAlign: 'center',
                    } : {
                      fontSize: 16, width: 24, textAlign: 'center', flexShrink: 0,
                      color: it.c || 'inherit',
                    }}>{it.e}</span>
                    <div style={{ fontSize: 12, lineHeight: 1.35 }}>
                      <strong style={{ color: '#1c1f26' }}>{it.t}.</strong>{' '}
                      <span style={{ color: '#4a5568' }}>{it.d}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
