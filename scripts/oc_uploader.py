"""
oc_uploader.py — Sube órdenes de compra desde Supabase Storage a NEO
Corre cada 5 minutos desde LaunchAgent. Revisa tabla cola_neo_uploads,
descarga el Excel, lo sube a NEO con el proveedor correcto, marca como procesado.

Ubicación: ~/Documents/neo-sync/oc_uploader.py
"""
import os, sys, asyncio, re, logging, json, urllib.request, urllib.error, tempfile, unicodedata
from pathlib import Path
from datetime import datetime, timedelta
from playwright.async_api import async_playwright
from dotenv import load_dotenv


# Palabras "genéricas" que NO distinguen proveedores entre sí (sufijos
# corporativos y términos de uso amplio). Se ignoran al elegir keyword
# de búsqueda y al validar match. Las prefijadas tipo IMPORTACIONES /
# DISTRIBUIDORA / COMERCIALIZADORA NO entran acá porque sí distinguen
# (existen IMPORTACIONES VEGA y COMERCIALIZADORA VEGA al mismo tiempo).
GENERIC_WORDS = {
    "SA", "SAS", "LTDA", "LTD", "INC", "CORP", "CORPORATION",
    "LLC", "CO", "CIA", "COMPANY", "COMPANIA",
    "INTERNATIONAL", "INTERNACIONAL", "INTL",
    "GROUP", "GRUPO",
    "ENTERPRISES", "ENTERPRISE",
    "GLOBAL", "WORLDWIDE", "HOLDINGS",
}


def _normalize(s):
    """Quita acentos y pasa a uppercase: ACUÑA → ACUNA, GERMÁN → GERMAN."""
    return ''.join(
        c for c in unicodedata.normalize('NFD', s.upper())
        if unicodedata.category(c) != 'Mn'
    )

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

NEO_URL      = "https://neo.neotecnologias.com/NEOBusiness/"
NEO_USUARIO  = os.getenv("NEO_USUARIO", "luisjim230")
NEO_CLAVE    = os.getenv("NEO_CLAVE", "Miami123")
EMPRESA_OK   = "Corporacion Rojimo S.A."
SUPA_URL     = os.getenv("SUPABASE_URL", "https://xeeieqjqmtoiutfnltqu.supabase.co")
SUPA_KEY     = os.getenv("SUPABASE_SERVICE_ROLE_KEY") or os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZWllcWpxbXRvaXV0Zm5sdHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjA2NTMsImV4cCI6MjA4ODI5NjY1M30.SqYdotAkZOyMARsZb1XutfgYiH9Ig2qoHOD8j6oPy00")
LOG_FILE     = BASE / "oc-uploader.log"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)-7s %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.FileHandler(str(LOG_FILE)),
        logging.StreamHandler(sys.stdout)
    ]
)
log = logging.getLogger(__name__)


# ─────────────────────────────────────────────
# SUPABASE HELPERS
# ─────────────────────────────────────────────

def supa_get(path):
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}",
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}", "Accept": "application/json"}
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            return json.loads(r.read())
    except urllib.error.HTTPError as e:
        log.error(f"Supabase GET error {e.code}: {e.read().decode()[:200]}")
        return []

def supa_patch(path, data):
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{SUPA_URL}/rest/v1/{path}",
        data=payload, method="PATCH",
        headers={
            "apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}",
            "Content-Type": "application/json", "Prefer": "return=minimal"
        }
    )
    try:
        urllib.request.urlopen(req, timeout=15)
        return True
    except urllib.error.HTTPError as e:
        log.error(f"Supabase PATCH error {e.code}: {e.read().decode()[:200]}")
        return False

def liberar_zombis():
    """
    Resetea procesando=false en registros que quedaron colgados con
    procesando=true por más de 15 min. Sin esto, si el script crashea a
    mitad de un upload el registro queda enterrado para siempre porque
    obtener_pendientes() filtra por procesando=eq.false.
    """
    corte = (datetime.utcnow() - timedelta(minutes=15)).strftime("%Y-%m-%dT%H:%M:%SZ")
    zombis = supa_get(
        f"cola_neo_uploads?select=id,numero_sol&estado=in.(pendiente,error)&procesando=eq.true&created_at=lt.{corte}"
    )
    if isinstance(zombis, list) and zombis:
        for z in zombis:
            log.info(f"Liberando zombi: {z.get('numero_sol') or z['id']}")
            supa_patch(f"cola_neo_uploads?id=eq.{z['id']}", {"procesando": False})

def obtener_pendientes():
    """Trae OCs pendientes de la cola."""
    liberar_zombis()
    registros = supa_get("cola_neo_uploads?estado=in.(pendiente,error)&procesando=eq.false&intentos=lt.3&order=created_at.asc")
    return registros if isinstance(registros, list) else []

def marcar_procesado(id_registro, exitoso, detalle=""):
    estado = "procesado" if exitoso else "error"
    supa_patch(
        f"cola_neo_uploads?id=eq.{id_registro}",
        {
            "estado": estado,
            "procesado_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "detalle": detalle[:500]
        }
    )

def descargar_excel_storage(storage_path, dest_path):
    """Descarga el Excel desde Supabase Storage al disco local."""
    # storage_path viene como: "oc-excels/OC_PROVEEDOR_2026-03-19.xlsx"
    # URL correcta: /storage/v1/object/oc-excels/OC_PROVEEDOR_2026-03-19.xlsx
    url = f"{SUPA_URL}/storage/v1/object/public/{storage_path}"
    req = urllib.request.Request(
        url,
        headers={"apikey": SUPA_KEY, "Authorization": f"Bearer {SUPA_KEY}"}
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        with open(dest_path, "wb") as f:
            f.write(r.read())
    log.info(f"  📥 Descargado: {dest_path} ({os.path.getsize(dest_path):,} bytes)")


# ─────────────────────────────────────────────
# NEO HELPERS (reusan patrones de main.py)
# ─────────────────────────────────────────────

def get_token(url):
    m = re.search(r'\(S\([^)]+\)\)', url)
    return m.group(0) if m else ""

def get_neo_base(url):
    # NEO balancea entre neo1..neo7. El token de sesión solo vale en el
    # host donde NEO nos dejó después del login; si cambiamos a neo1
    # hardcodeado, NEO rompe con NullReferenceException en FilterCombo.
    m = re.match(r'(https?://neo\d*\.neotecnologias\.com)', url)
    return m.group(1) if m else "https://neo1.neotecnologias.com"

async def set_input(page, fid, val):
    el = page.locator(f"#{fid}")
    await el.wait_for(state="visible", timeout=10000)
    await el.click()
    await el.evaluate("el => el.select()")
    await el.fill(val)

async def login(page):
    log.info("Login en NEO...")
    await page.goto(NEO_URL)
    await page.wait_for_load_state("networkidle")

    # Manejar "en uso en otro dispositivo"
    try:
        usar = page.locator("text=Usar aquí")
        if await usar.count() > 0:
            log.info("Sesión activa detectada → haciendo clic en 'Usar aquí'")
            await usar.first.click()
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(1500)
    except Exception:
        pass

    # Si ya hay sesión activa (token en URL), no volver a loguear
    if "Login" not in page.url:
        log.info("Sesión ya activa, saltando login")
        return

    await set_input(page, "txtUsuario", NEO_USUARIO)
    await set_input(page, "txtContrasenna", NEO_CLAVE)
    await page.click("#btnIngresar")
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(1000)

    # Manejar "en uso en otro dispositivo" post-login
    try:
        usar = page.locator("iframe#IFRAMEPRINCIPAL").content_frame.locator("text=Usar aquí")
        if await usar.count() > 0:
            await usar.first.click()
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(1500)
    except Exception:
        pass

    log.info("Login OK")

async def verificar_empresa(page):
    """Igual que main.py — verifica que sea Rojimo, cambia si es necesario."""
    try:
        await page.locator("a:has-text('Perfil'), .iconoPerfil, #lnkPerfil").first.click()
        await page.wait_for_timeout(1000)
        sel = page.locator("select").filter(has=page.locator("option:has-text('Rojimo')"))
        val = await sel.first.input_value()
        if "rojimo" not in val.lower():
            log.info("Cambiando empresa a Corporacion Rojimo S.A.")
            await sel.first.select_option(label=EMPRESA_OK)
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2000)
        else:
            log.info(f"Empresa OK: {val}")
            await page.keyboard.press("Escape")
        await page.wait_for_timeout(500)
    except Exception as e:
        log.warning(f"verificar_empresa: {e} — continuando igual")

async def navegar_nueva_oc(page):
    """Navega a Proveeduría → Órdenes de compra → Nueva."""
    tok = get_token(page.url)
    base = get_neo_base(page.url)
    url_oc = f"{base}/NEOBusiness/{tok}/Paginas/Modulos/Proveeduria/OrdenCompraPA.aspx?IdOpcion=105027&IdEntidad=0"
    log.info(f"Navegando a OC: {url_oc}")
    await page.goto(url_oc)
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(1500)

    # Hacer clic en +Nuevo
    nuevo = page.locator("input[value='Nuevo'], a:has-text('Nuevo'), button:has-text('Nuevo'), input[value='+Nuevo']")
    await nuevo.first.wait_for(state="visible", timeout=10000)
    await nuevo.first.click()
    await page.wait_for_load_state("networkidle")
    await page.wait_for_timeout(1500)
    log.info("Pantalla 'Registrar Orden de Compra' abierta")

async def buscar_y_seleccionar_proveedor(page, nombre_proveedor):
    """
    Busca el proveedor en NEO usando un keyword distintivo (ignorando
    sufijos genéricos tipo SA, LTD, INTERNATIONAL, GROUP) y elige del
    dropdown el row que mejor coincide con el nombre SOL.

    Reglas de aceptación (de más confiable a menos):
      1. Match exacto del nombre normalizado.
      2. Subset perfecto: todas las palabras distintivas de SOL están en el row.
      3. Único candidato del dropdown que contiene el keyword (NEO ya filtra,
         así que si solo hay uno es muy probable que sea el correcto).
      4. Ganador claro: el row tiene más palabras distintivas en común que
         cualquier otro candidato.

    Si nada califica → abortar para no registrar al proveedor equivocado.

    Bugs reales que motivaron esta lógica:
      - "HOGGAN INTERNATIONAL" → registraba contra "BARANA INTERNATIONAL LTD"
        (keyword genérica "INTERNATIONAL" → BARANA aparecía primero)
      - "TERNIUM INTERNACIONAL COSTA RICA" → contra "ALUTECH COSTA RICA"
      - "IMPORTACIONES VEGA SA" → contra "COMERCIALIZADORA VEGA"
      - "GERMAN ALEJANDRO CHAVES ACUNA" → contra "ACUÑA Y HERNANDEZ"
        (proveedor "fantasma": txtProveedor_Id quedaba pegado del OC anterior
        cuando la búsqueda fallaba; ahora se limpia explícitamente)
    """
    log.info(f"Buscando proveedor: {nombre_proveedor}")

    proveedor_input = page.locator("#txtProveedor_Text")
    await proveedor_input.wait_for(state="visible", timeout=8000)

    # Limpiar txtProveedor_Text Y txtProveedor_Id. Sin limpiar el ID, si la
    # selección falla NEO sigue usando el proveedor del OC anterior.
    await page.evaluate("""() => {
        const t = document.getElementById('txtProveedor_Text');
        const i = document.getElementById('txtProveedor_Id');
        if (t) t.value = '';
        if (i) i.value = '';
    }""")
    await proveedor_input.click()
    await proveedor_input.click(click_count=3)
    await proveedor_input.fill("")
    await page.wait_for_timeout(300)

    nombre_norm = _normalize(nombre_proveedor.strip())
    palabras_validas = [p for p in re.findall(r"\w+", nombre_norm) if len(p) >= 3]
    distintivas_sol = set(p for p in palabras_validas if p not in GENERIC_WORDS)

    if not distintivas_sol:
        log.error(f"  ❌ '{nombre_proveedor}' no tiene palabras distintivas — abortando")
        return False

    KEYWORD_EXCEPTIONS = {
        "CHAOZHOU ZHONGTONG": "ZHONGTONG",
        "CHAOZHOU ZHONGTONG TRADE": "ZHONGTONG",
    }

    candidatos = []
    if nombre_norm in KEYWORD_EXCEPTIONS:
        candidatos.append(KEYWORD_EXCEPTIONS[nombre_norm])
    else:
        for p in palabras_validas:
            if len(p) >= 4 and p not in GENERIC_WORDS and p not in candidatos:
                candidatos.append(p)
                break
        for p in reversed(palabras_validas):
            if len(p) >= 4 and p not in GENERIC_WORDS and p not in candidatos:
                candidatos.append(p)
                break
        for p in palabras_validas:
            if p not in GENERIC_WORDS and p not in candidatos:
                candidatos.append(p)
                break

    if not candidatos:
        log.error(f"  ❌ Sin candidatos de keyword para '{nombre_proveedor}' — abortando")
        return False

    log.info(f"  Distintivas SOL: {distintivas_sol}")

    for kw_idx, keyword in enumerate(candidatos):
        log.info(f"  Intento #{kw_idx+1} con keyword: {keyword}")

        await proveedor_input.click()
        await proveedor_input.click(click_count=3)
        await proveedor_input.fill("")
        await page.wait_for_timeout(300)
        await proveedor_input.type(keyword, delay=150)
        await page.wait_for_timeout(3000)

        # NEO renderiza las filas del dropdown como <tr> con visibility:hidden
        # hasta que la UI las muestra. wait_for(visible) tira timeout. Usamos
        # state="attached" + text_content() para leer rows hidden y
        # click(force=True) para seleccionarlas.
        try:
            await page.locator("table.obj tr").first.wait_for(state="attached", timeout=5000)
        except Exception:
            log.warning(f"  Dropdown no apareció con '{keyword}'")
            continue

        filas = page.locator("table.obj tr")
        n = await filas.count()
        candidatos_filas = []

        for i in range(n):
            try:
                fila = filas.nth(i)
                tds = fila.locator("td")
                if await tds.count() < 3:
                    continue
                nombre_neo_raw = ((await tds.nth(2).text_content()) or "").strip()
                if not nombre_neo_raw:
                    continue
                nombre_neo_norm = _normalize(nombre_neo_raw)
                palabras_neo = set(re.findall(r"\w+", nombre_neo_norm))

                # Sanity check: el keyword tiene que estar entre las palabras
                # del row. NEO ya filtra por substring pero esto descarta
                # rows raros que se cuelan (headers, separadores, etc).
                if keyword not in palabras_neo:
                    continue

                count = len(distintivas_sol & palabras_neo)
                if count == 0:
                    continue

                candidatos_filas.append({
                    'idx': i,
                    'nombre_raw': nombre_neo_raw,
                    'palabras_neo': palabras_neo,
                    'count': count,
                    'subset': distintivas_sol.issubset(palabras_neo),
                    'exacto': nombre_neo_norm == nombre_norm,
                })
            except Exception:
                continue

        if not candidatos_filas:
            log.warning(f"  Sin candidatos con keyword '{keyword}'")
            continue

        # Ordenar: exacto > subset > más palabras matched > NEO row más corto
        candidatos_filas.sort(key=lambda c: (
            -int(c['exacto']),
            -int(c['subset']),
            -c['count'],
            len(c['palabras_neo']),
        ))

        best = candidatos_filas[0]
        runner_up_count = candidatos_filas[1]['count'] if len(candidatos_filas) > 1 else 0

        # Aceptar si: match exacto, subset perfecto, único candidato,
        # o ganador claro (estrictamente más palabras matched que el segundo).
        accept = (
            best['exacto']
            or best['subset']
            or len(candidatos_filas) == 1
            or best['count'] > runner_up_count
        )

        if not accept:
            log.warning(f"  Match ambiguo con '{keyword}': mejor count={best['count']}, runner-up={runner_up_count} — siguiente keyword")
            continue

        log.info(f"  ✅ Match: {best['nombre_raw']} (count={best['count']}/{len(distintivas_sol)}, subset={best['subset']}, exacto={best['exacto']})")
        await filas.nth(best['idx']).click(force=True)
        await page.wait_for_timeout(1500)

        prov_id = await page.locator("#txtProveedor_Id").input_value()
        if prov_id:
            log.info(f"  ✅ Proveedor ID: {prov_id}")
            return True
        log.warning(f"  txtProveedor_Id vacío post-click — siguiente keyword")

    log.error(f"  ❌ Ningún keyword resolvió '{nombre_proveedor}' — abortando OC")
    return False

async def cargar_excel_oc(page, excel_path):
    """Sube el Excel via CuteWebUI."""
    log.info(f"Subiendo Excel: {excel_path}")
    await page.wait_for_timeout(1000)

    browse_btn = page.locator("#caCargarPlantilla_BrowseButton, img[id*='BrowseButton']")
    await browse_btn.first.wait_for(state="visible", timeout=8000)

    async with page.expect_file_chooser(timeout=10000) as fc_info:
        await browse_btn.first.click()
    file_chooser = await fc_info.value
    await file_chooser.set_files(excel_path)
    log.info("  Archivo seleccionado")
    await page.wait_for_timeout(2000)

    # Modal 1: "La orden se realiza en CRC. ¿Desea continuar?" — aparece al cargar Excel
    try:
        btn_si_crc = page.locator("input[value='Sí'], input[value='Si'], button:has-text('Sí')")
        await btn_si_crc.first.wait_for(state="visible", timeout=8000)
        await btn_si_crc.first.click()
        log.info("  Modal CRC confirmado")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)
    except Exception as e:
        log.warning(f"  Modal CRC no apareció: {e}")

    # Esperar que NEO procese los ítems del Excel (UpdatePanel reload)
    log.info("  Esperando que NEO procese los ítems...")
    for i in range(180):
        await page.wait_for_timeout(1000)
        hf = await page.locator("#caCargarPlantilla_hfItemsUploaded").input_value()
        img_src = await page.locator("#caCargarPlantilla_IMG").get_attribute("src") or ""
        if hf and "ajax-loader" not in img_src:
            log.info(f"  ✅ Items cargados ({len(hf)} chars)")
            break
        if i % 15 == 14:
            log.info(f"  ... esperando ({i+1}s)")
        if i == 179:
            log.warning("  Timeout 180s")

    await page.wait_for_timeout(1000)
    return True

async def registrar_oc(page, numero_sol=None):
    """Hace clic en Registrar, confirma el modal de NEO, y verifica resultado."""
    # Llenar Observaciones con el consecutivo SOL antes de registrar
    if numero_sol:
        obs_text = f"Consecutivo {numero_sol} orden generada por SOL"
        for sel in ["#txtObservaciones", "#txtObservacion", "textarea[id*='bservac']", "input[id*='bservac']"]:
            try:
                obs = page.locator(sel)
                if await obs.count() > 0:
                    await obs.first.fill(obs_text)
                    log.info(f"  Observaciones: {obs_text}")
                    break
            except Exception:
                pass

    registrar = page.locator("input[value='Registrar'], button:has-text('Registrar')")
    await registrar.first.wait_for(state="visible", timeout=8000)
    await registrar.first.click(force=True)
    await page.wait_for_timeout(1500)

    # NEO muestra modal de confirmación "¿Está seguro?" — hacer clic en "Sí"
    try:
        btn_si = page.locator("#mcMensajeConfirmacion_btnSi, input[value='Sí'], input[value='Si']")
        await btn_si.first.wait_for(state="visible", timeout=5000)
        await btn_si.first.click(force=True)
        log.info("  Modal de confirmación: clic en Sí")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)
    except Exception as e:
        log.warning(f"  Modal confirmación no apareció: {e}")

    # Verificar resultado y capturar número de OC
    numero_oc = ""
    try:
        num = page.locator("#txtNumero, input[id*='Numero'][id*='txt']")
        if await num.count() > 0:
            numero_oc = (await num.first.input_value()).strip()
            if numero_oc:
                log.info(f"  OC registrada con número: {numero_oc}")
    except Exception:
        pass

    # Volver al listado y cambiar estado a "Aplicada"
    try:
        # Navegar al listado de OCs
        tok = get_token(page.url)
        base = get_neo_base(page.url)
        url_lista = f"{base}/NEOBusiness/{tok}/Paginas/Modulos/Proveeduria/OrdenCompraPA.aspx?IdOpcion=105027&IdEntidad=0"
        await page.goto(url_lista)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(3000)

        # Buscar la OC correcta: si tenemos numero_oc, buscar esa fila específica
        # Si no, usar la primera "Registrada" (fallback)
        estado_link = None
        if numero_oc:
            log.info(f"  Buscando OC #{numero_oc} en listado...")
            fila_oc = page.locator(f"tr:has-text('{numero_oc}')")
            try:
                await fila_oc.first.wait_for(state="visible", timeout=8000)
                estado_link = fila_oc.first.locator("a:has-text('Registrada')")
                log.info(f"  Encontrada fila OC #{numero_oc}")
            except Exception:
                log.warning(f"  No encontré fila con #{numero_oc}, buscando por proveedor...")
                # Buscar por proveedor como fallback
                try:
                    kw = proveedor.split()[0] if proveedor else ""
                    fila_prov = page.locator(f"tr:has-text('{kw}'):has(a:has-text('Registrada'))")
                    await fila_prov.first.wait_for(state="visible", timeout=5000)
                    estado_link = fila_prov.first.locator("a:has-text('Registrada')")
                    log.info(f"  Encontrada por proveedor: {kw}")
                except Exception:
                    log.warning(f"  No encontré por proveedor, usando primera Registrada")
                    estado_link = page.locator("a:has-text('Registrada')").first
        else:
            log.info("  Sin numero_oc — buscando por proveedor...")
            try:
                kw = proveedor.split()[0] if proveedor else ""
                fila_prov = page.locator(f"tr:has-text('{kw}'):has(a:has-text('Registrada'))")
                await fila_prov.first.wait_for(state="visible", timeout=5000)
                estado_link = fila_prov.first.locator("a:has-text('Registrada')")
                log.info(f"  Encontrada por proveedor: {kw}")
            except Exception:
                log.warning(f"  Fallback: usando primera Registrada en listado")
                estado_link = page.locator("a:has-text('Registrada')").first

        await estado_link.wait_for(state="visible", timeout=20000)
        await estado_link.click(force=True)
        await page.wait_for_timeout(2000)

        # Seleccionar "Aplicada" y confirmar haciendo clic en botón "Cambiar"
        try:
            select_estado = page.locator("select").first
            await select_estado.wait_for(state="visible", timeout=5000)
            await select_estado.select_option(label="Aplicada")
            await page.wait_for_timeout(500)
            # Llenar observación
            obs = page.locator("#hHistorial_txtObservacion")
            if await obs.count() > 0:
                await obs.fill("Orden automatica SOL")
            await page.wait_for_timeout(300)
            # Clic en botón "Cambiar" visible
            btn_cambiar = page.locator("input[value='Cambiar'], button:has-text('Cambiar')")
            await btn_cambiar.first.wait_for(state="visible", timeout=5000)
            await btn_cambiar.first.click(force=True)
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2000)
            log.info("  ✅ Estado Aplicada OK")
        except Exception as e:
            log.warning(f"  Aplicar estado: {e}")
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(1500)
        log.info("  ✅ Estado cambiado a Aplicada")
        return True, f"OC {numero_oc} registrada y aplicada"
    except Exception as e:
        log.warning(f"  No se pudo aplicar: {e}")
        return True, f"OC {numero_oc} registrada (sin aplicar)"


# ─────────────────────────────────────────────
# FLUJO PRINCIPAL
# ─────────────────────────────────────────────

async def procesar_oc(page, registro):
    """Procesa una OC de la cola: descarga Excel, sube a NEO, marca como procesado."""
    oc_id        = registro["id"]
    nombre_oc    = registro.get("nombre_archivo", "")
    storage_path = registro.get("storage_path", "")
    proveedor    = registro.get("proveedor_nombre", "")

    log.info(f"\n{'='*50}")
    log.info(f"Procesando OC #{oc_id}: {nombre_oc}")
    log.info(f"Proveedor: {proveedor}")

    # 1. Descargar Excel a archivo temporal
    with tempfile.NamedTemporaryFile(suffix=".xlsx", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        descargar_excel_storage(storage_path, tmp_path)
    except Exception as e:
        log.error(f"Error descargando Excel: {e}")
        marcar_procesado(oc_id, False, f"Error descargando: {e}")
        return False

    # 2. Navegar a Nueva OC en NEO
    try:
        await navegar_nueva_oc(page)
    except Exception as e:
        log.error(f"Error navegando a Nueva OC: {e}")
        marcar_procesado(oc_id, False, f"Error navegando NEO: {e}")
        os.unlink(tmp_path)
        return False

    # 3. Seleccionar proveedor
    try:
        prov_ok = await buscar_y_seleccionar_proveedor(page, proveedor)
        if not prov_ok:
            # No subir el Excel si NEO no aceptó el proveedor — si no,
            # NEO lo cuelga del último proveedor que tuvo en memoria
            # (p.ej. "Acuña y Hernández") y queda contaminando OCs.
            log.error(f"Proveedor '{proveedor}' no seleccionado en NEO — abortando OC sin subir Excel")
            marcar_procesado(oc_id, False, f"Proveedor no encontrado en NEO: {proveedor}")
            os.unlink(tmp_path)
            return False
    except Exception as e:
        log.error(f"Error buscando proveedor: {e}")
        marcar_procesado(oc_id, False, f"Error proveedor: {e}")
        os.unlink(tmp_path)
        return False

    # 4. Cargar Excel
    try:
        items_ok = await cargar_excel_oc(page, tmp_path)
        if not items_ok:
            log.warning("No se detectaron ítems en la tabla — continuando de todas formas")
    except Exception as e:
        log.error(f"Error cargando Excel: {e}")
        marcar_procesado(oc_id, False, f"Error cargando Excel: {e}")
        os.unlink(tmp_path)
        return False

    # 5. Registrar OC
    try:
        ok, detalle = await registrar_oc(page, numero_sol=registro.get('numero_sol'))
        marcar_procesado(oc_id, ok, detalle)
        if ok:
            log.info(f"✅ OC #{oc_id} procesada correctamente")
            # Notificación Mac
            import subprocess
            subprocess.run(["osascript", "-e",
                f'display notification "OC {nombre_oc} subida a NEO" with title "SOL → NEO ✅" sound name "Purr"'],
                capture_output=True)
        else:
            log.error(f"❌ OC #{oc_id} falló: {detalle}")
        return ok
    except Exception as e:
        log.error(f"Error registrando OC: {e}")
        marcar_procesado(oc_id, False, f"Error registrando: {e}")
        return False
    finally:
        try:
            os.unlink(tmp_path)
        except Exception:
            pass

async def main():
    import fcntl
    lock_path = BASE / "oc-uploader.lock"
    # 'a+' no trunca — permite leer el PID de la instancia que tiene el lock
    lock_file = open(lock_path, 'a+')
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except (IOError, BlockingIOError):
        lock_file.seek(0)
        pid_str = lock_file.read().strip()
        log.info(f"Ya hay otra instancia corriendo (PID {pid_str or '?'}) — saliendo.")
        return
    # Lock adquirido — escribimos nuestro PID
    lock_file.seek(0)
    lock_file.truncate()
    lock_file.write(str(os.getpid()))
    lock_file.flush()

    pendientes = obtener_pendientes()
    if not pendientes:
        log.info("Sin OCs pendientes en la cola.")
        return

    log.info(f"OCs pendientes encontradas: {len(pendientes)}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=True,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox"]
        )
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        await login(page)
        await verificar_empresa(page)

        exitosas, fallidas = [], []
        for registro in pendientes:
            oc_id_temp = registro.get("id")
            supa_patch(f"cola_neo_uploads?id=eq.{oc_id_temp}", {"procesando": True, "intentos": (registro.get("intentos") or 0) + 1})
            ok = await procesar_oc(page, registro)
            if ok:
                exitosas.append(registro.get("nombre_archivo", registro["id"]))
            else:
                fallidas.append(registro.get("nombre_archivo", registro["id"]))

        await browser.close()

    log.info(f"\n{'='*50}")
    log.info(f"✅ Exitosas ({len(exitosas)}): {', '.join(exitosas)}")
    if fallidas:
        log.info(f"❌ Fallidas ({len(fallidas)}): {', '.join(fallidas)}")

if __name__ == "__main__":
    asyncio.run(main())
