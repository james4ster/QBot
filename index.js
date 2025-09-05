// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { google } from 'googleapis';
import fs from 'fs';
import { buildRecapForRow } from './recapUtils/buildGameRecap.js';
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

// === Phrase message tracking ===
const repliedMessages = new Set();

// === Discord Events ===
client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
});

// === Message Handling ===
client.on('messageCreate', async message => {
  if (message.author.bot || message.webhookId) return;
  if (repliedMessages.has(message.id)) return;

  const msgLower = message.content.toLowerCase();

  if (message.mentions.has(client.user) || msgLower.includes('ticklebot')) {
    repliedMessages.add(message.id);
    await message.reply("🐺 What do you want? I'm busy watching Nyad.");
    setTimeout(() => repliedMessages.delete(message.id), 60 * 1000);
    return;
  }

  for (const phraseObj of phrases) {
    const triggers = phraseObj.triggers.map(t => t.toLowerCase());
    if (triggers.some(trigger => new RegExp(`\\b${trigger}\\b`, 'i').test(msgLower))) {
      repliedMessages.add(message.id);
      await message.channel.send(phraseObj.response);
      setTimeout(() => repliedMessages.delete(message.id), 10 * 60 * 1000);
      break;
    }
  }
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
client.on('interactionCreate', async (interaction) => {
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
  } */

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
      // Team abbreviations row
      message += `${pad('', 10)}${pad(team1Abbr, 8)}${pad(team2Abbr, 8)}\n`;
      message += '---------- -------- --------\n';

      // Stats rows
      statsToCompare.forEach(stat => {
        const t1 = team1Stats[stat] ?? '-';
        const t2 = team2Stats[stat] ?? '-';
        message += `${pad(stat)} | ${pad(t1)} | ${pad(t2)}\n`;
      });

      // ===== Season Results Section =====
      message += `\nSeason Results:\n`;

      const seasonResults = await getHeadToHeadResults(team1Abbr, team2Abbr);
      if (seasonResults.length === 0) {
        message += 'No games played between these teams this season.\n';
      } else {
        seasonResults.forEach(game => {
          // Format: Away v Home | Score
          const line = `${game.Away} v ${game.Home} | ${game.AwayScore}-${game.HomeScore}`;
          message += `${line}\n`;
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

  // === Get Head-to-Head Results ===
  async function getHeadToHeadResults(team1, team2) {
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: 'RawSchedule!A2:Z1000', // adjust if needed
    });
    const rows = res.data.values;
    if (!rows || !rows.length) return [];

    const results = [];

    rows.forEach(row => {
      const H = row[4]; // Home team abbreviation column
      const A = row[3]; // Away team abbreviation column
      const Hscore = row[7]; // Home score column
      const Ascore = row[9]; // Away score column

      if (!H || !A || Hscore === undefined || Ascore === undefined) return;

      if ((H === team1 && A === team2) || (H === team2 && A === team1)) {
        results.push({
          Home: H,
          Away: A,
          HomeScore: Hscore,
          AwayScore: Ascore
        });
      }
    });

    return results;
  }






});

// === Get Team Stats ===
async function getTeamStats() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'RawTeam!D3:AV30', // D=0, AV is last column we care about
  });
  const rows = res.data.values;
  if (!rows || !rows.length) return {};

  // ✅ Corrected mapping for only the stats you wanted
  // Column indices are zero-based relative to column D
  const statColumnMap = {
    'GP': 4,    // H
    'W': 5,     // I
    'L': 6,     // J
    'T': 7,     // K
    'OTL': 8,   // L
    'PTS': 9,   // M
    'W%': 10,   // N
    'GF': 11,   // O
    'GF/G': 12, // P
    'GA': 13,   // Q
    'GA/G': 14, // R
    'SH': 15,   // S
    'S/G': 16,  // T
    'SH%': 17,  // U
    'SHA': 18,  // V
    'SA/G': 19, // W
    'SD': 20,   // X
    'FOW': 28,  // AF
    'FO': 29,   // AG
    'FO%': 30,  // AH
    'H': 31,    // AI
    'H/G': 32,  // AJ
    'HA': 33,   // AK
    'HD': 34,   // AL
    'BAG': 36,  // AN
    'BA': 37,   // AO
    'BA%': 38,  // AP
    '1xG': 39,  // AQ
    '1xA': 40,  // AR
    '1x%': 41,  // AS
    'PS': 42,   // AT
    'PSA': 43,  // AU
    'PS%': 44   // AV
  };

  const headers = Object.keys(statColumnMap);

  const data = {};
  rows.forEach(row => {
    if (!row[0]) return;
    const abbr = row[0].trim(); // Team abbreviation in column D
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
