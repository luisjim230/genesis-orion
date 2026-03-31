// app/api/radar/route.js
// POST: Dispara el workflow de RADAR en GitHub Actions
// GET: Retorna el estado del último run

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fuente = body.fuente || 'todas';

    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return Response.json({ error: 'GITHUB_TOKEN no configurado' }, { status: 500 });
    }

    const r = await fetch(
      'https://api.github.com/repos/luisjim230/genesis-orion/actions/workflows/radar-scraper.yml/dispatches',
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github+json',
        },
        body: JSON.stringify({
          ref: 'main',
          inputs: { fuente },
        }),
      }
    );

    if (r.status === 204) {
      return Response.json({ ok: true, mensaje: 'Workflow disparado correctamente' });
    }

    const text = await r.text();
    return Response.json({ error: 'Error disparando workflow', status: r.status, detalle: text }, { status: 500 });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

export async function GET() {
  try {
    const token = process.env.GITHUB_TOKEN;
    if (!token) {
      return Response.json({ error: 'GITHUB_TOKEN no configurado' }, { status: 500 });
    }

    const r = await fetch(
      'https://api.github.com/repos/luisjim230/genesis-orion/actions/workflows/radar-scraper.yml/runs?per_page=1',
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
        },
      }
    );

    const data = await r.json();
    const run = data.workflow_runs?.[0];

    if (!run) {
      return Response.json({ ultimo_run: null });
    }

    return Response.json({
      ultimo_run: {
        id: run.id,
        estado: run.status,
        conclusion: run.conclusion,
        inicio: run.created_at,
        fin: run.updated_at,
        trigger: run.event,
      },
    });

  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
