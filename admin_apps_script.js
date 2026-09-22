function doGet(e) {
  var mainSsId = "13ZS1Xw2JnlloFIOLs-ZlWkGfTUDUB-Kbu3n-3GhqK8Y";
  
  // ==========================================
  // 1. ADMIN SECRET ENDPOINT (For Python Script)
  // ==========================================
  if (e.parameter.secret === "Admin123") {
    var maintenanceSsId = "104RGZClQzvy8zT_-Aayrs89nit_z9DvvCN3ap9mGl88";
    var today = new Date();
    
    function isToday(dateVal) {
      if(!dateVal || !(dateVal instanceof Date)) return false;
      return dateVal.getDate() == today.getDate() && dateVal.getMonth() == today.getMonth() && dateVal.getFullYear() == today.getFullYear();
    }
    
    // Get Main Sheet Data
    var mainSheet = SpreadsheetApp.openById(mainSsId).getSheets()[0];
    var mainData = mainSheet.getDataRange().getValues();
    var routineByStaff = {};
    var overallStaff = "None";
    var overallCycles = [];
    var stationStaff = "None";
    var stationCycles = [];
    
    for (var i = 1; i < mainData.length; i++) {
      var row = mainData[i];
      if (isToday(row[0])) {
        var task = row[1], cycle = row[2], cond = row[4], issue = row[5], parts = row[6], staff = row[7];
        if (!routineByStaff[staff]) routineByStaff[staff] = [];
        if (task === "Routine Checkup" || task === "Pre-Task Check") routineByStaff[staff].push(cycle);
        else if (task === "Overall Checkup") { overallStaff = staff; overallCycles.push(cycle); }
        else if (task === "Station Visit") { stationStaff = staff; stationCycles.push(cycle); }
      }
    }
    
    // Get Maintenance Data
    var maintSheet = SpreadsheetApp.openById(maintenanceSsId).getSheetByName("Repaired Cycles");
    var maintData = maintSheet.getDataRange().getValues();
    var maintenanceLogs = [];
    for (var i = 1; i < maintData.length; i++) {
      var row = maintData[i];
      if (isToday(row[6])) { // Column G timestamp
         maintenanceLogs.push({ cycleId: row[1], fix: row[3] });
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
  // 2. REGULAR PRE-TASK ENDPOINT (For React App)
  // ==========================================
  var ss = SpreadsheetApp.openById(mainSsId);
  var sheet = ss.getSheets()[0];
  var data = sheet.getDataRange().getValues();
  
  var recentCycles = [];
  var now = new Date();
  
  for (var i = data.length - 1; i > 0; i--) {
    var row = data[i];
    var timestamp = new Date(row[0]);
    var taskType = row[1];
    var cycleId = row[2];
    var staffName = row[7];
    
    if (taskType === 'Routine Checkup' || taskType === 'Routine' || taskType === 'Pre-Task Check') {
      var diffHours = Math.abs(now - timestamp) / 36e5;
      if (diffHours <= 48 && cycleId) {
        recentCycles.push({ cycleId: cycleId.toString().trim(), staffName: staffName ? staffName.toString().trim() : 'Unknown' });
      }
    }
  }
  
  var result = { data: recentCycles };
  if (e.parameter.callback) {
    return ContentService.createTextOutput(e.parameter.callback + "(" + JSON.stringify(result) + ")").setMimeType(ContentService.MimeType.JAVASCRIPT);
  } else {
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  }
}
