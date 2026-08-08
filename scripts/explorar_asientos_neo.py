"""
explorar_asientos_neo.py — Exploración VISIBLE de la pantalla de Asientos
contables de NEO, para descubrir los selectores reales (sin suposiciones).

NO modifica nada en NEO ni toca el downloader. Solo mira y vuelca todo a
scripts/salida_exploracion_neo.txt, y al final deja el navegador abierto con
page.pause() para que puedas navegar a mano.

Cómo correr en la M1 (navegador visible):
  cd ~/genesis-orion && .venv/bin/python scripts/explorar_asientos_neo.py

Reutiliza neo_session.py para el login (Login OK, Empresa 984 = Rojimo).
"""

import os, sys, asyncio, json
from pathlib import Path
from datetime import datetime

BASE = Path(__file__).parent
sys.path.insert(0, str(BASE))
from neo_session import relogin_si_hace_falta

try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

NEO_URL     = "https://neo.neotecnologias.com/NEOBusiness/"
NEO_USUARIO = os.getenv("NEO_USUARIO")
NEO_CLAVE   = os.getenv("NEO_CLAVE")
EMPRESA_ID  = "984"  # Corporación Rojimo S.A.

OUT = BASE / "salida_exploracion_neo.txt"

if not (NEO_USUARIO and NEO_CLAVE):
    raise SystemExit("ERROR: faltan NEO_USUARIO / NEO_CLAVE en scripts/.env")


def w(*parts):
    """Append al archivo de salida (y eco a consola)."""
    linea = " ".join(str(p) for p in parts)
    print(linea)
    with open(OUT, "a", encoding="utf-8") as f:
        f.write(linea + "\n")


def sec(titulo):
    w("\n" + "=" * 78)
    w("== " + titulo)
    w("=" * 78)


# JS que corre DENTRO de un documento (frame o page) y devuelve un resumen.
JS_DUMP = r"""
() => {
  const clean = s => (s || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  const q = sel => Array.from(document.querySelectorAll(sel));
  const botones = q('button, a, input[type=button], input[type=submit], [role=button]').map(e => ({
    tag: e.tagName, id: e.id || '', clase: (e.className && e.className.toString()) || '',
    texto: clean(e.innerText || e.value || e.title || '')
  }));
  const campos = q('input, select, textarea').map(e => ({
    tag: e.tagName, id: e.id || '', name: e.name || '', type: e.type || '', placeholder: e.placeholder || ''
  }));
  // Elegir la tabla con más filas (la de resultados)
  const tablas = q('table').map(t => ({ t, filas: t.querySelectorAll('tr').length }));
  tablas.sort((a, b) => b.filas - a.filas);
  let tabla = null;
  if (tablas.length) {
    const t = tablas[0].t;
    const headTr = t.querySelector('thead tr') || t.querySelector('tr');
    const headers = headTr ? Array.from(headTr.querySelectorAll('th,td')).map(c => clean(c.innerText)) : [];
    const bodyTrs = Array.from(t.querySelectorAll('tbody tr'));
    const trs = (bodyTrs.length ? bodyTrs : Array.from(t.querySelectorAll('tr')).slice(1)).slice(0, 3);
    const filas = trs.map(tr => Array.from(tr.querySelectorAll('td,th')).map(c => c.outerHTML));
    tabla = { total_tablas: tablas.length, headers, filas };
  }
  return { botones, campos, tabla };
}
"""


async def dump_contexto(ctx, etiqueta):
    """Vuelca botones/links, inputs/selects y tabla de un frame o page."""
    try:
        data = await ctx.evaluate(JS_DUMP)
    except Exception as e:
        w(f"[{etiqueta}] no se pudo evaluar: {e}")
        return

    sec(f"{etiqueta} · BOTONES Y LINKS")
    for b in data["botones"]:
        if b["id"] or b["texto"]:
            w(f"  <{b['tag']}> id={b['id']!r} class={b['clase']!r} texto={b['texto']!r}")

    sec(f"{etiqueta} · INPUTS Y SELECTS")
    for c in data["campos"]:
        w(f"  <{c['tag']}> id={c['id']!r} name={c['name']!r} type={c['type']!r} placeholder={c['placeholder']!r}")

    sec(f"{etiqueta} · TABLA DE RESULTADOS")
    if data["tabla"]:
        w(f"  (tablas en la pantalla: {data['tabla']['total_tablas']})")
        w("  HEADERS: " + json.dumps(data["tabla"]["headers"], ensure_ascii=False))
        for i, fila in enumerate(data["tabla"]["filas"], 1):
            w(f"  --- FILA {i} ---")
            for celda in fila:
                w("    " + celda.replace("\n", " "))
    else:
        w("  (no se encontró ninguna tabla)")


async def get_frame(page):
    """Devuelve el Frame del iframe principal de NEO (o None)."""
    try:
        el = await page.wait_for_selector('iframe[name="IFRAMEPRINCIPAL"]', timeout=15000)
        return await el.content_frame()
    except Exception:
        return None


async def main():
    from playwright.async_api import async_playwright

    # Empezar el archivo limpio
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(f"Exploración NEO · {datetime.now():%Y-%m-%d %H:%M}\n")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False, slow_mo=250)
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        # ── Login ────────────────────────────────────────────────────────────
        w("Abriendo NEO...")
        await page.goto(NEO_URL, wait_until="domcontentloaded", timeout=60000)
        await page.get_by_role("textbox", name="Usuario o correo electrónico").fill(NEO_USUARIO)
        await page.get_by_role("textbox", name="Contraseña").fill(NEO_CLAVE)
        await page.get_by_role("button", name="Ingresar").click()
        await page.wait_for_load_state("networkidle")
        w("Login OK")

        await page.get_by_title("Perfil").click()
        await page.locator("#cboEmpresa").select_option(EMPRESA_ID)
        await page.wait_for_load_state("networkidle")
        w(f"Empresa OK ({EMPRESA_ID} = Rojimo)")

        if not await relogin_si_hace_falta(page, NEO_USUARIO, NEO_CLAVE, w):
            w("⚠️ NEO sigue en Login.aspx — sesión tomada por otro cliente. URL:", page.url)

        # ── Abrir menú Contabilidad ──────────────────────────────────────────
        try:
            await page.locator("#mostrar_barra_izquierda").click()
        except Exception:
            pass
        try:
            await page.get_by_role("link", name="Contabilidad").click()
            await page.wait_for_timeout(2500)
            w("Menú Contabilidad abierto")
        except Exception as e:
            w("No se pudo abrir el menú Contabilidad:", e)

        # ── Clic en a#108007 (Asientos contables) — probar en iframe y en page
        clic_ok = False
        for donde, ctx in [("iframe", await get_frame(page)), ("page", page)]:
            if ctx is None:
                continue
            try:
                loc = ctx.locator("a#108007")
                if await loc.count() > 0:
                    w(f"Encontré a#108007 en {donde}, haciendo clic…")
                    await loc.first.click()
                    clic_ok = True
                    break
            except Exception as e:
                w(f"a#108007 en {donde} falló:", e)
        if not clic_ok:
            w("⚠️ No encontré a#108007. Buscá el link a mano en la ventana abierta.")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)

        # ── Volcar el iframe ya en Asientos contables ────────────────────────
        frame = await get_frame(page)
        if frame:
            sec("HTML COMPLETO DEL IFRAME (Asientos contables)")
            try:
                html = await frame.content()
                w(html)
            except Exception as e:
                w("No se pudo obtener el HTML del iframe:", e)
            await dump_contexto(frame, "IFRAME")
        else:
            w("⚠️ No hay iframe IFRAMEPRINCIPAL. Vuelco la page.")
            await dump_contexto(page, "PAGE")

        # ── Botón Imprimir: puede abrir menú, modal o ventana nueva ──────────
        sec("CLIC EN 'IMPRIMIR'")
        target = frame or page
        imprimir = None
        for intento in ["button", "link", "text"]:
            try:
                if intento == "text":
                    cand = target.locator("text=Imprimir")
                else:
                    cand = target.get_by_role(intento, name="Imprimir")
                if await cand.count() > 0:
                    imprimir = cand.first
                    w(f"Botón Imprimir encontrado como {intento}")
                    break
            except Exception:
                continue

        if imprimir is None:
            w("No encontré el botón 'Imprimir'. Buscalo a mano en la ventana.")
        else:
            popup = None
            try:
                async with context.expect_page(timeout=8000) as pinfo:
                    await imprimir.click()
                popup = await pinfo.value
            except Exception:
                popup = None

            if popup:
                try:
                    await popup.wait_for_load_state("domcontentloaded", timeout=15000)
                except Exception:
                    pass
                await page.wait_for_timeout(1500)
                sec("SE ABRIÓ UNA VENTANA/POPUP NUEVA")
                w("URL popup:", popup.url)
                try:
                    w(await popup.content())
                except Exception as e:
                    w("No se pudo leer el popup:", e)
                await dump_contexto(popup, "POPUP")
            else:
                # No hubo popup: pudo aparecer un menú o modal en frame/page
                await page.wait_for_timeout(1500)
                sec("NO HUBO POPUP — estado tras 'Imprimir' (frame)")
                try:
                    w(await (frame or page).content())
                except Exception as e:
                    w("No se pudo leer el contenido:", e)
                sec("NO HUBO POPUP — estado tras 'Imprimir' (page nivel superior)")
                try:
                    w(await page.content())
                except Exception as e:
                    w("No se pudo leer la page:", e)

        # ── Dejar abierto para exploración manual ────────────────────────────
        sec("FIN AUTOMÁTICO — navegador abierto (page.pause)")
        w("Todo quedó en:", str(OUT))
        w("Ahora navegá a mano. Cerrá el inspector de Playwright para terminar.")
        await page.pause()

        await browser.close()


if __name__ == "__main__":
    asyncio.run(main())
