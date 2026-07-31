// Calendario de pagos de renta (impuesto sobre la renta CR).
// Estos montos los refina el contador — por eso viven acá en config y NO
// hardcodeados en el componente de flujo de caja. Editá las fechas/montos
// según la planificación fiscal vigente.
//
// fecha:    ISO (YYYY-MM-DD) del día en que sale la plata de caja.
// concepto: texto que se muestra en el detalle del flujo.
// monto:    ₡ (colones).
export const CALENDARIO_RENTA = [
  { fecha: '2026-09-30', concepto: 'Pago parcial renta 2026 (2/3)', monto: 12_500_000 },
  { fecha: '2026-12-31', concepto: 'Pago parcial renta 2026 (3/3)', monto: 12_500_000 },
  { fecha: '2027-03-15', concepto: 'Saldo renta 2026 (declaración D-101)', monto: 182_000_000 },
  { fecha: '2027-06-30', concepto: 'Pago parcial renta 2027 (1/3)', monto: 55_000_000 },
  { fecha: '2027-09-30', concepto: 'Pago parcial renta 2027 (2/3)', monto: 55_000_000 },
  { fecha: '2027-12-31', concepto: 'Pago parcial renta 2027 (3/3)', monto: 55_000_000 },
];
