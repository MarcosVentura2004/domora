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
