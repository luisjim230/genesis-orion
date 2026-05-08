# Hallazgos Pareto + Pricing — Mayo 2026

**Período analizado:** 2025-05-01 a 2026-04-30 (12 meses rolling completos)
**Universo:** 4,164 SKUs con venta · ₡2,878 millones venta neta · ₡933 millones utilidad bruta · margen ponderado 32.4%
**Fuente:** `neo_items_facturados` (Supabase project `xeeieqjqmtoiutfnltqu`)
**Exclusiones:** TRANSPORTE, RUTEO0557, código 42069, promos de transporte. Devoluciones netadas.

---

## 1) Hallazgos sorprendentes

### a. El producto #1 en ventas no entra en el podio de utilidad
**Hi Bond Pegamento Blanco Cartucho** vendió ₡42.9M (top 1 venta) pero genera apenas ₡12.7M utilidad por su margen de 29.6%. **AKIRO Aislante de Fibra de Vidrio** vendió ₡32.7M (no llega ni al top 20 de venta) pero genera ₡22.6M utilidad — 78% más utilidad con 24% menos venta. Hay **84 SKUs en el Pareto de venta que NO están en el de utilidad**, y **90 SKUs en el Pareto de utilidad que NO están en el de venta**. Esos 84 son candidatos directos a subir precio; los otros 90 son joyas ocultas que merecen pauta y stock asegurado.

### b. El cuadrante "A-Bajo" tiene el mayor potencial inexplotado del negocio
305 SKUs (cuadrante alto volumen, margen <30%) representan **₡1,267M en venta — 44% del total** — pero solo **₡274M en utilidad (29% del total)**. Hi Bond, Lámina Gypsum, Zinc por metro, Cemento, Tubería estructural galvanizada. Subir **5 puntos de margen** ahí = **+₡63M de utilidad anual** sin tocar volumen. Es el ROI más alto y más rápido del análisis.

### c. Categorías de importación arrastran el margen del negocio
Las top 5 categorías por margen ponderado son todas IMPORTACIÓN: Aislantes 69%, Importación Puertas de Vidrio 56%, Tablilla/Cornisas/Uniones 44%, Loza importada 45%, Grifería importada 55%. **Las categorías locales/commodity están entre 17–25% de margen** (tubería estructural, perling, agregados, cementos). Confirma que la tesis del negocio — importar de China — es donde está el dinero.

### d. ₡31.2 millones dormidos en 284 SKUs sin venta en 12 meses pero con stock
Tablilla PVC Artemis ARTEMIS MATE (171 unidades, ₡2.25M inmovilizados), múltiples cornisas e importaciones discontinuadas. Al 15% costo de capital: **₡4.7M/año de costo puro de oportunidad** sin ganar un colón. La categoría más golpeada es Importación Tablilla.

### e. MATERIAL SEGUNDA y REGALÍAS están vendiendo por debajo de costo
Material Segunda: -99% margen (₡6M venta vs ₡12.3M costo → pérdida bruta ₡6.1M). Regalías: -99.99% margen. **Esto último es esperado** (son promocionales) pero MATERIAL SEGUNDA debería estar al menos a costo o tener una política clara de descontinuado. Vale la pena revisar la lógica de costeo de esa categoría — quizás están imputando costo de inventario nuevo a producto rezagado.

---

## 2) 5 acciones ordenadas por ROI esperado

| # | Acción | Impacto estimado anual | Esfuerzo | Plazo |
|---|--------|-----------------------|----------|-------|
| 1 | **Subir 5pp de margen a los 305 SKUs del cuadrante A-Bajo** (priorizar TOP 30: pegamentos, gypsum, zinc, cemento, tubería estructural). Ojo: hay productos commodity con elasticidad alta — empezar con +2pp en lotes piloto. | **+₡63M** | Medio | 60-90 días |
| 2 | **Liquidar los 284 SKUs muertos con stock.** Vender al 50-70% del costo libera ₡15-20M en caja + ahorra ₡4.7M anuales de costo de oportunidad. Negociar paquetes con clientes mayoristas. | **+₡15M caja, +₡4.7M/año** | Medio | 30 días |
| 3 | **Empujar pauta y stock en IMPORTACIÓN GRIFERÍA, AISLANTES, TABLILLA y VENTANAS** (margen 44-69%). Si elevás 20% volumen en estas 4 categorías = +₡91M venta × 50% margen promedio = **+₡45M utilidad**. | **+₡45M** | Alto | 90-180 días |
| 4 | **Renegociar costo o aplicar piso de margen del 22% en TUBERÍA ESTRUCTURAL** (₹109M venta hoy a 16.9%). Subir 3pp = ₡3.3M; renegociar costo 3% con proveedor = otros ₡3.3M. | **+₡6.6M** | Bajo | 30 días |
| 5 | **Auditar política de costos en MATERIAL SEGUNDA**. Hoy el sistema reporta -99% margen — o el costo está mal cargado o hay que decidir descontinuar la línea. | **+₡6M** (si era error de costeo) | Bajo | 15 días |

**Total impacto top 3:** **₡123.7M de utilidad bruta adicional anual + ₡15M de caja inmediata** (sobre base actual de ₡933M de utilidad → +13%).

---

## 3) Recomendación específica para el módulo de Pricing

De las 5 capas conversadas en el chat principal, la que tiene **mayor ROI y menor riesgo** para construir primero es:

> **Capa 1 — Alarmas de erosión de margen para SKUs clase A**

**Por qué primero:**
- Los 617 SKUs clase A llevan el 80% de la venta. Una caída de 1pp de margen ahí ≈ ₡23M anuales perdidos.
- Hoy NO hay forma de detectar erosión silenciosa por descuentos del vendedor o cambios de tipo de cambio.
- El cuadrante A-Bajo (305 SKUs, ₡1,267M venta) es exactamente donde la alarma genera más valor: cualquiera de esos pierde 1pp y son ₡12.7M.

**Especificación mínima viable:**
1. Tabla `pricing_alertas_skus` con threshold por SKU (margen mínimo aceptable). Default: margen ponderado del SKU últimos 90 días menos 3pp.
2. Job nocturno que compare margen real de los últimos 7 días contra el threshold. Si <threshold → alerta a `sol_alertas` y mensaje vía bot SOL_DJ_BOT.
3. Vista en SOL: tabla con los 30 SKUs en alerta, ordenados por venta absoluta perdida × días en alerta.
4. **Fila base ya existe**: la hoja `Tabla_Verdad_Pricing` del Excel adjunto tiene los 707 SKUs clase A (venta ∪ utilidad) con todo lo necesario.

**Después de la capa 1 (orden sugerido):**
- Capa 2: Sugerencia de precio elástico (modelo simple de venta vs precio histórico).
- Capa 3: Vista de Pareto en vivo en SOL (refresh diario).
- Capa 4: Pricing por canal (mostrador vs proyectos).
- Capa 5: Predicción de quiebres y recomendación de sobreprecio en SKUs con stock bajo.

---

## Notas técnicas y supuestos

- **Margen** = (venta_neta − costo) / venta_neta. **Markup** = (venta_neta − costo) / costo. La columna `utilidad_costo` en NEO es markup % por línea, no monto en colones.
- Devoluciones se netearon a nivel de línea: `cantidad_neta = cantidad_facturada − cantidad_devuelta`; venta y costo recalculados sobre la cantidad neta.
- Para Top 10 de margen se aplicó piso de 5 unidades vendidas (anti-ruido por SKUs con 1 sola venta de margen extremo).
- 4,561 líneas con devolución ≈ ₡149M en valor (5.2% del bruto facturado).
- Los SKUs muertos cubren stock>0 y sin venta en el período. Los que figuran con `dias_sin_venta` negativo son SKUs nuevos que recién empezaron a vender (mayo 2026 parcial); el flag los marca como "RECIENTE".
- Mes de mayo 2026 es **parcial** (8 días al cierre del corte) — por eso el período rolling se cerró el 30 de abril 2026.
- ⚠️ **RLS desactivado** en 4 tablas de HERMES (`hermes_proformas_cabecera`, `hermes_proformas_items`, `hermes_config_tiers`, `hermes_seguimientos`). No afecta este análisis (Pareto usa `neo_items_facturados`) pero hay que revisarlo aparte.
