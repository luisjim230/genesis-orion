"""
neo_lista_items_downloader.py — Descarga "Lista de ítems" de NEO y sube a Supabase.
Permite calcular el valor del inventario a costo (usando costo_sin_imp × existencias).

Cómo correr manualmente:
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_lista_items_downloader.py

Horario automático (via sync_daemon):
  Lun-Sáb: 9:00 y 16:00
"""

import os, sys, asyncio, logging, json, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright
from dotenv import load_dotenv

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

NEO_URL      = "https://neo.neotecnologias.com/NEOBusiness/"
NEO_USUARIO  = os.getenv("NEO_USUARIO", "luisjim230")
NEO_CLAVE    = os.getenv("NEO_CLAVE",   "Miami123")
EMPRESA_ID   = "984"

SUPA_URL     = os.getenv("SUPABASE_URL",      "https://xeeieqjqmtoiutfnltqu.supabase.co")
SUPA_KEY     = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZWllcWpxbXRvaXV0Zm5sdHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjA2NTMsImV4cCI6MjA4ODI5NjY1M30.SqYdotAkZOyMARsZb1XutfgYiH9Ig2qoHOD8j6oPy00")

DOWNLOAD_DIR = BASE / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
LOG_FILE     = BASE / "neo-lista-items.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.FileHandler(str(LOG_FILE)),
        logging.StreamHandler(sys.stdout),
    ]
)
log = logging.getLogger(__name__)


# ─── SUPABASE ─────────────────────────────────────────────────────────────────

def supa_request(method, path, data=None):
    url = f"{SUPA_URL}/rest/v1/{path}"
    body = json.dumps(data).encode() if data else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("apikey", SUPA_KEY)
    req.add_header("Authorization", f"Bearer {SUPA_KEY}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=minimal")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status
    except urllib.error.HTTPError as e:
        log.error(f"Supabase {method} {path}: {e.code} {e.read().decode()[:300]}")
        return None


def subir_a_supabase(excel_path):
    try:
        import pandas as pd
    except ImportError:
        log.error("pandas no instalado: pip3 install pandas openpyxl")
        return False

    import unicodedata

    def norm(s):
        return unicodedata.normalize('NFC', str(s)).strip()

    log.info("Leyendo Excel...")
    raw = pd.read_excel(excel_path, header=None, dtype=str)

    # Buscar fila de encabezado (la que tenga "Código" o "Código interno")
    header_row = None
    for i, row in raw.iterrows():
        vals = [norm(str(v)) for v in row if pd.notna(v)]
        if any(v in ("Código", "Código interno", "Codigo", "Codigo interno") for v in vals):
            header_row = i
            break
    if header_row is None:
        log.error("❌ No se encontró fila de encabezado con 'Código'")
        return False

    df = pd.read_excel(excel_path, header=header_row, dtype=str)
    df.columns = [norm(c) for c in df.columns]
    log.info(f"  Headers: {list(df.columns)}")

    # Mapeo flexible: varios nombres posibles por columna
    col_map = {
        "Código interno":               "codigo_interno",
        "Código Interno":               "codigo_interno",
        "Codigo interno":               "codigo_interno",
        "Código":                       "codigo_interno",
        "Codigo":                       "codigo_interno",
        "Código CABYS":                 "codigo_cabys",
        "Codigo CABYS":                 "codigo_cabys",
        "Tipo":                         "tipo",
        "Categoría":                    "categoria",
        "Categoria":                    "categoria",
        "Marca":                        "marca",
        "Ítem":                         "item",
        "Item":                         "item",
        "Nombre":                       "item",
        "Proveedor":                    "proveedor",
        "Fecha registro":               "fecha_registro",
        "Fecha Registro":               "fecha_registro",
        "Última compra":                "ultima_compra",
        "Ultima compra":                "ultima_compra",
        "Última venta":                 "ultima_venta",
        "Ultima venta":                 "ultima_venta",
        "Descripción":                  "descripcion",
        "Descripcion":                  "descripcion",
        # Nombres exactos del Excel de NEO (verificados 2026-04-01)
        "Costo unitario sin impuesto":                      "costo_sin_imp",
        "Costo sin impuesto":                               "costo_sin_imp",
        "Costo sin impuestos":                              "costo_sin_imp",
        "Costo Sin Impuesto":                               "costo_sin_imp",
        "Moneda del costo unitario sin impuesto":           "moneda_costo",
        "Moneda costo":                                     "moneda_costo",
        "Moneda Costo":                                     "moneda_costo",
        "Precio unitario sin impuesto":                     "precio_sin_imp",
        "Precio sin impuesto":                              "precio_sin_imp",
        "Precio sin impuestos":                             "precio_sin_imp",
        "Precio Sin Impuesto":                              "precio_sin_imp",
        "Precio unitario con impuesto":                     "precio_con_imp",
        "Precio con impuesto":                              "precio_con_imp",
        "Precio con impuestos":                             "precio_con_imp",
        "Precio Con Impuesto":                              "precio_con_imp",
        "Moneda del precio unitario sin impuesto":          "moneda_precio",
        "Moneda precio":                                    "moneda_precio",
        "Moneda Precio":                                    "moneda_precio",
        "IVA":                                              "iva",
        "% IVA":                                            "iva",
        "% utilidad":                                       "pct_utilidad",
        "Utilidad":                                         "pct_utilidad",
        "% Utilidad":                                       "pct_utilidad",
        "Existencias":                                      "existencias",
        "Activo":                                           "activo",
        "Descuento Máximo":                                 "descuento_maximo",
        "Descuento máximo":                                 "descuento_maximo",
        "Descuento maximo":                                 "descuento_maximo",
        "Fecha de registro":                                "fecha_registro",
        "Fecha registro":                                   "fecha_registro",
        "Fecha Registro":                                   "fecha_registro",
    }

    df = df.rename(columns=col_map)
    cols_db = list(dict.fromkeys(col_map.values()))  # orden sin duplicados
    cols = [c for c in cols_db if c in df.columns]
    log.info(f"  Columnas mapeadas: {cols}")

    if "codigo_interno" not in cols:
        log.error("❌ No se mapeó 'codigo_interno' — abortando")
        return False

    df = df[cols].copy()

    # Numéricos
    for col in ["costo_sin_imp", "precio_sin_imp", "precio_con_imp", "pct_utilidad",
                "existencias", "descuento_maximo"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Eliminar filas sin código
    df = df.dropna(subset=["codigo_interno"])
    df = df[df["codigo_interno"].str.strip() != ""]

    fecha_carga     = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    periodo_reporte = datetime.now().strftime("Día %Y-%m-%d")
    df["fecha_carga"]     = fecha_carga
    df["periodo_reporte"] = periodo_reporte

    registros = json.loads(df.to_json(orient="records", force_ascii=False))
    total = len(registros)

    if total < 100:
        log.error(f"❌ Solo {total} filas — no se toca Supabase")
        return False

    log.info(f"  {total:,} ítems leídos")

    # Borrar snapshot anterior
    log.info("Borrando snapshot anterior...")
    supa_request("DELETE", "neo_lista_items?id=gt.0")

    # Insertar en lotes de 200
    BATCH = 200
    ok = 0
    for i in range(0, total, BATCH):
        lote = registros[i:i + BATCH]
        status = supa_request("POST", "neo_lista_items", lote)
        if status and status < 300:
            ok += len(lote)
        else:
            log.error(f"  Error en lote {i // BATCH + 1}")

    log.info(f"✅ Supabase: {ok:,}/{total:,} registros cargados")
    exito = ok == total

    ahora = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    supa_request("PATCH", "sync_status?id=eq.items_lista_general", {
        "ultima_sync": ahora,
        "exitoso": exito,
        "updated_at": ahora,
    })
    log.info("  sync_status actualizado")
    return exito


# ─── PLAYWRIGHT ───────────────────────────────────────────────────────────────

async def main():
    import re
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    log.info("=" * 50)
    log.info(f"NEO → Lista de ítems  [{ts}]")
    log.info("=" * 50)

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        try:
            # ── 1. LOGIN ──────────────────────────────────────────────────────
            log.info("Abriendo NEO...")
            await page.goto(NEO_URL)
            await page.wait_for_load_state("networkidle")

            try:
                usar = page.locator("text=Usar aquí")
                if await usar.count() > 0:
                    await usar.first.click()
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_timeout(1500)
            except Exception:
                pass

            try:
                u = page.get_by_role("textbox", name="Usuario o correo electrónico")
                await u.wait_for(state="visible", timeout=8000)
                await u.fill(NEO_USUARIO)
                await u.press("Tab")
                await page.get_by_role("textbox", name="Contraseña").fill(NEO_CLAVE)
                await page.get_by_role("button", name="Ingresar").click()
                await page.wait_for_load_state("networkidle")
                await page.wait_for_timeout(2000)
                log.info("Login OK")
            except Exception as e:
                log.info(f"Login skip (sesión activa): {e}")

            try:
                usar = page.locator("text=Usar aquí")
                if await usar.count() > 0:
                    await usar.first.click()
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_timeout(1500)
            except Exception:
                pass

            # ── 2. EMPRESA ────────────────────────────────────────────────────
            try:
                await page.get_by_title("Perfil").click()
                await page.wait_for_timeout(1000)
                sel = page.locator("#cboEmpresa")
                val = await sel.input_value()
                if val != EMPRESA_ID:
                    log.info(f"  Cambiando empresa → {EMPRESA_ID}")
                    await sel.select_option(EMPRESA_ID)
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_timeout(2000)
                else:
                    log.info("  Empresa OK (984 = Rojimo)")
                    await page.keyboard.press("Escape")
                    await page.wait_for_timeout(500)
            except Exception as e:
                log.warning(f"  Empresa: {e}")

            # ── 3. HOME con token ────────────────────────────────────────────
            await page.wait_for_load_state("networkidle")
            tok_match = re.search(r'\(S\([^)]+\)\)', page.url)
            if tok_match:
                tok = tok_match.group(0)
                home = f"https://neo1.neotecnologias.com/NEOBusiness/{tok}/Paginas/Modulos/NEO/Home.aspx"
                await page.goto(home)
                await page.wait_for_load_state("networkidle")
                await page.wait_for_timeout(2000)

            # ── 4. SIDEBAR ───────────────────────────────────────────────────
            try:
                sb = page.locator("#mostrar_barra_izquierda")
                if await sb.count() > 0:
                    await sb.click()
                    await page.wait_for_timeout(1000)
            except Exception:
                pass

            # ── 5. INVENTARIO → ÍTEMS ────────────────────────────────────────
            log.info("Navegando: Inventario → Ítems...")
            # Usar JS click para evitar problemas de viewport en headless
            await page.evaluate("document.querySelector('[id=\"102000\"]')?.click()")
            await page.wait_for_timeout(2500)

            iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame

            # El reporte "Lista de ítems" se llama "Ítems" en el sidebar de NEO
            try:
                items_link = iframe.locator("a").filter(has_text="Ítems").first
                if await items_link.count() == 0:
                    items_link = iframe.locator("a").filter(has_text="Items").first
                await items_link.click()
                log.info("  Navegado a Ítems ✅")
            except Exception as e:
                log.error(f"❌ No se encontró el link 'Ítems': {e}")
                # Volcar links disponibles para diagnóstico
                links = await iframe.locator("a").all()
                for l in links[:30]:
                    txt = (await l.inner_text()).strip()
                    if txt: log.info(f"  Link disponible: {repr(txt)}")
                return

            await page.wait_for_timeout(3000)
            log.info("✅ Lista de ítems cargada")

            # ── 6. FILTRO: solo activos ───────────────────────────────────────
            try:
                activo_sel = iframe.locator("#fActivo")
                if await activo_sel.count() > 0:
                    await activo_sel.select_option("1")
                    log.info("Activo = Sí")
            except Exception as e:
                log.warning(f"  Filtro activo: {e}")

            # ── 7. REFRESCAR ─────────────────────────────────────────────────
            for sel in ["input[value='Refrescar']", "#btnRefrescar", "input[value='Buscar']"]:
                try:
                    btn = iframe.locator(sel).first
                    if await btn.count() > 0 and await btn.is_visible():
                        await btn.click()
                        log.info(f"Refrescar: {sel}")
                        break
                except Exception:
                    pass

            log.info("Esperando datos...")
            for i in range(90):
                await page.wait_for_timeout(1000)
                try:
                    c = await iframe.content()
                    if "registros" in c.lower():
                        log.info(f"✅ Datos listos ({i+1}s)")
                        break
                except Exception:
                    pass
                if i == 89:
                    log.warning("Timeout 90s — descargando igual")

            await page.wait_for_timeout(2000)

            # ── 8. DESCARGAR EXCEL ────────────────────────────────────────────
            log.info("Descargando Excel...")
            dest = DOWNLOAD_DIR / f"lista_items_{datetime.now().strftime('%Y%m%d_%H%M')}.xlsx"

            async with page.expect_download(timeout=300_000) as dl_info:
                await iframe.get_by_role("cell", name="Exportar", exact=True).click()

            dl = await dl_info.value
            await dl.save_as(str(dest))
            log.info(f"✅ Descargado: {dest} ({dest.stat().st_size:,} bytes)")

            # ── 9. SUBIR A SUPABASE ───────────────────────────────────────────
            subir_a_supabase(dest)

            import subprocess
            subprocess.run(["osascript", "-e",
                f'display notification "Lista de ítems actualizada en Supabase" with title "SOL ✅" sound name "Purr"'],
                capture_output=True)

        except Exception as e:
            log.error(f"Error: {e}", exc_info=True)
        finally:
            await page.wait_for_timeout(1000)
            await browser.close()

    log.info("Listo.")


if __name__ == "__main__":
    asyncio.run(main())
