"""
neo_minimos_downloader.py — Descarga "Mínimos y Máximos" de NEO y sube a Supabase.
Selectores obtenidos con Playwright Codegen el 2026-03-29.

Cómo correr manualmente:
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_minimos_downloader.py

Horario automático (LaunchAgent):
  Lun-Vie: 7:30, 13:00, 16:30
  Sábados: 10:00
"""

import os, sys, asyncio, logging, json, re, urllib.request, urllib.error, fcntl
from pathlib import Path
from datetime import date, datetime
from dateutil.relativedelta import relativedelta
from playwright.async_api import async_playwright
from dotenv import load_dotenv

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

NEO_URL      = "https://neo.neotecnologias.com/NEOBusiness/"
NEO_USUARIO  = os.getenv("NEO_USUARIO", "luisjim230")
NEO_CLAVE    = os.getenv("NEO_CLAVE",   "Miami123")
EMPRESA_ID   = "984"   # Corporacion Rojimo S.A.

SUPA_URL     = os.getenv("SUPABASE_URL",      "https://xeeieqjqmtoiutfnltqu.supabase.co")
SUPA_KEY     = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZWllcWpxbXRvaXV0Zm5sdHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjA2NTMsImV4cCI6MjA4ODI5NjY1M30.SqYdotAkZOyMARsZb1XutfgYiH9Ig2qoHOD8j6oPy00")

DOWNLOAD_DIR = BASE / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
LOG_FILE     = BASE / "neo-minimos.log"

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


def fecha_inicio():
    """Hoy menos 3 meses en formato DDMMYYYY."""
    hace3 = date.today() - relativedelta(months=3)
    return hace3.strftime("%d%m%Y")


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
    """
    Lee el Excel, borra los datos anteriores e inserta el snapshot nuevo.
    Usa exactamente las mismas columnas que /api/subir-inventario de SOL.
    """
    try:
        import pandas as pd
    except ImportError:
        log.error("pandas no instalado: pip3 install pandas openpyxl")
        return False

    log.info("Leyendo Excel...")
    import unicodedata

    def norm(s):
        return unicodedata.normalize('NFC', str(s)).strip()

    # Leer sin headers para encontrar la fila de "Código" (puede no ser la primera)
    raw = pd.read_excel(excel_path, header=None, dtype=str)
    header_row = None
    for i, row in raw.iterrows():
        if any(norm(str(v)) == "Código" for v in row if pd.notna(v)):
            header_row = i
            break
    if header_row is None:
        log.error("❌ No se encontró fila con 'Código' en el Excel")
        return False

    # Reconstruir DataFrame con la fila correcta como encabezado
    df = pd.read_excel(excel_path, header=header_row, dtype=str)
    df.columns = [norm(c) for c in df.columns]
    log.info(f"  Headers en fila {header_row}: {list(df.columns)}")

    col_map = {
        norm("Código"):                              "codigo",
        norm("Tipo"):                                "tipo",
        norm("Nombre"):                              "nombre",
        norm("Categoría"):                           "categoria",
        norm("Marca"):                               "marca",
        norm("Ubicación"):                           "ubicacion",
        norm("Mínimo"):                              "minimo",
        norm("Existencias"):                         "existencias",
        norm("Máximo"):                              "maximo",
        norm("Última compra"):                       "ultima_compra",
        norm("Último proveedor"):                    "ultimo_proveedor",
        norm("Último costo unitario con descuento"): "ultimo_costo",
        norm("Moneda"):                              "moneda",
        norm("Promedio mensual vendido"):            "promedio_mensual",
        norm("Activo"):                              "activo",
        norm("Estatus"):                             "estatus",
    }
    df = df.rename(columns=col_map)
    cols = [c for c in col_map.values() if c in df.columns]
    log.info(f"  Columnas mapeadas: {cols}")

    if "codigo" not in cols:
        log.error("❌ No se encontró la columna 'Código' — abortando para no dañar la BD")
        return False

    df = df[cols].copy()

    # Numéricos
    for col in ["minimo", "existencias", "maximo", "ultimo_costo", "promedio_mensual"]:
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")

    # Fecha → string ISO
    if "ultima_compra" in df.columns:
        df["ultima_compra"] = pd.to_datetime(df["ultima_compra"], errors="coerce").dt.strftime("%Y-%m-%d")

    # Columnas requeridas por SOL
    fecha_carga = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    df["fecha_carga"]     = fecha_carga
    df["periodo_reporte"] = "Sin período"

    # Serializar con pandas (maneja numpy types y NaN → null correctamente)
    registros = json.loads(df.to_json(orient="records", force_ascii=False))
    total = len(registros)

    # ── Seguridad: si el archivo parece incompleto, no tocar la BD ──
    if total < 100:
        log.error(f"❌ Solo {total} filas en el Excel — no se toca Supabase (mínimo esperado: 100)")
        return False

    # ── Borrar snapshot anterior (igual que hace /api/subir-inventario) ──
    log.info("Borrando snapshot anterior...")
    supa_request("DELETE", "neo_minimos_maximos?id=gt.0")

    # ── Insertar nuevo snapshot en lotes de 200 ──
    log.info(f"Insertando {total:,} registros...")
    BATCH = 200
    ok = 0
    for i in range(0, total, BATCH):
        lote = registros[i:i + BATCH]
        status = supa_request("POST", "neo_minimos_maximos", lote)
        if status and status < 300:
            ok += len(lote)
        else:
            log.error(f"  Error en lote {i // BATCH + 1}")

    log.info(f"✅ Supabase: {ok:,}/{total:,} registros cargados")
    exito = ok == total

    # Actualizar sync_status para que el badge en SOL muestre la hora correcta
    ahora = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    supa_request("PATCH", "sync_status?id=eq.minimos_maximos", {
        "ultima_sync": ahora,
        "exitoso": exito,
        "updated_at": ahora,
    })
    log.info("  sync_status actualizado")

    return exito


# ─── PLAYWRIGHT ───────────────────────────────────────────────────────────────

async def main():
    ts = datetime.now().strftime("%Y-%m-%d %H:%M")
    log.info("=" * 50)
    log.info(f"NEO → Mínimos y Máximos  [{ts}]")
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

            # Sesión activa en otro dispositivo
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

            # Post-login "Usar aquí"
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

            # ── 5. INVENTARIO → MÍNIMOS Y MÁXIMOS ────────────────────────────
            log.info("Navegando: Inventario → Mínimos y máximos...")
            await page.get_by_role("link", name="Inventario").click()
            await page.wait_for_timeout(1500)

            iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
            await iframe.get_by_role("link", name=" Mínimos y máximos").click()
            await page.wait_for_timeout(3000)
            log.info("✅ Mínimos y máximos cargado")

            # ── 6. FILTROS ────────────────────────────────────────────────────
            f_inicio = fecha_inicio()
            fecha_field = iframe.locator("#fFechaInicio")
            await fecha_field.wait_for(state="visible", timeout=10000)
            await fecha_field.click(click_count=3)
            await fecha_field.fill(f_inicio)
            await page.keyboard.press("Tab")
            await page.wait_for_timeout(400)
            log.info(f"Fecha: {f_inicio}")

            await iframe.locator("#fActivo").select_option("1")
            log.info("Activo = Sí")

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
            dest = DOWNLOAD_DIR / f"minimos_maximos_{date.today().strftime('%Y%m%d_%H%M')}.xlsx"

            async with page.expect_download(timeout=60000) as dl_info:
                await iframe.get_by_role("cell", name="Exportar", exact=True).click()

            dl = await dl_info.value
            await dl.save_as(str(dest))
            log.info(f"✅ Descargado: {dest} ({dest.stat().st_size:,} bytes)")

            # ── 9. SUBIR A SUPABASE ───────────────────────────────────────────
            subir_a_supabase(dest)

            # Notificación Mac
            import subprocess
            subprocess.run(["osascript", "-e",
                f'display notification "Mínimos y Máximos actualizado en Supabase" with title "SOL ✅" sound name "Purr"'],
                capture_output=True)

        except Exception as e:
            log.error(f"Error: {e}", exc_info=True)
        finally:
            await page.wait_for_timeout(1000)
            await browser.close()

    log.info("Listo.")


if __name__ == "__main__":
    lock_path = BASE / "neo_minimos_downloader.lock"
    lock_file = open(lock_path, "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.warning("Otra instancia ya está corriendo — abortando para evitar duplicados en BD")
        sys.exit(0)
    try:
        asyncio.run(main())
    finally:
        fcntl.flock(lock_file, fcntl.LOCK_UN)
        lock_file.close()
