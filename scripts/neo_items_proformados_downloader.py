"""
neo_items_proformados_downloader.py — Descarga "Lista de items proformados"
(líneas) del mes actual desde NEO y la sube a Supabase vía RPC
hermes_upsert_proformas_items.

Selectores capturados con Playwright Codegen el 2026-05-02.
Menú: Ventas → " Ítems proformados" dentro del iframe IFRAMEPRINCIPAL.
Export: cell "Exportar" (a la izquierda — NO el botón Exportar de arriba).

Cómo correr manualmente:
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_items_proformados_downloader.py
"""

import os, sys, asyncio, logging, json, urllib.request, urllib.error
from pathlib import Path
from datetime import datetime, date
from playwright.async_api import async_playwright
from dotenv import load_dotenv

BASE = Path(__file__).parent
sys.path.insert(0, str(BASE))
from neo_session import relogin_si_hace_falta
load_dotenv(BASE / ".env")

NEO_URL      = "https://neo.neotecnologias.com/NEOBusiness/"
NEO_USUARIO  = os.getenv("NEO_USUARIO", "luisjim230")
NEO_CLAVE    = os.getenv("NEO_CLAVE",   "Miami123")
EMPRESA_ID   = "984"

SUPA_URL = os.getenv("SUPABASE_URL", "https://xeeieqjqmtoiutfnltqu.supabase.co")
SUPA_KEY = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZWllcWpxbXRvaXV0Zm5sdHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjA2NTMsImV4cCI6MjA4ODI5NjY1M30.SqYdotAkZOyMARsZb1XutfgYiH9Ig2qoHOD8j6oPy00")

TG_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")
TG_CHAT  = os.getenv("TELEGRAM_CHAT_ID",   "")

DOWNLOAD_DIR = BASE / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
LOG_FILE = BASE / "neo-items-proformados.log"

UMBRAL_MIN = 5  # ítems proformados de un mes deberían ser muchos más

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.FileHandler(str(LOG_FILE)), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)


# ─── ALERTAS ──────────────────────────────────────────────────────────────────

def alerta_telegram(msg):
    if not TG_TOKEN or not TG_CHAT:
        log.warning(f"  (Telegram no configurado, alerta omitida): {msg}")
        return
    url = f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage"
    body = json.dumps({"chat_id": TG_CHAT, "text": msg, "parse_mode": "HTML"}).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("Content-Type", "application/json")
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception as e:
        log.warning(f"  Telegram falló: {e}")


# ─── SUPABASE ─────────────────────────────────────────────────────────────────

def supa_rpc(name, payload):
    url = f"{SUPA_URL}/rest/v1/rpc/{name}"
    body = json.dumps({"payload": payload}).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("apikey", SUPA_KEY)
    req.add_header("Authorization", f"Bearer {SUPA_KEY}")
    req.add_header("Content-Type", "application/json")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        log.error(f"RPC {name}: {e.code} {e.read().decode()[:300]}")
        return None
    except Exception as e:
        log.error(f"RPC {name}: {e}")
        return None


def supa_upsert_sync_status(script_id, exitoso=True):
    url = f"{SUPA_URL}/rest/v1/sync_status?on_conflict=id"
    body = json.dumps([{
        "id": script_id,
        "ultima_sync": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "exitoso": exitoso,
    }]).encode()
    req = urllib.request.Request(url, data=body, method="POST")
    req.add_header("apikey", SUPA_KEY)
    req.add_header("Authorization", f"Bearer {SUPA_KEY}")
    req.add_header("Content-Type", "application/json")
    req.add_header("Prefer", "resolution=merge-duplicates,return=minimal")
    try:
        urllib.request.urlopen(req, timeout=15)
    except Exception as e:
        log.warning(f"sync_status: {e}")


# ─── DESCARGA ─────────────────────────────────────────────────────────────────

def rango_mes_actual():
    hoy = date.today()
    f_ini = date(hoy.year, hoy.month, 1)
    return f_ini.strftime("%d%m%Y"), hoy.strftime("%d%m%Y")


async def setear_fechas(iframe, f_inicio, f_fin):
    selectores = [
        ("#fFechaInicio", "#fFechaFin"),
        ("#txtFechaInicio", "#txtFechaFin"),
        ("input[name='fFechaInicio']", "input[name='fFechaFin']"),
        ("input[name='txtFechaInicio']", "input[name='txtFechaFin']"),
    ]
    for sel_ini, sel_fin in selectores:
        try:
            el = iframe.locator(sel_ini)
            if await el.count() > 0:
                await el.click(click_count=3)
                await el.fill(f_inicio)
                await iframe.locator(sel_fin).click(click_count=3)
                await iframe.locator(sel_fin).fill(f_fin)
                log.info(f"  Fechas OK ({sel_ini}): {f_inicio} → {f_fin}")
                return True
        except Exception:
            continue
    try:
        inputs = iframe.locator("input[type='text']")
        count = await inputs.count()
        for idx in range(min(count, 12)):
            val = await inputs.nth(idx).get_attribute("value") or ""
            if "/" in val and len(val) >= 8 and idx + 1 < count:
                await inputs.nth(idx).click(click_count=3)
                await inputs.nth(idx).fill(f_inicio)
                await inputs.nth(idx + 1).click(click_count=3)
                await inputs.nth(idx + 1).fill(f_fin)
                log.info(f"  Fechas OK (fallback input[{idx}]): {f_inicio} → {f_fin}")
                return True
    except Exception:
        pass
    return False


async def descargar():
    f_inicio, f_fin = rango_mes_actual()
    log.info(f"Mes actual: {f_inicio[:2]}/{f_inicio[2:4]}/{f_inicio[4:]} → {f_fin[:2]}/{f_fin[2:4]}/{f_fin[4:]}")

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        ctx     = await browser.new_context(accept_downloads=True)
        page    = await ctx.new_page()

        log.info("Abriendo NEO...")
        await page.goto(NEO_URL)
        await page.get_by_role("textbox", name="Usuario o correo electrónico").fill(NEO_USUARIO)
        await page.get_by_role("textbox", name="Contraseña").fill(NEO_CLAVE)
        await page.get_by_role("button", name="Ingresar").click()
        await page.wait_for_load_state("networkidle")
        log.info("Login OK")

        await page.get_by_title("Perfil").click()
        await page.locator("#cboEmpresa").select_option(EMPRESA_ID)
        await page.wait_for_load_state("networkidle")
        log.info(f"  Empresa OK ({EMPRESA_ID} = Rojimo)")

        if not await relogin_si_hace_falta(page, NEO_USUARIO, NEO_CLAVE, log):
            raise RuntimeError(f"NEO en Login.aspx — sesión tomada. URL: {page.url}")

        await page.locator("#mostrar_barra_izquierda").click()
        await page.get_by_role("link", name="Ventas").click()
        await page.wait_for_timeout(2000)

        iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
        await iframe.get_by_role("link", name=" Ítems proformados").click()
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)
        log.info("✅ Ítems proformados cargado")

        if not await setear_fechas(iframe, f_inicio, f_fin):
            log.warning("  No encontré campos de fecha — usando rango por defecto de NEO")

        try:
            await iframe.get_by_role("button", name="Refrescar").click()
        except Exception:
            pass
        log.info("Esperando datos...")
        try:
            await iframe.locator("text=registros").wait_for(timeout=120_000)
        except Exception:
            await page.wait_for_timeout(10_000)

        ts = datetime.now().strftime("%Y%m%d_%H%M")
        excel_path = DOWNLOAD_DIR / f"items_proformados_{ts}.xlsx"

        log.info("Descargando Excel (botón izquierdo)...")
        async with page.expect_download(timeout=180_000) as dl_info:
            await iframe.get_by_role("cell", name="Exportar", exact=True).click()
        dl = await dl_info.value
        await dl.save_as(excel_path)
        await browser.close()

    size = excel_path.stat().st_size
    log.info(f"✅ Descargado: {excel_path} ({size:,} bytes)")
    return excel_path


# ─── PARSE + UPLOAD ───────────────────────────────────────────────────────────

def parse_y_subir(excel_path):
    try:
        import pandas as pd
    except ImportError:
        log.error("pandas/openpyxl no instalados: pip3 install pandas openpyxl")
        return False

    log.info("Leyendo Excel...")
    raw = pd.read_excel(excel_path, header=None, dtype=str)

    header_row = None
    for i, row in raw.iterrows():
        vals = [str(v).strip() if pd.notna(v) else "" for v in row.tolist()]
        if "Proforma" in vals:
            header_row = i
            break
    if header_row is None:
        log.error("❌ No encontré fila con 'Proforma' — abortando")
        alerta_telegram("⚠️ <b>Ítems proformados</b>\nExcel sin columna 'Proforma'. Sync abortado.")
        return False

    df = pd.read_excel(excel_path, header=header_row, dtype=str)
    df.columns = [str(c).strip() for c in df.columns]
    log.info(f"  Headers fila {header_row}: {list(df.columns)[:14]}")

    def col(name):
        return name if name in df.columns else None

    cprof = col("Proforma")
    if not cprof:
        log.error("❌ Sin columna 'Proforma' — abortando")
        return False

    df = df.dropna(subset=[cprof])
    df = df[df[cprof].astype(str).str.strip() != ""]
    df = df[~df[cprof].astype(str).str.lower().str.startswith("total")]

    def to_num(v, default=0):
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return default
        s = str(v).strip().replace(",", "")
        try:
            return float(s)
        except Exception:
            return default

    def to_int(v, default=None):
        x = to_num(v, None)
        return int(x) if x is not None else default

    def to_str(v):
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return None
        s = str(v).strip()
        return s if s else None

    def to_date(v):
        if v is None or (isinstance(v, float) and pd.isna(v)):
            return None
        s = str(v).strip()
        if not s:
            return None
        for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
            try:
                return datetime.strptime(s.split(" ")[0], fmt).strftime("%Y-%m-%d")
            except Exception:
                pass
        try:
            return pd.to_datetime(s, errors="coerce").strftime("%Y-%m-%d")
        except Exception:
            return None

    # Item puede venir como "Ítem" o "Item"
    citem = None
    for c in df.columns:
        if c.strip() in ("Ítem", "Item"):
            citem = c
            break

    payload = []
    fechas_vistas = []
    for _, row in df.iterrows():
        proforma = to_int(row.get(cprof))
        if not proforma:
            continue
        f = to_date(row.get(col("Fecha")))
        if f:
            fechas_vistas.append(f)
        codigo_interno = to_str(row.get(col("Código interno")))
        codigo_cliente = to_str(row.get(col("Código")))
        payload.append({
            "proforma":                proforma,
            "fecha":                   f,
            "vendedor":                to_str(row.get(col("Vendedor"))),
            "codigo_cliente":          codigo_cliente,
            "cliente":                 to_str(row.get(col("Cliente"))),
            "codigo_interno":          codigo_interno,
            "item":                    to_str(row.get(citem)) if citem else None,
            "cantidad_proformada":     to_num(row.get(col("Cantidad proformada"))),
            "precio_unitario_sin_imp": to_num(row.get(col("Precio unitario sin impuesto"))),
            "descuento":               to_num(row.get(col("Descuento"))),
            "impuestos":               to_num(row.get(col("Impuestos"))),
            "total_linea":             to_num(row.get(col("Total"))),
            "observaciones":           to_str(row.get(col("Observaciones"))),
        })

    total = len(payload)
    hoy = date.today()
    mes_actual = f"{hoy.year}-{str(hoy.month).zfill(2)}"
    del_mes = sum(1 for f in fechas_vistas if f and f.startswith(mes_actual))

    if total == 0:
        log.error("❌ Payload vacío")
        alerta_telegram(f"⚠️ <b>Ítems proformados</b>\nSin datos para {mes_actual}. Revisar NEO.")
        return False

    if del_mes == 0:
        log.warning(f"⚠️ Hay {total} líneas pero ninguna del mes {mes_actual}")
        alerta_telegram(f"⚠️ <b>Ítems proformados</b>\n{total} líneas pero ninguna del mes {mes_actual}.")

    if total < UMBRAL_MIN:
        log.warning(f"⚠️ Solo {total} líneas — sospechoso")
        alerta_telegram(f"⚠️ <b>Ítems proformados</b>\nSolo {total} líneas (umbral {UMBRAL_MIN}).")

    log.info(f"Llamando RPC hermes_upsert_proformas_items con {total} líneas ({del_mes} del mes actual)...")
    res = supa_rpc("hermes_upsert_proformas_items", payload)
    if not res:
        return False

    log.info(f"✅ {res.get('filas_recibidas')} líneas en {res.get('proformas_afectadas')} proformas")
    return True


# ─── MAIN ─────────────────────────────────────────────────────────────────────

def main():
    log.info("=" * 60)
    log.info("ÍTEMS PROFORMADOS DOWNLOADER")
    log.info("=" * 60)
    try:
        excel = asyncio.run(descargar())
        ok = parse_y_subir(excel)
        supa_upsert_sync_status("proformas_items", exitoso=ok)
        sys.exit(0 if ok else 1)
    except Exception as e:
        log.exception(f"Falló: {e}")
        alerta_telegram(f"❌ <b>Ítems proformados</b>\nSync falló: {str(e)[:200]}")
        supa_upsert_sync_status("proformas_items", exitoso=False)
        sys.exit(1)


if __name__ == "__main__":
    main()
