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

- **Repo:** genesis-orion (Next.js + Supabase). Dominio prod: `sol.depositojimenez.com`. Sitio público trackeado: `depositojimenezcr.com` (Nidux).
- **Sync NEO → Supabase** corre en la Mac del usuario vía LaunchAgents:
  - `com.rojimo.neosync.*` → corre `~/Documents/neo-sync/main.py` y `autoupload.py`
  - `com.sol.sync-daemon` + `com.sol.neo-*` → corre scripts del repo en `scripts/`
- Ambos sets necesitan `SUPABASE_SERVICE_ROLE_KEY` en su `.env` para evitar bloqueo de RLS al escribir en `neo_items_comprados`, `neo_minimos_maximos`, etc.

### Telegram (notificaciones internas)

- **Bot:** `SOL_DJ_BOT` · `t.me/SOL_DJ_BOT` · ID `8663038626` (creado en BotFather por Luis).
- **NUNCA pedir el token al usuario.** El token completo vive como secret de GitHub Actions:
  `secrets.TELEGRAM_BOT_TOKEN` y `secrets.TELEGRAM_CHAT_ID`. Cualquier alerta nueva debe correr
  vía un workflow de `.github/workflows/` (igual que `telegram-daily-tasks.yml`,
  `telegram-daily-report.yml`, `telegram-metricas-daily.yml`). NO hace falta cargar nada de
  Telegram en Vercel ni en la Mac.
- **Override por módulo:** secrets adicionales tipo `TELEGRAM_CHAT_ID_METRICAS` permiten
  apuntar mensajes a un chat distinto (ej. canal del equipo de WhatsApp). El workflow ya
  tiene la lógica de fallback a `TELEGRAM_CHAT_ID` si el override no está.
- **Hora estándar de cron:** `0 15 * * 1-6` (9am Costa Rica, lun–sáb). Domingo se omite.

### GA4 / Métricas Web

- **Property ID:** `534989092` (propiedad GA4 de `depositojimenezcr.com`).
- **Measurement ID:** `G-237EPSVR3Z`.
- **Service Account:** `dj-ga4-reader@deposito-jimenez-494720.iam.gserviceaccount.com` (rol Lector).
  - Si GA4 UI rechaza agregarla manualmente con "no coincide con cuenta de Google", usar la
    Analytics Admin API directamente (scope `analytics.manage.users`) — ver
    `docs/metricas-web.md`. Las dimensiones custom como `traffic_type` se crean con
    scope `analytics.edit`.
- **APIs habilitadas en GCP:** Google Analytics Data API (proyecto `deposito-jimenez-494720`,
  number `496550359534`).
- **Dimensión custom registrada:** `traffic_type` (event-scoped). Distingue tráfico interno
  del equipo vs externo (clientes). El Realtime API NO la soporta — siempre se ignora ahí.
- Vars de entorno requeridas en Vercel: `GA4_PROPERTY_ID`, `GA4_SERVICE_ACCOUNT_JSON` (base64),
  `GA4_MEASUREMENT_ID`, `GA4_MEASUREMENT_API_SECRET`.

### Rama de trabajo actual

`main` (los PRs de feature se mergean directo).
