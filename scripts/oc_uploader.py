"""
oc_uploader.py — Sube órdenes de compra desde Supabase Storage a NEO
Corre cada 5 minutos desde LaunchAgent. Revisa tabla cola_neo_uploads,
descarga el Excel, lo sube a NEO con el proveedor correcto, marca como procesado.

Ubicación: ~/Documents/neo-sync/oc_uploader.py
"""
import os, sys, asyncio, re, logging, json, urllib.request, urllib.error, tempfile
from pathlib import Path
from datetime import datetime
from playwright.async_api import async_playwright
from dotenv import load_dotenv

BASE = Path(__file__).parent
load_dotenv(BASE / ".env")

NEO_URL      = "https://neo.neotecnologias.com/NEOBusiness/"
NEO_USUARIO  = os.getenv("NEO_USUARIO", "luisjim230")
NEO_CLAVE    = os.getenv("NEO_CLAVE", "Miami123")
EMPRESA_OK   = "Corporacion Rojimo S.A."
SUPA_URL     = os.getenv("SUPABASE_URL", "https://xeeieqjqmtoiutfnltqu.supabase.co")
SUPA_KEY     = os.getenv("SUPABASE_ANON_KEY", "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhlZWllcWpxbXRvaXV0Zm5sdHF1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI3MjA2NTMsImV4cCI6MjA4ODI5NjY1M30.SqYdotAkZOyMARsZb1XutfgYiH9Ig2qoHOD8j6oPy00")
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

def obtener_pendientes():
    """Trae OCs pendientes de la cola."""
    registros = supa_get("cola_neo_uploads?estado=eq.pendiente&order=created_at.asc")
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
    # URL del listado de OCs (IdOpcion 105019 es Órdenes de compra en Proveeduría)
    url_oc = f"{NEO_URL.replace('neo.', 'neo1.')}{tok}/Paginas/Modulos/Proveeduria/OrdenCompraPA.aspx?IdOpcion=105027&IdEntidad=0"
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
    Busca el proveedor en NEO usando el campo txtProveedor_Text.
    NEO muestra un dropdown tipo grid con columnas Identificación/Nombre.
    Hace clic en la primera fila del dropdown.
    """
    log.info(f"Buscando proveedor: {nombre_proveedor}")

    proveedor_input = page.locator("#txtProveedor_Text")
    await proveedor_input.wait_for(state="visible", timeout=8000)
    await proveedor_input.click()
    await proveedor_input.click(click_count=3)
    await proveedor_input.fill("")
    await page.wait_for_timeout(300)

    # Usar la primera palabra significativa (>3 letras) del nombre
    palabras = nombre_proveedor.upper().split()
    # Tabla de excepciones: nombre exacto del proveedor -> keyword a usar en NEO
    KEYWORD_EXCEPTIONS = {
        "CHAOZHOU ZHONGTONG": "ZHONGTONG",
        "CHAOZHOU ZHONGTONG TRADE": "ZHONGTONG",
        "CHAOZHOU ZHONGTONG TRADE": "ZHONGTONG",
    }
    nombre_upper = nombre_proveedor.upper().strip()
    if nombre_upper in KEYWORD_EXCEPTIONS:
        keyword = KEYWORD_EXCEPTIONS[nombre_upper]
        log.info(f"  Usando keyword de excepcion: {keyword}")
    else:
        keyword = next((p for p in reversed(palabras) if len(p) > 3), palabras[-1])
    log.info(f"  Keyword: {keyword}")

    # Tipear lento — NEO dispara AJAX en cada keyup
    await proveedor_input.type(keyword, delay=150)
    await page.wait_for_timeout(3000)

    # El dropdown de NEO es dhtmlx grid: tabla con clase "obj" y filas "rowselected"
    try:
        fila = page.locator("table.obj tr.rowselected")
        await fila.first.wait_for(state="visible", timeout=5000)
        texto = await fila.first.locator("td").nth(2).inner_text()
        log.info(f"  Clic en proveedor: {texto.strip()}")
        await fila.first.click()
        await page.wait_for_timeout(1500)
    except Exception as e:
        log.warning(f"  rowselected no encontrado: {e}")
        try:
            fila2 = page.locator("table.obj tr").nth(1)
            await fila2.wait_for(state="visible", timeout=3000)
            await fila2.click()
            await page.wait_for_timeout(1500)
        except Exception as e2:
            log.warning(f"  Fallback tabla.obj falló: {e2}")

    # Verificar que txtProveedor_Id tiene valor
    prov_id = await page.locator("#txtProveedor_Id").input_value()
    if prov_id:
        log.info(f"  ✅ Proveedor ID: {prov_id}")
        return True

    log.error("  ❌ txtProveedor_Id vacío — proveedor NO seleccionado")
    return False

async def cargar_excel_oc(page, excel_path):
    """Sube el Excel via CuteWebUI con browser headful."""
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

async def registrar_oc(page):
    """Hace clic en Registrar, confirma el modal de NEO, y verifica resultado."""
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
        url_lista = f"https://neo1.neotecnologias.com/NEOBusiness/{tok}/Paginas/Modulos/Proveeduria/OrdenCompraPA.aspx?IdOpcion=105027&IdEntidad=0"
        await page.goto(url_lista)
        await page.wait_for_load_state("networkidle")
        await page.wait_for_timeout(2000)

        # Hacer clic en el link "Registrada" de la primera OC (la más reciente)
        estado_link = page.locator("a:has-text('Registrada')").first
        await estado_link.wait_for(state="visible", timeout=20000)
        await estado_link.click(force=True)
        await page.wait_for_timeout(2000)

        # Seleccionar "Aplicada" y confirmar con JS
        try:
            select_estado = page.locator("select").first
            await select_estado.wait_for(state="visible", timeout=5000)
            await select_estado.select_option(label="Aplicada")
            await page.wait_for_timeout(800)
            # Confirmar con JS — hHistorial_btnCambiar puede estar disabled
            await page.evaluate("""() => {
                const obs = document.getElementById('hHistorial_txtObservacion');
                if (obs) obs.value = 'Orden automatica';
                const btn = document.getElementById('hHistorial_btnCambiar');
                if (btn) { btn.disabled = false; btn.click(); }
            }""")
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
        await buscar_y_seleccionar_proveedor(page, proveedor)
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
        ok, detalle = await registrar_oc(page)
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
    pendientes = obtener_pendientes()
    if not pendientes:
        log.info("Sin OCs pendientes en la cola.")
        return

    log.info(f"OCs pendientes encontradas: {len(pendientes)}")

    async with async_playwright() as pw:
        browser = await pw.chromium.launch(
            headless=False,
            args=["--disable-blink-features=AutomationControlled", "--no-sandbox", "--window-position=10000,10000"]
        )
        context = await browser.new_context(accept_downloads=True)
        page = await context.new_page()

        await login(page)
        await verificar_empresa(page)

        exitosas, fallidas = [], []
        for registro in pendientes:
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
