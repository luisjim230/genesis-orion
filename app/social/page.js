'use client';
import { useState } from 'react';
import { createBrowserClient } from '@supabase/ssr';
import { useRouter } from 'next/navigation';

const nunitoStyle = `@import url('https://fonts.googleapis.com/css2?family=Nunito:wght@800;900&display=swap');`;

export default function LoginPage() {
  const router = useRouter();
  const supabase = createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const [login, setLogin]   = useState('');
  const [pass, setPass]     = useState('');
  const [error, setError]   = useState(null);
  const [loading, setLoading] = useState(false);

  async function handleLogin(e) {
    e.preventDefault();
    setLoading(true); setError(null);
    let authEmail = login.trim().toLowerCase();
    if (!authEmail.includes('@')) {
      const res  = await fetch(`/api/admin/usuarios?username=${encodeURIComponent(authEmail)}`);
      const data = await res.json();
      if (!res.ok || !data?.email) { setError('Usuario no encontrado.'); setLoading(false); return; }
      authEmail = data.email;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: authEmail, password: pass });
    if (error) { setError('Credenciales incorrectas.'); setLoading(false); return; }
    router.push('/'); router.refresh();
  }

  const inputStyle = { width:'100%', boxSizing:'border-box', background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.14)', borderRadius:10, padding:'11px 14px', color:'rgba(253,244,244,0.92)', fontSize:'0.9rem', fontFamily:'inherit', outline:'none' };

  return (
    <>
      <style>{nunitoStyle}</style>
      <div style={{ minHeight:'100vh', display:'flex', alignItems:'center', justifyContent:'center', background:'linear-gradient(135deg, #5E2733 0%, #3a1520 60%, #1a0a0e 100%)', fontFamily:"'Rubik','DM Sans',sans-serif" }}>
        <div style={{ background:'rgba(255,255,255,0.04)', border:'1px solid rgba(255,255,255,0.10)', borderRadius:20, padding:'48px 44px', width:'100%', maxWidth:400, boxShadow:'0 24px 64px rgba(0,0,0,0.40)' }}>
          <div style={{ textAlign:'center', marginBottom:36 }}>
            <svg width="56" height="48" viewBox="0 0 56 48" style={{ display:'block', margin:'0 auto 10px' }}>
              <rect x="0"  y="0"  width="16" height="9" rx="2" fill="rgba(255,255,255,0.90)"/>
              <rect x="20" y="0"  width="24" height="9" rx="2" fill="#ED6E2E"/>
              <rect x="0"  y="13" width="24" height="9" rx="2" fill="#ED6E2E"/>
              <rect x="28" y="13" width="16" height="9" rx="2" fill="#ED6E2E"/>
              <rect x="0"  y="26" width="10" height="9" rx="2" fill="#ED6E2E"/>
              <rect x="14" y="26" width="30" height="9" rx="2" fill="#ED6E2E"/>
            </svg>
            <div style={{ fontFamily:"'Nunito',sans-serif", fontWeight:900, color:'#ED6E2E', fontSize:13, letterSpacing:'0.18em', textTransform:'uppercase', marginBottom:2 }}>DEPÓSITO JIMÉNEZ</div>
            <div style={{ fontFamily:"'Nunito',sans-serif", fontWeight:900, color:'rgba(253,244,244,0.95)', fontSize:26, letterSpacing:'0.04em', lineHeight:1 }}>SOL</div>
            <div style={{ color:'rgba(253,244,244,0.45)', fontSize:'0.65rem', letterSpacing:'0.10em', textTransform:'uppercase', marginTop:4 }}>Sistema de Operaciones y Logística</div>
          </div>
          <form onSubmit={handleLogin} style={{ display:'flex', flexDirection:'column', gap:16 }}>
            <div>
              <label style={{ fontSize:'0.72rem', color:'rgba(253,244,244,0.45)', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Usuario o correo</label>
              <input type="text" required autoComplete="username" value={login} onChange={e=>setLogin(e.target.value)} style={inputStyle} placeholder="luis.jimenez o usuario@rojimo.com"/>
            </div>
            <div>
              <label style={{ fontSize:'0.72rem', color:'rgba(253,244,244,0.45)', textTransform:'uppercase', letterSpacing:'0.08em', display:'block', marginBottom:6 }}>Contraseña</label>
              <input type="password" required autoComplete="current-password" value={pass} onChange={e=>setPass(e.target.value)} style={inputStyle} placeholder="••••••••"/>
            </div>
            {error && <div style={{ background:'rgba(252,129,129,0.12)', border:'1px solid rgba(252,129,129,0.35)', borderRadius:8, padding:'10px 14px', color:'#fc8181', fontSize:'0.82rem' }}>❌ {error}</div>}
            <button type="submit" disabled={loading} style={{ marginTop:8, padding:'13px', borderRadius:10, border:'none', background:loading?'rgba(237,110,46,0.5)':'#ED6E2E', color:'#fff', fontWeight:600, fontSize:'0.95rem', fontFamily:'inherit', cursor:loading?'not-allowed':'pointer' }}>
              {loading ? 'Ingresando...' : 'Ingresar →'}
            </button>
          </form>
          <div style={{ textAlign:'center', marginTop:28, fontSize:'0.68rem', color:'rgba(253,244,244,0.20)' }}>SOL v1.0 · 2026 · Acceso restringido</div>
        </div>
      </div>
    </>
  );
}
