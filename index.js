// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { google } from 'googleapis';
import fs from 'fs';
import { buildRecapForRow } from './recapUtils/buildGameRecap.js';

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

      // Fetch emojis from Google Sheets BSB Settings
      const emojiMap = await getDiscordEmojiMap();
      const team1Emoji = emojiMap[team1Abbr] || team1Abbr;
      const team2Emoji = emojiMap[team2Abbr] || team2Abbr;

      const statsToCompare = [
        'GP','W','L','T','OTL','PTS','W%','GF','GF/G','GA','GA/G',
        'SH','S/G','SH%','SHA','SA/G','SD','FOW','FO','FO%',
        'H','H/G','HA','HD','BAG','BA','BA%','1xG','1xA','1x%',
        'PS','PSA','PS%'
      ];

      // Build the table for Discord
      let tableHeader = `${team1Emoji} ${team1Abbr} | ${team2Emoji} ${team2Abbr}`;
      let table = "```"; // start code block

      statsToCompare.forEach(stat => {
        const t1 = team1Stats[stat] ?? '-';
        const t2 = team2Stats[stat] ?? '-';
        table += `\n${stat.padEnd(6)} | ${t1.toString().padEnd(6)} | ${t2}`;
      });

      table += "\n```";

      await interaction.editReply(`${tableHeader}\n${table}`);
    } catch (err) {
      console.error(err);
      if (!interaction.replied) await interaction.editReply("❌ Error fetching matchup stats");
    }
  }
});

// === Get Team Stats ===
async function getTeamStats() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'RawTeam!D3:AV30', // data starts at column D
  });
  const rows = res.data.values;
  if (!rows || !rows.length) return {};

  // Corrected mapping relative to column D
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
    'FOW': 31,  // AF
    'FO': 32,   // AG
    'FO%': 33,  // AH
    'H': 34,    // AI
    'H/G': 35,  // AJ
    'HA': 36,   // AK
    'HD': 37,   // AL
    'BAG': 39,  // AN
    'BA': 40,   // AO
    'BA%': 41,  // AP
    '1xG': 42,  // AQ
    '1xA': 43,  // AR
    '1x%': 44,  // AS
    'PS': 45,   // AT
    'PSA': 46,  // AU
    'PS%': 47   // AV
  };

  const headers = Object.keys(statColumnMap);
  const data = {};

  rows.forEach(row => {
    if (!row[0]) return;
    const abbr = row[0].trim(); // column D is team abbreviation
    data[abbr] = {};

    headers.forEach(header => {
      const colIndex = statColumnMap[header];
      const val = row[colIndex]; 
      data[abbr][header] = val ?? '-';
    });
  });

  return data;
}

// === Get Discord Emoji Map from BSB Settings ===
async function getDiscordEmojiMap() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'BSB Settings!B25:E40',
  });
  const rows = res.data.values || [];
  const map = {};
  rows.forEach(row => {
    if (!row[2] || !row[3]) return; // Team or Emoji ID missing
    map[row[2].trim()] = `<:${row[4] || row[2]}:${row[3]}>`; // use custom emoji
  });
  return map;
}

// === Login ===
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Discord login failed:', err));
