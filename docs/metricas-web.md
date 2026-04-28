# Módulo Métricas Web

Dashboard de Google Analytics 4 + generador de Links UTM + reporte separado de actividad
del equipo (Equipo WhatsApp) + sistema de marcado de dispositivos internos.

Vive en `/metricas-web` y se accede desde el sidebar (grupo *Inteligencia*).

## ¿Qué resuelve?

1. **Dashboard externo (clientes):** GA4 sin contaminar con la navegación del equipo. Filtrado
   por `traffic_type != "internal"`.
2. **Equipo WhatsApp (interno):** lectura de demanda. Cuando alguien del equipo entra al sitio
   para responder un cliente por WhatsApp, esa visita queda registrada como interna y se ve en
   esta tab. Cruzando "muy consultado por equipo" vs "poco vendido" salen oportunidades.
3. **Generador de links UTM:** la diseñadora arma links sin saber qué es un UTM. Imposible
   equivocarse: source, medium, campaign y content se eligen con botones grandes.
4. **Marcado de dispositivos internos:** página pública `/marcar-interno` que un empleado abre
   en su navegador para que sus visitas se marquen como `traffic_type=internal`.

## Configuración inicial

### 1) Migración Supabase

```
supabase/migrations/20260428_metricas_web.sql
```

Crea las tablas:
- `utm_campaigns` — campañas activas/archivadas
- `utm_links_history` — todos los links generados
- `ga4_metrics_cache` — caché de respuestas GA4
- `internal_team_devices` — registro de dispositivos marcados

Ejecutar en el SQL Editor de Supabase.

### 2) Variables de entorno

Definir en Vercel (y en `.env.local` para desarrollo):

| Variable | Valor | Descripción |
|---|---|---|
| `GA4_PROPERTY_ID` | Ej: `123456789` | ID numérico de la propiedad GA4 (NO el measurement ID). Está en GA4 > Admin > Property Settings. |
| `GA4_SERVICE_ACCOUNT_JSON` | JSON de la service account, **codificado en base64** | Recomendado en base64 para evitar problemas con saltos de línea en Vercel. El código acepta también JSON crudo. |
| `GA4_MEASUREMENT_ID` | `G-237EPSVR3Z` | Tag de GA4 (ya configurado en el sitio). |
| `GA4_MEASUREMENT_API_SECRET` | `jnTUBYNNRO2xlLAs71hg_A` | Secret de Measurement Protocol. Se usa solo en `/marcar-interno`. |
| `SUPABASE_SERVICE_ROLE_KEY` | (ya existe) | Necesaria para el caché y endpoints administrativos. |


> **Nota sobre Telegram:** las alertas diarias corren en GitHub Actions (`.github/workflows/telegram-metricas-daily.yml`),
> no en Vercel Cron. Usan los secrets `TELEGRAM_BOT_TOKEN` y `TELEGRAM_CHAT_ID` (o `TELEGRAM_CHAT_ID_METRICAS`)
> que ya están configurados en GitHub. NO hace falta cargar nada de Telegram en Vercel.

#### Cómo pasar el JSON de service account a Vercel

**Recomendación: base64.** En tu Mac, abrí Terminal y corré:

```
base64 -i ~/Downloads/dj-ga4-service-account.json | pbcopy
```

Eso copia al portapapeles el JSON codificado. Pegalo en Vercel como valor de
`GA4_SERVICE_ACCOUNT_JSON`. El código detecta automáticamente que viene en base64
y lo decodifica en runtime.

(Si lo pegás en JSON crudo también funciona, pero Vercel a veces escapa los `\n`
de la `private_key`; en base64 no hay riesgo.)

### 3) Permisos

En `lib/useAuth.js` el módulo `metricas-web` está habilitado para `admin`. Para darle acceso
a otros roles (ej: ventas, marketing), agregalo al array correspondiente o usá
`permisos_extra` en `usuarios_sol`.

## Cómo funciona el filtrado interno vs externo

GA4 recibe en cada evento un parámetro custom `traffic_type`. Cuando vale `"internal"`,
los reportes de la tab **Dashboard** lo excluyen y los de **Equipo WhatsApp** lo incluyen
en exclusiva.

El parámetro llega a GA4 por cualquiera de estas vías:

1. **Cookie / localStorage `dj_internal_traffic=true` en el navegador.** El script de
   `app/components/GA4Script.js` la lee y la inyecta en el `gtag('config', ...)`.
2. **Evento Measurement Protocol con `traffic_type: "internal"`.** Lo dispara
   `/marcar-interno` cuando un empleado se registra (server-side, una sola vez).
3. **URL parameter `?traffic_type=internal`.** Si Nidux no permite scripts custom,
   configurar en GA4 una *Internal Traffic Rule* que detecte este parámetro de URL.
   `/marcar-interno` redirige al sitio agregando ese parámetro.

### En Génesis Orión (este sistema)

Listo. `app/components/GA4Script.js` ya está montado en el `<head>` y aplica el flag
en cada page load.

### En depositojimenezcr.com (Nidux)

Hay dos opciones según lo que permita Nidux:

**Opción A — Snippet custom (preferida).** Pegá este bloque en el header del sitio Nidux,
ANTES del tag de GA4:

```html
<script>
  (function(){
    var isInternal = false;
    try {
      isInternal = localStorage.getItem('dj_internal_traffic') === 'true';
      if (!isInternal) {
        isInternal = /(?:^|; )dj_internal_traffic=true/.test(document.cookie);
      }
    } catch (e) {}
    window.__dj_traffic_type = isInternal ? 'internal' : null;
  })();
</script>
```

Y luego en la inicialización de gtag:

```html
<script async src="https://www.googletagmanager.com/gtag/js?id=G-237EPSVR3Z"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  var cfg = { send_page_view: true };
  if (window.__dj_traffic_type === 'internal') cfg.traffic_type = 'internal';
  gtag('config', 'G-237EPSVR3Z', cfg);
</script>
```

**Opción B — URL parameter.** Si Nidux no permite scripts:
1. En `/marcar-interno`, después de marcar, redirigimos al usuario a
   `https://depositojimenezcr.com/?traffic_type=internal` (ya hecho).
2. En GA4 Admin > Data Streams > Web > Configure tag settings > Define internal traffic,
   crear una regla "Match all of the following: Page URL contains `traffic_type=internal`".
3. Esto sirve solo para esa primera visita post-marcado. Para visitas siguientes el flag se
   mantiene en localStorage del navegador, pero como Nidux no lo lee, no se aplica.

> **Decisión adoptada:** se usa la opción A si Nidux permite scripts. Si no, se cae a la B y
> se le pide a los empleados que abran el sitio desde el botón "Ir al sitio" de
> `/marcar-interno` (ese botón inyecta el parámetro en URL). Documentar internamente cuál se eligió.

## Procedimiento para que un empleado marque su dispositivo

1. Luis (o quien administre) le manda al empleado el link `https://[dominio]/marcar-interno`.
   Está en la tab **Configuración** del módulo, botón "Copiar link".
2. El empleado abre el link en el navegador que usa habitualmente para responder WhatsApp
   (Chrome, Safari, Edge, etc.).
3. Llena dos campos: nombre del dispositivo (ej: "Compu de oficina de María") y su nombre.
4. Hace click en "Marcar este navegador como interno".
5. Listo. El navegador queda marcado por hasta 2 años o hasta que se limpien los datos.
6. Si trabaja desde varios dispositivos (compu + celular), repetir el paso en cada uno.
7. Modo incógnito o cambio de navegador resetea la marca.

## Convenciones de UTMs

El generador adopta las siguientes convenciones (lo que aparece en GA4):

| Parámetro | Valores posibles |
|---|---|
| `utm_source` | `facebook` · `instagram` · `tiktok` · `whatsapp` · `youtube` · `email` |
| `utm_medium` | `organico` · `pagado` · `bio` · `historia` |
| `utm_campaign` | slug de la campaña creada en Supabase. Ej: `black_friday_2026` |
| `utm_content` | identifica la pieza específica. Ej: `azulejo_oporto_facebook_organico` |

Ejemplo de link final:

```
https://depositojimenezcr.com/products/5410/azulejo-oporto-verde?utm_source=instagram&utm_medium=pagado&utm_campaign=verano_2026&utm_content=azulejo_oporto_reel_demo
```

## Manual del Generador de Links (para la diseñadora)

Mobile-first, paso por paso. No hay forma de equivocarse:

1. **Pegar el link del producto.** Copialo de la pestaña del navegador. Si no es de
   depositojimenezcr.com, te avisa.
2. **Elegir dónde lo vas a publicar.** Botón con el ícono de la red (Facebook, Instagram, etc).
3. **Elegir tipo de publicación.** Post orgánico, pagado, link en bio, historia.
4. **Elegir campaña.** Si no existe, hay un botón "+ Crear campaña nueva".
5. **Describir la pieza.** Texto libre. El sistema te muestra una sugerencia automática debajo
   y te la podés copiar con un click.
6. **Copiar el link.** Botón verde gigante "📋 COPIAR LINK". Listo. Se guarda automáticamente
   en el historial.

Si pasás algo mal, podés volver y editar cualquier paso.

## Cómo interpretar la tab "Equipo WhatsApp"

Esta tab muestra **solo** la actividad del equipo. La premisa: cuando un empleado responde
una consulta de WhatsApp, abre el sitio para mostrarle el producto al cliente. Ese clic
queda como visita interna.

Productos muy consultados por el equipo y poco vendidos = **demanda WhatsApp no convertida**.
Casos típicos:
- Producto agotado pero la gente lo sigue pidiendo.
- Producto sin foto o con descripción mala.
- Precio fuera de mercado.
- Categoría que se podría empujar más.

El **mapa de calor** muestra cuándo el equipo más consulta. Útil para staffing y para
detectar picos de demanda.

## Caché GA4

Las consultas a GA4 son lentas y tienen quota. Por eso cacheamos en `ga4_metrics_cache` por
ventanas cortas:

| Métrica | TTL |
|---|---|
| `summary` | 5 min |
| `top_products` | 15 min |
| `traffic_sources` | 15 min |
| `conversions` | 10 min |
| `campaigns_performance` | 15 min |
| `internal_team_activity` | 10 min |
| `active_users_realtime` | sin caché |

En la tab **Configuración** hay un botón "Forzar refresh de caché" que borra todo.

## Endpoints API

| Endpoint | Método | Descripción |
|---|---|---|
| `/api/metricas-web/ga4` | GET | Métricas GA4 con caché. Query: `metric_type`, `date_range`, `traffic_filter` |
| `/api/metricas-web/campaigns` | GET / POST | Lista / crea campañas |
| `/api/metricas-web/campaigns/[id]` | PATCH / DELETE | Edita / archiva |
| `/api/metricas-web/links` | GET / POST | Lista / guarda link UTM |
| `/api/metricas-web/internal-devices` | GET / POST / PATCH | Lista / registra / revoca dispositivo |
| `/api/metricas-web/mark-internal` | POST | Dispara evento Measurement Protocol con traffic_type=internal |
| `/api/metricas-web/cache-clear` | POST | Borra todo el caché GA4 |

## Solución de problemas

### "GA4 no está configurado"
Falta `GA4_PROPERTY_ID` o `GA4_SERVICE_ACCOUNT_JSON` en Vercel. Verificar en
Vercel > Project > Settings > Environment Variables.

### El dashboard muestra 0 sesiones pero el sitio tiene tráfico
- Verificá que GA4_PROPERTY_ID sea el ID numérico, NO el measurement ID (`G-...`).
- La service account debe tener rol "Viewer" o superior en la propiedad GA4
  (Admin > Property Access Management).

### "Usuarios activos" en el dashboard externo siempre muestra 0
- Mientras nadie haya pegado al sitio en los últimos 30 minutos, el realtime es 0.
- Si hay tráfico real y aparece 0, revisá la regla de tráfico interno en GA4 — quizás
  está marcando todo como interno.

### Un empleado marcó su dispositivo pero sigue contado como externo
- Pedirle que confirme que el botón devolvió "Listo".
- Si usa otro navegador o modo incógnito, hay que volver a marcar.
- Verificar que `internal_team_devices` tiene su registro (Configuración > Dispositivos).
- El parámetro tarda hasta 24 horas en aparecer en reportes históricos de GA4
  (en realtime es inmediato).

### Tendencia de un producto en Equipo WhatsApp dice "↑ sube" pero el producto recién apareció
Es esperado: si en el período anterior tenía 0 vistas y ahora tiene N>0, es "↑ sube".

### El generador no me deja crear una campaña con un nombre que ya existe
El slug es único. Si ya existe `verano_2026`, la próxima se guarda como `verano_2026_2`.

## Archivos clave

```
app/metricas-web/
├── page.js                          (orquestador con tabs)
├── components/
│   ├── styles.js                    (estilos compartidos)
│   ├── Dashboard.js                 (tab principal: clientes externos)
│   ├── EquipoWhatsApp.js            (tab interna)
│   ├── GeneradorLinks.js            (paso a paso UTM)
│   ├── HistorialLinks.js            (tabla últimos 50)
│   └── Configuracion.js             (admin: caché, dispositivos, campañas)
app/marcar-interno/
└── page.js                          (página pública para empleados)
app/components/
└── GA4Script.js                     (gtag.js + flag interno en cada page load)
app/api/metricas-web/
├── ga4/route.js
├── campaigns/route.js
├── campaigns/[id]/route.js
├── links/route.js
├── internal-devices/route.js
├── mark-internal/route.js
└── cache-clear/route.js
lib/
└── ga4.js                           (cliente GA4 + helpers)
supabase/migrations/
└── 20260428_metricas_web.sql        (4 tablas + RLS)
```
