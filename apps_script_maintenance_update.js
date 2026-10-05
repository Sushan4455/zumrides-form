function doPost(e) {
  try {
    // 104RGZClQzvy8zT_-Aayrs89nit_z9DvvCN3ap9mGl88 is the Maintenance Spreadsheet
    var ss = SpreadsheetApp.openById("104RGZClQzvy8zT_-Aayrs89nit_z9DvvCN3ap9mGl88");
    // 13ZS1Xw2JnlloFIOLs-ZlWkGfTUDUB-Kbu3n-3GhqK8Y is the Zum Operations Spreadsheet
    var zumSs = SpreadsheetApp.openById("13ZS1Xw2JnlloFIOLs-ZlWkGfTUDUB-Kbu3n-3GhqK8Y");
    var fleetSheet = zumSs.getSheetByName("Fleet Issue and Repair");

    var payload = JSON.parse(e.parameter.data);
    var records = Array.isArray(payload) ? payload : payload.records;
    
    // Helper to find the true bottom row of a specific table range
    function getTableBottomRow(sheet, startCol, endCol) {
      if (!sheet) return 6;
      var data = sheet.getRange(1, startCol, sheet.getMaxRows(), endCol - startCol + 1).getValues();
      for (var i = data.length - 1; i >= 0; i--) {
        var hasData = data[i].some(function(cell) { return cell !== ""; });
        if (hasData) {
          return i + 1;
        }
      }
      return 6; // Default to row 6 if empty
    }

    // Helper to append a row to a specific table, moving the Totals row down if present
    function appendToTable(sheet, startCol, endCol, newValues) {
      if (!sheet) return;
      var bottomRow = getTableBottomRow(sheet, startCol, endCol);
      var bottomRowRange = sheet.getRange(bottomRow, startCol, 1, endCol - startCol + 1);
      var bottomRowValues = bottomRowRange.getValues()[0];
      
      var isTotalsRow = bottomRowValues.some(function(val) {
        return typeof val === 'string' && val.toLowerCase().indexOf('total') > -1;
      });
      
      var targetRow;
      if (isTotalsRow) {
        targetRow = bottomRow;
        // Move the totals row down by 1
        bottomRowRange.moveTo(sheet.getRange(bottomRow + 1, startCol));
        
        // Copy formatting from the row above to the new target row
        if (targetRow > 7) {
          var prevRowRange = sheet.getRange(targetRow - 1, startCol, 1, endCol - startCol + 1);
          prevRowRange.copyTo(sheet.getRange(targetRow, startCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        }
      } else {
        targetRow = bottomRow + 1;
      }
      
      // Calculate Issue #
      var issueNum = Math.max(1, targetRow - 6);
      newValues[0] = issueNum; // ensure the first value is the correct Issue #
      
      sheet.getRange(targetRow, startCol, 1, endCol - startCol + 1).setValues([newValues]);
    }
    
    records.forEach(function(record) {
      var defectCat = record.defectCategory || record.category || '';
      var reportedIssue = record.reportedIssue || record.issue || '';
      var cycleIdStr = record.cycleId ? record.cycleId.toString().trim() : '';

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
          cycleIdStr,
          reportedIssue,
          record.status || 'Pending'
        ]);

        // Also update Fleet Issue and Repair sheet (Columns B to G -> 2 to 7)
        if (fleetSheet) {
          appendToTable(fleetSheet, 2, 7, [
            "", // Placeholder for Issue #
            cycleIdStr,
            defectCat,
            reportedIssue,
            record.fixDescription || 'Pending Workshop Repair',
            record.status || 'Pending'
          ]);
        }
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
          cycleIdStr,
          record.staffName,
          record.fixDescription,
          record.odometer || '',
          record.status || 'Repaired'
        ]);

        // Also update Fleet Issue and Repair sheet (Columns I to N -> 9 to 14)
        if (fleetSheet) {
          appendToTable(fleetSheet, 9, 14, [
            "", // Placeholder for Issue #
            cycleIdStr,
            defectCat,
            reportedIssue,
            record.fixDescription || '',
            record.status || 'Repaired'
          ]);
        }
      }
    });
    
    return ContentService.createTextOutput(JSON.stringify({ 'result': 'success' })).setMimeType(ContentService.MimeType.JSON);
  } catch(error) {
    return ContentService.createTextOutput(JSON.stringify({ 'result': 'error', 'error': error.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}
