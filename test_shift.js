const getCurrentShiftWindow = (date = new Date()) => {
  const currentHour = date.getHours();
  
  // Shift 1: 05:00 - 14:00 (5 AM to 2 PM)
  // Shift 2: 14:00 - 22:00 (2 PM to 10 PM)
  // Shift 3 (Night): 22:00 - 05:00 (10 PM to 5 AM next day)
  
  const start = new Date(date);
  const end = new Date(date);
  
  start.setMinutes(0, 0, 0);
  end.setMinutes(0, 0, 0);

  if (currentHour >= 5 && currentHour < 14) {
    start.setHours(5);
    end.setHours(14);
  } else if (currentHour >= 14 && currentHour < 22) {
    start.setHours(14);
    end.setHours(22);
  } else {
    // Night shift crosses midnight
    if (currentHour >= 22) {
      start.setHours(22);
      end.setDate(end.getDate() + 1);
      end.setHours(5);
    } else {
      start.setDate(start.getDate() - 1);
      start.setHours(22);
      end.setHours(5);
    }
  }

  return { start: start.toISOString(), end: end.toISOString() };
};
console.log(getCurrentShiftWindow());
