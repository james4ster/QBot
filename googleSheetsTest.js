//Test Q sheets access / need a test tab

import { google } from "googleapis";

// 1️⃣ Google Auth using your service account secret
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

// 2️⃣ Sheets client
const sheets = google.sheets({ version: "v4", auth });

// 3️⃣ Function to get rows from a sheet
async function getSheetData(spreadsheetId, sheetName) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${sheetName}!A:Z`,  //Need tabname here
  });
  return res.data.values;
}

// 4️⃣ Test function
async function main() {
  const spreadsheetId = process.env.SPREADSHEET_ID;
  const rows = await getSheetData(spreadsheetId, ""); //Need tabname here
  console.log(rows);
}

main().catch(console.error);
