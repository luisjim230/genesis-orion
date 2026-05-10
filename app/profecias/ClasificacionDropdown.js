'use client';
import { useState } from 'react';
import { CLASIFICACIONES } from './ui.js';

export default function ClasificacionDropdown({ codigo, value, onChange }) {
  const [val, setVal] = useState(value || 'normal');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState(null);

  async function guardar(nuevo) {
    setVal(nuevo);
    setSaving(true);
    setErr(null);
    try {
      const r = await fetch('/api/profecias/clasificacion', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codigo_interno: codigo, clasificacion_manual: nuevo }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) throw new Error(j.error || 'Error');
      if (onChange) onChange(nuevo);
    } catch (e) {
      setErr(e.message);
      setVal(value || 'normal');
    } finally {
      setSaving(false);
    }
  }

  return (
    <span style={{ position: 'relative', display: 'inline-block' }}>
      <select
        value={val}
        disabled={saving}
        onChange={(e) => guardar(e.target.value)}
        style={{
          fontSize: 12, padding: '3px 6px', borderRadius: 4,
          border: '1px solid #cbd5e0', background: saving ? '#edf2f7' : '#fff',
          cursor: saving ? 'wait' : 'pointer',
        }}
        title={err || undefined}
      >
        {CLASIFICACIONES.map((c) => (
          <option key={c.value} value={c.value}>{c.label}</option>
        ))}
      </select>
      {err && <span style={{ position: 'absolute', top: '100%', left: 0, fontSize: 10, color: '#E53E3E' }}>!</span>}
    </span>
  );
}
