"""
neo_asientos_estado_downloader.py — Descarga la lista de ASIENTOS CONTABLES de
NEO (Número, Estado, Fecha, Tipo, Observaciones, Debe, Haber) y la sube a la
tabla `neo_asientos_estado` en Supabase.

SOLO LECTURA: no escribe nada en NEO. Sirve para saber el estado real de cada
asiento (Aplicado / Registrado / Anulado), que el reporte de movimientos
contables NO trae. Con eso, el módulo Contabilidad de Génesis Orión puede
conciliar y dejar de contar como reales los asientos Anulados o Registrados.

Está calcado de neo_movimientos_contables_downloader.py y usa el mismo
neo_session.py para el manejo de sesión.

Cómo correr manualmente (M1):
  cd ~/Documents/GitHub/genesis-orion/scripts
  python3 neo_asientos_estado_downloader.py                 # últimos 90 días
  python3 neo_asientos_estado_downloader.py --desde 01/01/2026 --hasta 31/03/2026

Horario automático: LaunchAgent com.sol.neo-asientos-estado (lun–sáb 7:30/12:30/17:30).

Diferencias con los otros downloaders (a propósito):
  - Usuario secundario de NEO (NEO_USUARIO_2 / NEO_CLAVE_2) para no chocar con
    las descargas de inventario/ventas que corren en paralelo. Si no están en
    el .env, cae a NEO_USUARIO / NEO_CLAVE y lo avisa en el log.
  - Perfil de Chrome propio (user_data_dir separado) para no pelear cookies.
  - Acepta --desde / --hasta; por defecto baja los últimos 90 días, porque un
    asiento puede cambiar de estado semanas después de creado.
  - Carga con UPSERT por `asiento` (refresca estado y totales). NUNCA borra.
"""

import os, sys, asyncio, logging, json, argparse, urllib.request, urllib.error
import unicodedata, re
from pathlib import Path
from datetime import datetime, date, timedelta

BASE = Path(__file__).parent
sys.path.insert(0, str(BASE))
from neo_session import relogin_si_hace_falta

try:
    from dotenv import load_dotenv
    load_dotenv(BASE / ".env")
except ImportError:
    pass

NEO_URL     = "https://neo.neotecnologias.com/NEOBusiness/"
EMPRESA_ID  = "984"  # Corporación Rojimo S.A.

# Usuario secundario con fallback al principal (se avisa en el log más abajo)
NEO_USUARIO = os.getenv("NEO_USUARIO_2") or os.getenv("NEO_USUARIO")
NEO_CLAVE   = os.getenv("NEO_CLAVE_2")   or os.getenv("NEO_CLAVE")
_USANDO_FALLBACK = not (os.getenv("NEO_USUARIO_2") and os.getenv("NEO_CLAVE_2"))

SUPA_URL    = os.getenv("SUPABASE_URL")
SUPA_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

_faltan_env = [n for n, v in (("NEO_USUARIO", NEO_USUARIO), ("NEO_CLAVE", NEO_CLAVE), ("SUPABASE_URL", SUPA_URL), ("SUPABASE_SERVICE_ROLE_KEY/ANON_KEY", SUPA_KEY)) if not v]
if _faltan_env:
    raise SystemExit("ERROR: faltan variables en scripts/.env: " + ", ".join(_faltan_env) + ". Completá scripts/.env y reintentá.")

TABLA = "neo_asientos_estado"

DOWNLOAD_DIR = BASE / "downloads"
DOWNLOAD_DIR.mkdir(exist_ok=True)
# Perfil de Chrome propio para no compartir cookies con los otros downloaders
PROFILE_DIR  = BASE / ".pw-profile-asientos"
LOG_FILE     = BASE / "neo-asientos-estado.log"
# Nombre del enlace en el menú de Contabilidad (ajustable con Codegen si NEO lo cambia)
LINK_ASIENTOS = os.getenv("NEO_LINK_ASIENTOS", " Asientos contables")

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
    handlers=[logging.FileHandler(str(LOG_FILE)), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)


# ─── FECHAS ───────────────────────────────────────────────────────────────────

def parse_arg_fecha(s):
    """Acepta DD/MM/YYYY o YYYY-MM-DD y devuelve un date."""
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y"):
        try:
            return datetime.strptime(s, fmt).date()
        except ValueError:
            continue
    raise SystemExit(f"ERROR: fecha inválida '{s}'. Usá DD/MM/YYYY.")


def rango_fechas(args):
    """Devuelve (inicio, fin) como date. Por defecto, los últimos 90 días."""
    hoy = date.today()
    fin = parse_arg_fecha(args.hasta) if args.hasta else hoy
    inicio = parse_arg_fecha(args.desde) if args.desde else (hoy - timedelta(days=90))
    if inicio > fin:
        raise SystemExit("ERROR: --desde es posterior a --hasta.")
    return inicio, fin


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


# ─── NORMALIZACIÓN ────────────────────────────────────────────────────────────

def norm(s):
    return unicodedata.normalize("NFC", str(s)).strip()


# Varios encabezados posibles por columna (NEO cambia mayúsculas/acentos)
COL_CANDIDATOS = {
    "asiento":       ["Número", "Numero", "Asiento", "No. Asiento", "Número de asiento", "Asiento contable", "# Asiento"],
    "estado":        ["Estado"],
    "fecha":         ["Fecha"],
    "tipo":          ["Tipo"],
    "observaciones": ["Observaciones", "Observaciones del asiento", "Observación"],
    "debe_total":    ["Debe", "Total Debe", "Debe (Moneda de contabilidad)", "Debe total"],
    "haber_total":   ["Haber", "Total Haber", "Haber (Moneda de contabilidad)", "Haber total"],
}


def construir_col_map(columnas):
    """Mapea encabezados reales del Excel a los campos de la tabla."""
    cmap = {}
    norm_cols = {norm(c): c for c in columnas}
    for campo, candidatos in COL_CANDIDATOS.items():
        for cand in candidatos:
            key = norm(cand)
            if key in norm_cols:
                cmap[norm_cols[key]] = campo
                break
    return cmap


def to_number(v):
    """Convierte '1.234,56' o '1,234.56' o '₡ 1234.56' a float. '' -> 0."""
    if v is None:
        return 0.0
    s = re.sub(r"[^\d,.\-]", "", str(v))
    if not s:
        return 0.0
    # Si tiene ambos separadores, el último es el decimal
    if "," in s and "." in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        # coma como decimal (formato CR)
        s = s.replace(".", "").replace(",", ".") if s.count(",") == 1 else s.replace(",", "")
    try:
        return round(float(s), 2)
    except ValueError:
        return 0.0


def to_iso_date(v):
    """DD/MM/YYYY -> YYYY-MM-DD. Devuelve None si no parsea."""
    s = norm(v)
    for fmt in ("%d/%m/%Y", "%Y-%m-%d", "%d-%m-%Y", "%d/%m/%y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            continue
    return None


# ─── DESCARGA ─────────────────────────────────────────────────────────────────

async def descargar(inicio, fin):
    from playwright.async_api import async_playwright

    f_inicio = inicio.strftime("%d%m%Y")
    f_fin    = fin.strftime("%d%m%Y")
    log.info(f"  Rango: {inicio.isoformat()} → {fin.isoformat()}")

    async with async_playwright() as p:
        # Perfil propio (user_data_dir separado) para no compartir cookies
        ctx = await p.chromium.launch_persistent_context(
            str(PROFILE_DIR), headless=True, accept_downloads=True,
        )
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()

        # ── Login ──────────────────────────────────────────────────────────────
        log.info("Abriendo NEO...")
        await page.goto(NEO_URL, wait_until="domcontentloaded", timeout=60000)
        await page.get_by_role("textbox", name="Usuario o correo electrónico").fill(NEO_USUARIO)
        await page.get_by_role("textbox", name="Contraseña").fill(NEO_CLAVE)
        await page.get_by_role("button", name="Ingresar").click()
        await page.wait_for_load_state("networkidle")
        log.info("Login OK")

        # ── Empresa: Corporación Rojimo (984) ──────────────────────────────────
        await page.get_by_title("Perfil").click()
        await page.locator("#cboEmpresa").select_option(EMPRESA_ID)
        await page.wait_for_load_state("networkidle")
        log.info(f"  Empresa OK ({EMPRESA_ID} = Rojimo)")

        if not await relogin_si_hace_falta(page, NEO_USUARIO, NEO_CLAVE, log):
            raise RuntimeError(f"NEO sigue en Login.aspx — sesión tomada por otro cliente. URL: {page.url}")

        # ── Navegar: Contabilidad → Asientos contables ─────────────────────────
        await page.locator("#mostrar_barra_izquierda").click()
        await page.get_by_role("link", name="Contabilidad").click()
        await page.wait_for_timeout(2000)

        iframe = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
        await iframe.get_by_role("link", name=LINK_ASIENTOS).click()
        await page.wait_for_load_state("networkidle")
        log.info("✅ Asientos contables cargado")

        # ── Fechas ─────────────────────────────────────────────────────────────
        await iframe.locator("#fFechaInicio").click(click_count=3)
        await iframe.locator("#fFechaInicio").fill(f_inicio)
        log.info(f"  Fecha inicio OK: {f_inicio}")
        try:
            await iframe.locator("#fFechaFin").wait_for(timeout=10000)
            await iframe.locator("#fFechaFin").click(click_count=3)
            await iframe.locator("#fFechaFin").fill(f_fin)
            log.info(f"  Fecha fin OK: {f_fin}")
        except Exception:
            log.warning(f"  No se encontró #fFechaFin — continuando con inicio={f_inicio}")

        # ── Refrescar y esperar datos ──────────────────────────────────────────
        await iframe.get_by_role("button", name="Refrescar").click()
        log.info("Esperando datos (NEO es lento)...")
        try:
            await iframe.locator("text=registros").wait_for(timeout=120_000)
            log.info("  Datos cargados")
        except Exception:
            log.warning("Timeout 120s — exportando igual")

        # ── Exportar Excel ─────────────────────────────────────────────────────
        log.info("Descargando Excel...")
        ts = datetime.now().strftime("%Y%m%d_%H%M")
        excel_path = DOWNLOAD_DIR / f"asientos_estado_{ts}.xlsx"

        async with page.expect_download(timeout=120_000) as dl_info:
            await iframe.get_by_role("button", name="Exportar").click()

        dl = await dl_info.value
        await dl.save_as(excel_path)
        await ctx.close()

    size = excel_path.stat().st_size
    log.info(f"✅ Descargado: {excel_path} ({size:,} bytes)")
    return excel_path


# ─── SUBIR A SUPABASE ─────────────────────────────────────────────────────────

def subir_a_supabase(excel_path):
    try:
        import pandas as pd
    except ImportError:
        log.error("pandas no instalado: pip3 install pandas openpyxl")
        return False

    log.info("Leyendo Excel...")
    raw = pd.read_excel(excel_path, header=None, dtype=str)

    # Buscar la fila de encabezados: la primera que tenga a la vez Estado y Fecha
    header_row = None
    for i, row in raw.iterrows():
        vals = {norm(x) for x in row.tolist() if pd.notna(x)}
        if "Estado" in vals and "Fecha" in vals:
            header_row = i
            break
    if header_row is None:
        log.error("❌ No se encontró la fila de encabezados (Estado/Fecha) — abortando")
        return False

    df = pd.read_excel(excel_path, header=header_row, dtype=str)
    df.columns = [norm(c) for c in df.columns]
    cmap = construir_col_map(df.columns)
    log.info(f"  Headers fila {header_row}: {list(df.columns)}")
    log.info(f"  Columnas mapeadas: {cmap}")

    if "asiento" not in cmap.values() or "estado" not in cmap.values():
        log.error("❌ Faltan columnas clave (asiento/estado) — abortando")
        return False

    df = df.rename(columns=cmap)
    cols = [c for c in set(cmap.values())]
    df = df[cols].copy()

    # Limpiar: sin asiento, y filas de TOTAL
    df = df.dropna(subset=["asiento"])
    df = df[df["asiento"].astype(str).str.strip() != ""]
    df = df[~df["asiento"].astype(str).str.upper().str.startswith("TOTAL")]

    hoy = date.today()
    fecha_carga = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    periodo = f"{hoy.year}-{str(hoy.month).zfill(2)}"

    registros = []
    for _, r in df.iterrows():
        asiento = norm(r.get("asiento"))
        if not asiento:
            continue
        registros.append({
            "asiento": asiento,
            "fecha": to_iso_date(r.get("fecha")) if "fecha" in df.columns else None,
            "tipo": norm(r.get("tipo")) if "tipo" in df.columns else None,
            "estado": norm(r.get("estado")) if "estado" in df.columns else None,
            "observaciones": norm(r.get("observaciones")) if "observaciones" in df.columns else None,
            "debe_total": to_number(r.get("debe_total")) if "debe_total" in df.columns else 0,
            "haber_total": to_number(r.get("haber_total")) if "haber_total" in df.columns else 0,
            "periodo_reporte": periodo,
            "fecha_carga": fecha_carga,
        })

    # Deduplicar por asiento (el PK) quedándonos con el último
    dedup = {reg["asiento"]: reg for reg in registros}
    registros = list(dedup.values())

    total = len(registros)
    if total < 1:
        log.error("❌ 0 asientos — posible error. Abortando (no se toca la tabla).")
        return False

    estados = {}
    for reg in registros:
        estados[reg["estado"]] = estados.get(reg["estado"], 0) + 1
    log.info(f"  {total:,} asientos. Por estado: {estados}")

    log.info(f"Upsert por asiento de {total:,} registros...")
    BATCH = 200
    ok = 0
    for i in range(0, total, BATCH):
        lote = registros[i:i + BATCH]
        status = supa_request("POST", f"{TABLA}?on_conflict=asiento", lote)
        if status and status < 300:
            ok += len(lote)
        else:
            log.warning(f"  Lote {i}–{i+len(lote)} falló (status={status})")

    log.info(f"✅ Supabase: {ok:,}/{total:,} asientos cargados")
    return ok == total


# ─── MAIN ─────────────────────────────────────────────────────────────────────

async def main():
    ap = argparse.ArgumentParser(description="Descarga estados de asientos de NEO (solo lectura).")
    ap.add_argument("--desde", help="Fecha inicio DD/MM/YYYY (default: hoy - 90 días)")
    ap.add_argument("--hasta", help="Fecha fin DD/MM/YYYY (default: hoy)")
    args = ap.parse_args()

    log.info("=" * 50)
    log.info(f"NEO → Asientos (estado)  [{datetime.now():%Y-%m-%d %H:%M}]")
    if _USANDO_FALLBACK:
        log.warning("NEO_USUARIO_2/NEO_CLAVE_2 no definidos: usando el usuario principal (puede chocar con otros downloaders).")
    log.info("=" * 50)

    inicio, fin = rango_fechas(args)
    try:
        excel_path = await descargar(inicio, fin)
        exito = subir_a_supabase(excel_path)
        log.info("Listo." if exito else "Terminó con advertencias.")
        sys.exit(0 if exito else 1)
    except Exception as e:
        log.error(f"Error: {e}", exc_info=True)
        sys.exit(1)


if __name__ == "__main__":
    asyncio.run(main())
