import { google } from 'googleapis';
import { generateRecapText } from './recapLLM.js';
import { getTeamNameMap } from './teamMap.js';

const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});

const sheets = google.sheets({ version: 'v4', auth });

// --- Fetch game info ---
async function fetchGameData(gameRow = 2) {
  const range = `RawData!A${gameRow}:AP${gameRow}`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const row = res.data.values?.[0];
  if (!row) throw new Error('No data found in row ' + gameRow);

  return {
    gameID: row[1],
    homeTeam: row[7],
    awayTeam: row[8],
    homeScore: Number(row[41]),
    awayScore: Number(row[13]),
  };
}

// --- Fetch scoring highlights ---
async function fetchScoringData(gameID) {
  const range = `RawScoring!A2:M`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];

  return rows
    .filter(r => r[5] == gameID)
    .map(row => ({
      period: Math.min(Number(row[7]), 3),
      time: row[8],
      team: row[9],
      goalScorer: row[10],
      assist1: row[11] || '',
      assist2: row[12] || '',
      type: row[13] || 'EV',
    }));
}

// --- Fetch player stats ---
async function fetchPlayerData(gameID) {
  const range = `RawPlayer!A2:Z`;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];

  const playerGoals = {};
  const goalies = [];

  rows.filter(r => r[5] == gameID).forEach(r => {
    const name = r[7];
    const pos = r[8];
    const goals = Number(r[9]);
    const ga = Number(r[13]);
    const sv = Number(r[14]);

    if (pos === 'G') {
      goalies.push(
        ga === 0
          ? `${name} had a shutout with ${sv} saves`
          : `${name} allowed ${ga} goals on ${sv} shots`
      );
    } else if (goals > 0) {
      playerGoals[name] = goals;
    }
  });

  return { playerGoals, goalies };
}

// --- Build recap ---
export async function buildRecapForRow(gameRow = 2) {
  const teamMap = await getTeamNameMap();

  const gameDataRaw = await fetchGameData(gameRow);
  const gameData = {
    ...gameDataRaw,
    homeTeam: teamMap[gameDataRaw.homeTeam] || gameDataRaw.homeTeam,
    awayTeam: teamMap[gameDataRaw.awayTeam] || gameDataRaw.awayTeam,
  };

  const scoringRowsRaw = await fetchScoringData(gameDataRaw.gameID);
  const scoringRows = scoringRowsRaw.map(s => ({
    ...s,
    team: teamMap[s.team] || s.team,
  }));

  const { playerGoals, goalies } = await fetchPlayerData(gameDataRaw.gameID);

  // --- Inline helper for highlights ---
  const generateHighlights = (rows) => {
    return rows.slice(0, 5).map((row, idx) => {
      let assistText = '';
      if (row.assist1 && row.assist2) assistText = `, assisted by ${row.assist1} & ${row.assist2}`;
      else if (row.assist1) assistText = `, assisted by ${row.assist1}`;
      return `${idx + 1}. ${row.team} goal by ${row.goalScorer}${assistText} (Period ${row.period}, ${row.time})`;
    });
  };

  const highlights = generateHighlights(scoringRows);

  const tieText =
    gameData.homeScore === gameData.awayScore
      ? 'It ended in a tie. What a thrilling display of mediocrity!'
      : '';

  console.log('Game data:', gameData);
  console.log('Highlights:', highlights);
  console.log('Player Goals:', playerGoals);
  console.log('Goalies:', goalies);

  let recapText = await generateRecapText({
    gameData,
    highlights,
    playerGoals,
    goalies,
    extraText: tieText,
    promptInstructions: 'Write a short 2–3 paragraph recap. Keep it concise and fun.',
  });

  // Truncate recap for ~30-sec audio
  const MAX_CHARS = 1000;
  if (recapText.length > MAX_CHARS) {
    recapText = recapText.slice(0, MAX_CHARS) + '…';
  }

  console.log('--- Generated Recap ---');
  console.log(recapText);
  return recapText;
}

// --- Run for a specific row ---
if (import.meta.url === `file://${process.argv[1]}`) {
  buildRecapForRow(22)
    .then(() => console.log('✅ Recap generation complete'))
    .catch(err => console.error('❌ Error generating recap:', err));
}
