# Rifa de Motos — "Club de Acciones" (spec viva)

App hermana del Club del Enchapador. Reusa la misma máquina (matching de facturas
NEO por dígitos + monto, tablas con RLS, RPC `SECURITY DEFINER`, página pública
con anon key, panel admin con service role). La diferencia: en vez de **puntos
canjeables** se acumulan **acciones** para un **sorteo de motos**.

## Mecánica de acciones (modelo propuesto — todo configurable en `rifa_config`)

- **Base:** 1 acción por cada ₡25.000 del total real de la factura (`floor`; mínimo ₡25.000).
- **Bono patrocinador (×2):** si la factura lleva ≥1 producto de un proveedor
  patrocinador. Un solo bono por factura, no por producto (evita abuso).
- **Bono web (×3):** si la factura la hizo el vendedor de la web.
- **No se apilan: gana el mayor.** Patrocinador + web → ×3.
- **Fecha de corte:** después de esa fecha/hora no cuentan facturas nuevas.

Perillas ajustables sin tocar código: `colones_por_accion` (25000),
`bono_patrocinador_mult` (2), `bono_web_mult` (3), `vendedor_web` (`Vnidux`),
`fecha_corte`, `digitos_factura` (5), `tolerancia_monto_pct` (10), `activa`.

### Detección del ×2 (patrocinador)
Dos disparadores:
1. **Producto de proveedor patrocinador.** NEO mapea `codigo_interno → proveedor`
   en `neo_lista_items` / `neo_inventario_proveedor`. El ×2 se dispara si alguna
   línea de la factura pertenece a un proveedor marcado como patrocinador.
2. **Pago con Credix.** Se detecta por `observaciones ilike '%credix%'` en
   `neo_consolidado_facturas` (incluye órdenes Nidux "Medio pago: Credix").

### Decidido
- **Vendedor web (×3):** `Vnidux`.
- **Base:** ₡25.000 por acción.
- Proveedores mapeados en NEO: ARSA = `DISTRIBUIDORA ARGUEDAS Y SALAS`,
  COFERSA = `CONSORCIO FERRETERO DE SAN JOSE`, DHF = `DISTRIBUIDORA HERMANOS FUENTES`.
- **Estado:** motor (tablas + RPC) aplicado y probado — ver
  `supabase/migrations/20260821_rifa_motos.sql`.

## Patrocinadores y escala de importancia

Valor de referencia de una moto: **₡625.000**. Aporte total: **₡6.125.000**
(≈ 9.8 motos). Motos directas comprometidas: 7 (ARSA 4, COFERSA 1, MFA 1,
Impersa 1) + ₡1.750.000 en efectivo (≈ 2.8 motos más).

| # | Patrocinador | Aporte | En ₡ | % del total | Tier | ×2 auto |
|---|---|---|---:|---:|---|---|
| 1 | **ARSA** | 4 motos | 2.500.000 | 40.8% | 💎 Diamante | — (aporta motos) |
| 2 | **COFERSA** | 1 moto | 625.000 | 10.2% | 🥇 Oro | — |
| 3 | **MFA** | 1 moto | 625.000 | 10.2% | 🥇 Oro | ✅ |
| 4 | **Impersa** | 1 moto | 625.000 | 10.2% | 🥇 Oro | ✅ |
| 5 | **Credix** | ₡300.000 | 300.000 | 4.9% | 🥈 Plata | — (financiera) |
| 6 | **Macopa** | ₡300.000 | 300.000 | 4.9% | 🥈 Plata | ✅ |
| 7 | **Mayoreo del Istmo** | ₡300.000 | 300.000 | 4.9% | 🥈 Plata | ✅ |
| 8 | **Tornicentro** | ₡200.000 | 200.000 | 3.3% | 🥉 Bronce | ✅ |
| 9 | **Megalíneas** | ₡200.000 | 200.000 | 3.3% | 🥉 Bronce | ✅ |
| 10 | **Carbone** | ₡200.000 | 200.000 | 3.3% | 🥉 Bronce | ✅ |
| 11 | **Ebisa** | ₡100.000 | 100.000 | 1.6% | 🤝 Colaborador | ✅ |
| 12 | **Ternium** | ₡100.000 | 100.000 | 1.6% | 🤝 Colaborador | ✅ |
| 13 | **DHF** | ₡50.000 | 50.000 | 0.8% | 🤝 Colaborador | — |

Uso de la escala: tamaño/orden del logo en el carrusel del landing y jerarquía en
los agradecimientos. Diamante manda (logo grande, arriba), y baja hasta
Colaborador.

Nombres de proveedor en NEO (para el ×2): `IMPERSA SA`,
`MFA MAYOREO FERRETERIA Y ACABADOS`, `MAYOREO DEL ISTMO`, `MEGALINEAS SA`,
`TORNICENTRO INVERSIONES INDUSTRIALES GANA GANA`, `DISTRIBUIDORA CARBONE CR`,
`INSTALACIONES Y SERVICIOS MACOPA`, `EBISA GLOBAL BRAND SA`,
`TERNIUM INTERNACIONAL COSTA RICA`.

## Fases de ejecución

1. **Motor:** tablas `rifa_*`, RPC `rifa_consultar_acciones` y
   `rifa_registrar_factura`, vista `rifa_saldos`. Reusa el matching del club.
2. **Página pública `/rifa`:** consultar acciones + registrar factura + aviso de
   sync (~1 h) + explicación de la mecánica + carrusel de logos.
3. **Panel `/rifa-admin`:** ranking por acciones, registros, gestión de
   proveedores patrocinadores y logos, y las perillas de config.
4. **Sorteo:** pantalla en vivo, ganador no repite (se excluye automático),
   registro de ganadores, opción de semilla verificable (lotería).

## Notas legales / operativas
- Sorteo de este tamaño en CR normalmente requiere permiso y términos y
  condiciones. Confirmar antes del sorteo.
- Aviso obligatorio al cliente: la factura puede tardar ~1 h en aparecer (la
  sincronización NEO → Supabase no es en tiempo real).
