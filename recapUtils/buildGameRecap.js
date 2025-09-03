import { google } from 'googleapis';
import { generateRecapText } from './recapLLM.js';
import { generateHighlights } from './generateHighlights.js';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// --- Fetch basic game data ---
async function fetchGameData(gameRow = 2) {
  const range = `RawData!A${gameRow}:AP${gameRow}`;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const row = res.data.values?.[0];
  if (!row) throw new Error('No data found in row ' + gameRow);

  return {
    gameID: row[1],       // Column B = GameID
    homeTeam: row[7],     // Column H
    awayTeam: row[8],     // Column I
    homeScore: row[41],   // Column AP
    awayScore: row[13],   // Column N
    players: [],          // leave empty for now
  };
}

// --- Fetch scoring highlights for a game ---
async function fetchScoringData(gameID) {
  const range = `RawScoring!A2:M`; // adjust as needed
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });

  const rows = res.data.values || [];
  // filter rows for this game
  const scoringRows = rows
    .filter(row => row[5] == gameID) // column F = GameID
    .map(row => ({
      team: row[9],        // Column J = TEAM
      goalScorer: row[10], // Column K = GOALscorer
      assist1: row[11],    // Column L = ASSIST1
      assist2: row[12],    // Column M = ASSIST2
      period: row[6],      // Column G = Period
      time: row[7],        // Column H = TIME
    }));

  return scoringRows;
}

// --- Build the recap image (placeholder logic for now) ---
async function buildGameRecap(gameData, outputPath, highlights) {
  console.log('Building recap for:', gameData.homeTeam, 'vs', gameData.awayTeam);
  console.log('Score:', gameData.homeScore, '-', gameData.awayScore);
  console.log('Highlights:');
  highlights.forEach(h => console.log(' -', h));
  console.log(`Recap image would be saved to: ${outputPath}`);
  // TODO: replace with actual image generation code
}

// --- Exported function for Discord slash command ---
export async function buildRecapForRow(gameRow = 2) {
  const gameData = await fetchGameData(gameRow);
  const scoringRows = await fetchScoringData(gameData.gameID);
  const highlights = generateHighlights(scoringRows);

  await buildGameRecap(gameData, './recapUtils/output/test_game.png', highlights);

  import { safeGenerateRecapText } from './recapLLM.js';

  const recapText = await safeGenerateRecapText(gameData, highlights);
  
  return recapText;
}
