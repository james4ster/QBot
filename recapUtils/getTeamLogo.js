// recapUtils/getTeamLogo.js
import { google } from 'googleapis';

export async function getTeamLogo(teamCode, sheets, SPREADSHEET_ID) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'Teams!A:F', // adjust sheet name if needed
  });

  const rows = res.data.values;
  if (!rows || rows.length === 0) return null;

  // Find the row matching team code
  const row = rows.find(r => r[0] === teamCode);
  if (!row) return null;

  return row[5]; // column G = Logo URL
}
