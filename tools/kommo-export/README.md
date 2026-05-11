# Kommo Export v2 — Depósito Jiménez

Descarga TODAS las conversaciones de WhatsApp del rango configurado (default: últimos 12 meses) para entrenar el agente IA. Funciona mes por mes para no perder leads viejos.

## Flujo

```bash
cd ~/kommo-export

# 1) Logueate una vez (guarda sesion.json)
node 1-login.js

# 2) Listá todos los leads del rango (escribe leads-pendientes.json)
node 2-listar-leads.js

# 3) Descargá las conversaciones lead por lead
node 3-descargar.js

# 4) Armá el dataset final
node 4-construir-dataset.js
```

## Configuración

Editá `config.js` para cambiar fechas o throttling.

## Outputs

```
export/AAAA-MM/lead_<id>/
  ├── conversacion.json   ← mensajes estructurados
  └── conversacion.html   ← snapshot del DOM (por si querés revisar)

dataset-entrenamiento.jsonl
dataset-por-vendedor/<Nombre>.jsonl
TODAS-LAS-CONVERSACIONES.{json,csv,txt}
estadisticas.txt
```

## Reanudar

Los scripts son idempotentes:
- `2-listar-leads.js` no pisa los IDs ya capturados.
- `3-descargar.js` saltea leads que ya tienen `conversacion.json`.

Si se cae a la mitad, volvé a correr el mismo comando.
