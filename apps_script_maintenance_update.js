function doPost(e) {
  try {
    // 104RGZClQzvy8zT_-Aayrs89nit_z9DvvCN3ap9mGl88 is the Maintenance Spreadsheet
    var ss = SpreadsheetApp.openById("104RGZClQzvy8zT_-Aayrs89nit_z9DvvCN3ap9mGl88");
    var payload = JSON.parse(e.parameter.data);
    var records = Array.isArray(payload) ? payload : payload.records;
    
    records.forEach(function(record) {
      // If the request specifies sheetTarget as 'issues', send it to 'Cycle Issues'
      if (record.sheetTarget === 'issues') {
        var issuesSheet = ss.getSheetByName("Cycle Issues");
        if (!issuesSheet) {
          issuesSheet = ss.insertSheet("Cycle Issues");
          issuesSheet.appendRow(["Timestamp", "Staff Name", "Cycle ID", "Defect Category / Issue", "Status"]);
        }
        issuesSheet.appendRow([
          record.timestamp,
          record.staffName,
          record.cycleId,
          record.reportedIssue || record.issue,
          record.status || 'Pending'
        ]);
      } 
      // Else, send it to 'Repaired Cycles'
      else {
        var repairSheet = ss.getSheetByName("Repaired Cycles");
        if (!repairSheet) {
          repairSheet = ss.insertSheet("Repaired Cycles");
          repairSheet.appendRow(["Timestamp", "Cycle ID", "Staff Name", "Repair Action Taken", "Odometer", "Status"]);
        }
        repairSheet.appendRow([
          record.timestamp,
          record.cycleId,
          record.staffName,
          record.fixDescription,
          record.odometer || '',
          record.status || 'Repaired'
        ]);
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify({ 'result': 'success' })).setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({ 'result': 'error', 'error': error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
