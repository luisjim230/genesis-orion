-- Vista de IVA mensual para el flujo de caja del módulo de finanzas.
-- Devuelve, por período (mes), lo devengado en ventas, el crédito fiscal de
-- compras/importaciones, las retenciones de datáfono y el neto que efectivamente
-- sale de caja el mes siguiente. Un neto negativo = crédito a favor (se arrastra
-- en el frontend). Se excluyen los asientos de cierre fiscal automáticos.
CREATE OR REPLACE VIEW per_iva_mensual AS
SELECT
  periodo_reporte AS mes,
  -- IVA cobrado en ventas (cuenta de pasivo, saldo haber)
  ROUND(SUM(CASE WHEN cuenta_contable LIKE '20-10-50-03-02%'
    THEN haber_contabilidad - debe_contabilidad ELSE 0 END)) AS iva_devengado,
  -- IVA pagado en compras e importaciones (crédito fiscal)
  ROUND(SUM(CASE WHEN cuenta_contable LIKE '10-10-60-07%' OR cuenta_contable LIKE '10-10-60-08%'
    THEN debe_contabilidad - haber_contabilidad ELSE 0 END)) AS iva_soportado,
  -- Retenciones de IVA que hacen los bancos en datáfono (crédito aplicable)
  ROUND(SUM(CASE WHEN cuenta_contable LIKE '10-10-60-03%'
    THEN debe_contabilidad - haber_contabilidad ELSE 0 END)) AS retenciones_tc,
  -- Lo que efectivamente sale de caja el mes siguiente
  ROUND(SUM(CASE WHEN cuenta_contable LIKE '20-10-50-03-02%'
    THEN haber_contabilidad - debe_contabilidad ELSE 0 END)
   - SUM(CASE WHEN cuenta_contable LIKE '10-10-60-07%' OR cuenta_contable LIKE '10-10-60-08%'
    THEN debe_contabilidad - haber_contabilidad ELSE 0 END)
   - SUM(CASE WHEN cuenta_contable LIKE '10-10-60-03%'
    THEN debe_contabilidad - haber_contabilidad ELSE 0 END)) AS iva_neto_a_pagar
FROM neo_movimientos_contables
WHERE (observaciones_asiento NOT LIKE 'Asiento creado automáticamente. Periodo Fiscal%'
       OR observaciones_asiento IS NULL)
GROUP BY periodo_reporte;

GRANT SELECT ON per_iva_mensual TO anon, authenticated, agente_ro;
