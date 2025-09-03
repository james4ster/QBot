  import { google } from 'googleapis';
  import { buildGameRecap } from './buildCanvas.js';
  import { generateRecapText } from './recapLLM.js';

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
      gameID: row[1],       // Column B = GameID (adjust if needed)
      homeTeam: row[7],     // H
      awayTeam: row[8],     // I
      homeScore: row[41],   // AP
      awayScore: row[13],   // N
      players: [],          // leave empty for now
    };
  }

  // --- Fetch scoring highlights for a game ---
  async function fetchScoringData(gameID) {
    const range = `RawScoring!A2:M`; // adjust to cover all scoring rows
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range,
    });

    const rows = res.data.values || [];
    // filter rows for this game
    const scoringRows = rows
      .filter(row => row[5] == gameID) // column F = GameID
      .map(row => ({
        team: row[9],       // J = TEAM
        goalScorer: row[10],// K = GOALscorer
        assist1: row[11],   // L = ASSIST 1
        assist2: row[12],   // M = ASSIST 2
        period: row[6],     // G = Period
        time: row[7],       // H = TIME
      }));

    return scoringRows;
  }

  // --- Generate text highlights ---
  function generateHighlights(scoringRows) {
    const highlights = scoringRows.map(row => {
      let assistText = '';
      if (row.assist1 && row.assist2) assistText = `, assisted by ${row.assist1} & ${row.assist2}`;
      else if (row.assist1) assistText = `, assisted by ${row.assist1}`;
      return `${row.team} Goal! ${row.goalScorer}${assistText} (${row.period}P ${row.time})`;
    });

    return highlights.slice(0, 3); // top 3 highlights
  }

  // --- Main ---
  async function main() {
    // 1️⃣ Fetch basic game data (row 2 by default)
    const gameData = await fetchGameData();

    // 2️⃣ Fetch scoring highlights for this game
    const scoringRows = await fetchScoringData(gameData.gameID);
    const highlights = generateHighlights(scoringRows);

    // 3️⃣ Build the recap canvas with highlights
    await buildGameRecap(gameData, './recapUtils/output/test_game.png', highlights);

    console.log('✅ Test recap image with highlights created!');

    // 4 Build the text recap from LLM
    const recapText = await generateRecapText(gameData, highlights);
    console.log(recapText);
  }

  main().catch(console.error);
