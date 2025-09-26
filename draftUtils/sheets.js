// draftUtils/sheets.js
import { google } from 'googleapis';

export const SPREADSHEET_ID = process.env.COPY_OF_Q_SPREADSHEET_ID; // exported for other modules

const auth = new google.auth.GoogleAuth({
  credentials: JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON),
  scopes: ['https://www.googleapis.com/auth/spreadsheets'],
});

export const sheets = google.sheets({ version: 'v4', auth });

// Get current draft order
export async function getDraftOrder() {
  const range = "'Draft Central - 98'!A4:G"; // starting at row 4
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range });
  const rows = res.data.values || [];

  return rows.map((r, i) => ({
    rowNumber: i + 4,          // actual row in sheet
    round: r[0],               // Column A
    pickNumber: r[1],          // Column B
    managerName: r[3] ? r[3].replace(/"/g, '').trim() : null, // Column D, strip quotes
    time: r[4],            // column E
    picked: r[5] || null,      // Column F
  }));
}

// Get list of available players (column L)
export async function getAvailablePlayers() {
  const range = "'Draft Central - 98'!L4:L";
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range,
  });
  const rows = res.data.values || [];
  return rows.map(r => r[0]).filter(Boolean);
}

// Assign pick to the first available manager in sheet order
export async function assignPick(managerName, playerName, dryRun = true) {
  const draftOrder = await getDraftOrder();

  // 1️⃣ Find the first row without a pick
  const currentPick = draftOrder.find(p => !p.picked);

  if (!currentPick) {
    throw new Error('Draft is already complete — no empty rows found.');
  }

  // 2️⃣ Check if the DM sender is the correct manager
  if (currentPick.managerName !== managerName) {
    throw new Error(
      `It's not your turn. Current pick: ${currentPick.managerName}`
    );
  }

  // 3️⃣ Check that player is available
  const availablePlayers = await getAvailablePlayers();
  if (!availablePlayers.includes(playerName)) {
    throw new Error(`${playerName} is not in the available players list`);
  }

  if (dryRun) {
    console.log(
      `[DryRun] → Round ${currentPick.round}, Pick ${currentPick.pickNumber}: ${managerName} would select ${playerName}`
    );
    return currentPick;
  }

  // 4️⃣ Write pick to column F of the current row
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'Draft Central - 98'!F${currentPick.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[playerName]] },
  });

  // 5️⃣ Highlight player in available players list
  const playerIndex = availablePlayers.findIndex(p => p === playerName);
  if (playerIndex !== -1) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 1057858866, // actual sheet ID for 'Draft Central - 98'
                startRowIndex: playerIndex + 3, // L4 = rowIndex 3
                endRowIndex: playerIndex + 4,
                startColumnIndex: 11, // column L
                endColumnIndex: 12,
              },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 1, green: 0.8, blue: 0.8 },
                },
              },
              fields: 'userEnteredFormat.backgroundColor',
            },
          },
        ],
      },
    });
  }

  // 6️⃣ Return the updated pick object
  return { ...currentPick, picked: playerName };
}
