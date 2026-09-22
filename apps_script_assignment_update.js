function doGet(e) {
  var mainSsId = "13ZS1Xw2JnlloFIOLs-ZlWkGfTUDUB-Kbu3n-3GhqK8Y";
  
  function isCurrentShift(dateVal) {
    if(!dateVal) return false;
    var d = new Date(dateVal);
    if(isNaN(d.getTime())) return false;
    
    var now = new Date();
    var shiftStart, shiftEnd;
    
    // If it is currently before 12:00 PM (Noon), the shift started yesterday at Noon
    if (now.getHours() < 12) {
      shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 12, 0, 0, 0);
      shiftEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    } 
    // If it is currently after 12:00 PM (Noon), the shift started today at Noon
    else {
      shiftStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
      shiftEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 12, 0, 0, 0);
    }
    
    return d.getTime() >= shiftStart.getTime() && d.getTime() < shiftEnd.getTime();
  }
  
  // ==========================================
  // 1. ADMIN DASHBOARD ENDPOINT
  // ==========================================
  if (e.parameter.secret === "Admin123") {
    var maintenanceSsId = "104RGZClQzvy8zT_-Aayrs89nit_z9DvvCN3ap9mGl88";
    
    var mainSheet = SpreadsheetApp.openById(mainSsId).getSheets()[0];
    var mainData = mainSheet.getDataRange().getValues();
    var routineByStaff = {};
    var overallStaff = "None", overallCycles = [];
    var stationStaff = "None", stationCycles = [];
    
    for (var i = 1; i < mainData.length; i++) {
      var row = mainData[i];
      if (isCurrentShift(row[0])) {
        var task = row[1], cycle = row[2], staff = row[7];
        if (!routineByStaff[staff]) routineByStaff[staff] = [];
        
        if (task === "Routine Checkup" || task === "Pre-Task Check") routineByStaff[staff].push(cycle);
        else if (task === "Overall Checkup") { overallStaff = staff; overallCycles.push(cycle); }
        else if (task === "Station Visit") { stationStaff = staff; stationCycles.push(cycle); }
      }
    }
    
    var maintSheet = SpreadsheetApp.openById(maintenanceSsId).getSheetByName("Repaired Cycles");
    var maintData = maintSheet.getDataRange().getValues();
    var maintenanceLogs = [];
    for (var i = 1; i < maintData.length; i++) {
      if (isCurrentShift(maintData[i][6])) { 
         maintenanceLogs.push({ cycleId: maintData[i][1], fix: maintData[i][3] });
      }
    }
    
    var adminData = {
      routine: routineByStaff,
      overall: { staff: overallStaff, cycles: overallCycles },
      station: { staff: stationStaff, cycles: stationCycles },
      maintenance: maintenanceLogs
    };
    
    return ContentService.createTextOutput(JSON.stringify(adminData)).setMimeType(ContentService.MimeType.JSON);
  }
  
  // ==========================================
  // 2. REGULAR ENDPOINT (Pre-Task & Assignments)
  // ==========================================
  var ss = SpreadsheetApp.openById(mainSsId);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  var recentCycles = [];
  var now = new Date();
  
  // Fetch recent routine checks
  for (var i = data.length - 1; i > 0; i--) {
    var row = data[i];
    if (row[1] === 'Routine Checkup' || row[1] === 'Routine' || row[1] === 'Pre-Task Check') {
      if (Math.abs(now - new Date(row[0])) / 36e5 <= 48 && row[2]) {
        recentCycles.push({ cycleId: row[2].toString().trim(), staffName: row[7] ? row[7].toString().trim() : 'Unknown' });
      }
    }
  }

  // Fetch today's Assignments (Current Shift)
  var assignSheet = ss.getSheetByName("Assignments");
  var assignments = {};
  if (assignSheet) {
     var aData = assignSheet.getDataRange().getValues();
     for (var j = aData.length - 1; j > 0; j--) {
        var aRow = aData[j];
        if (isCurrentShift(aRow[0])) {
           var aStaff = aRow[1];
           var aCycles = aRow[2];
           if (!assignments[aStaff]) {
               assignments[aStaff] = aCycles.toString().split(',').map(function(c) { return c.trim(); }).filter(function(c) { return c; });
           }
        }
     }
  }
  
  var result = { data: recentCycles, assignments: assignments };
  if (e.parameter.callback) return ContentService.createTextOutput(e.parameter.callback + "(" + JSON.stringify(result) + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var ss = SpreadsheetApp.openById("13ZS1Xw2JnlloFIOLs-ZlWkGfTUDUB-Kbu3n-3GhqK8Y");
    var payload = JSON.parse(e.parameter.data);
    
    // Check if this is an Admin Assignment POST
    if (payload.action === "assign") {
       var assignSheet = ss.getSheetByName("Assignments");
       if (!assignSheet) {
         assignSheet = ss.insertSheet("Assignments");
         assignSheet.appendRow(["Timestamp", "Staff Name", "Assigned Cycles"]);
       }
       assignSheet.appendRow([new Date(), payload.staffName, payload.cycles]);
       return ContentService.createTextOutput(JSON.stringify({ 'result': 'success' })).setMimeType(ContentService.MimeType.JSON);
    }

    // Otherwise, handle regular form records
    var sheet = ss.getSheets()[0];
    var records = Array.isArray(payload) ? payload : payload.records;
    
    records.forEach(function(record) {
      sheet.appendRow([
        record.timestamp,
        record.taskType,
        record.cycleId,
        record.batteryId,
        record.condition,
        record.issue,
        record.partsChecked,
        record.staffName,
        record.stationName
      ]);
    });
    return ContentService.createTextOutput(JSON.stringify({ 'result': 'success' })).setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({ 'result': 'error', 'error': error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
