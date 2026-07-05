import XLSX from 'xlsx';
import path from 'path';

const filePath = path.resolve(process.cwd(), 'NSL_Bot_Tracker.xlsx');

function readExcel() {
  try {
    const workbook = XLSX.readFile(filePath);
    const sheetNames = workbook.SheetNames;
    console.log(`Workbook loaded successfully. Sheets found: ${JSON.stringify(sheetNames)}`);

    sheetNames.forEach(sheetName => {
      console.log(`\n======================================================`);
      console.log(`  SHEET: ${sheetName}`);
      console.log(`======================================================`);
      const worksheet = workbook.Sheets[sheetName];
      const data = XLSX.utils.sheet_to_json(worksheet, { defval: '' });
      console.log(JSON.stringify(data, null, 2));
    });
  } catch (err) {
    console.error('Error reading excel file:', err.message);
  }
}

readExcel();
