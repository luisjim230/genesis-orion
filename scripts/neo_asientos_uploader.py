"""
neo_asientos_uploader.py — Robot que sube a NEO los asientos APROBADOS desde el
panel de Contabilidad (Génesis Orión). Es la otra punta del circuito: el panel
deja el asiento en estado 'aprobado' y este robot lo registra en NEO.

Flujo (descubierto con Playwright codegen sobre la pantalla real):
  login → (alerta "Continuar" si aparece) → EMPRESA Corporación Rojimo (984)
  → Contabilidad → Asientos contables → Nuevo → fecha (calendario con
  desplegables de mes/año) → Observaciones → por cada línea: cuenta + debe/haber
  + Agregar → centro de costo por línea → Registrar.

SEGURIDAD:
  - Solo procesa estado='aprobado' y es_prueba=false. Los de PRUEBA NUNCA suben.
  - Verifica SIEMPRE que la empresa sea Rojimo (984) antes de registrar.
  - --dry-run hace TODO menos el clic final "Registrar" (para probar sin crear
    nada real en NEO). ¡Usalo en la primera corrida!

Cómo correr en la M1:
  cd ~/genesis-orion
  # Probar UN asiento, viendo el navegador, SIN registrarlo de verdad:
  .venv/bin/python scripts/neo_asientos_uploader.py --solo <ID> --dry-run
  # Cuando todo llene bien, sacale --dry-run para que lo registre:
  .venv/bin/python scripts/neo_asientos_uploader.py --solo <ID>
  # Procesar toda la cola de aprobados (hasta 20):
  .venv/bin/python scripts/neo_asientos_uploader.py --limit 20
"""

import os, sys, re, fcntl, asyncio, logging, json, argparse, urllib.request, urllib.error
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
EMPRESA_ID  = "984"  # Corporación Rojimo S.A.
NEO_USUARIO = os.getenv("NEO_USUARIO_2") or os.getenv("NEO_USUARIO")
NEO_CLAVE   = os.getenv("NEO_CLAVE_2")   or os.getenv("NEO_CLAVE")
_FALLBACK   = not (os.getenv("NEO_USUARIO_2") and os.getenv("NEO_CLAVE_2"))

SUPA_URL    = os.getenv("SUPABASE_URL")
SUPA_KEY    = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY")

_faltan = [n for n, v in (("NEO_USUARIO", NEO_USUARIO), ("NEO_CLAVE", NEO_CLAVE), ("SUPABASE_URL", SUPA_URL), ("SUPABASE_SERVICE_ROLE_KEY/ANON_KEY", SUPA_KEY)) if not v]
if _faltan:
    raise SystemExit("ERROR: faltan variables en scripts/.env: " + ", ".join(_faltan))

PROFILE_DIR = BASE / ".pw-profile-uploader"
LOG_FILE    = BASE / "neo-asientos-uploader.log"
SHOTS_DIR   = BASE / "capturas-uploader"
LOCK_FILE   = BASE / ".uploader.lock"


async def captura(page, nombre):
    """Guarda un screenshot del formulario para revisar sin ver la pantalla."""
    try:
        SHOTS_DIR.mkdir(exist_ok=True)
        ruta = SHOTS_DIR / f"{nombre}.png"
        await page.screenshot(path=str(ruta), full_page=True)
        log.info(f"  📸 Captura guardada: {ruta}")
        return ruta
    except Exception as e:
        log.warning(f"  No pude sacar la captura: {e}")
        return None


async def cerrar_alerta(page, iframe):
    """Cierra la alerta de la llave criptográfica (u otra) que a veces sale.
    El botón puede decir 'Aceptar' o 'Continuar', y aparecer en el iframe o en
    la página. No pasa nada si no hay ninguna: se ignora."""
    scopes = []
    try:
        fr = iframe()
        if fr:
            scopes.append(fr)
    except Exception:
        pass
    scopes.append(page)
    for scope in scopes:
        for name in ("Aceptar", "Continuar", " Continuar", "OK"):
            for rol in ("button", "link"):
                try:
                    loc = scope.get_by_role(rol, name=name)
                    if await loc.count() > 0 and await loc.first.is_visible():
                        await loc.first.click()
                        await page.wait_for_timeout(1200)
                        log.info(f"  Alerta cerrada con '{name.strip()}'")
                        return True
                except Exception:
                    continue
    return False

MESES = ["", "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio",
         "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]

async def _tipear_y_elegir(page, IF, texto_busqueda, codigo, nombre):
    """Escribe `texto_busqueda` en el campo de cuentas y trata de elegir la
    cuenta `codigo`/`nombre` del desplegable. Devuelve True si la eligió."""
    campo = IF().get_by_role("textbox", name="Lista de las cuentas")
    await campo.click(click_count=3)
    # OJO: fill() NO dispara el desplegable de NEO; hay que teclear de verdad.
    await campo.press_sequentially(texto_busqueda, delay=55)
    await page.wait_for_timeout(900)

    # Regex: la fila EMPIEZA con el código exacto (código+nombre juntos), sin
    # confundir substrings (20-10-10-10-01 no empieza con 10-10-10-01).
    rx_ini = re.compile(r"^\s*" + re.escape(codigo) + r"(\s|$)")
    opciones = [
        ("código exacto", IF().get_by_text(codigo, exact=True)),
        ("código al inicio", IF().get_by_text(rx_ini)),
    ]
    if nombre:
        opciones.append(("celda nombre", IF().get_by_role("cell", name=nombre, exact=True)))
        opciones.append(("celda nombre~", IF().get_by_role("cell", name=nombre)))  # no exacto
        opciones.append(("texto nombre", IF().get_by_text(nombre, exact=True)))
    for etiqueta, op in opciones:
        try:
            await op.first.wait_for(state="visible", timeout=3500)
            await op.first.click()
            await page.wait_for_timeout(400)
            log.info(f"    cuenta {codigo} elegida ({etiqueta}, buscando '{texto_busqueda}')")
            return True
        except Exception:
            continue
    return False


async def elegir_cuenta(page, IF, codigo, nombre):
    """Elige la cuenta del desplegable de NEO. Busca primero por CÓDIGO; si no
    aparece (pasa con las cuentas de comisiones 90-xx), reintenta buscando por
    NOMBRE (NEO también busca por nombre, como en grabacion_comisiones.py)."""
    nombre = (nombre or "").strip()
    if await _tipear_y_elegir(page, IF, codigo, codigo, nombre):
        return True
    if nombre and await _tipear_y_elegir(page, IF, nombre, codigo, nombre):
        return True
    # Último recurso: dejar tipeado el código y Enter.
    campo = IF().get_by_role("textbox", name="Lista de las cuentas")
    await campo.click(click_count=3)
    await campo.press_sequentially(codigo, delay=55)
    await page.wait_for_timeout(600)
    await campo.press("Enter")
    await page.wait_for_timeout(400)
    log.warning(f"    cuenta {codigo}: no la encontré por código ni por nombre; usé Enter")
    return False

logging.basicConfig(
    level=logging.INFO, format="%(asctime)s %(levelname)-7s %(message)s", datefmt="%H:%M:%S",
    handlers=[logging.FileHandler(str(LOG_FILE)), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger(__name__)


# ─── SUPABASE REST ────────────────────────────────────────────────────────────
def supa(method, path, data=None, prefer=None):
    url = f"{SUPA_URL}/rest/v1/{path}"
    body = json.dumps(data).encode() if data is not None else None
    req = urllib.request.Request(url, data=body, method=method)
    req.add_header("apikey", SUPA_KEY)
    req.add_header("Authorization", f"Bearer {SUPA_KEY}")
    req.add_header("Content-Type", "application/json")
    if prefer:
        req.add_header("Prefer", prefer)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            txt = r.read().decode()
            return json.loads(txt) if txt else None
    except urllib.error.HTTPError as e:
        log.error(f"Supabase {method} {path}: {e.code} {e.read().decode()[:300]}")
        return None


def cargar_aprobados(solo_id=None, limit=20):
    sel = ("id,fecha,descripcion,moneda,estado,es_prueba,intentos,"
           "lineas:conta_asiento_lineas(orden,cuenta,debe,haber,observacion,"
           "cta:conta_cuentas(nombre),centro:conta_centros_costo(nombre_neo))")
    q = f"conta_asientos?select={sel}&estado=eq.aprobado&es_prueba=eq.false&order=aprobado_en.asc&limit={limit}"
    if solo_id:
        q = f"conta_asientos?select={sel}&id=eq.{solo_id}"
    data = supa("GET", q) or []
    if solo_id and data:
        a = data[0]
        if a["estado"] != "aprobado":
            log.warning(f"El asiento #{solo_id} está en estado '{a['estado']}', no 'aprobado'.")
        if a.get("es_prueba"):
            log.warning(f"El asiento #{solo_id} es de PRUEBA — no debería subirse a NEO real.")
    return data


def marcar(asiento_id, campos):
    supa("PATCH", f"conta_asientos?id=eq.{asiento_id}", campos, prefer="return=minimal")


def fmt_monto(x):
    # NEO recibe "1614.9" / "16025" (punto decimal, sin separador de miles)
    x = float(x or 0)
    s = ("%f" % x).rstrip("0").rstrip(".")
    return s if s else "0"


# ─── PLAYWRIGHT: registrar un asiento en NEO ──────────────────────────────────
async def registrar_en_neo(page, iframe_getter, asiento, dry_run):
    """Reproduce el asiento en la pantalla REGISTRAR ASIENTO CONTABLE.
    Devuelve el número de asiento de NEO (o None) si se registró."""
    IF = iframe_getter

    # Nuevo asiento. "Nuevo" puede ser button o link; NEO a veces tarda o lo tapa
    # la barra de progreso. Se cierra cualquier alerta, se prueba button y luego
    # link (el que aparezca visible) y si el clic no entra, se fuerza.
    await cerrar_alerta(page, IF)
    nuevo = IF().get_by_role("button", name="Nuevo").first
    try:
        await nuevo.wait_for(state="visible", timeout=20000)
    except Exception:
        nuevo = IF().get_by_role("link", name="Nuevo").first
        try:
            await nuevo.wait_for(state="visible", timeout=20000)
        except Exception:
            pass
    try:
        await nuevo.click(timeout=10000)
    except Exception:
        await nuevo.click(force=True, timeout=6000)

    # Por si sale la alerta de la llave criptográfica al abrir el asiento
    await page.wait_for_timeout(1200)
    await cerrar_alerta(page, IF)

    # Esperar a que el formulario REALMENTE cargue: el campo Observaciones es la
    # señal de que la pantalla "Registrar asiento contable" ya está lista.
    obs = IF().get_by_role("textbox", name="Observaciones del asiento")
    await obs.wait_for(state="visible", timeout=45000)

    # ── Fecha (calendario con desplegables de mes/año) ──────────────────────
    # Reproduce EXACTO la grabación (grabacion_fecha.py):
    #   Submit(icono) → #monthSelect img → texto del mes → img.nth(3) → texto del año → celda del día
    y, m, d = str(asiento["fecha"]).split("-")
    dia, mes_nom, anio = str(int(d)), MESES[int(m)], y

    async def elegir_texto(texto):
        # Click de una opción del calendario probando exact y no-exact, con
        # timeouts cortos para NO quedarse pegado 45s si un selector no calza.
        for exact in (True, False):
            try:
                loc = IF().get_by_text(texto, exact=exact).first
                await loc.wait_for(state="visible", timeout=6000)
                await loc.click()
                return
            except Exception:
                continue
        raise RuntimeError(f"No encontré la opción '{texto}' en el calendario")

    cal = IF().get_by_role("button", name="Submit").first  # icono que abre el calendario
    await cal.wait_for(state="visible", timeout=15000)
    await cal.click()
    await page.wait_for_timeout(1000)
    # Mes
    await IF().locator("#monthSelect").get_by_role("img").click()
    await page.wait_for_timeout(500)
    await elegir_texto(mes_nom)
    await page.wait_for_timeout(500)
    # Año: el desplegable del año es el 4º img del datepicker (como en la grabación)
    await IF().get_by_role("img").nth(3).click()
    await page.wait_for_timeout(500)
    await elegir_texto(anio)
    await page.wait_for_timeout(500)
    # Día
    diaC = IF().get_by_role("cell", name=dia, exact=True).first
    await diaC.wait_for(state="visible", timeout=8000)
    await diaC.click()
    log.info(f"  Fecha seteada: {dia}/{m}/{anio}")

    # ── Observaciones (descripción) ─────────────────────────────────────────
    obs = IF().get_by_role("textbox", name="Observaciones del asiento")
    await obs.click(); await obs.fill(asiento.get("descripcion") or "")

    # ── Líneas ──────────────────────────────────────────────────────────────
    # Cada línea: elegir cuenta → monto → Agregar, y VERIFICAR que entró a la
    # grilla (que el código aparezca). Si no entró, se reintenta hasta 3 veces;
    # si aun así no entra, se aborta el asiento (mejor error claro que registrar
    # un asiento incompleto/desbalanceado).
    lineas = sorted(asiento.get("lineas") or [], key=lambda l: l.get("orden") or 0)
    for i, l in enumerate(lineas, 1):
        codigo = l["cuenta"]
        debe = float(l.get("debe") or 0); haber = float(l.get("haber") or 0)
        campo_nom = "Debe del movimiento del" if debe > 0 else "Haber del movimiento del"
        monto = fmt_monto(debe if debe > 0 else haber)

        agregada = False
        for intento in range(1, 4):
            # 1) Cuenta (elegir del desplegable; ojo códigos substring de otros).
            await elegir_cuenta(page, IF, codigo, (l.get("cta") or {}).get("nombre"))
            # 2) Monto (campo enmascarado: teclear; forzar clic si está tapado).
            campo = IF().get_by_role("textbox", name=campo_nom)
            try:
                await campo.click(click_count=3, timeout=8000)
            except Exception:
                try:
                    await campo.scroll_into_view_if_needed(timeout=4000)
                except Exception:
                    pass
                await campo.click(click_count=3, force=True, timeout=6000)
            await campo.press_sequentially(monto, delay=45)
            await page.wait_for_timeout(300)
            # 3) Agregar a la grilla.
            await IF().get_by_role("button", name="Agregar").click()
            await page.wait_for_timeout(1000)
            # 4) Verificar que la línea REALMENTE entró (el código en la grilla).
            try:
                if await IF().get_by_text(codigo, exact=False).count() > 0:
                    agregada = True
                    break
            except Exception:
                pass
            log.warning(f"  Línea {codigo}: no entró a la grilla (intento {intento}/3), reintento…")
        if not agregada:
            raise RuntimeError(f"No pude agregar la línea de la cuenta {codigo} tras 3 intentos "
                               f"(el asiento quedaría desbalanceado). Se aborta.")
        log.info(f"  Línea {i}/{len(lineas)}: {codigo} {'D' if debe>0 else 'H'} {monto}")

    # ── Centros de costo (por línea que tenga) ──────────────────────────────
    # Cada línea sin centro muestra el link "Sin centro de costo". Se asignan en
    # el orden en que aparecen. Recorremos las líneas que traen centro.
    for l in lineas:
        centro = (l.get("centro") or {}).get("nombre_neo")
        if not centro:
            continue
        try:
            enlace = IF().get_by_role("cell", name="Sin centro de costo", exact=True).locator("a").first
            await enlace.click()
            campo = IF().get_by_role("textbox", name="Centro de costo del")
            await campo.click(click_count=3)
            await campo.press_sequentially(centro, delay=40)
            await page.wait_for_timeout(1000)  # autocompletar del centro
            await campo.press("ArrowDown")
            await page.wait_for_timeout(400)
            await campo.press("Enter")
            await page.wait_for_timeout(500)
            log.info(f"  Centro de costo: {centro}")
        except Exception as e:
            log.warning(f"  No pude asignar el centro '{centro}': {e}")

    # ── Registrar ────────────────────────────────────────────────────────────
    aid = asiento["id"]
    if dry_run:
        log.info("  🧪 DRY-RUN: NO hago clic en 'Registrar'. El asiento quedó armado en pantalla para revisar.")
        await captura(page, f"asiento-{aid}-dryrun")
        return None

    # Foto del formulario armado ANTES de registrar (para diagnóstico: fecha,
    # líneas, montos… todo lo que NEO va a validar).
    await captura(page, f"asiento-{aid}-antes-registrar")

    reg = IF().get_by_role("button", name="Registrar")
    try:
        await reg.scroll_into_view_if_needed(timeout=8000)
    except Exception:
        pass
    try:
        await reg.click(timeout=15000)
    except Exception:
        # el botón puede quedar tapado por la barra de progreso u otro overlay
        await reg.click(force=True, timeout=8000)
    await page.wait_for_timeout(3000)

    # ── CONFIRMAR que NEO realmente aceptó el asiento ─────────────────────────
    # 1) Rechazo explícito por campo obligatorio (validación de NEO).
    for scope in (IF(), page):
        try:
            m = scope.get_by_text(re.compile(r"campos?\s+requeridos|marcados con un|complet\w* los campos", re.I))
            if await m.count() > 0 and await m.first.is_visible():
                await captura(page, f"asiento-{aid}-VALIDACION")
                raise RuntimeError("NEO rechazó el asiento: falta un campo obligatorio (marcado con * rojo). "
                                   "Ver captura -VALIDACION para saber cuál.")
        except RuntimeError:
            raise
        except Exception:
            continue

    # 2) Número asignado por NEO (confirmación positiva).
    numero = None
    for intento in (
        lambda: IF().get_by_role("textbox", name="Número").first,
        lambda: IF().locator('input[id*="umero"], input[name*="umero"], input[id*="siento"]').first,
    ):
        try:
            val = ((await intento().input_value()) or "").strip()
            if val and val not in ("0", "0.00", "0.0"):
                numero = val; break
        except Exception:
            continue

    # 3) Prueba clave: NEO, al registrar OK, DESHABILITA el botón 'Registrar'
    #    (onclick: this.disabled=true). Si sigue habilitado, NO se registró.
    #    Sin número + botón activo => no cantar 'En NEO' en falso: marcar error.
    if not numero:
        try:
            reg2 = IF().get_by_role("button", name="Registrar").first
            if await reg2.count() > 0 and await reg2.is_visible() and await reg2.is_enabled():
                await captura(page, f"asiento-{aid}-SIN-CONFIRMAR")
                raise RuntimeError("No pude confirmar el registro en NEO (sin número y el formulario sigue abierto). "
                                   "Se deja en error para revisar/reintentar en vez de marcarlo 'En NEO' en falso.")
        except RuntimeError:
            raise
        except Exception:
            pass

    await captura(page, f"asiento-{aid}-registrado")
    log.info(f"  ✅ Registrado en NEO (asiento_neo={numero})")
    return numero


# ─── LOGIN + EMPRESA + NAVEGACIÓN ─────────────────────────────────────────────
async def preparar_neo(page):
    log.info("Abriendo NEO...")
    await page.goto(NEO_URL, wait_until="domcontentloaded", timeout=60000)
    await page.get_by_role("textbox", name="Usuario o correo electrónico").fill(NEO_USUARIO)
    await page.get_by_role("textbox", name="Contraseña").fill(NEO_CLAVE)
    await page.get_by_role("button", name="Ingresar").click()
    await page.wait_for_load_state("networkidle")
    log.info("Login OK")

    iframe = lambda: page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame

    # Alerta post-login de la llave criptográfica (a veces): 'Aceptar' o 'Continuar'
    await page.wait_for_timeout(1500)
    await cerrar_alerta(page, iframe)

    # EMPRESA: verificar/cambiar a Corporación Rojimo (984) — CRÍTICO
    await page.get_by_title("Perfil").click()
    await page.locator("#cboEmpresa").select_option(EMPRESA_ID)
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(1500)
    log.info(f"  Empresa OK ({EMPRESA_ID} = Rojimo)")

    # Cambiar de empresa suele reiniciar la sesión (por eso el 'login doble').
    if not await relogin_si_hace_falta(page, NEO_USUARIO, NEO_CLAVE, log):
        raise RuntimeError(f"NEO sigue en Login.aspx. URL: {page.url}")
    await cerrar_alerta(page, iframe)

    # Contabilidad → Asientos contables
    await page.locator("#mostrar_barra_izquierda").click()
    await page.get_by_role("link", name="Contabilidad").click()
    await page.wait_for_timeout(2500)
    # id 108007 (por nombre matchea 2 links). Empieza con dígito → selector de atributo.
    enlace = iframe().locator('a[id="108007"]')
    await enlace.wait_for(state="visible", timeout=30000)
    await enlace.click()
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(1500)
    log.info("✅ Asientos contables cargado")
    return iframe


# ─── MAIN ─────────────────────────────────────────────────────────────────────
async def main():
    ap = argparse.ArgumentParser(description="Sube asientos aprobados del panel a NEO.")
    ap.add_argument("--solo", help="Procesar solo este ID de asiento")
    ap.add_argument("--limit", type=int, default=1, help="Asientos por corrida (default 1: login fresco por asiento = más confiable; si quedan más, se auto-encola otra)")
    ap.add_argument("--dry-run", action="store_true", help="Hace todo menos el clic final 'Registrar'")
    ap.add_argument("--headless", action="store_true", help="Sin ventana (por defecto se ve el navegador)")
    args = ap.parse_args()

    # Candado: una sola corrida a la vez. Si el daemon dispara dos veces seguidas
    # (varias aprobaciones juntas), la segunda sale sin hacer nada y evita
    # registrar el mismo asiento dos veces en NEO.
    lock_fp = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fp, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except BlockingIOError:
        log.info("Ya hay otra corrida del uploader en curso. Salgo sin hacer nada.")
        return

    log.info("=" * 60)
    log.info(f"NEO ← Subir asientos aprobados  [{datetime.now():%Y-%m-%d %H:%M}]"
             + ("  (DRY-RUN)" if args.dry_run else ""))
    if _FALLBACK:
        log.warning("NEO_USUARIO_2/NEO_CLAVE_2 no definidos: usando el usuario principal.")
    log.info("=" * 60)

    asientos = cargar_aprobados(args.solo, args.limit)
    if not asientos:
        log.info("No hay asientos aprobados para subir. Nada que hacer.")
        return
    log.info(f"{len(asientos)} asiento(s) a procesar.")

    from playwright.async_api import async_playwright
    async with async_playwright() as p:
        ctx = await p.chromium.launch_persistent_context(str(PROFILE_DIR), headless=args.headless)
        page = ctx.pages[0] if ctx.pages else await ctx.new_page()
        # NEO es lento pero no tanto: 25s da margen y a la vez hace que un
        # campo que no aparece falle rápido (con captura) en vez de colgar 45s.
        page.set_default_timeout(25000)
        # Auto-aceptar diálogos nativos del navegador (alert/confirm), por si la
        # alerta de la llave criptográfica es un popup del navegador.
        page.on("dialog", lambda d: asyncio.ensure_future(d.accept()))
        try:
            iframe = await preparar_neo(page)
        except Exception as e:
            log.error(f"No pude preparar NEO: {e}", exc_info=True)
            await captura(page, "ERROR-preparar-neo")
            if args.dry_run:
                await page.wait_for_timeout(600000)
            return

        for a in asientos:
            aid = a["id"]
            # Saltar prueba por seguridad (doble candado)
            if a.get("es_prueba"):
                log.warning(f"#{aid} es de prueba — se salta."); continue
            if not args.dry_run and a["estado"] != "aprobado":
                log.warning(f"#{aid} no está aprobado ({a['estado']}) — se salta."); continue

            log.info(f"── Asiento #{aid}: {a.get('descripcion')}")
            if not args.dry_run:
                marcar(aid, {"estado": "enviando", "procesando": True})
            try:
                numero = await registrar_en_neo(page, iframe, a, args.dry_run)
                if not args.dry_run:
                    marcar(aid, {"estado": "sincronizado", "asiento_neo": numero,
                                 "enviado_en": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
                                 "procesando": False, "detalle_error": None})
                    log.info(f"✅ #{aid} sincronizado (NEO {numero}).")
            except Exception as e:
                log.error(f"❌ #{aid} falló: {e}", exc_info=True)
                await captura(page, f"asiento-{aid}-ERROR")
                log.error(f"   URL al fallar: {page.url}")
                if not args.dry_run:
                    marcar(aid, {"estado": "error", "detalle_error": str(e)[:500],
                                 "intentos": (a.get("intentos") or 0) + 1, "procesando": False})
                # Si hay más asientos, volver a la lista; si no, no recargar.
                if a is not asientos[-1]:
                    try:
                        iframe = await preparar_neo(page)
                    except Exception:
                        break

        if args.dry_run:
            log.info("DRY-RUN terminado. Revisá la ventana; cerrala cuando quieras.")
            await page.wait_for_timeout(600000)  # 10 min para inspeccionar a mano
        await ctx.close()

    # Auto-drenaje: si quedan aprobados sin procesar (lote más grande que el
    # límite, o alguno quedó para reintento), encolar otra corrida para que el
    # daemon la levante y siga. Así lotes grandes se van solos, de a poco, sin
    # pasarse del timeout del daemon.
    if not args.dry_run and not args.solo:
        try:
            restantes = supa("GET", "conta_asientos?select=id&estado=eq.aprobado&es_prueba=eq.false&limit=1") or []
            pend = supa("GET", "sync_requests?select=id&script=eq.asientos_upload&status=eq.pending&limit=1") or []
            if restantes and not pend:
                supa("POST", "sync_requests", {"script": "asientos_upload", "status": "pending"}, prefer="return=minimal")
                log.info("Quedan asientos aprobados: encolé otra corrida para seguir.")
        except Exception as e:
            log.warning(f"No pude auto-encolar la siguiente corrida: {e}")


if __name__ == "__main__":
    asyncio.run(main())
