import { google } from "googleapis";

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
});

const sheets = google.sheets({ version: "v4", auth });

export async function getTeamNameMap() {
  const range = "RawTeam!D:E"; // D = Abbreviation, E = Full Name
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  const map = {};
  for (const [abbr, full] of rows) {
    if (abbr && full) map[abbr] = full;
  }
  return map;
}
