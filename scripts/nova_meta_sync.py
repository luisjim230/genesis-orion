#!/usr/bin/env python3
"""
NOVA Meta Sync — Sincroniza datos de Meta Ads con Supabase.

Modos:
  nightly   — últimos 3 días de insights (default)
  backfill  — últimos 6 meses de insights
  campaigns — solo metadata de campañas y adsets
  insights  — solo insights (últimos 3 días)
  pixel     — solo eventos del pixel

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


def meta_get(endpoint, params=None, token=None):
    """GET request to Meta API with retry logic."""
    if params is None:
        params = {}
    params["access_token"] = token
    url = f"{META_BASE}/{endpoint}"

    for attempt in range(3):
        try:
            r = requests.get(url, params=params, timeout=60)
            if r.status_code == 200:
                return r.json()
            data = r.json()
            err = data.get("error", {})
            # Rate limit — wait and retry
            if err.get("code") == 17 or err.get("code") == 32:
                wait = 60 * (attempt + 1)
                log.warning(f"Rate limit hit, esperando {wait}s...")
                time.sleep(wait)
                continue
            log.error(f"Meta API error {r.status_code}: {json.dumps(err, ensure_ascii=False)}")
            return None
        except requests.exceptions.Timeout:
            log.warning(f"Timeout en intento {attempt + 1}, reintentando...")
            time.sleep(10)
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
    """Sync adset metadata."""
    log.info("Sincronizando conjuntos de anuncios...")
    fields = "id,campaign_id,name,status,targeting,daily_budget,lifetime_budget"
    data = meta_get(f"{AD_ACCOUNT_ID}/adsets", {"fields": fields, "limit": 200}, token)
    if not data or "data" not in data:
        log.error("No se pudieron obtener adsets")
        return 0

    count = 0
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
        sb.table("meta_adsets").upsert(row, on_conflict="id").execute()
        count += 1

    log.info(f"  {count} adsets sincronizados")
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
def sync_insights(token, days_back=3):
    """Sync daily insights from Meta to Supabase."""
    since = (datetime.now() - timedelta(days=days_back)).strftime("%Y-%m-%d")
    until = datetime.now().strftime("%Y-%m-%d")
    log.info(f"Sincronizando insights: {since} → {until} ({days_back} días)...")

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
    data = meta_get(f"{AD_ACCOUNT_ID}/insights", params, token)

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

    log.info(f"  {total} registros de insights sincronizados")
    return total


# ─── Sync pixel events ──────────────────────────────────────────────
def sync_pixel(token):
    """Sync pixel event stats."""
    log.info("Sincronizando eventos del pixel...")
    total = 0

    for pixel_id in PIXEL_IDS:
        data = meta_get(
            f"{pixel_id}/stats",
            {"aggregation": "event", "start_time": int((datetime.now() - timedelta(days=7)).timestamp())},
            token,
        )
        if not data or "data" not in data:
            log.warning(f"  No se pudieron obtener stats del pixel {pixel_id}")
            continue

        today = datetime.now().strftime("%Y-%m-%d")
        for event in data["data"]:
            row = {
                "pixel_id": pixel_id,
                "event_name": event.get("event", event.get("event_name", "unknown")),
                "event_count": int(event.get("count", event.get("value", 0))),
                "date": today,
            }
            sb.table("meta_pixel_events").upsert(row).execute()
            total += 1

    log.info(f"  {total} eventos de pixel sincronizados")
    return total


# ─── Sync audiences ─────────────────────────────────────────────────
def sync_audiences(token):
    """Sync custom audiences."""
    log.info("Sincronizando audiencias...")
    fields = "id,name,subtype,approximate_count,data_source"
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
            "approximate_count": a.get("approximate_count"),
            "data_source": a.get("data_source"),
        }
        sb.table("meta_audiences").upsert(row, on_conflict="id").execute()
        count += 1

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
        if mode in ("nightly", "backfill", "campaigns"):
            try:
                n = sync_campaigns(token)
                total += n
                n2 = sync_adsets(token)
                total += n2
            except Exception as e:
                log.error(f"Error sincronizando campañas: {e}")
                errors.append(f"campaigns: {e}")

        if mode in ("nightly", "backfill", "insights"):
            try:
                days = 180 if mode == "backfill" else 3
                n = sync_insights(token, days_back=days)
                total += n
            except Exception as e:
                log.error(f"Error sincronizando insights: {e}")
                errors.append(f"insights: {e}")

        if mode in ("nightly", "backfill", "pixel"):
            try:
                n = sync_pixel(token)
                total += n
            except Exception as e:
                log.error(f"Error sincronizando pixel: {e}")
                errors.append(f"pixel: {e}")

        if mode in ("nightly", "backfill"):
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
