const XLSX = require('xlsx');

/** Map of "SheetName!A1" -> cell value string */
function xlsxToCellMap(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const map = new Map();

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet || !sheet['!ref']) continue;

    const range = XLSX.utils.decode_range(sheet['!ref']);
    for (let r = range.s.r; r <= range.e.r; r++) {
      for (let c = range.s.c; c <= range.e.c; c++) {
        const addr = XLSX.utils.encode_cell({ r, c });
        const cell = sheet[addr];
        if (!cell) continue;
        const v = cell.w != null ? String(cell.w) : cell.v != null ? String(cell.v) : '';
        const text = String(v).trim();
        if (!text) continue;
        map.set(`${sheetName}!${addr}`, text);
      }
    }
  }

  return map;
}

module.exports = { xlsxToCellMap };
