// Earliest month from which retroactive expenses are applied (Jan 2026)
const RETRO_CUTOFF_YEAR = 2026;
const RETRO_CUTOFF_MONTH = 0; // 0-indexed

const MONTH_NAMES_ES = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];

function getFreqStep(frequency, customFreqMonths) {
  if (frequency === 'trimestral') return 3;
  if (frequency === 'anual') return 12;
  if (frequency === 'custom') return parseInt(customFreqMonths) || 1;
  return 1; // mensual
}

/**
 * Returns the earliest start_date (YYYY-MM-DD) obtainable by stepping back from
 * startDate by the given frequency until crossing Jan 2026.
 * Returns null if no steps are possible (e.g. annual starting May 2026).
 */
export function calcRetroactiveStartDate(startDate, frequency, customFreqMonths) {
  const step = getFreqStep(frequency, customFreqMonths);
  const origY = parseInt(startDate.substring(0, 4));
  const origM = parseInt(startDate.substring(5, 7)) - 1; // 0-indexed

  let retroY = origY;
  let retroM = origM;

  while (true) {
    let prevM = retroM - step;
    let prevY = retroY;
    while (prevM < 0) { prevM += 12; prevY--; }

    if (prevY < RETRO_CUTOFF_YEAR || (prevY === RETRO_CUTOFF_YEAR && prevM < RETRO_CUTOFF_MONTH)) {
      break;
    }

    retroY = prevY;
    retroM = prevM;
  }

  if (retroY === origY && retroM === origM) return null;
  return `${retroY}-${String(retroM + 1).padStart(2, '0')}-01`;
}

/**
 * Returns an array of Spanish month labels ("Ene 2026", ...) from retroDate
 * up to (not including) startDate, stepping by frequency.
 */
export function calcRetroMonths(retroDate, startDate, frequency, customFreqMonths) {
  const step = getFreqStep(frequency, customFreqMonths);
  let y = parseInt(retroDate.substring(0, 4));
  let m = parseInt(retroDate.substring(5, 7)) - 1; // 0-indexed
  const endY = parseInt(startDate.substring(0, 4));
  const endM = parseInt(startDate.substring(5, 7)) - 1;

  const months = [];
  while (y < endY || (y === endY && m < endM)) {
    months.push(`${MONTH_NAMES_ES[m]} ${y}`);
    m += step;
    while (m >= 12) { m -= 12; y++; }
  }
  return months;
}
