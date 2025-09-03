import { google } from 'googleapis';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// === Fetch game info from RawData ===
// Column mapping: H=7, I=8, N=13, AP=41
export async function fetchGameData(gameRow = 2) {
  const range = `RawData!A${gameRow}:AP${gameRow}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const row = res.data.values?.[0];
  if (!row) throw new Error('No data found in row ' + gameRow);

  return {
    gameID: row[1],       // Column B = Game_ID
    homeTeam: row[7],     // H
    awayTeam: row[8],     // I
    homeScore: row[41],   // AP
    awayScore: row[13],   // N
    players: [],          // empty for now
  };
}

// === Fetch scoring highlights from RawScoring by GameID ===
export async function fetchScoringData(gameID) {
  const range = `RawScoring!A2:M`; // Adjust range if needed
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  // Filter only rows matching the gameID
  const highlights = rows.filter(r => r[5] == gameID).map(r => ({
    period: r[7],          // Period
    time: r[8],            // TIME
    team: r[9],            // TEAM
    scorer: r[10],         // GOALscorer
    assist1: r[11] || '',  // ASSIST 1
    assist2: r[12] || '',  // ASSIST 2
    type: r[13] || 'EV',   // TYPE
  }));

  return highlights;
}
