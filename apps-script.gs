const SHEET_ID = '1T6XxVZ3L6Wp0RmGe93ix931OaqVpBBklGRaI57TdTB4';
const SHEET_NAME = 'RM2026';

function getBalance(sheet) {
  return Number(sheet.getRange('F1002').getValue()) || 0;
}

function doGet() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  const balance = getBalance(sheet);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, balance: balance })).setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  const data = JSON.parse(e.postData.contents || '{}');
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME);
  if (!sheet) throw new Error('RM2026 not found');
  if (data.action === 'delete') {
    const rowToDelete = Number(data.row);
    if (!Number.isInteger(rowToDelete) || rowToDelete < 2 || rowToDelete > sheet.getLastRow()) throw new Error('Invalid row');
    sheet.deleteRow(rowToDelete);
    const lastRowAfterDelete = sheet.getLastRow();
    for (let row = 3; row <= lastRowAfterDelete; row += 1) sheet.getRange(row, 6).setFormula(`=F${row - 1}+D${row}-E${row}`);
    SpreadsheetApp.flush();
    const balance = getBalance(sheet);
    return ContentService.createTextOutput(JSON.stringify({ ok: true, balance: balance })).setMimeType(ContentService.MimeType.JSON);
  }
  if (!data.date || !data.item || (!data.dt && !data.kt)) throw new Error('Missing required fields');
  const lastRow = sheet.getLastRow();
  const dt = Number(data.dt) || 0;
  const kt = Number(data.kt) || 0;
  sheet.appendRow([new Date(data.date), data.item, data.other || '', dt || '', kt || '']);
  const newRow = sheet.getLastRow();
  sheet.getRange(newRow, 1).setNumberFormat('dd/MM/yyyy');
  const previousBalance = newRow > 2 ? `F${newRow - 1}` : '0';
  sheet.getRange(newRow, 6).setFormula(`=${previousBalance}+D${newRow}-E${newRow}`);
  SpreadsheetApp.flush();
  const balance = getBalance(sheet);
  return ContentService.createTextOutput(JSON.stringify({ ok: true, balance: balance, row: newRow })).setMimeType(ContentService.MimeType.JSON);
}
