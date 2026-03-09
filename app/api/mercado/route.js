// app/api/mercado/route.js
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const fuente = searchParams.get('fuente');
  try {
    switch (fuente) {
      case 'bccr_ref': {
        const hoy = new Date();
        const dd = String(hoy.getDate()).padStart(2,'0');
        const mm = String(hoy.getMonth()+1).padStart(2,'0');
        const yyyy = hoy.getFullYear();
        const fecha = dd+'/'+mm+'/'+yyyy;
        const resultados = {};

        // Método 1: API BCCR con token oficial
        for (const [ind, nombre] of [['317','compra'],['318','venta']]) {
          try {
            const url = 'https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicos?Indicador='+ind+'&FechaInicio='+fecha+'&FechaFinal='+fecha+'&Nombre=Genesis&SubNiveles=N&CorreoElectronico=genesis@rojimo.com&Token=OJXUWSTM2J';
            const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
            const text = await r.text();
            const match = text.match(/<NUM_VALOR>([\d.]+)<\/NUM_VALOR>/);
            if (match) resultados[nombre] = parseFloat(match[1]);
          } catch(e) {}
        }

        // Método 2: si falló, usar Yahoo Finance USDCRC
        if (!resultados.compra || !resultados.venta) {
          try {
            const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/USDCRC%3DX?interval=1d&range=2d', {
              headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
              signal: AbortSignal.timeout(8000)
            });
            const json = await r.json();
            const closes = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(x => x != null);
            if (closes.length > 0) {
              const tc = closes[closes.length-1];
              // BCCR venta suele ser ~1% más que el tipo medio
              resultados.compra = resultados.compra || Math.round(tc * 0.994 * 100) / 100;
              resultados.venta  = resultados.venta  || Math.round(tc * 1.006 * 100) / 100;
            }
          } catch(e) {}
        }

        // Método 3: scraping página BCCR
        if (!resultados.compra || !resultados.venta) {
          try {
            const r = await fetch('https://www.bccr.fi.cr/seccion-indicadores-economicos/tipo-de-cambio', {
              headers: { 'User-Agent': 'Mozilla/5.0' },
              signal: AbortSignal.timeout(10000)
            });
            const html = await r.text();
            const compraM = html.match(/317[^<]*<[^>]+>([\d,\.]+)/);
            const ventaM  = html.match(/318[^<]*<[^>]+>([\d,\.]+)/);
            if (compraM) resultados.compra = resultados.compra || parseFloat(compraM[1].replace(',','.'));
            if (ventaM)  resultados.venta  = resultados.venta  || parseFloat(ventaM[1].replace(',','.'));
          } catch(e) {}
        }

        return Response.json({ ok: true, data: resultados });
      }

      case 'bccr_bancos': {
        // Tipos de cambio de bancos vía BCCR ventanilla (indicadores 318-327 aprox)
        // BAC=500, BCR=802, Davivienda=877 según catálogo BCCR
        const entidades = [
          { codigo: '672', nombre: 'BAC San José',  key: 'bac' },
          { codigo: '802', nombre: 'BCR',            key: 'bcr' },
          { codigo: '877', nombre: 'Davivienda',     key: 'davivienda' },
        ];
        const hoy = new Date();
        const dd = String(hoy.getDate()).padStart(2,'0');
        const mm = String(hoy.getMonth()+1).padStart(2,'0');
        const yyyy = hoy.getFullYear();
        const fecha = dd+'/'+mm+'/'+yyyy;
        const resultados = {};
        // Indicadores ventanilla por banco: compra ~3-5 puntos debajo de venta BCCR
        // Usamos la API de ventanilla con indicadores específicos
        for (const ent of entidades) {
          try {
            const url = `https://gee.bccr.fi.cr/Indicadores/Suscripciones/WS/wsindicadoreseconomicos.asmx/ObtenerIndicadoresEconomicos?Indicador=3140&FechaInicio=${fecha}&FechaFinal=${fecha}&Nombre=Genesis&SubNiveles=N&CorreoElectronico=genesis@rojimo.com&Token=OJXUWSTM2J&Entidad=${ent.codigo}`;
            const r = await fetch(url, { signal: AbortSignal.timeout(8000) });
            const text = await r.text();
            const vals = [...text.matchAll(/<NUM_VALOR>([\d.]+)<\/NUM_VALOR>/g)].map(m => parseFloat(m[1]));
            if (vals.length >= 2) resultados[ent.key] = { compra: vals[0], venta: vals[1] };
          } catch(e) {}
        }
        return Response.json({ ok: true, data: resultados });
      }

      case 'yahoo': {
        const ticker = searchParams.get('ticker');
        if (!ticker) return Response.json({ ok: false, error: 'ticker requerido' });
        try {
          const r = await fetch('https://query1.finance.yahoo.com/v8/finance/chart/'+ticker+'?interval=1d&range=5d', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' },
            signal: AbortSignal.timeout(10000)
          });
          const json = await r.json();
          const closes = (json?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || []).filter(x => x != null);
          if (closes.length >= 2) {
            const precio = closes[closes.length-1], anterior = closes[closes.length-2];
            return Response.json({ ok:true, data:{ precio, anterior, cambio_pct:((precio-anterior)/anterior)*100 } });
          } else if (closes.length===1) {
            return Response.json({ ok:true, data:{ precio:closes[0], anterior:closes[0], cambio_pct:0 } });
          }
        } catch(e) {}
        return Response.json({ ok:false, error:'Sin datos' });
      }

      case 'tradingeconomics': {
        const slug = searchParams.get('slug');
        if (!slug) return Response.json({ ok:false, error:'slug requerido' });
        try {
          const r = await fetch('https://tradingeconomics.com/commodity/'+slug, {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36', 'Accept': 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
            signal: AbortSignal.timeout(12000)
          });
          const html = await r.text();
          let precio = null, cambio_pct = 0;
          let m = html.match(/"price"\s*:\s*"?([\d,\.]+)"?/);
          if (m) precio = parseFloat(m[1].replace(',',''));
          if (!precio) { m = html.match(/<span[^>]*id="p"[^>]*>([\d,\.]+)<\/span>/); if(m) precio=parseFloat(m[1].replace(',','')); }
          if (!precio) { m = html.match(/(?:rose|fell|traded|increased|decreased)\s+(?:to|at)\s+([\d,\.]+)/i); if(m) precio=parseFloat(m[1].replace(',','')); }
          const mp = html.match(/([-+]?\d+\.?\d*)\s*%\s*(?:from the previous|over the past month)/i);
          if (mp) cambio_pct = parseFloat(mp[1]);
          if (precio) return Response.json({ ok:true, data:{ precio, cambio_pct } });
        } catch(e) {}
        return Response.json({ ok:false, error:'No se pudo extraer precio' });
      }

      case 'fletes': {
        try {
          const r = await fetch('https://www.freightos.com/enterprise/terminal/freightos-baltic-index-global-container-pricing-index/', {
            headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            signal: AbortSignal.timeout(12000)
          });
          const html = await r.text();
          const matches = [...html.matchAll(/\$\s*([\d,]+)\/FEU/g)];
          const valores = matches.map(m=>parseInt(m[1].replace(',',''))).filter(n=>n>500&&n<15000);
          if (valores.length>0) return Response.json({ ok:true, data:{ asia_uswc:valores[0], asia_usec:valores[1]||null } });
        } catch(e) {}
        return Response.json({ ok:false, error:'Sin datos de flete' });
      }

      default: return Response.json({ ok:false, error:'Fuente desconocida' }, { status:400 });
    }
  } catch(e) { return Response.json({ ok:false, error:e.message }, { status:500 }); }
}
