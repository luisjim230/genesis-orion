// Helper compartido para Google Analytics 4 Data API.
// - Resuelve credenciales de service account desde GA4_SERVICE_ACCOUNT_JSON
//   (acepta JSON directo o JSON codificado en base64).
// - Construye el dimensionFilter para `traffic_type` según el filtro pedido:
//     'external' → excluye eventos con traffic_type = "internal".
//     'internal' → solo eventos con traffic_type = "internal".
//     'all'      → sin filtro.
// - Cliente reutilizable (singleton) para evitar reconstruir la conexión.

import { BetaAnalyticsDataClient } from '@google-analytics/data';

let _client = null;
let _propertyId = null;

function loadCredentials() {
  const raw = process.env.GA4_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error('GA4_SERVICE_ACCOUNT_JSON no está configurado');
  let jsonStr = raw.trim();
  // Soporta base64 (recomendado para Vercel para evitar problemas con saltos de línea).
  if (!jsonStr.startsWith('{')) {
    try {
      jsonStr = Buffer.from(jsonStr, 'base64').toString('utf-8');
    } catch (e) {
      throw new Error('GA4_SERVICE_ACCOUNT_JSON no es JSON ni base64 válido');
    }
  }
  const creds = JSON.parse(jsonStr);
  // private_key suele venir con \n escapados.
  if (creds.private_key && creds.private_key.includes('\\n')) {
    creds.private_key = creds.private_key.replace(/\\n/g, '\n');
  }
  return creds;
}

export function getGA4Client() {
  if (_client) return _client;
  const creds = loadCredentials();
  // fallback: 'rest' fuerza al SDK a usar HTTP/REST en lugar de gRPC.
  // Vercel serverless functions no soportan gRPC (HTTP/2 long-lived),
  // sin esto la primera llamada falla con un error vacío "undefined undefined: undefined".
  _client = new BetaAnalyticsDataClient({
    credentials: {
      client_email: creds.client_email,
      private_key: creds.private_key,
    },
    projectId: creds.project_id,
    fallback: 'rest',
  });
  return _client;
}

export function getPropertyId() {
  if (_propertyId) return _propertyId;
  const id = process.env.GA4_PROPERTY_ID;
  if (!id) throw new Error('GA4_PROPERTY_ID no está configurado');
  _propertyId = String(id).replace(/^properties\//, '');
  return _propertyId;
}

export function getPropertyResource() {
  return `properties/${getPropertyId()}`;
}

// Construye el dimensionFilter según el modo de tráfico.
// Para GA4, los parámetros de evento custom se exponen como dimensión `customEvent:traffic_type`.
export function buildTrafficFilter(mode) {
  const m = String(mode || 'external').toLowerCase();
  if (m === 'all') return null;

  if (m === 'internal') {
    return {
      filter: {
        fieldName: 'customEvent:traffic_type',
        stringFilter: { matchType: 'EXACT', value: 'internal', caseSensitive: false },
      },
    };
  }

  // external por defecto: excluye sessions/events marcados como internal.
  // GA4 NotExpression con StringFilter sirve para "no es internal" (incluye los nulos/vacíos).
  return {
    notExpression: {
      filter: {
        fieldName: 'customEvent:traffic_type',
        stringFilter: { matchType: 'EXACT', value: 'internal', caseSensitive: false },
      },
    },
  };
}

// Helpers para parsear el query param `date_range` a fechas relativas.
export function parseDateRange(range) {
  const r = String(range || '7d').toLowerCase();
  const map = {
    'today':       { startDate: 'today', endDate: 'today' },
    'yesterday':   { startDate: 'yesterday', endDate: 'yesterday' },
    '7d':          { startDate: '7daysAgo', endDate: 'today' },
    '14d':         { startDate: '14daysAgo', endDate: 'today' },
    '28d':         { startDate: '28daysAgo', endDate: 'today' },
    '30d':         { startDate: '30daysAgo', endDate: 'today' },
    '90d':         { startDate: '90daysAgo', endDate: 'today' },
    'this_month':  { startDate: '30daysAgo', endDate: 'today' },
  };
  return map[r] || map['7d'];
}

// Devuelve el rango anterior (mismo largo) para comparativos de %.
// Si current = "NdaysAgo to today" (N+1 días), previous = "(2N+1)daysAgo to (N+1)daysAgo".
export function getPreviousRange(range) {
  const r = String(range || '7d').toLowerCase();
  const lengths = { 'today':1, 'yesterday':1, '7d':7, '14d':14, '28d':28, '30d':30, '90d':90, 'this_month':30 };
  const days = lengths[r] || 7;
  return { startDate: `${days * 2}daysAgo`, endDate: `${days + 1}daysAgo` };
}

// Calcula el % de cambio entre dos números, evitando división por cero.
export function pctChange(current, previous) {
  const c = Number(current) || 0;
  const p = Number(previous) || 0;
  if (p === 0) return c === 0 ? 0 : 100;
  return ((c - p) / p) * 100;
}
