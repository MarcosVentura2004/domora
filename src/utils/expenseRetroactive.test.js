import { calcRetroactiveStartDate, calcRetroMonths } from './expenseRetroactive';

describe('calcRetroactiveStartDate', () => {
  test('mensual mayo 2026 → enero 2026', () => {
    expect(calcRetroactiveStartDate('2026-05-01', 'mensual', '')).toBe('2026-01-01');
  });

  test('trimestral mayo 2026 → febrero 2026', () => {
    expect(calcRetroactiveStartDate('2026-05-01', 'trimestral', '')).toBe('2026-02-01');
  });

  test('anual mayo 2026 → null (mayo 2025 está antes del cutoff)', () => {
    expect(calcRetroactiveStartDate('2026-05-01', 'anual', '')).toBeNull();
  });

  test('custom 2 meses mayo 2026 → enero 2026', () => {
    expect(calcRetroactiveStartDate('2026-05-01', 'custom', '2')).toBe('2026-01-01');
  });

  test('mensual febrero 2026 → enero 2026', () => {
    expect(calcRetroactiveStartDate('2026-02-01', 'mensual', '')).toBe('2026-01-01');
  });

  test('mensual enero 2026 → null (no hay meses previos desde cutoff)', () => {
    expect(calcRetroactiveStartDate('2026-01-01', 'mensual', '')).toBeNull();
  });

  test('trimestral abril 2026 → enero 2026', () => {
    expect(calcRetroactiveStartDate('2026-04-01', 'trimestral', '')).toBe('2026-01-01');
  });

  test('custom 3 meses junio 2026 → marzo 2026', () => {
    expect(calcRetroactiveStartDate('2026-06-01', 'custom', '3')).toBe('2026-03-01');
  });
});

describe('calcRetroMonths', () => {
  test('mensual ene→may 2026 produce 4 etiquetas', () => {
    expect(calcRetroMonths('2026-01-01', '2026-05-01', 'mensual', '')).toEqual([
      'Ene 2026', 'Feb 2026', 'Mar 2026', 'Abr 2026',
    ]);
  });

  test('trimestral feb→may 2026 produce 1 etiqueta', () => {
    expect(calcRetroMonths('2026-02-01', '2026-05-01', 'trimestral', '')).toEqual(['Feb 2026']);
  });

  test('custom 2 meses ene→may 2026 produce 2 etiquetas', () => {
    expect(calcRetroMonths('2026-01-01', '2026-05-01', 'custom', '2')).toEqual([
      'Ene 2026', 'Mar 2026',
    ]);
  });

  test('mensual ene→feb 2026 produce 1 etiqueta', () => {
    expect(calcRetroMonths('2026-01-01', '2026-02-01', 'mensual', '')).toEqual(['Ene 2026']);
  });
});

describe('desde mes elegido', () => {
  const { isMonthBefore, buildRetroStartDate, defaultRetroMonth, calcRetroMonths: crm } = require('./expenseRetroactive');

  test('isMonthBefore', () => {
    expect(isMonthBefore(2025, 4, '2026-10-01')).toBe(true);
    expect(isMonthBefore(2026, 9, '2026-10-01')).toBe(false);
    expect(isMonthBefore(2026, 10, '2026-10-01')).toBe(false);
  });

  test('buildRetroStartDate mantiene el día y lo ajusta al mes', () => {
    expect(buildRetroStartDate(2025, 4, '2026-10-15')).toBe('2025-05-15');
    expect(buildRetroStartDate(2025, 1, '2026-10-31')).toBe('2025-02-28');
  });

  test('defaultRetroMonth mensual oct 2026 → ene 2026; anual mayo 2026 → mayo 2025', () => {
    expect(defaultRetroMonth('2026-10-01', 'mensual', '')).toEqual({ year: 2026, month: 0 });
    expect(defaultRetroMonth('2026-05-01', 'anual', '')).toEqual({ year: 2025, month: 4 });
  });

  test('mensual desde mayo 2025 hasta oct 2026 → 17 meses; con 5 pagos → 5', () => {
    expect(crm('2025-05-01', '2026-10-01', 'mensual', '')).toHaveLength(17);
    expect(crm('2025-05-01', '2026-10-01', 'mensual', '', 5)).toEqual(['May 2025', 'Jun 2025', 'Jul 2025', 'Ago 2025', 'Sep 2025']);
  });
});
