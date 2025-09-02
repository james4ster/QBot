import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import { GoogleSpreadsheet } from 'google-spreadsheet';

// ---- Express Server ----
const app = express();
const PORT = process.env.PORT || 10000;

app.get('/', (req, res) => {
  res.send('TickleBot is alive!');
});

app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});

// ---- Discord Bot ----
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ---- Google Sheets ----
const SHEET_ID = process.env.SPREADSHEET_ID;
const creds = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

async function getCurrentSeason() {
  try {
    const doc = new GoogleSpreadsheet(SHEET_ID);
    await doc.useServiceAccountAuth(creds); // async auth
    await doc.loadInfo();

    const settingsSheet = doc.sheetsByTitle['BSB Settings'];
    if (!settingsSheet) {
      console.error('BSB Settings tab not found!');
      return null;
    }

    await settingsSheet.loadCells('B10');
    const currentSeasonCell = settingsSheet.getCellByA1('B10');
    console.log('🏒 Current season:', currentSeasonCell.value);

    return currentSeasonCell.value;
  } catch (err) {
    console.error('Error accessing Google Sheet:', err);
    return null;
  }
}

// Bot ready event
client.once('clientReady', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
  const season = await getCurrentSeason();
  if (season) {
    console.log(`Season loaded for bot: ${season}`);
  }
});

client.login(process.env.DISCORD_BOT_TOKEN);
