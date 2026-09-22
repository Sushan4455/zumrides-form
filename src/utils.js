const OPERATIONS_ROTATION = ['Kabir', 'Laxman', 'Anish', 'Surya'];
const ROTATION_ANCHOR = Date.UTC(2026, 8, 22);
const STATION_ANCHOR_INDEX = 1; // 22 Sep 2026: Laxman
const OVERALL_ANCHOR_INDEX = 2; // 22 Sep 2026: Anish

const positiveModulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

export function getLocalDateKey(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getDailyAssignments(date = new Date()) {
  const localDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const isSaturday = new Date(localDay).getUTCDay() === 6;

  if (isSaturday) {
    return { station: null, overall: null, isWorkingDay: false };
  }

  let daysFromAnchor = 0;
  const direction = localDay >= ROTATION_ANCHOR ? 1 : -1;
  for (
    let cursor = ROTATION_ANCHOR + (direction * 86400000);
    direction === 1 ? cursor <= localDay : cursor >= localDay;
    cursor += direction * 86400000
  ) {
    if (new Date(cursor).getUTCDay() !== 6) daysFromAnchor += direction;
  }

  const stationIndex = positiveModulo(STATION_ANCHOR_INDEX + daysFromAnchor, OPERATIONS_ROTATION.length);
  const overallIndex = positiveModulo(OVERALL_ANCHOR_INDEX + daysFromAnchor, OPERATIONS_ROTATION.length);

  return {
    station: OPERATIONS_ROTATION[stationIndex],
    overall: OPERATIONS_ROTATION[overallIndex],
    isWorkingDay: true
  };
}

export function getCurrentShiftWindow(date = new Date()) {
  const shiftStart = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const shiftEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0, 0);

  return {
    start: shiftStart.toISOString(),
    end: shiftEnd.toISOString()
  };
}
