// Helpers for fixed-duration recurring expenses (e.g. a 360-payment mortgage)
// whose first payment happened before the expense was added to the app.

const MONTH_NAMES_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function getFreqStep(frequency, customFreqMonths) {
  if (frequency === 'trimestral') return 3;
  if (frequency === 'anual') return 12;
  if (frequency === 'custom') return parseInt(customFreqMonths) || 1;
  return 1; // mensual
}

function toYM(dateStr) {
  return { y: parseInt(dateStr.substring(0, 4)), m: parseInt(dateStr.substring(5, 7)) - 1 };
}

/**
 * Payments still pending from startDate onward, given the total number of
 * payments counted from firstPaymentDate. Without firstPaymentDate (or if it is
 * not before startDate) the total is returned unchanged.
 */
export function calcRemainingPayments(totalPayments, firstPaymentDate, startDate, frequency, customFreqMonths) {
  const total = parseInt(totalPayments);
  if (!total || total < 1) return null;
  if (!firstPaymentDate || !startDate) return total;
  const step = getFreqStep(frequency, customFreqMonths);
  const f = toYM(firstPaymentDate);
  const s = toYM(startDate);
  const monthsBetween = (s.y - f.y) * 12 + (s.m - f.m);
  if (monthsBetween <= 0) return total;
  // Payments at firstPayment + k*step that fall before the start month
  const elapsed = Math.ceil(monthsBetween / step);
  return total - elapsed;
}

/** "mar 2048" — month of the last payment, counting `payments` from startDate. */
export function calcLastPaymentLabel(payments, startDate, frequency, customFreqMonths) {
  const n = parseInt(payments);
  if (!n || n < 1 || !startDate) return '';
  const step = getFreqStep(frequency, customFreqMonths);
  const s = toYM(startDate);
  const total = s.m + (n - 1) * step;
  return `${MONTH_NAMES_ES[total % 12]} ${s.y + Math.floor(total / 12)}`;
}
