"""
neo_session.py — Utilidades compartidas para manejar la sesión NEO en los
downloaders Playwright.

NEO invalida la sesión cuando detecta otra activa con el mismo usuario
(p.ej. NEO abierto en el navegador del usuario, o dos scripts corriendo
en paralelo). El síntoma es que la URL pasa a `.../Login.aspx?login=1`
a mitad del flujo y el iframe principal viene vacío.

`relogin_si_hace_falta` detecta ese redirect y reintenta login (incluyendo
el botón "Usar aquí" cuando NEO lo ofrece) hasta 3 veces.
"""

import fcntl
import os
import re
import time
from pathlib import Path

# ─── CANDADO GLOBAL DE NEO ────────────────────────────────────────────────────
# NEO invalida la sesión cuando ve otra activa con el mismo usuario. El daemon ya
# corre sus scripts en fila, pero una corrida manual (o el otro set de
# LaunchAgents) encima de la del daemon rompe las DOS: la que estaba a mitad de
# camino se queda sin sesión y su exportación muere por timeout.
# Este candado garantiza que solo un script hable con NEO a la vez.
LOCK_FILE = Path.home() / "sol-logs" / "neo.lock"
_lock_fh = None   # se mantiene abierto toda la vida del proceso: el SO suelta el
                  # candado solo cuando el proceso termina (incluso si crashea).


def tomar_candado_neo(nombre, log, espera_max=240):
    """Espera a que NEO quede libre y toma el candado para este proceso.

    Si no se libera en `espera_max` segundos, corta con SystemExit(1) en vez de
    entrar igual: el daemon ve el rc=1, reintenta al minuto siguiente y avisa si
    insiste en fallar. Mejor perder una corrida que romper la que está andando.
    """
    global _lock_fh
    LOCK_FILE.parent.mkdir(parents=True, exist_ok=True)
    _lock_fh = open(LOCK_FILE, "w")
    inicio = time.time()
    avisado = False
    while True:
        try:
            fcntl.flock(_lock_fh, fcntl.LOCK_EX | fcntl.LOCK_NB)
            break
        except (BlockingIOError, OSError):
            esperado = time.time() - inicio
            if esperado > espera_max:
                log.error(f"❌ NEO ocupado por otro script hace más de {espera_max}s — corto para reintentar después.")
                _lock_fh.close()
                _lock_fh = None
                raise SystemExit(1)
            if not avisado:
                log.info("  Esperando a que se libere NEO (lo está usando otro script)...")
                avisado = True
            time.sleep(5)
    _lock_fh.write(f"{nombre} pid={os.getpid()}\n")
    _lock_fh.flush()
    log.info(f"  🔒 Candado de NEO tomado por {nombre}")


async def cerrar_alerta_neo(page, log=None):
    """Cierra la alerta de la llave criptográfica de Hacienda (u otra) que NEO
    muestra de vez en cuando después del login. El botón puede decir 'Aceptar'
    o 'Continuar' y aparece dentro del iframe principal o en la página. Si no
    hay ninguna alerta no pasa nada: se ignora en silencio.

    Se llama solo desde relogin_si_hace_falta, así que TODOS los scripts que ya
    usan ese helper quedan cubiertos sin tocar cada uno."""
    try:
        frame = page.locator('iframe[name="IFRAMEPRINCIPAL"]').content_frame
    except Exception:
        frame = None
    scopes = [s for s in (frame, page) if s is not None]
    for scope in scopes:
        for name in ("Aceptar", "Continuar", " Continuar", "OK"):
            for rol in ("button", "link"):
                try:
                    loc = scope.get_by_role(rol, name=name)
                    if await loc.count() > 0 and await loc.first.is_visible():
                        await loc.first.click()
                        await page.wait_for_timeout(1200)
                        if log:
                            log.info(f"  Alerta NEO cerrada con '{name.strip()}'")
                        return True
                except Exception:
                    continue
    return False


async def relogin_si_hace_falta(page, usuario, clave, log, intentos=3):
    """
    Si `page.url` contiene Login.aspx, reautentica hasta `intentos` veces.
    Devuelve True si al salir no estamos en Login, False si siguió fallando.
    """
    # Antes de nada, cerrar la alerta de la llave criptográfica si salió: si
    # queda abierta bloquea el iframe y cualquier navegación posterior falla.
    await cerrar_alerta_neo(page, log)

    for i in range(intentos):
        if "Login.aspx" not in page.url:
            return True
        log.warning(f"  NEO pidió relogin (intento {i+1})")

        # "Usar aquí" aparece cuando hay sesión activa en otro cliente
        try:
            usar = page.locator("text=Usar aquí")
            if await usar.count() > 0:
                await usar.first.click()
                await page.wait_for_load_state("networkidle")
                await page.wait_for_timeout(2000)
                continue
        except Exception:
            pass

        # Llenar credenciales
        try:
            u = page.get_by_role("textbox", name="Usuario o correo electrónico")
            await u.wait_for(state="visible", timeout=8000)
            await u.fill(usuario)
            await u.press("Tab")
            await page.get_by_role("textbox", name="Contraseña").fill(clave)
            await page.get_by_role("button", name="Ingresar").click()
            await page.wait_for_load_state("networkidle")
            await page.wait_for_timeout(2500)
            # "Usar aquí" post-login
            try:
                usar = page.locator("text=Usar aquí")
                if await usar.count() > 0:
                    await usar.first.click()
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_timeout(1500)
            except Exception:
                pass
            # Si sigue en Login.aspx, navegar explícitamente a Home con token nuevo
            if "Login.aspx" in page.url:
                tok_match = re.search(r'\(S\([^)]+\)\)', page.url)
                if tok_match:
                    tok = tok_match.group(0)
                    home = f"https://neo1.neotecnologias.com/NEOBusiness/{tok}/Paginas/Modulos/NEO/Home.aspx"
                    await page.goto(home, wait_until="domcontentloaded", timeout=60000)
                    try:
                        await page.wait_for_load_state("networkidle", timeout=15000)
                    except Exception:
                        pass
                    await page.wait_for_timeout(2000)
        except Exception as e:
            log.error(f"  Relogin falló: {e}")
            return False

    return "Login.aspx" not in page.url
