// draftUtils/draftController.js
import { getDraftOrder, getAvailablePlayers, sheets, SPREADSHEET_ID } from './sheets.js';

export async function assignPick(managerName, playerName, dryRun = false) {
  // 1️⃣ Get the current draft order from the sheet
  const draftOrder = await getDraftOrder();

  // 2️⃣ Find the first empty pick in the draft (column F is empty)
  const currentPick = draftOrder.find(p => !p.picked);
  if (!currentPick) {
    throw new Error('Draft is complete — no picks available.');
  }

  // 3️⃣ Validate that the player is in the available list
  const availablePlayers = await getAvailablePlayers();
  if (!availablePlayers.includes(playerName)) {
    throw new Error(`${playerName} is not in the available players list; spell his name right dumb ass.`);
  }

  // 4️⃣ Dry-run logging
  if (dryRun) {
    console.log(
      `🧪 Dry Run → Round ${currentPick.round}, Pick ${currentPick.pickNumber}: ` +
      `${currentPick.managerName} would select ${playerName}`
    );
    return currentPick;
  }

  // 5️⃣ Write the pick to column F in the main draft sheet
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `'Draft Central - 98'!F${currentPick.rowNumber}`,
    valueInputOption: 'RAW',
    requestBody: { values: [[playerName]] },
  });

  // 6️⃣ Highlight the player in the available players list (column L)
  const playerRow = availablePlayers.findIndex(p => p === playerName);
  if (playerRow !== -1) {
    await sheets.spreadsheets.batchUpdate({
      spreadsheetId: SPREADSHEET_ID,
      requestBody: {
        requests: [
          {
            repeatCell: {
              range: {
                sheetId: 1057858866, // Draft Central - 98
                startRowIndex: playerRow + 3, // adjust for starting row 4
                endRowIndex: playerRow + 4,
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

  // 7️⃣ Determine the next pick for logging
  const currentIndex = draftOrder.findIndex(p => p.rowNumber === currentPick.rowNumber);
  const nextPick = draftOrder.slice(currentIndex + 1).find(p => !p.picked);
  if (nextPick) {
    console.log(
      `➡️ Next Up → Round ${nextPick.round}, Pick ${nextPick.pickNumber}: ${nextPick.managerName}`
    );
  } else {
    console.log("🏁 Draft completed — no more managers left.");
  }

  // ✅ Return the current pick with the chosen player
  return { ...currentPick, picked: playerName };
}
