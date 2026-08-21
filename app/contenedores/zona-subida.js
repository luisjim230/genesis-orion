'use client';
import { useState, useRef } from 'react';
import { S } from './estilos';

// Zona para soltar archivos: se pueden arrastrar desde el escritorio, hacer
// click para elegirlos, o pegarlos con Ctrl/Cmd+V. Cualquiera de las tres.

const EXT_OK = /\.(pdf|xlsx|xlsm|xls|csv)$/i;

export default function ZonaSubida({ onArchivos, subiendo, progreso, titulo, ayuda }) {
  const [dentro, setDentro] = useState(false);
  const [rechazados, setRech] = useState([]);
  const fileRef = useRef(null);

  function entregar(lista) {
    const files = [...(lista || [])];
    if (!files.length) return;
    const buenos = files.filter(f => EXT_OK.test(f.name || ''));
    const malos  = files.filter(f => !EXT_OK.test(f.name || ''));
    setRech(malos.map(f => f.name));
    if (buenos.length) onArchivos(buenos);
  }

  return (
    <div>
      <input ref={fileRef} type="file" multiple accept=".pdf,.xlsx,.xlsm,.xls,.csv"
             onChange={e=>{ entregar(e.target.files); e.target.value = ''; }}
             style={{ display:'none' }}/>

      <div
        onClick={()=>{ if (!subiendo) fileRef.current?.click(); }}
        onDragEnter={e=>{ e.preventDefault(); e.stopPropagation(); setDentro(true); }}
        onDragOver={e=>{ e.preventDefault(); e.stopPropagation(); setDentro(true); }}
        onDragLeave={e=>{ e.preventDefault(); e.stopPropagation(); setDentro(false); }}
        onDrop={e=>{
          e.preventDefault(); e.stopPropagation(); setDentro(false);
          if (!subiendo) entregar(e.dataTransfer?.files);
        }}
        onPaste={e=>{ if (!subiendo) entregar(e.clipboardData?.files); }}
        tabIndex={0}
        style={{
          border: '2px dashed ' + (dentro ? 'var(--orange)' : 'var(--border)'),
          background: dentro ? '#fff3ec' : '#fff',
          borderRadius: '12px',
          padding: '26px 20px',
          textAlign: 'center',
          cursor: subiendo ? 'progress' : 'pointer',
          transition: 'all 0.15s',
          outline: 'none',
        }}
      >
        {subiendo ? (
          <>
            <div style={{ fontSize:'1.6rem' }}>⏳</div>
            <div style={{ fontWeight:600, marginTop:'6px', fontSize:'0.92em' }}>
              {progreso || 'Leyendo el archivo...'}
            </div>
            <div style={{ fontSize:'0.78em', color:'var(--text-muted)', marginTop:'4px' }}>
              Puede tardar hasta un minuto por archivo. No cierres la pantalla.
            </div>
          </>
        ) : (
          <>
            <div style={{ fontSize:'1.8rem' }}>{dentro ? '📥' : '📎'}</div>
            <div style={{ fontWeight:600, marginTop:'6px', fontSize:'0.95em' }}>
              {dentro ? '¡Soltalos acá!' : (titulo || 'Arrastrá los archivos acá')}
            </div>
            <div style={{ fontSize:'0.8em', color:'var(--text-muted)', marginTop:'4px' }}>
              {ayuda || 'O hacé click para elegirlos. PDF o Excel — podés soltar varios de una.'}
            </div>
          </>
        )}
      </div>

      {rechazados.length > 0 && (
        <div style={{ ...S.aviso('warn'), marginTop:'10px', marginBottom:0 }}>
          Estos no los puedo leer (solo PDF y Excel): {rechazados.join(', ')}
        </div>
      )}
    </div>
  );
}
