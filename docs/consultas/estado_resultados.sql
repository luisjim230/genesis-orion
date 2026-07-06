-- Estado de resultados de los últimos 6 meses + KPIs
SELECT mes, ventas_netas, utilidad_bruta, gastos_operativos + gastos_financieros AS gastos,
       utilidad_neta, margen_bruto_pct, punto_equilibrio_ventas
FROM per_estado_resultados
ORDER BY mes DESC
LIMIT 6;

SELECT * FROM per_kpis;
