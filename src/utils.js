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

export function getDailyAssignments(date = new Date(), postponedDates = { station: [], overall: [] }) {
  const localDay = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const isSaturday = new Date(localDay).getUTCDay() === 6;

  if (isSaturday) {
    return { station: null, overall: null, isWorkingDay: false };
  }

  // Fallback for dates before our scheduling anchor
  if (localDay < ROTATION_ANCHOR) {
    return { station: null, overall: OPERATIONS_ROTATION[0], isWorkingDay: true };
  }

  // Initialize the queue for station assignments
  let stationQueue = [];
  for (let i = 0; i < OPERATIONS_ROTATION.length; i++) {
    stationQueue.push(OPERATIONS_ROTATION[(STATION_ANCHOR_INDEX + i) % OPERATIONS_ROTATION.length]);
  }

  let overallIndex = OVERALL_ANCHOR_INDEX;

  let currentStation = null;
  let currentOverall = null;
  let daysSinceLastStation = 0;

  for (let cursor = ROTATION_ANCHOR; cursor <= localDay; cursor += 86400000) {
    const cursorDateObj = new Date(cursor);
    if (cursorDateObj.getUTCDay() === 6) continue; // Skip Saturdays

    const cursorKey = `${cursorDateObj.getUTCFullYear()}-${String(cursorDateObj.getUTCMonth() + 1).padStart(2, '0')}-${String(cursorDateObj.getUTCDate()).padStart(2, '0')}`;
    const isStationPostponed = postponedDates?.station?.includes(cursorKey);
    const isOverallPostponed = postponedDates?.overall?.includes(cursorKey);

    // --- OVERALL CHECKUP ---
    if (isOverallPostponed) {
      currentOverall = null;
      // We do not advance the overallIndex, effectively "pausing" the rotation for 1 day
    } else {
      currentOverall = OPERATIONS_ROTATION[overallIndex];
      overallIndex = (overallIndex + 1) % OPERATIONS_ROTATION.length;
    }

    // --- STATION VISIT ---
    if (isStationPostponed) {
      currentStation = null;
      // We do not increment daysSinceLastStation, "pausing" the timer
    } else {
      if (cursor !== ROTATION_ANCHOR) {
        daysSinceLastStation++;
      }

      let isStationDay = false;
      if (cursor === ROTATION_ANCHOR || daysSinceLastStation >= 2) {
        isStationDay = true;
      }

      if (isStationDay) {
        // If the preferred person clashes with the Overall visit, they lose their turn and go to the back
        while (currentOverall && stationQueue[0] === currentOverall) {
          let skippedPerson = stationQueue.shift();
          stationQueue.push(skippedPerson);
        }
        
        currentStation = stationQueue[0];
        stationQueue.shift();
        stationQueue.push(currentStation);
        
        daysSinceLastStation = 0;
      } else {
        currentStation = null;
      }
    }
  }

  return {
    station: currentStation,
    overall: currentOverall,
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
