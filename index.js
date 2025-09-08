// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { google } from 'googleapis';
import fs from 'fs';
import path from "path";

import { buildRecapForRow } from './recapUtils/buildGameRecap.js';
import { generateRecapVideo } from './recapUtils/generateRecapVideo.js';
import { abbrToFullName, teamEmojiMap } from './teamMappings.js';

// === Phrase triggers ===
const phrases = JSON.parse(fs.readFileSync('./phrases.json', 'utf-8'));

// === Express Server ===
const app = express();
const PORT = process.env.PORT || 10000;
app.use(express.json());
app.get('/', (req, res) => res.send('QBot is alive!'));
app.listen(PORT, () => console.log(`🌐 Express server listening on port ${PORT}`));

// === Discord Bot ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
});

// === Google Sheets Setup ===
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;


// === Queue Setup For Managing Box Scores ===
const boxScoreQueue = [];
let processing = false;

async function processQueue() {
  if (processing || boxScoreQueue.length === 0) return;
  processing = true;

  while (boxScoreQueue.length > 0) {
    const filePath = boxScoreQueue.shift();
    try {
      console.log(`🎬 Processing box score: ${filePath}`);
      await generateRecapVideo(filePath);

      // Send the resulting video to Discord
      await sendVideoToDiscord(filePath);

    } catch (err) {
      console.error(`❌ Failed to process ${filePath}:`, err);
    }
  }

  processing = false;
}



// === Phrase message tracking ===
const repliedMessages = new Set();

// === Discord Events ===
client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
});

// === Message Handling ===
client.on("messageCreate", async (message) => {
  if (message.author.bot || message.webhookId) return;

  // === BOX SCORE CHANNEL HANDLER ===
  if (message.channelId === process.env.BOX_SCORE_CHANNEL_ID) {
    for (const attachment of message.attachments.values()) {
      if (!attachment.name.endsWith(".png")) continue;

      try {
        const BOX_SCORE_DIR = path.join('recapUtils', 'boxScores');
        const PROCESSED_DIR = path.join('recapUtils', 'processedBoxScores');

        if (!fs.existsSync(BOX_SCORE_DIR)) fs.mkdirSync(BOX_SCORE_DIR, { recursive: true });
        if (!fs.existsSync(PROCESSED_DIR)) fs.mkdirSync(PROCESSED_DIR, { recursive: true });

        const localPath = path.join(BOX_SCORE_DIR, attachment.name);
        const res = await fetch(attachment.url);
        const buffer = Buffer.from(await res.arrayBuffer());
        fs.writeFileSync(localPath, buffer);
        console.log(`📥 Saved box score: ${localPath}`);


        // === Push to queue instead of immediate processing ===
        boxScoreQueue.push(localPath);
        processQueue();

      } catch (err) {
        console.error(`❌ Failed to process ${attachment.name}:`, err);
      }
    }

    // Don't process phrases for box score messages
    return;
  }

  // ... rest of your message handling (phrases, mentions, etc.)
});

// === Slash Commands ===
const commands = [
  {
    name: 'testrecap',
    description: 'Generate a test recap for a single game',
    options: [{ name: 'gamerow', description: 'The row number of the game in your sheet', type: 4, required: false }],
  },
  {
    name: 'matchup',
    description: 'Compare two team stats',
    options: [
      { name: 'team1', description: 'First team abbreviation (e.g., SUP, BNX)', type: 3, required: true },
      { name: 'team2', description: 'Second team abbreviation (e.g., THS, NCJ)', type: 3, required: true },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
(async () => {
  try {
    console.log('⚡ Registering commands...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Commands registered!');
  } catch (err) {
    console.error('❌ Error registering commands:', err);
  }
})();

// === Interaction Handling ===
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  // ==== /testrecap ====
  /* ==== COMMENTING OUT UNTIL READY TO TEST ====
  if (interaction.commandName === 'testrecap') {
    try {
      await interaction.deferReply();
      const recapText = await buildRecapForRow(gameData);
      await interaction.editReply({
        content: recapText,
        files: ['./recapUtils/output/test_game.png'],
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Error generating recap");
    }
  }
  ==== END COMMENT ===*/

  // ==== /matchup ====
  if (interaction.commandName === 'matchup') {
    try {
      await interaction.deferReply();

      const team1Abbr = interaction.options.getString('team1').toUpperCase();
      const team2Abbr = interaction.options.getString('team2').toUpperCase();

      const stats = await getTeamStats();
      const team1Stats = stats[team1Abbr];
      const team2Stats = stats[team2Abbr];

      if (!team1Stats || !team2Stats) {
        return interaction.editReply("❌ Stats not found for one or both teams.");
      }

      const statsToCompare = [
        'GP','W','L','T','OTL','PTS','W%','GF','GF/G','GA','GA/G',
        'SH','S/G','SH%','SHA','SA/G','SD','FOW','FO','FO%',
        'H','H/G','HA','HD','BAG','BA','BA%','1xG','1xA','1x%',
        'PS','PSA','PS%'
      ];

      const pad = (str, len = 7) => str.toString().padEnd(len, ' ');

      let message = '';
      message += `${pad('', 10)}${pad(team1Abbr, 8)}${pad(team2Abbr, 10)}\n`;
      message += '----------------------------\n';

      statsToCompare.forEach(stat => {
        const t1 = team1Stats[stat] ?? '-';
        const t2 = team2Stats[stat] ?? '-';
        message += `${pad(stat)} | ${pad(t1)} | ${pad(t2)}\n`;
      });

      // ===== Season Results Section =====
      message += `\nHead-to-Head:\n`;

      const seasonResults = await getHeadToHeadResults(team1Abbr, team2Abbr);

      if (seasonResults.length === 0) {
        message += 'No games played between these teams this season.\n';
      } else {
        const record = {
          [team1Abbr]: { W: 0, L: 0, T: 0, OTL: 0 },
          [team2Abbr]: { W: 0, L: 0, T: 0, OTL: 0 },
        };

        seasonResults.forEach(game => {
          const { Home, Away, HomeScore, AwayScore, OT } = game;
          const hs = parseInt(HomeScore, 10);
          const as = parseInt(AwayScore, 10);
          if (isNaN(hs) || isNaN(as)) return;

          if (hs === as) {
            record[Home].T++;
            record[Away].T++;
          } else if (hs > as) {
            if (OT && OT.toLowerCase().includes('ot')) record[Away].OTL++;
            else record[Away].L++;
            record[Home].W++;
          } else {
            if (OT && OT.toLowerCase().includes('ot')) record[Home].OTL++;
            else record[Home].L++;
            record[Away].W++;
          }
        });

        message += `${team1Abbr}: ${record[team1Abbr].W}-${record[team1Abbr].L}-${record[team1Abbr].T}-${record[team1Abbr].OTL}\n`;
        message += `${team2Abbr}: ${record[team2Abbr].W}-${record[team2Abbr].L}-${record[team2Abbr].T}-${record[team2Abbr].OTL}\n`;

        message += `\nGame Scores:\n`;
        seasonResults.forEach(game => {
          message += `${game.Away} ${game.AwayScore}-${game.HomeScore} ${game.Home}\n`;
        });
      }

      await interaction.editReply({ content: `\`\`\`\n${message}\`\`\`` });

    } catch (err) {
      console.error(err);
      try {
        await interaction.editReply("❌ Error generating matchup stats.");
      } catch (_) {
        console.log('Failed to send reply — interaction may have expired.');
      }
    }
  }
});

// === Get Head-to-Head Results ===
async function getHeadToHeadResults(team1, team2) {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'RawSchedule!A2:Z1000',
  });
  const rows = res.data.values;
  if (!rows || !rows.length) return [];

  const results = [];

  rows.forEach(row => {
    const Home = row[8];       // column I = HomeTeam
    const HomeScore = row[10]; // column K
    const Away = row[11];      // column L = AwayTeam
    const AwayScore = row[13]; // column N
    const OT = row[14];        // column O

    if (!Home || !Away || HomeScore === undefined || AwayScore === undefined) return;

    if ((Home === team1 && Away === team2) || (Home === team2 && Away === team1)) {
      results.push({ Home, Away, HomeScore, AwayScore, OT });
    }
  });

  return results;
}

// === Get Team Stats ===
async function getTeamStats() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'RawTeam!D3:AV30',
  });
  const rows = res.data.values;
  if (!rows || !rows.length) return {};

  const statColumnMap = {
    'GP':4,'W':5,'L':6,'T':7,'OTL':8,'PTS':9,'W%':10,'GF':11,'GF/G':12,'GA':13,'GA/G':14,
    'SH':15,'S/G':16,'SH%':17,'SHA':18,'SA/G':19,'SD':20,'FOW':28,'FO':29,'FO%':30,'H':31,
    'H/G':32,'HA':33,'HD':34,'BAG':36,'BA':37,'BA%':38,'1xG':39,'1xA':40,'1x%':41,'PS':42,'PSA':43,'PS%':44
  };

  const headers = Object.keys(statColumnMap);
  const data = {};

  rows.forEach(row => {
    if (!row[0]) return;
    const abbr = row[0].trim();
    data[abbr] = {};
    headers.forEach(header => {
      const colIndex = statColumnMap[header];
      const val = row[colIndex];
      const numVal = parseFloat(val);
      data[abbr][header] = isNaN(numVal) ? val ?? '-' : numVal;
    });
  });

  return data;
}

// === Login ===
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Discord login failed:', err));
