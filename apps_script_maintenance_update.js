// ============================================
// 1. ENDPOINT FOR REACT APP TO FETCH PENDING ISSUES
// ============================================
function doGet(e) {
  // Use the new Zum Operations spreadsheet ID
  var zumSs = SpreadsheetApp.openById("1uWlRhJqAtbAq4ktBANVIobyRMOCyt6oETVJXYYH2W_U");
  
  if (e.parameter.action === "getPendingIssues") {
    var fleetSheet = zumSs.getSheetByName("Fleet Issue and Repair");
    if (!fleetSheet) {
      return ContentService.createTextOutput("[]").setMimeType(ContentService.MimeType.JSON);
    }
    
    var data = fleetSheet.getRange(7, 2, fleetSheet.getMaxRows() - 6, 6).getValues();
    var issues = [];
    
    for (var i = 0; i < data.length; i++) {
      var row = data[i];
      if (String(row[4]).toLowerCase().indexOf('total') > -1) break; 
      
      var cycleId = String(row[1]).trim();
      var defectCat = row[2];
      var reportedIssue = row[3];
      
      if (cycleId) {
        issues.push({
          cycle_id: cycleId,
          defect_category: defectCat,
          reported_issue: reportedIssue
        });
      }
    }
    
    var output = JSON.stringify(issues);
    if (e.parameter.callback) {
      output = e.parameter.callback + "(" + output + ")";
      return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(output).setMimeType(ContentService.MimeType.JSON);
  }
}

// ============================================
// 2. MAIN ENDPOINT FOR RECEIVING APP DATA
// ============================================
function doPost(e) {
  try {
    var rawData;
    if (e.parameter && e.parameter.data) {
      rawData = JSON.parse(e.parameter.data);
    } else if (e.postData && e.postData.contents) {
      rawData = JSON.parse(e.postData.contents);
    } else {
      rawData = {};
    }

    var data = { tasks: [], maintenance: [], batterySwaps: [], homeCycles: [], feedback: [] };

    if (Array.isArray(rawData)) {
      rawData.forEach(function(r) {
        if (r.sheetTarget === 'issues') {
          data.feedback.push({
            staff_name: r.staffName,
            cycle_id: r.cycleId,
            feedback: r.reportedIssue || r.issue,
            category: r.defectCategory || "Other Issues",
            status: "Pending"
          });
        } else if (r.taskType === 'Maintenance' || r.sheetTarget === 'repaired') {
          data.maintenance.push({
            staff_name: r.staffName,
            cycle_id: r.cycleId,
            fix_description: r.fixDescription,
            status: r.status,
            category: r.defectCategory || "Other Issues",
            issue: r.issue
          });
        } else {
          data.tasks.push({
            staff_name: r.staffName,
            task_type: r.taskType,
            station_name: r.stationName,
            cycle_id: r.cycleId,
            condition: r.condition,
            issue: r.issue,
            parts_checked: r.partsChecked,
            odometer: r.odometer
          });
        }
      });
    } else {
      if (rawData.tasks) data.tasks = rawData.tasks;
      if (rawData.maintenance) data.maintenance = rawData.maintenance;
      if (rawData.batterySwaps) data.batterySwaps = rawData.batterySwaps;
      if (rawData.homeCycles) data.homeCycles = rawData.homeCycles;
      if (rawData.feedback) data.feedback = rawData.feedback;
    }

    var sheet = SpreadsheetApp.getActiveSpreadsheet(); 
    // Use the new Zum Operations spreadsheet ID
    var zumSs = SpreadsheetApp.openById("1uWlRhJqAtbAq4ktBANVIobyRMOCyt6oETVJXYYH2W_U");
    var fleetSheet = zumSs.getSheetByName("Fleet Issue and Repair");

    function getTableTargetInfo(sheetObj, startCol, endCol) {
      if (!sheetObj) return { row: 7, isTotalsRow: false };
      var dataVals = sheetObj.getRange(7, startCol, sheetObj.getMaxRows() - 6, endCol - startCol + 1).getValues();
      for (var i = 0; i < dataVals.length; i++) {
        var row = dataVals[i];
        var isTotalsRow = row.some(function(val) { return typeof val === 'string' && val.toLowerCase().indexOf('total') > -1; });
        var hasData = row.some(function(cell) { return cell !== ""; });
        
        if (isTotalsRow) {
          return { row: i + 7, isTotalsRow: true };
        }
        if (!hasData) {
          return { row: i + 7, isTotalsRow: false };
        }
      }
      return { row: 7, isTotalsRow: false };
    }

    function appendToTable(sheetObj, startCol, endCol, newValues) {
      if (!sheetObj) return;
      var targetInfo = getTableTargetInfo(sheetObj, startCol, endCol);
      var targetRow = targetInfo.row;
      
      if (targetInfo.isTotalsRow) {
        var bottomRowRange = sheetObj.getRange(targetRow, startCol, 1, endCol - startCol + 1);
        bottomRowRange.moveTo(sheetObj.getRange(targetRow + 1, startCol));
        if (targetRow > 7) {
          var prevRowRange = sheetObj.getRange(targetRow - 1, startCol, 1, endCol - startCol + 1);
          prevRowRange.copyTo(sheetObj.getRange(targetRow, startCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        }
      } else {
        if (targetRow > 7) {
          var prevRowRange = sheetObj.getRange(targetRow - 1, startCol, 1, endCol - startCol + 1);
          prevRowRange.copyTo(sheetObj.getRange(targetRow, startCol), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
        }
      }
      
      var issueNum = Math.max(1, targetRow - 6);
      newValues[0] = issueNum;
      
      sheetObj.getRange(targetRow, startCol, 1, endCol - startCol + 1).setValues([newValues]);
    }

    function removeFromPendingTable(sheetObj, cycleId) {
      if (!sheetObj || !cycleId) return null;
      var startCol = 2; // B
      var endCol = 7;   // G
      
      var dataVals = sheetObj.getRange(7, startCol, sheetObj.getMaxRows() - 6, endCol - startCol + 1).getValues();
      var dataEndRow = 6;
      for (var i = 0; i < dataVals.length; i++) {
        var row = dataVals[i];
        var isTotalsRow = row.some(function(val) { return typeof val === 'string' && val.toLowerCase().indexOf('total') > -1; });
        var hasData = row.some(function(cell) { return cell !== ""; });
        
        if (isTotalsRow || !hasData) {
          break; 
        }
        dataEndRow = i + 7;
      }
      
      if (dataEndRow < 7) return null; 
      
      var tableData = sheetObj.getRange(7, startCol, dataEndRow - 7 + 1, endCol - startCol + 1).getValues();
      var deletedAny = false;
      var foundRowData = null;
      
      function isMatch(id1, id2) {
        var s1 = String(id1).trim().toLowerCase();
        var s2 = String(id2).trim().toLowerCase();
        if (s1 === s2) return true;
        if (s1 !== "" && s2 !== "" && !isNaN(s1) && !isNaN(s2) && Number(s1) === Number(s2)) return true;
        return false;
      }
      
      for (var i = tableData.length - 1; i >= 0; i--) {
        var rowCycleId = tableData[i][1]; 
        
        if (isMatch(rowCycleId, cycleId)) {
          var rowToDelete = 7 + i;
          
          if (!foundRowData) {
            foundRowData = {
              defect_category: tableData[i][2], 
              reported_issue: tableData[i][3]   
            };
          }
          
          if (rowToDelete < dataEndRow) {
            var dataBelow = sheetObj.getRange(rowToDelete + 1, startCol, dataEndRow - rowToDelete, endCol - startCol + 1).getValues();
            sheetObj.getRange(rowToDelete, startCol, dataEndRow - rowToDelete, endCol - startCol + 1).setValues(dataBelow);
            sheetObj.getRange(dataEndRow, startCol, 1, endCol - startCol + 1).clearContent();
          } else {
            sheetObj.getRange(rowToDelete, startCol, 1, endCol - startCol + 1).clearContent();
          }
          
          deletedAny = true;
          dataEndRow--;
        }
      }
      
      if (deletedAny && dataEndRow >= 7) {
        var numRows = dataEndRow - 7 + 1;
        var issueNumbers = [];
        for (var j = 1; j <= numRows; j++) {
          issueNumbers.push([j]);
        }
        sheetObj.getRange(7, startCol, numRows, 1).setValues(issueNumbers);
      }
      
      return foundRowData;
    }

    if (data.tasks && data.tasks.length > 0) {
      var taskSheet = sheet.getSheetByName("Tasks");
      if (!taskSheet) {
        taskSheet = sheet.insertSheet("Tasks");
        taskSheet.appendRow(["Timestamp", "Staff Name", "Task Type", "Station Name", "Cycle ID", "Condition", "Issue", "Parts Checked", "Odometer"]);
      }
      data.tasks.forEach(function(task) {
        taskSheet.appendRow([new Date(), task.staff_name || "", task.task_type || "", task.station_name || "", task.cycle_id || "", task.condition || "", task.issue || "", task.parts_checked || "", task.odometer || ""]);
      });
    }

    if (data.maintenance && data.maintenance.length > 0) {
      var maintSheet = sheet.getSheetByName("Maintenance");
      if (!maintSheet) {
        maintSheet = sheet.insertSheet("Maintenance");
        maintSheet.appendRow(["Timestamp", "Staff Name", "Cycle ID", "Fix Description", "Status"]);
      }
      data.maintenance.forEach(function(maint) {
        maintSheet.appendRow([new Date(), maint.staff_name || "", maint.cycle_id || "", maint.fix_description || "", maint.status || ""]);
        
        if (fleetSheet && maint.cycle_id) {
          var oldIssueData = removeFromPendingTable(fleetSheet, maint.cycle_id);
          
          var finalDefect = maint.defect_category || maint.category;
          var finalIssue = maint.reported_issue || maint.issue;
          
          if (oldIssueData) {
             if (!finalDefect || finalDefect === "Other Issues") finalDefect = oldIssueData.defect_category;
             if (!finalIssue) finalIssue = oldIssueData.reported_issue;
          }
          
          appendToTable(fleetSheet, 9, 14, [
            "",
            maint.cycle_id || "",
            finalDefect || "Other Issues",
            finalIssue || "",
            maint.fix_description || "",
            maint.status || "Repaired"
          ]);
        }
      });
    }

    if (data.batterySwaps && data.batterySwaps.length > 0) {
      var swapSheet = sheet.getSheetByName("Battery Swaps");
      if (!swapSheet) {
        swapSheet = sheet.insertSheet("Battery Swaps");
        swapSheet.appendRow(["Timestamp", "Staff Name", "Cycle ID", "Battery ID", "IN Voltage", "IN Percentage", "Battery IN Pilot Time", "OUT Voltage", "OUT Percentage", "Battery OUT Pilot Time"]);
      }
      data.batterySwaps.forEach(function(swap) {
        swapSheet.appendRow([new Date(), swap.staff_name || "", swap.cycle_id || "", swap.battery_id || "", swap.in_voltage || "", swap.in_percentage || "", swap.in_time || "", swap.out_voltage || "", swap.out_percentage || "", swap.out_time || ""]);
      });
    }

    if (data.homeCycles && data.homeCycles.length > 0) {
      var homeSheet = sheet.getSheetByName("Home Cycle");
      if (!homeSheet) {
        homeSheet = sheet.insertSheet("Home Cycle");
        homeSheet.appendRow(["Name"]);
        homeSheet.setFrozenRows(1);
        homeSheet.setFrozenColumns(1);
      }
      
      var dataRange = homeSheet.getDataRange();
      var values = dataRange.getValues();
      var headers = values[0];
      
      var riderRowMap = {};
      for (var r = 1; r < values.length; r++) {
        var riderName = String(values[r][0]).trim().toLowerCase();
        if (riderName) {
          riderRowMap[riderName] = r;
        }
      }
      
      var d = new Date();
      var monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
      var todayStr = d.getDate() + "-" + monthNames[d.getMonth()];
      
      var headersStr = headers.map(function(h) {
        if (h instanceof Date) { return h.getDate() + "-" + monthNames[h.getMonth()]; }
        return String(h).trim();
      });
      
      var todayColIdx = headersStr.indexOf(todayStr);
      if (todayColIdx === -1) {
        todayColIdx = headers.filter(String).length;
        homeSheet.getRange(1, todayColIdx + 1).setValue(todayStr);
      }
      
      data.homeCycles.forEach(function(cycle) {
        var rName = (cycle.manual_name || "Unknown").trim();
        var rNameLower = rName.toLowerCase();
        var cycleId = (cycle.home_cycle_id || "").trim();
        
        var targetRowIdx;
        if (riderRowMap.hasOwnProperty(rNameLower)) {
          targetRowIdx = riderRowMap[rNameLower];
        } else {
          var newRow = new Array(todayColIdx + 1).fill("");
          newRow[0] = rName;
          homeSheet.appendRow(newRow);
          targetRowIdx = homeSheet.getLastRow() - 1; 
          riderRowMap[rNameLower] = targetRowIdx;
        }
        
        var cell = homeSheet.getRange(targetRowIdx + 1, todayColIdx + 1);
        var existingVal = cell.getValue();
        if (existingVal) cell.setValue(existingVal + ", " + cycleId); 
        else cell.setValue(cycleId);
      });
    }

    if (data.feedback && data.feedback.length > 0) {
      var feedbackSheet = sheet.getSheetByName("Feedback");
      if (!feedbackSheet) {
        feedbackSheet = sheet.insertSheet("Feedback");
        feedbackSheet.appendRow(["Sn", "Staff Name", "Cycle ID", "Feebback"]);
      }
      
      var lastRow = feedbackSheet.getLastRow();
      
      data.feedback.forEach(function(item) {
        var sn = (lastRow === 1) ? 1 : lastRow;
        
        feedbackSheet.appendRow([
          sn, 
          item.staff_name || "", 
          item.cycle_id || "", 
          item.feedback || ""
        ]);
        lastRow++;

        if (fleetSheet && item.cycle_id) {
          appendToTable(fleetSheet, 2, 7, [
            "", 
            item.cycle_id || "",
            item.defect_category || item.category || "Other Issues", 
            item.feedback || item.reported_issue || item.issue || "",
            item.repair_action_taken || item.fix_description || "Pending Workshop Repair",
            item.status || "Pending"
          ]);
        }
      });
    }

    return ContentService.createTextOutput(JSON.stringify({ status: 'success' })).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ status: 'error', message: error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}
