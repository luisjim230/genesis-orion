# Preferencias del usuario (Luis Jiménez)

**El usuario NO es programador.** Claude debe hacer absolutamente todo por él.

## Reglas obligatorias en TODA conversación

1. **Nunca dar pasos múltiples.** Cuando haya que ejecutar comandos en la Mac del usuario, entregarle **UN solo comando compuesto** (encadenado con `&&`, `;`, loops, etc.) que haga todo de principio a fin. El usuario solo copia-pega una vez.

2. **Nunca explicar conceptos técnicos** (RLS, branches, commits, LaunchAgents, etc.) salvo que el usuario lo pida. Ejecutar y reportar resultado.

3. **Español rioplatense informal**, frases cortas, sin jerga innecesaria.

4. **No pedirle al usuario que edite archivos a mano**, que navegue paths, ni que entienda outputs crudos. Si hay que editar un archivo, hacerlo con `sed`/`echo`/script; si hay que leer un log, filtrar las líneas relevantes automáticamente.

5. **Claude corre en sandbox Linux remoto, NO en la Mac del usuario.** Lo único que el usuario tiene que hacer es:
   - Copiar/pegar comandos en Terminal de su Mac
   - Pegar credenciales que están detrás de su login (Supabase dashboard, Vercel, etc.) cuando Claude se lo pide explícitamente
   - Cualquier otra cosa (clonar repos, instalar dependencias, reiniciar daemons) debe venir empaquetada en UN comando

6. **Advertir sobre rotación de secrets** cuando el usuario pegue una service key, token, o contraseña en el chat — y recordárselo al final de la tarea.

7. **Siempre incluir `git checkout <rama>` antes de cualquier `git pull`** en comandos que se le den al usuario. El usuario no sabe que `git pull` solo actualiza la rama donde está parado. Si los cambios que el usuario tiene que correr están en una rama de feature (ej. `claude/xxx`), el comando DEBE ser:
   ```
   cd <ruta> && git checkout <rama-feature> && git pull origin <rama-feature> && <comando-a-correr>
   ```
   Nunca asumir que el usuario está en la rama correcta. Nunca darle `git pull` sin checkout previo. Si la rama no existe local, `git checkout -B <rama> origin/<rama>` la crea y traquea en un solo paso.

## Contexto del proyecto

- **Repo:** genesis-orion (Next.js + Supabase)
- **Sync NEO → Supabase** corre en la Mac del usuario vía LaunchAgents:
  - `com.rojimo.neosync.*` → corre `~/Documents/neo-sync/main.py` y `autoupload.py`
  - `com.sol.sync-daemon` + `com.sol.neo-*` → corre scripts del repo en `scripts/`
- Ambos sets necesitan `SUPABASE_SERVICE_ROLE_KEY` en su `.env` para evitar bloqueo de RLS al escribir en `neo_items_comprados`, `neo_minimos_maximos`, etc.
- Rama de trabajo actual: `claude/fix-date-matching-WX9bs`
