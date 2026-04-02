#!/usr/bin/env python3
"""
NOVA Meta Sync — Sincroniza datos de Meta Ads con Supabase.

Modos:
  nightly   — últimos 3 días de insights (default)
  backfill  — últimos 6 meses de insights
  campaigns — solo metadata de campañas y adsets
  insights  — solo insights (últimos 3 días)
  pixel     — solo eventos del pixel
  posts     — publicaciones de Facebook e Instagram (historial completo)
  instagram — solo publicaciones de Instagram (historial completo)

Uso:
  python nova_meta_sync.py [nightly|backfill|campaigns|insights|pixel]

Variables de entorno:
  META_ACCESS_TOKEN     — Token de Meta (o se lee de meta_config)
  SUPABASE_URL          — URL del proyecto Supabase
  SUPABASE_SERVICE_KEY  — Service key de Supabase
"""

import os
import sys
import json
import time
import logging
from datetime import datetime, timedelta

import requests
from supabase import create_client

# ─── Config ─────────────────────────────────────────────────────────
META_API_VERSION = "v25.0"
META_BASE = f"https://graph.facebook.com/{META_API_VERSION}"
AD_ACCOUNT_ID = "act_15525261"
PIXEL_IDS = ["2872277373015010", "654302754772118"]

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://xeeieqjqmtoiutfnltqu.supabase.co")
SUPABASE_KEY = os.environ.get("SUPABASE_SERVICE_KEY", "")

# ─── Logging ────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
log = logging.getLogger("nova-meta-sync")

# ─── Supabase client ────────────────────────────────────────────────
sb = create_client(SUPABASE_URL, SUPABASE_KEY)


def get_meta_token():
    """Get Meta token from env var or meta_config table."""
    token = os.environ.get("META_ACCESS_TOKEN")
    if token:
        return token
    try:
        res = sb.table("meta_config").select("value").eq("key", "access_token").single().execute()
        return res.data["value"]
    except Exception as e:
        log.error(f"No se pudo obtener el token de Meta: {e}")
        sys.exit(1)


def meta_get(endpoint, params=None, token=None, retries=3, rate_limit_wait=300):
    """GET request to Meta API.
    rate_limit_wait: seconds to wait on rate limit before retrying (default 5 min).
    Set to 0 to fail fast on rate limit (useful in backfill batch loops).
    """
    if params is None:
        params = {}
    params["access_token"] = token
    url = f"{META_BASE}/{endpoint}"

    for attempt in range(retries):
        try:
            r = requests.get(url, params=params, timeout=90)
            if r.status_code == 200:
                return r.json()
            data = r.json()
            err = data.get("error", {})
            code = err.get("code")
            # Rate limit (4) or throttle (17, 32)
            if code in (4, 17, 32):
                if rate_limit_wait == 0 or attempt == retries - 1:
                    log.warning(f"Rate limit (código {code}) — sin más reintentos, pasando al siguiente batch")
                    return None
                log.warning(f"Rate limit (código {code}), esperando {rate_limit_wait}s (intento {attempt+1}/{retries})...")
                time.sleep(rate_limit_wait)
                continue
            log.error(f"Meta API error {r.status_code}: {json.dumps(err, ensure_ascii=False)}")
            return None
        except requests.exceptions.Timeout:
            log.warning(f"Timeout en intento {attempt + 1}, reintentando en 30s...")
            time.sleep(30)
        except Exception as e:
            log.error(f"Error en request: {e}")
            return None
    return None


# ─── Sync campaigns ─────────────────────────────────────────────────
def sync_campaigns(token):
    """Sync campaign metadata from Meta to Supabase."""
    log.info("Sincronizando campañas...")
    fields = "id,name,objective,status,daily_budget,lifetime_budget,created_time,start_time,stop_time"
    data = meta_get(f"{AD_ACCOUNT_ID}/campaigns", {"fields": fields, "limit": 200}, token)
    if not data or "data" not in data:
        log.error("No se pudieron obtener campañas")
        return 0

    campaigns = data["data"]
    count = 0
    for c in campaigns:
        row = {
            "id": c["id"],
            "name": c["name"],
            "objective": c.get("objective"),
            "status": c.get("status"),
            "daily_budget": float(c["daily_budget"]) / 100 if c.get("daily_budget") else None,
            "lifetime_budget": float(c["lifetime_budget"]) / 100 if c.get("lifetime_budget") else None,
            "created_time": c.get("created_time"),
            "start_time": c.get("start_time"),
            "stop_time": c.get("stop_time"),
        }
        sb.table("meta_campaigns").upsert(row, on_conflict="id").execute()
        count += 1

    log.info(f"  {count} campañas sincronizadas")
    return count


# ─── Sync adsets ─────────────────────────────────────────────────────
def sync_adsets(token):
    """Sync adset metadata. Skips adsets with orphaned campaign_ids."""
    log.info("Sincronizando conjuntos de anuncios...")
    fields = "id,campaign_id,name,status,targeting,daily_budget,lifetime_budget"
    data = meta_get(f"{AD_ACCOUNT_ID}/adsets", {"fields": fields, "limit": 500}, token)
    if not data or "data" not in data:
        log.error("No se pudieron obtener adsets")
        return 0

    count = 0
    skipped = 0
    for a in data["data"]:
        row = {
            "id": a["id"],
            "campaign_id": a.get("campaign_id"),
            "name": a["name"],
            "status": a.get("status"),
            "targeting": a.get("targeting"),
            "daily_budget": float(a["daily_budget"]) / 100 if a.get("daily_budget") else None,
            "lifetime_budget": float(a["lifetime_budget"]) / 100 if a.get("lifetime_budget") else None,
        }
        try:
            sb.table("meta_adsets").upsert(row, on_conflict="id").execute()
            count += 1
        except Exception as e:
            # Skip adsets with orphaned campaign_ids (deleted campaigns)
            skipped += 1
            log.debug(f"  Adset {a['id']} ignorado: {e}")

    log.info(f"  {count} adsets sincronizados, {skipped} ignorados (campañas borradas)")
    return count


# ─── Extract action value ────────────────────────────────────────────
def extract_action(actions, action_type):
    """Extract a specific action value from Meta's actions array."""
    if not actions:
        return 0
    for a in actions:
        if a.get("action_type") == action_type:
            return int(float(a.get("value", 0)))
    return 0


def extract_action_value(action_values, action_type):
    """Extract monetary value from Meta's action_values array."""
    if not action_values:
        return 0
    for a in action_values:
        if a.get("action_type") == action_type:
            return float(a.get("value", 0))
    return 0


# ─── Sync insights ──────────────────────────────────────────────────
def sync_insights_range(token, since, until):
    """Sync insights for a specific date range. Returns number of records synced.
    Uses rate_limit_wait=0 so rate limits fail fast (caller handles retry logic).
    """
    fields = (
        "campaign_id,campaign_name,spend,impressions,reach,clicks,ctr,cpc,"
        "actions,cost_per_action_type,action_values"
    )
    params = {
        "fields": fields,
        "time_range": json.dumps({"since": since, "until": until}),
        "time_increment": 1,
        "level": "campaign",
        "limit": 500,
    }

    total = 0
    data = meta_get(f"{AD_ACCOUNT_ID}/insights", params, token, rate_limit_wait=0)
    if not data:
        return 0

    while data and "data" in data:
        for row in data["data"]:
            actions = row.get("actions", [])
            cost_per_action = row.get("cost_per_action_type", [])
            action_values = row.get("action_values", [])

            record = {
                "campaign_id": row["campaign_id"],
                "campaign_name": row["campaign_name"],
                "date": row["date_start"],
                "spend": float(row.get("spend", 0)),
                "impressions": int(row.get("impressions", 0)),
                "reach": int(row.get("reach", 0)),
                "clicks": int(row.get("clicks", 0)),
                "ctr": float(row.get("ctr", 0)),
                "cpc": float(row.get("cpc", 0)),
                "messaging_connections": extract_action(actions, "onsite_conversion.total_messaging_connection"),
                "conversations_started": extract_action(actions, "onsite_conversion.messaging_conversation_started_7d"),
                "conversations_replied": extract_action(actions, "onsite_conversion.messaging_conversation_replied_7d"),
                "link_clicks": extract_action(actions, "link_click"),
                "landing_page_views": extract_action(actions, "landing_page_view"),
                "purchases": extract_action(actions, "purchase"),
                "purchase_value": extract_action_value(action_values, "purchase"),
                "add_to_cart": extract_action(actions, "add_to_cart"),
                "initiate_checkout": extract_action(actions, "initiate_checkout"),
                "post_reactions": extract_action(actions, "post_reaction"),
                "post_saves": extract_action(actions, "onsite_conversion.post_save"),
                "comments": extract_action(actions, "comment"),
                "video_views": extract_action(actions, "video_view"),
                "actions_raw": actions if actions else None,
                "cost_per_action_raw": cost_per_action if cost_per_action else None,
                "action_values_raw": action_values if action_values else None,
            }

            sb.table("meta_insights_daily").upsert(
                record,
                on_conflict="campaign_id,date",
            ).execute()
            total += 1

        # Pagination
        paging = data.get("paging", {})
        next_url = paging.get("next")
        if next_url:
            try:
                r = requests.get(next_url, timeout=60)
                data = r.json() if r.status_code == 200 else None
            except Exception:
                data = None
        else:
            data = None

    return total


def sync_insights(token, days_back=3, start_override=None):
    """Sync daily insights from Meta to Supabase.
    For backfills > 30 days, splits into 14-day batches to avoid Meta API limits.
    start_override: date object — if set, ignores days_back and uses this as start.
    """
    end_date = datetime.now().date()
    start_date = start_override if start_override else end_date - timedelta(days=days_back)
    log.info(f"Sincronizando insights: {start_date} → {end_date} ({days_back} días)...")

    total = 0

    if days_back <= 30:
        # Single request for short ranges
        total = sync_insights_range(
            token,
            start_date.strftime("%Y-%m-%d"),
            end_date.strftime("%Y-%m-%d"),
        )
    else:
        # Batch into 14-day chunks with 90s pause between batches for backfills
        # Smaller batches + longer pauses to avoid the Insights API rate limit
        batch_size = 14
        batch_pause = 90  # seconds between batches
        current = start_date
        batch_num = 0
        while current < end_date:
            batch_end = min(current + timedelta(days=batch_size - 1), end_date)
            batch_num += 1
            log.info(f"  Batch {batch_num}: {current} → {batch_end}")
            n = sync_insights_range(
                token,
                current.strftime("%Y-%m-%d"),
                batch_end.strftime("%Y-%m-%d"),
            )
            total += n
            log.info(f"    {n} registros en este batch (acumulado: {total})")
            current = batch_end + timedelta(days=1)
            # Pause between batches to respect Meta rate limits
            if current < end_date:
                log.info(f"    Pausa de {batch_pause}s antes del siguiente batch...")
                time.sleep(batch_pause)

    log.info(f"  {total} registros de insights sincronizados en total")
    return total


# ─── Sync pixel events ──────────────────────────────────────────────
def sync_pixel(token):
    """Sync pixel event stats.

    The /stats endpoint returns hourly buckets:
      { "data": [ { "start_time": "...", "aggregation": "event",
                    "data": [ {"value": "PageView", "count": 820}, ... ] }, ... ] }
    We aggregate all buckets into daily totals keyed by event name.
    """
    log.info("Sincronizando eventos del pixel...")
    total = 0
    today = datetime.now().strftime("%Y-%m-%d")
    # Cover the last 3 days to catch any late-arriving events
    since = int((datetime.now() - timedelta(days=3)).timestamp())

    for pixel_id in PIXEL_IDS:
        data = meta_get(
            f"{pixel_id}/stats",
            {"aggregation": "event", "start_time": since},
            token,
        )
        if not data or "data" not in data:
            log.warning(f"  No se pudieron obtener stats del pixel {pixel_id}")
            continue

        # Aggregate counts per event across all hourly buckets
        event_totals: dict[str, int] = {}
        for bucket in data["data"]:
            for item in bucket.get("data", []):
                name = item.get("value", "unknown")
                count = int(item.get("count", 0))
                event_totals[name] = event_totals.get(name, 0) + count

        if not event_totals:
            log.info(f"  Pixel {pixel_id}: sin eventos en el período")
            continue

        for event_name, event_count in event_totals.items():
            row = {
                "pixel_id": pixel_id,
                "event_name": event_name,
                "event_count": event_count,
                "date": today,
            }
            sb.table("meta_pixel_events").upsert(
                row,
                on_conflict="pixel_id,event_name,date",
            ).execute()
            total += 1
            log.info(f"  {pixel_id} | {event_name}: {event_count}")

    log.info(f"  {total} eventos de pixel sincronizados")
    return total


# ─── Sync page posts (organic) ──────────────────────────────────────
def sync_page_posts(token, full=False):
    """Sync organic Facebook page posts and their insights.

    full=True  → desde 2025-01-01 (historial completo)
    full=False → últimos 90 días (nightly/incremental)

    Fetches posts and pulls per-post insight metrics:
    impressions, reach, reactions, comments, shares, saves, video views, clicks.
    Also flags which posts have an associated paid campaign.
    After saving posts, aggregates daily totals into social_metricas.
    """
    log.info("Sincronizando publicaciones de la página...")

    page_id_res = sb.table("meta_config").select("value").eq("key", "page_id").single().execute()
    page_id = page_id_res.data["value"] if page_id_res.data else None
    if not page_id:
        log.warning("  page_id no configurado en meta_config — omitiendo sync de posts")
        return 0

    # La nueva experiencia de páginas requiere un page access token (no user token).
    # Lo obtenemos via /me/accounts usando el user token.
    page_token = token
    try:
        accounts = meta_get("me/accounts", {"fields": "id,access_token"}, token)
        if accounts and "data" in accounts:
            match = next((a for a in accounts["data"] if a.get("id") == page_id), None)
            if match and match.get("access_token"):
                page_token = match["access_token"]
                log.info("  Page access token obtenido correctamente")
            else:
                log.warning(f"  Página {page_id} no encontrada en /me/accounts — usando user token")
        else:
            log.warning("  No se pudo obtener /me/accounts — usando user token")
    except Exception as e:
        log.warning(f"  Error obteniendo page token: {e} — usando user token")

    from datetime import date as _date
    if full:
        since_ts = int(datetime(_date(2025, 1, 1).year, 1, 1).timestamp())
        log.info("  Modo full: desde 2025-01-01")
    else:
        since_ts = int((datetime.now() - timedelta(days=90)).timestamp())
    fields = "id,message,story,created_time,full_picture,permalink_url,attachments{type},shares,comments.summary(true){id},reactions.summary(true){id}"
    data = meta_get(
        f"{page_id}/posts",
        {"fields": fields, "since": since_ts, "limit": 100},
        page_token,
    )
    if not data or "data" not in data:
        log.warning("  No se pudieron obtener publicaciones de la página")
        return 0

    posts = data["data"]
    # Paginate if needed
    while data.get("paging", {}).get("next"):
        try:
            r = requests.get(data["paging"]["next"], timeout=60)
            data = r.json() if r.status_code == 200 else {}
            posts.extend(data.get("data", []))
        except Exception:
            break

    log.info(f"  {len(posts)} publicaciones encontradas")

    # Get campaign names to flag which posts were pauteadas
    paid_names = set()
    try:
        campaigns = sb.table("meta_campaigns").select("name").execute()
        paid_names = {c["name"].lower().strip() for c in (campaigns.data or [])}
    except Exception:
        pass

    # La API de insights por post no está disponible en la nueva experiencia de páginas de Meta.
    # Todos los datos se obtienen directamente de los campos del post.
    total = 0
    for post in posts:
        post_id = post["id"]
        created = post.get("created_time")
        message = post.get("message", post.get("story", ""))
        attachment = post.get("attachments", {}).get("data", [{}])[0]
        post_type = attachment.get("type", "status")

        reactions = int(post.get("reactions", {}).get("summary", {}).get("total_count", 0) or 0)
        comments  = int(post.get("comments", {}).get("summary", {}).get("total_count", 0) or 0)
        shares    = int(post.get("shares", {}).get("count", 0)) if isinstance(post.get("shares"), dict) else 0
        saves     = 0
        clicks    = 0
        impressions = 0
        reach       = 0
        engaged     = 0
        video_views = 0
        video_organic = 0
        negative    = 0

        # Engagement rate = engaged / reach
        eng_rate = round(engaged / reach, 4) if reach > 0 else 0

        # Flag if post title matches a campaign name (rough heuristic)
        has_paid = any(w in message.lower() for w in paid_names) if message else False

        row = {
            "id": post_id,
            "page_id": page_id,
            "message": message[:2000] if message else None,
            "created_time": created,
            "post_type": post_type,
            "permalink_url": post.get("permalink_url"),
            "full_picture": post.get("full_picture"),
            "impressions": impressions,
            "impressions_unique": reach,
            "engaged_users": engaged,
            "reactions": reactions,
            "comments": comments,
            "shares": shares,
            "saves": saves,
            "video_views": video_views,
            "video_views_organic": video_organic,
            "clicks": clicks,
            "negative_feedback": negative,
            "engagement_rate": eng_rate,
            "has_paid_campaign": has_paid,
            "synced_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }

        sb.table("meta_page_posts").upsert(row, on_conflict="id").execute()
        total += 1

    log.info(f"  {total} publicaciones sincronizadas")

    # ── Agregar en social_metricas (diario, plataforma=facebook) ──────
    _aggregate_posts_to_social_metricas(fb_page_id=page_id)

    return total


def _aggregate_posts_to_social_metricas(fb_page_id=None):
    """Roll up meta_page_posts into social_metricas (daily Facebook row).

    Groups all posts by publish date and sums likes, comments, shares,
    video views. Also records the best-performing post of each day and
    the page fan count. Upserts into social_metricas so the Social
    module Dashboard gets automatic Facebook data without manual entry.
    """
    log.info("  Agregando posts en social_metricas...")
    try:
        q = sb.table("meta_page_posts").select(
            "created_time,reactions,comments,shares,video_views,"
            "impressions_unique,engaged_users,message,permalink_url"
        )
        if fb_page_id:
            q = q.eq("page_id", fb_page_id)
        rows = q.execute()
        if not rows.data:
            return

        # Get page fan count from meta_config
        fan_count = 0
        try:
            fc = sb.table("meta_config").select("value").eq("key", "page_fan_count").single().execute()
            fan_count = int(fc.data["value"]) if fc.data else 0
        except Exception:
            pass

        daily: dict = {}
        for p in rows.data:
            ct = p.get("created_time", "")
            if not ct:
                continue
            day = ct[:10]
            if day not in daily:
                daily[day] = {"likes": 0, "comentarios": 0, "compartidos": 0,
                               "views": 0, "reach": 0, "engaged": 0,
                               "mejor_reactions": 0, "mejor_post": ""}
            d = daily[day]
            likes = int(p.get("reactions", 0) or 0)
            d["likes"]       += likes
            d["comentarios"] += int(p.get("comments", 0) or 0)
            d["compartidos"] += int(p.get("shares", 0) or 0)
            d["views"]       += int(p.get("video_views", 0) or 0)
            d["reach"]       += int(p.get("impressions_unique", 0) or 0)
            d["engaged"]     += int(p.get("engaged_users", 0) or 0)
            # Track best post of the day
            if likes > d["mejor_reactions"]:
                d["mejor_reactions"] = likes
                msg = p.get("message", "") or ""
                d["mejor_post"] = msg[:120] if msg else (p.get("permalink_url") or "")

        for day, d in daily.items():
            eng = round(d["engaged"] / d["reach"], 4) if d["reach"] > 0 else 0
            metricas_row = {
                "fecha": day,
                "plataforma": "facebook",
                "seguidores": fan_count,
                "likes": d["likes"],
                "comentarios": d["comentarios"],
                "compartidos": d["compartidos"],
                "views": d["views"],
                "engagement_rate": eng,
                "mejor_post": d["mejor_post"],
                "creado_en": datetime.now().isoformat(),
            }
            sb.table("social_metricas").upsert(
                metricas_row, on_conflict="fecha,plataforma"
            ).execute()

        log.info(f"    {len(daily)} días agregados en social_metricas")
    except Exception as e:
        log.warning(f"  Error agregando social_metricas: {e}")


# ─── Sync Facebook page-level insights ─────────────────────────────
def sync_facebook_page_insights(token, days_back=90):
    """Sync page-level daily insights into social_metricas (plataforma=facebook).

    Métricas disponibles con read_insights + new pages experience:
      page_views_total        → views
      page_video_views        → video views (suma al campo views)
      page_post_engagements   → engaged_users → engagement_rate
      page_fan_adds_by_paid_non_paid_unique → nuevos_seguidores
      page_actions_post_reactions_total     → likes (sum all reaction types)

    Se corre en batches de 90 días (límite de la API).
    """
    log.info("Sincronizando insights de página de Facebook...")

    page_id_res = sb.table("meta_config").select("value").eq("key", "page_id").single().execute()
    page_id = page_id_res.data["value"] if page_id_res.data else None
    if not page_id:
        log.warning("  page_id no configurado — omitiendo page insights")
        return 0

    page_token = token
    try:
        r = requests.get(
            f"{META_BASE}/{page_id}",
            params={"fields": "access_token,fan_count", "access_token": token},
            timeout=30,
        )
        d = r.json()
        page_token = d.get("access_token", token)
        fan_count = int(d.get("fan_count", 0) or 0)
        # Update fan count in meta_config
        if fan_count:
            sb.table("meta_config").upsert({"key": "page_fan_count", "value": str(fan_count)}, on_conflict="key").execute()
    except Exception as e:
        log.warning(f"  Error obteniendo page token: {e}")
        fan_count = 0

    end_date = datetime.now().date()
    start_date = end_date - timedelta(days=days_back)

    metrics = "page_views_total,page_video_views,page_post_engagements,page_fan_adds_by_paid_non_paid_unique,page_actions_post_reactions_total"

    try:
        r = requests.get(
            f"{META_BASE}/{page_id}/insights",
            params={
                "metric": metrics,
                "period": "day",
                "since": start_date.strftime("%Y-%m-%d"),
                "until": end_date.strftime("%Y-%m-%d"),
                "access_token": page_token,
            },
            timeout=60,
        )
        data = r.json()
        if "error" in data:
            log.error(f"  Error page insights: {data['error']}")
            return 0
    except Exception as e:
        log.error(f"  Request error page insights: {e}")
        return 0

    # Parse into daily dict
    daily: dict = {}
    for metric_block in data.get("data", []):
        name = metric_block["name"]
        for v in metric_block.get("values", []):
            day = v["end_time"][:10]
            if day not in daily:
                daily[day] = {"views": 0, "engaged": 0, "nuevos_seg": 0, "likes": 0}
            val = v.get("value", 0)
            if name == "page_views_total":
                daily[day]["views"] += int(val or 0)
            elif name == "page_video_views":
                daily[day]["views"] += int(val or 0)
            elif name == "page_post_engagements":
                daily[day]["engaged"] += int(val or 0)
            elif name == "page_fan_adds_by_paid_non_paid_unique":
                if isinstance(val, dict):
                    daily[day]["nuevos_seg"] += int(val.get("total", 0) or 0)
                else:
                    daily[day]["nuevos_seg"] += int(val or 0)
            elif name == "page_actions_post_reactions_total":
                if isinstance(val, dict):
                    daily[day]["likes"] += sum(int(x or 0) for x in val.values())
                else:
                    daily[day]["likes"] += int(val or 0)

    total = 0
    for day, d in daily.items():
        row = {
            "fecha": day,
            "plataforma": "facebook",
            "seguidores": fan_count,
            "views": d["views"],
            "likes": d["likes"],
            "nuevos_seguidores": d["nuevos_seg"],
            "engagement_rate": round(d["engaged"] / max(d["views"], 1) * 100, 2) if d["views"] > 0 else 0,
            "creado_en": datetime.now().isoformat(),
        }
        sb.table("social_metricas").upsert(row, on_conflict="fecha,plataforma").execute()
        total += 1

    log.info(f"  {total} días de page insights de Facebook actualizados")
    return total


# ─── Sync Instagram posts ───────────────────────────────────────────
def sync_instagram_posts(token, full=False):
    """Sync Instagram Business account media into meta_page_posts.

    full=True  → desde 2025-01-01 (historial completo)
    full=False → últimos 90 días (nightly/incremental)

    Campos disponibles con instagram_basic:
      like_count, comments_count, media_type, permalink, caption, timestamp
    (instagram_manage_insights no está habilitado → sin impresiones/reach/saved)
    """
    log.info("Sincronizando publicaciones de Instagram...")

    # ── Obtener page token y IG account ID ────────────────────────────
    page_id_res = sb.table("meta_config").select("value").eq("key", "page_id").single().execute()
    page_id = page_id_res.data["value"] if page_id_res.data else None
    if not page_id:
        log.warning("  page_id no configurado — omitiendo sync Instagram")
        return 0

    page_token = token
    ig_id = None
    try:
        r = requests.get(
            f"{META_BASE}/{page_id}",
            params={"fields": "access_token,instagram_business_account", "access_token": token},
            timeout=30,
        )
        data = r.json()
        page_token = data.get("access_token", token)
        ig_id = data.get("instagram_business_account", {}).get("id")
    except Exception as e:
        log.warning(f"  Error obteniendo page token/IG ID: {e}")

    if not ig_id:
        log.warning("  No hay Instagram Business Account vinculado a la página")
        return 0

    # Guardar/actualizar ig_id en meta_config para referencia
    try:
        sb.table("meta_config").upsert(
            {"key": "instagram_business_account_id", "value": ig_id},
            on_conflict="key"
        ).execute()
    except Exception:
        pass

    # ── Follower count ─────────────────────────────────────────────────
    followers = 0
    try:
        r = requests.get(
            f"{META_BASE}/{ig_id}",
            params={"fields": "followers_count,username", "access_token": page_token},
            timeout=30,
        )
        ig_info = r.json()
        followers = int(ig_info.get("followers_count", 0) or 0)
        log.info(f"  @{ig_info.get('username')} — {followers:,} seguidores")
    except Exception as e:
        log.warning(f"  No se pudo obtener info de IG: {e}")

    # ── Paginar medios ─────────────────────────────────────────────────
    from datetime import date as _date
    since_ts = None
    if full:
        since_ts = int(datetime(_date(2025, 1, 1).year, 1, 1).timestamp())
        log.info("  Modo full: desde 2025-01-01")
    else:
        since_ts = int((datetime.now() - timedelta(days=90)).timestamp())

    fields = "id,caption,timestamp,media_type,like_count,comments_count,permalink,thumbnail_url,media_url"
    params = {"fields": fields, "limit": 100, "access_token": page_token}
    if since_ts:
        params["since"] = since_ts

    posts = []
    url = f"{META_BASE}/{ig_id}/media"
    while url:
        try:
            r = requests.get(url, params=params, timeout=90)
            data = r.json()
            params = None  # URL siguiente ya tiene todo
            if "error" in data:
                log.error(f"  Error IG media: {data['error']}")
                break
            posts.extend(data.get("data", []))
            url = data.get("paging", {}).get("next")
        except Exception as e:
            log.error(f"  Error fetching IG media: {e}")
            break

    log.info(f"  {len(posts)} publicaciones encontradas en Instagram")

    # ── Guardar en meta_page_posts ─────────────────────────────────────
    total = 0
    for post in posts:
        row = {
            "id": post["id"],
            "page_id": ig_id,
            "message": (post.get("caption") or "")[:2000] or None,
            "created_time": post.get("timestamp"),
            "post_type": (post.get("media_type") or "IMAGE").lower(),
            "permalink_url": post.get("permalink"),
            "full_picture": post.get("thumbnail_url") or post.get("media_url"),
            "impressions": 0,
            "impressions_unique": 0,
            "engaged_users": 0,
            "reactions": int(post.get("like_count", 0) or 0),
            "comments": int(post.get("comments_count", 0) or 0),
            "shares": 0,
            "saves": 0,
            "video_views": 0,
            "video_views_organic": 0,
            "clicks": 0,
            "negative_feedback": 0,
            "engagement_rate": 0,
            "has_paid_campaign": False,
            "synced_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
        }
        try:
            sb.table("meta_page_posts").upsert(row, on_conflict="id").execute()
            total += 1
        except Exception as e:
            log.warning(f"  Post IG {post['id']} ignorado: {e}")

    log.info(f"  {total} publicaciones de Instagram sincronizadas")

    # ── Agregar en social_metricas (plataforma=instagram) ─────────────
    _aggregate_ig_to_social_metricas(ig_id, followers)

    return total


def _aggregate_ig_to_social_metricas(ig_id, followers_count):
    """Agrega posts de Instagram en social_metricas por día."""
    log.info("  Agregando Instagram en social_metricas...")
    try:
        rows = sb.table("meta_page_posts").select(
            "created_time,reactions,comments,message,permalink_url"
        ).eq("page_id", ig_id).execute()

        if not rows.data:
            log.info("    Sin posts de Instagram para agregar")
            return

        daily: dict = {}
        for p in rows.data:
            ct = p.get("created_time", "")
            if not ct:
                continue
            day = ct[:10]
            if day not in daily:
                daily[day] = {"likes": 0, "comentarios": 0,
                              "mejor_reactions": 0, "mejor_post": ""}
            d = daily[day]
            likes = int(p.get("reactions", 0) or 0)
            d["likes"] += likes
            d["comentarios"] += int(p.get("comments", 0) or 0)
            if likes > d["mejor_reactions"]:
                d["mejor_reactions"] = likes
                msg = p.get("message", "") or ""
                d["mejor_post"] = msg[:120] if msg else (p.get("permalink_url") or "")

        for day, d in daily.items():
            row = {
                "fecha": day,
                "plataforma": "instagram",
                "seguidores": followers_count,
                "likes": d["likes"],
                "comentarios": d["comentarios"],
                "compartidos": 0,
                "views": 0,
                "engagement_rate": 0,
                "mejor_post": d["mejor_post"],
                "creado_en": datetime.now().isoformat(),
            }
            sb.table("social_metricas").upsert(row, on_conflict="fecha,plataforma").execute()

        log.info(f"    {len(daily)} días de Instagram agregados en social_metricas")
    except Exception as e:
        log.warning(f"  Error agregando Instagram social_metricas: {e}")


# ─── Sync audiences ─────────────────────────────────────────────────
def sync_audiences(token):
    """Sync custom audiences. Uses approximate_count_lower_bound since
    approximate_count was deprecated in Meta API v21+."""
    log.info("Sincronizando audiencias...")
    # approximate_count was deprecated; use lower/upper bound fields instead
    fields = "id,name,subtype,approximate_count_lower_bound,data_source"
    data = meta_get(f"{AD_ACCOUNT_ID}/customaudiences", {"fields": fields, "limit": 100}, token)
    if not data or "data" not in data:
        log.warning("No se pudieron obtener audiencias (puede que no haya ninguna)")
        return 0

    count = 0
    for a in data["data"]:
        row = {
            "id": a["id"],
            "name": a["name"],
            "subtype": a.get("subtype"),
            "approximate_count": a.get("approximate_count_lower_bound"),
            "data_source": a.get("data_source"),
        }
        try:
            sb.table("meta_audiences").upsert(row, on_conflict="id").execute()
            count += 1
        except Exception as e:
            log.warning(f"  Audiencia {a['id']} ignorada: {e}")

    log.info(f"  {count} audiencias sincronizadas")
    return count


# ─── Log sync ────────────────────────────────────────────────────────
def log_sync(sync_type, status, records=0, error=None):
    """Write entry to meta_sync_log."""
    sb.table("meta_sync_log").insert({
        "sync_type": sync_type,
        "status": status,
        "records_synced": records,
        "error_message": error,
        "started_at": datetime.utcnow().isoformat(),
        "finished_at": datetime.utcnow().isoformat(),
    }).execute()


# ─── Main ────────────────────────────────────────────────────────────
def main():
    mode = sys.argv[1] if len(sys.argv) > 1 else "nightly"
    log.info(f"═══ NOVA Meta Sync — modo: {mode} ═══")

    token = get_meta_token()
    total = 0
    errors = []

    try:
        # ── INSIGHTS PRIMERO — usa la cuota de API más fresca ──────────
        if mode in ("nightly", "backfill", "insights", "full_history"):
            try:
                if mode == "full_history":
                    # Todo 2025 + lo que va de 2026
                    from datetime import date as _date
                    n = sync_insights(token, start_override=_date(2025, 1, 1))
                elif mode == "backfill":
                    n = sync_insights(token, days_back=180)
                else:
                    n = sync_insights(token, days_back=3)
                total += n
            except Exception as e:
                log.error(f"Error sincronizando insights: {e}")
                errors.append(f"insights: {e}")

        # ── Pixel (pocas llamadas, va segundo) ─────────────────────────
        if mode in ("nightly", "backfill", "full_history", "pixel"):
            try:
                n = sync_pixel(token)
                total += n
            except Exception as e:
                log.error(f"Error sincronizando pixel: {e}")
                errors.append(f"pixel: {e}")

        # ── Campañas y adsets (muchas llamadas, van al final) ──────────
        if mode in ("nightly", "backfill", "full_history", "campaigns"):
            try:
                n = sync_campaigns(token)
                total += n
                n2 = sync_adsets(token)
                total += n2
            except Exception as e:
                log.error(f"Error sincronizando campañas: {e}")
                errors.append(f"campaigns: {e}")

        # ── Publicaciones orgánicas de la página ───────────────────────
        if mode in ("nightly", "backfill", "full_history", "posts"):
            try:
                full_posts = mode in ("full_history", "posts")
                n = sync_page_posts(token, full=full_posts)
                total += n
            except Exception as e:
                log.error(f"Error sincronizando posts: {e}")
                errors.append(f"posts: {e}")

        # ── Publicaciones de Instagram ──────────────────────────────────
        if mode in ("nightly", "backfill", "full_history", "posts", "instagram"):
            try:
                full_ig = mode in ("full_history", "posts", "instagram")
                n = sync_instagram_posts(token, full=full_ig)
                total += n
            except Exception as e:
                log.error(f"Error sincronizando Instagram: {e}")
                errors.append(f"instagram: {e}")

        # ── Page-level insights de Facebook (views, engagement reales) ──
        if mode in ("nightly", "backfill", "full_history", "posts", "page_insights"):
            try:
                days = 90 if mode in ("backfill", "full_history", "posts", "page_insights") else 7
                n = sync_facebook_page_insights(token, days_back=days)
                total += n
            except Exception as e:
                log.error(f"Error sincronizando page insights: {e}")
                errors.append(f"page_insights: {e}")

        # ── Audiencias ─────────────────────────────────────────────────
        if mode in ("nightly", "backfill", "full_history"):
            try:
                n = sync_audiences(token)
                total += n
            except Exception as e:
                log.error(f"Error sincronizando audiencias: {e}")
                errors.append(f"audiences: {e}")

        status = "error" if errors else "ok"
        if errors and total > 0:
            status = "parcial"

        log_sync(mode, status, total, "; ".join(errors) if errors else None)
        log.info(f"═══ Completado: {total} registros, estado: {status} ═══")

    except Exception as e:
        log.error(f"Error fatal: {e}")
        log_sync(mode, "error", 0, str(e))
        sys.exit(1)


if __name__ == "__main__":
    main()
