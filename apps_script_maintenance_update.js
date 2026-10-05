var ZUM_OPERATIONS_SPREADSHEET_ID = "1uWlRhJqAtbAq4ktBANVIobyRMOCyt6oETVJXYYH2W_U";
var ALL_CYCLES_SPREADSHEET_ID = "104RGZClQzvy8zT_-Aayrs89nit_z9DvvCN3ap9mGl88";
var TABLE_START_ROW = 7;

function jsonResponse(value) {
  return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON);
}

function readPayload(e) {
  var raw = e && e.parameter ? e.parameter.data : "";
  if (!raw && e && e.postData && e.postData.contents) raw = e.postData.contents;
  if (!raw) throw new Error("Missing request data");
  return JSON.parse(raw);
}

function normalizeCycleId(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function getOrCreateSheet(spreadsheet, name, headers) {
  var sheet = spreadsheet.getSheetByName(name);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(name);
    sheet.appendRow(headers);
  }
  return sheet;
}

function findCycleRows(sheet, cycleColumn, startRow, cycleId) {
  var normalizedId = normalizeCycleId(cycleId);
  var lastRow = sheet.getLastRow();
  if (!normalizedId || lastRow < startRow) return [];
  var values = sheet.getRange(startRow, cycleColumn, lastRow - startRow + 1, 1).getDisplayValues();
  var matches = [];
  values.forEach(function(row, index) {
    if (normalizeCycleId(row[0]) === normalizedId) matches.push(startRow + index);
  });
  return matches;
}

function lastCycleRow(sheet, cycleColumn, startRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) return startRow - 1;
  var values = sheet.getRange(startRow, cycleColumn, lastRow - startRow + 1, 1).getDisplayValues();
  for (var index = values.length - 1; index >= 0; index--) {
    if (normalizeCycleId(values[index][0])) return startRow + index;
  }
  return startRow - 1;
}

function renumberTable(sheet, issueColumn, cycleColumn, startRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < startRow) return;
  var cycleValues = sheet.getRange(startRow, cycleColumn, lastRow - startRow + 1, 1).getDisplayValues();
  var number = 1;
  cycleValues.forEach(function(row, index) {
    if (normalizeCycleId(row[0])) {
      sheet.getRange(startRow + index, issueColumn).setValue(number++);
    }
  });
}

function deleteTableCells(sheet, row, startColumn, width) {
  sheet.getRange(row, startColumn, 1, width).deleteCells(SpreadsheetApp.Dimension.ROWS);
}

function removeDuplicateRows(sheet, rows, startColumn, width) {
  if (rows.length < 2) return rows.length ? rows[0] : null;
  for (var index = rows.length - 1; index >= 1; index--) {
    deleteTableCells(sheet, rows[index], startColumn, width);
  }
  return rows[0];
}

function prepareAppendRow(sheet, startColumn, width, cycleColumn, startRow) {
  var targetRow = Math.max(startRow, lastCycleRow(sheet, cycleColumn, startRow) + 1);
  var occupied = sheet.getRange(targetRow, startColumn, 1, width).getDisplayValues()[0].some(function(value) { return value !== ""; });
  if (occupied) sheet.getRange(targetRow, startColumn, 1, width).insertCells(SpreadsheetApp.Dimension.ROWS);
  if (targetRow > startRow) {
    sheet.getRange(targetRow - 1, startColumn, 1, width)
      .copyTo(sheet.getRange(targetRow, startColumn), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
  }
  return targetRow;
}

function pendingRecordFromNewSheet(fleetSheet, cycleId) {
  if (!fleetSheet) return null;
  var rows = findCycleRows(fleetSheet, 3, TABLE_START_ROW, cycleId);
  if (!rows.length) return null;
  var values = fleetSheet.getRange(rows[0], 2, 1, 6).getDisplayValues()[0];
  return { row: rows[0], category: values[2] || "", issue: values[3] || "" };
}

function removeNewPending(fleetSheet, cycleId) {
  if (!fleetSheet) return null;
  var pending = pendingRecordFromNewSheet(fleetSheet, cycleId);
  var rows = findCycleRows(fleetSheet, 3, TABLE_START_ROW, cycleId);
  for (var index = rows.length - 1; index >= 0; index--) deleteTableCells(fleetSheet, rows[index], 2, 6);
  renumberTable(fleetSheet, 2, 3, TABLE_START_ROW);
  return pending;
}

function upsertNewPending(fleetSheet, record) {
  if (!fleetSheet) return;
  var cycleId = normalizeCycleId(record.cycleId || record.cycle_id);
  if (!cycleId) return;

  var repairedRows = findCycleRows(fleetSheet, 10, TABLE_START_ROW, cycleId);
  for (var repairedIndex = repairedRows.length - 1; repairedIndex >= 0; repairedIndex--) {
    deleteTableCells(fleetSheet, repairedRows[repairedIndex], 9, 6);
  }
  renumberTable(fleetSheet, 9, 10, TABLE_START_ROW);

  var pendingRows = findCycleRows(fleetSheet, 3, TABLE_START_ROW, cycleId);
  var row = removeDuplicateRows(fleetSheet, pendingRows, 2, 6);
  if (!row) row = prepareAppendRow(fleetSheet, 2, 6, 3, TABLE_START_ROW);
  var existingIssueNumber = fleetSheet.getRange(row, 2).getValue();
  fleetSheet.getRange(row, 2, 1, 6).setValues([[
    existingIssueNumber || 1,
    cycleId,
    record.defectCategory || record.category || "Feedback",
    record.reportedIssue || record.issue || record.feedback || "",
    record.fixDescription || "Pending Workshop Repair",
    "Pending"
  ]]);
  renumberTable(fleetSheet, 2, 3, TABLE_START_ROW);
}

function upsertNewRepaired(fleetSheet, record, pending) {
  if (!fleetSheet) return;
  var cycleId = normalizeCycleId(record.cycleId || record.cycle_id);
  if (!cycleId) return;
  var rows = findCycleRows(fleetSheet, 10, TABLE_START_ROW, cycleId);
  var row = removeDuplicateRows(fleetSheet, rows, 9, 6);
  if (!row) row = prepareAppendRow(fleetSheet, 9, 6, 10, TABLE_START_ROW);
  var existingIssueNumber = fleetSheet.getRange(row, 9).getValue();
  fleetSheet.getRange(row, 9, 1, 6).setValues([[
    existingIssueNumber || 1,
    cycleId,
    record.defectCategory || record.category || (pending && pending.category) || "",
    record.reportedIssue || record.issue || (pending && pending.issue) || "",
    record.fixDescription || "",
    "Repaired"
  ]]);
  renumberTable(fleetSheet, 9, 10, TABLE_START_ROW);
}

function upsertMaintenanceLog(sheet, record) {
  var cycleId = normalizeCycleId(record.cycleId || record.cycle_id);
  var rows = findCycleRows(sheet, 3, 2, cycleId);
  var row = rows.length ? rows[0] : sheet.getLastRow() + 1;
  for (var index = rows.length - 1; index >= 1; index--) sheet.deleteRow(rows[index]);
  var timestamp = record.timestamp ? new Date(record.timestamp) : new Date();
  if (isNaN(timestamp.getTime())) timestamp = new Date();
  sheet.getRange(row, 1, 1, 5).setValues([[
    timestamp,
    record.staffName || record.staff_name || "",
    cycleId,
    record.fixDescription || "",
    "Repaired"
  ]]);
}

function upsertOldIssue(sheet, record) {
  var cycleId = normalizeCycleId(record.cycleId || record.cycle_id);
  var rows = findCycleRows(sheet, 4, TABLE_START_ROW, cycleId);
  var row = removeDuplicateRows(sheet, rows, 2, 6);
  if (!row) row = prepareAppendRow(sheet, 2, 6, 4, TABLE_START_ROW);
  var current = sheet.getRange(row, 2, 1, 6).getValues()[0];
  sheet.getRange(row, 2, 1, 6).setValues([[
    current[0] || 1,
    current[1] || "",
    cycleId,
    record.defectCategory || record.category || "Feedback",
    record.reportedIssue || record.issue || record.feedback || "",
    "Pending"
  ]]);
  renumberTable(sheet, 2, 4, TABLE_START_ROW);
}

function markOldIssueRepaired(sheet, cycleId) {
  var rows = findCycleRows(sheet, 4, TABLE_START_ROW, cycleId);
  rows.forEach(function(row) { sheet.getRange(row, 7).setValue("Repaired"); });
}

function upsertOldRepaired(sheet, record, pending) {
  var cycleId = normalizeCycleId(record.cycleId || record.cycle_id);
  var rows = findCycleRows(sheet, 2, 2, cycleId);
  var row = rows.length ? rows[0] : sheet.getLastRow() + 1;
  for (var index = rows.length - 1; index >= 1; index--) sheet.deleteRow(rows[index]);
  var issueText = record.defectCategory || record.category || (pending && pending.category) || "";
  var reportedIssue = record.reportedIssue || record.issue || (pending && pending.issue) || "";
  if (reportedIssue) issueText += (issueText ? " (" : "") + reportedIssue + (issueText ? ")" : "");
  sheet.getRange(row, 1, 1, 6).setValues([[
    row - 1,
    cycleId,
    issueText,
    record.fixDescription || "",
    record.odometer || "",
    "Repaired"
  ]]);
}

function doGet(e) {
  try {
    if (!e || !e.parameter || e.parameter.action !== "getPendingIssues") return jsonResponse({ result: "ok" });
    var newWorkbook = SpreadsheetApp.openById(ZUM_OPERATIONS_SPREADSHEET_ID);
    var fleetSheet = newWorkbook.getSheetByName("Fleet Issue and Repair");
    if (!fleetSheet || fleetSheet.getLastRow() < TABLE_START_ROW) return jsonResponse([]);
    var rows = fleetSheet.getRange(TABLE_START_ROW, 2, fleetSheet.getLastRow() - TABLE_START_ROW + 1, 6).getDisplayValues();
    var seen = {};
    var pendingIssues = [];
    rows.forEach(function(row) {
      var cycleId = normalizeCycleId(row[1]);
      if (!cycleId || seen[cycleId] || String(row[5]).toLowerCase() === "repaired") return;
      seen[cycleId] = true;
      pendingIssues.push({ cycle_id: cycleId, defect_category: row[2] || "", reported_issue: row[3] || "" });
    });
    return jsonResponse(pendingIssues);
  } catch (error) {
    return jsonResponse({ result: "error", error: error.toString() });
  }
}

function doPost(e) {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var payload = readPayload(e);
    var newWorkbook = SpreadsheetApp.openById(ZUM_OPERATIONS_SPREADSHEET_ID);
    var oldWorkbook = SpreadsheetApp.openById(ALL_CYCLES_SPREADSHEET_ID);
    var fleetSheet = newWorkbook.getSheetByName("Fleet Issue and Repair");
    var oldIssuesSheet = oldWorkbook.getSheetByName("All Cycle Issues");
    var oldRepairedSheet = oldWorkbook.getSheetByName("Repaired Cycles");
    var written = { feedback: 0, maintenance: 0, issues: 0 };

    if (payload.feedback && Array.isArray(payload.feedback)) {
      var feedbackSheet = getOrCreateSheet(newWorkbook, "Feedback", ["Sn", "Staff Name", "Cycle ID", "Feedback"]);
      payload.feedback.forEach(function(record) {
        feedbackSheet.appendRow([feedbackSheet.getLastRow(), record.staff_name || record.staffName || "", record.cycle_id || record.cycleId || "", record.feedback || ""]);
        upsertNewPending(fleetSheet, record);
        upsertOldIssue(oldIssuesSheet, record);
        written.feedback++;
      });
    }

    var records = Array.isArray(payload) ? payload : (payload.records || []);
    records.forEach(function(record) {
      var cycleId = normalizeCycleId(record.cycleId || record.cycle_id);
      if (!cycleId) return;
      if (record.sheetTarget === "issues") {
        upsertNewPending(fleetSheet, record);
        upsertOldIssue(oldIssuesSheet, record);
        written.issues++;
        return;
      }

      var pending = removeNewPending(fleetSheet, cycleId);
      upsertNewRepaired(fleetSheet, record, pending);
      var maintenanceSheet = getOrCreateSheet(newWorkbook, "Maintenance", ["Timestamp", "Staff Name", "Cycle ID", "Fix Description", "Status"]);
      upsertMaintenanceLog(maintenanceSheet, record);
      markOldIssueRepaired(oldIssuesSheet, cycleId);
      upsertOldRepaired(oldRepairedSheet, record, pending);
      written.maintenance++;
    });

    return jsonResponse({ result: "success", written: written });
  } catch (error) {
    return jsonResponse({ result: "error", error: error.toString() });
  } finally {
    lock.releaseLock();
  }
}
