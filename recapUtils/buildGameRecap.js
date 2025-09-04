import { google } from 'googleapis';
import { generateHighlights } from './generateHighlights.js';
import { generateRecapText } from './recapLLM.js';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// --- Fetch game data from RawData ---
async function fetchGameData(gameRow = 2) {
  const range = `RawData!A${gameRow}:AP${gameRow}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const row = res.data.values?.[0];
  if (!row) throw new Error('No data found in row ' + gameRow);

  return {
    gameID: row[1],       // Column B
    homeTeam: row[7],     // Column H
    awayTeam: row[8],     // Column I
    homeScore: row[41],   // Column AP
    awayScore: row[13],   // Column N
    players: [],
  };
}

// --- Fetch scoring highlights ---
async function fetchScoringData(gameID) {
  const range = `RawScoring!A2:M`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  return rows
    .filter(row => row[5] == gameID) // Column F = GameID
    .map(row => ({
      team: row[9],        // Column J
      goalScorer: row[10], // Column K
      assist1: row[11],    // Column L
      assist2: row[12],    // Column M
      period: row[6],      // Column G
      time: row[7],        // Column H
    }));
}

// --- Build recap (console/image placeholder) ---
async function buildGameRecap(gameData, outputPath, highlights) {
  console.log('Building recap for:', gameData.homeTeam, 'vs', gameData.awayTeam);
  console.log('Score:', gameData.homeScore, '-', gameData.awayScore);
  console.log('Highlights:');
  highlights.forEach(h => console.log(' -', h));
  console.log(`Recap image would be saved to: ${outputPath}`);
}

// --- Exported function for Discord slash command ---
export async function buildRecapForRow(gameRow = 2) {
  const gameData = await fetchGameData(gameRow);
  const scoringRows = await fetchScoringData(gameData.gameID);
  const highlights = generateHighlights(scoringRows);

  await buildGameRecap(gameData, './recapUtils/output/test_game.png', highlights);

  const recapText = await generateRecapText(gameData, highlights);
  return recapText;
}
