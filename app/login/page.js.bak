'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

const nunitoStyle = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap');`;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
  const [email, setEmail]     = useState('');
  const [pass, setPass]       = useState('');
  const [error, setError]     = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pass });
    if (error) { setError('Credenciales incorrectas. Verificá tu email y contraseña.'); setLoading(false); return; }
    router.push('/');
    router.refresh();
  }

  return (
    <>
      <style>{nunitoStyle}</style>
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg, #5E2733 0%, #3a1520 60%, #1a0a0e 100%)', fontFamily:"'Rubik','DM Sans',sans-serif" }}>
        <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:20, padding:'48px 44px', width:'100%', maxWidth:400, boxShadow:'0 24px 64px rgba(0,0,0,0.40)' }}>
          <div style={{ textAlign:'center', marginBottom:36 }}>
            <svg width="52" height="52" viewBox="0 0 36 36" style={{ marginBottom:12 }}>
              <circle cx="18" cy="18" r="7" fill="#ED6E2E"/>
              <line x1="18" y1="2"  x2="18" y2="8"  stroke="rgba(253,244,244,0.90)" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="18" y1="28" x2="18" y2="34" stroke="rgba(253,244,244,0.90)" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="2"  y1="18" x2="8"  y2="18" stroke="rgba(253,244,244,0.90)" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="28" y1="18" x2="34" y2="18" stroke="rgba(253,244,244,0.90)" strokeWidth="2.5" strokeLinecap="round"/>
              <line x1="6.1"  y1="6.1"  x2="10.3" y2="10.3" stroke="#ED6E2E" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
              <line x1="25.7" y1="25.7" x2="29.9" y2="29.9" stroke="#ED6E2E" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
              <line x1="29.9" y1="6.1"  x2="25.7" y2="10.3" stroke="#ED6E2E" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
              <line x1="10.3" y1="25.7" x2="6.1"  y2="29.9" stroke="#ED6E2E" strokeWidth="2.2" strokeLinecap="round" opacity="0.75"/>
            </svg>
            <div style={{ fontFamily:"'Nunito',sans-serif", fontWeight:900, color:'#ED6E2E', fontSize:22 }}>GÉNESIS ORIÓN</div>
            <div style={{ color:'rgba(253,244,244,0.40)', fontSize:'0.72rem', letterSpacing:'0.12em', textTransform:'uppercase', marginTop:4 }}>Corporación Rojimo S.A.</div>
          </div>
          <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={{ fontSize:'0.72rem', color:'rgba(253,244,244,0.45)', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Correo electrónico</label>
              <input type="email" required autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}
                style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:10, padding:'11px 14px', color:'rgba(253,244,244,0.92)', fontSize:'0.9rem', fontFamily:'inherit', outline:'none' }}
                placeholder="usuario@rojimo.com"/>
            </div>
            <div>
              <label style={{ fontSize:'0.72rem', color:'rgba(253,244,244,0.45)', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Contraseña</label>
              <input type="password" required autoComplete="current-password" value={pass} onChange={e=>setPass(e.target.value)}
                style={{ width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:10, padding:'11px 14px', color:'rgba(253,244,244,0.92)', fontSize:'0.9rem', fontFamily:'inherit', outline:'none' }}
                placeholder="••••••••"/>
            </div>
            {error && <div style={{ background:'rgba(252,129,129,0.12)', border:'1px solid rgba(252,129,129,0.35)', borderRadius:8, padding:'10px 14px', color:'#fc8181', fontSize:'0.82rem' }}>❌ {error}</div>}
            <button type="submit" disabled={loading}
              style={{ marginTop:8, padding:'13px', borderRadius:10, border:'none', background:loading?'rgba(237,110,46,0.5)':'#ED6E2E', color:'#fff', fontWeight:600, fontSize:'0.95rem', fontFamily:'inherit', cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Ingresando...' : 'Ingresar →'}
            </button>
          </form>
          <div style={{ textAlign:'center', marginTop:28, fontSize:'0.68rem', color:'rgba(253,244,244,0.20)' }}>SOL v1.0 · 2026 · Acceso restringido</div>
        </div>
      </div>
    </>
  );
}
