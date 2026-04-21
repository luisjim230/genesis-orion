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

import re


async def relogin_si_hace_falta(page, usuario, clave, log, intentos=3):
    """
    Si `page.url` contiene Login.aspx, reautentica hasta `intentos` veces.
    Devuelve True si al salir no estamos en Login, False si siguió fallando.
    """
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
                    await page.goto(home)
                    await page.wait_for_load_state("networkidle")
                    await page.wait_for_timeout(2000)
        except Exception as e:
            log.error(f"  Relogin falló: {e}")
            return False

    return "Login.aspx" not in page.url
