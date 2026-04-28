'use client';
import { useState } from 'react';
import { useAuth } from '../../lib/useAuth';
import { S, DATE_RANGES } from './components/styles';
import Dashboard from './components/Dashboard';
import EquipoWhatsApp from './components/EquipoWhatsApp';
import GeneradorLinks from './components/GeneradorLinks';
import HistorialLinks from './components/HistorialLinks';
import Configuracion from './components/Configuracion';

const TABS = [
  { key: 'dashboard',  label: 'Dashboard',           emoji: '📊' },
  { key: 'whatsapp',   label: 'Equipo WhatsApp',     emoji: '📱' },
  { key: 'generador',  label: 'Generador de Links',  emoji: '🪄' },
  { key: 'historial',  label: 'Historial de Links',  emoji: '📚' },
  { key: 'config',     label: 'Configuración',       emoji: '⚙️' },
];

export default function MetricasWebPage() {
  const { perfil, loading } = useAuth();
  const [tab, setTab] = useState('dashboard');
  const [dateRange, setDateRange] = useState('7d');

  if (loading) {
    return <div style={{ ...S.page, color: 'rgba(0,0,0,0.5)' }}>⏳ Cargando...</div>;
  }
  if (!perfil) {
    return <div style={{ ...S.page, color: 'rgba(0,0,0,0.6)' }}>Necesitás iniciar sesión.</div>;
  }

  return (
    <div style={S.page}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', flexWrap: 'wrap', gap: 12, marginBottom: 18 }}>
        <div>
          <h1 style={S.title}>📊 Métricas Web</h1>
          <div style={S.caption}>
            Dashboard de Google Analytics 4 · Tráfico externo (clientes) separado del interno (equipo).
          </div>
        </div>
        {tab !== 'generador' && tab !== 'historial' && tab !== 'config' && (
          <div>
            <label style={{ ...S.label, marginBottom: 4 }}>Período</label>
            <select value={dateRange} onChange={e => setDateRange(e.target.value)} style={{ ...S.input, minWidth: 200 }}>
              {DATE_RANGES.map(r => <option key={r.key} value={r.key}>{r.label}</option>)}
            </select>
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 18, paddingBottom: 6, borderBottom: '1px solid rgba(0,0,0,0.08)' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={S.pillTab(tab === t.key)}>
            <span style={{ marginRight: 4 }}>{t.emoji}</span>{t.label}
          </button>
        ))}
      </div>

      {tab === 'dashboard'  && <Dashboard dateRange={dateRange} />}
      {tab === 'whatsapp'   && <EquipoWhatsApp dateRange={dateRange} />}
      {tab === 'generador'  && <GeneradorLinks user={perfil} />}
      {tab === 'historial'  && <HistorialLinks />}
      {tab === 'config'     && <Configuracion />}
    </div>
  );
}
