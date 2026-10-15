import { calcRemainingPayments, calcLastPaymentLabel } from './expenseDuration';

describe('calcRemainingPayments', () => {
  test('sin fecha del primer pago → total', () => {
    expect(calcRemainingPayments('360', '', '2026-10-01', 'mensual')).toBe(360);
  });

  test('hipoteca desde ene 2018, añadida oct 2026 → 360 - 105', () => {
    expect(calcRemainingPayments('360', '2018-01-15', '2026-10-01', 'mensual')).toBe(255);
  });

  test('primer pago posterior al inicio → total', () => {
    expect(calcRemainingPayments('12', '2027-01-01', '2026-10-01', 'mensual')).toBe(12);
  });

  test('trimestral: pagos en ene, abr, jul antes de oct → 3 hechos', () => {
    expect(calcRemainingPayments('8', '2026-01-01', '2026-10-01', 'trimestral')).toBe(5);
  });

  test('trimestral desfasado: feb, may, ago antes de oct → 3 hechos', () => {
    expect(calcRemainingPayments('8', '2026-02-01', '2026-10-01', 'trimestral')).toBe(5);
  });

  test('todos los pagos ya hechos → 0 o negativo', () => {
    expect(calcRemainingPayments('12', '2020-01-01', '2026-10-01', 'mensual')).toBeLessThanOrEqual(0);
  });
});

describe('calcLastPaymentLabel', () => {
  test('255 pagos mensuales desde oct 2026 → dic 2047', () => {
    expect(calcLastPaymentLabel(255, '2026-10-01', 'mensual')).toBe('dic 2047');
  });

  test('1 pago → mismo mes', () => {
    expect(calcLastPaymentLabel(1, '2026-10-01', 'mensual')).toBe('oct 2026');
  });

  test('4 pagos anuales desde oct 2026 → oct 2029', () => {
    expect(calcLastPaymentLabel(4, '2026-10-01', 'anual')).toBe('oct 2029');
  });
});
