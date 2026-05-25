'use client';
import { useState } from 'react';
import { useAuth } from '../../lib/useAuth';
import OrigenPanorama from './OrigenPanorama';
import OrigenRiesgo from './OrigenRiesgo';
import OrigenClasificar from './OrigenClasificar';

// Paleta brandbook usada como acento por origen.
export const ORIGEN_COLOR = {
  nacional:  '#1B3A5C', // azul
  importado: '#E07B39', // naranja
  combo:     '#6E2238', // vino
};
export const BRAND = { azul: '#1B3A5C', vino: '#6E2238', naranja: '#E07B39', beige: '#EFE6D9' };

const SUBTABS = [
  { id: 'panorama',   label: '🌎 Panorama' },
  { id: 'riesgo',     label: '⚠️ Riesgo de Quiebre' },
  { id: 'clasificar', label: '✏️ Clasificar', adminOnly: true },
];

export default function OrigenTab() {
  const { perfil } = useAuth();
  const isAdmin = perfil?.rol === 'admin';
  const usuario = perfil?.nombre || perfil?.email || 'sistema';
  const [sub, setSub] = useState('panorama');

  const visibles = SUBTABS.filter(t => !t.adminOnly || isAdmin);
  const activo = visibles.some(t => t.id === sub) ? sub : 'panorama';

  return (
    <div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
        {visibles.map(t => (
          <button
            key={t.id}
            onClick={() => setSub(t.id)}
            style={{
              padding: '7px 16px',
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 700,
              border: '1px solid ' + (activo === t.id ? '#6E2238' : 'rgba(110,34,56,0.2)'),
              background: activo === t.id ? '#6E2238' : 'white',
              color: activo === t.id ? 'white' : '#6E2238',
              cursor: 'pointer',
            }}
          >{t.label}</button>
        ))}
      </div>

      {activo === 'panorama'   && <OrigenPanorama />}
      {activo === 'riesgo'     && <OrigenRiesgo />}
      {activo === 'clasificar' && isAdmin && <OrigenClasificar usuario={usuario} />}
    </div>
  );
}
