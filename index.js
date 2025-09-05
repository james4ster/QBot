// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events, REST, Routes } from 'discord.js';
import { google } from 'googleapis';
import fs from 'fs';
import { buildRecapForRow } from './recapUtils/buildGameRecap.js';

const phrases = JSON.parse(fs.readFileSync('./phrases.json', 'utf-8'));

// === Team and Emoji Mappings ===
import { abbrToFullName, teamEmojiMap } from './teamMappings.js';


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

  // ✅ Ticklebot mention / keyword
  if (message.mentions.has(client.user) || msgLower.includes('ticklebot')) {
    repliedMessages.add(message.id);
    await message.reply("🐺 What do you want? I'm busy watching Nyad.");
    setTimeout(() => repliedMessages.delete(message.id), 60 * 1000); // 1-minute cooldown
    return;
  }

  // === phrases.json triggers ===
  for (const phraseObj of phrases) {
    const triggers = phraseObj.triggers.map(t => t.toLowerCase());
    const triggerMatches = triggers.some(trigger => new RegExp(`\\b${trigger}\\b`, 'i').test(msgLower));
    if (triggerMatches) {
      repliedMessages.add(message.id);
      await message.channel.send(phraseObj.response);
      setTimeout(() => repliedMessages.delete(message.id), 10 * 60 * 1000);
      break; // Only respond once per message
    }
  }
});

// === Register /testrecap slash command ===
const commands = [
  {
    name: 'testrecap',
    description: 'Generate a test recap for a single game',
    options: [
      {
        name: 'gamerow',
        description: 'The row number of the game in your sheet',
        type: 4, // INTEGER
        required: false,
      },
    ],
  },

// === Register /matchup slash command (2 parameters) ===
  {
    name: 'matchup',
    description: 'Compare two team stats',
    options: [
      {
        name: 'team1',
        description: 'First team abbreviation (e.g., SUP, BNX)',
        type: 3, // STRING
        required: true
      },
      {
        name: 'team2',
        description: 'Second team abbreviation (e.g., THS, NCJ)',
        type: 3, // STRING
        required: true
      }
    ]
  }
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⚡ Registering /testrecap command...');
    await rest.put(
      Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ /testrecap command registered (guild)!');
  } catch (err) {
    console.error('❌ Error registering command:', err);
  }
})();

// === Handle /testrecap interactions ===
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;


  // === testrecap /command ===
  if (interaction.commandName === 'testrecap') {
    try {
      // 1️⃣ Defer immediately to avoid timeout
      await interaction.deferReply();

      console.log("Building recap for game...");

      // 2️⃣ Generate recap
      const recapText = await buildRecapForRow(gameData);

      // 3️⃣ Reply
      await interaction.editReply({
        content: recapText,
        files: ['./recapUtils/output/test_game.png'], // optional
      });
    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Error generating recap");
    }
  }

  // === matchup /command ===
  
  
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

      const comparison = compareTeams(team1Stats, team2Stats);

      const team1Emoji = teamEmojiMap[team1Abbr] || '';
      const team2Emoji = teamEmojiMap[team2Abbr] || '';

      // Log what is being returned for debugging
      console.log("Stats keys:", Object.keys(stats));
      console.log("Requested:", team1Abbr, team2Abbr);

      // Build a nicely lined-up table with emojis as headers
      let table = "Stat       | " + team1Emoji + " | " + team2Emoji + "\n";
      table += "---------------------------\n";

      Object.keys(comparison).forEach(stat => {
        const t1 = comparison[stat].t1.toString().padEnd(5, ' ');
        const t2 = comparison[stat].t2.toString().padEnd(5, ' ');
        table += `${stat.padEnd(10, ' ')} | ${t1} | ${t2}\n`;
      });

      await interaction.editReply({
        content: "```\n" + table + "```"
      });

    } catch (err) {
      console.error(err);
      await interaction.editReply("❌ Error generating matchup.");
    }
  }

});



// Fetch TeamLeaders stats

async function getTeamStats() {
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: 'RawTeam!D3:AV30', // buffer rows are fine
  });

  const rows = res.data.values;
  if (!rows || rows.length < 1) return {};

  const headers = [
    'GP','W','L','T','OTL','PTS','W%','GF','GF/G','GA','GA/G',
    'SH','S/G','SH%','SHA','SA/G','SD','PPG','PP','PP%',
    'PK','PKGA','PK%','SHG','FOW','FO','FO%','H','H/G','HA','HD',
    'BAG','BA','BA%','1xG','1xA','1x%','PS','PSA','PS%'
  ];

  const data = {};
  rows.forEach(row => {
    if (!row[0]) return; // skip blanks (no abbrev)

    const abbr = row[0].trim();
    data[abbr] = {};

    headers.forEach((header, i) => {
      const val = parseFloat(row[i + 4]); // ✅ stats start at col H
      data[abbr][header] = isNaN(val) ? row[i + 4] : val;
    });
  });

  return data;
}


// Compare two teams
function compareTeams(team1Stats, team2Stats) {
  const statPreference = {
    'W%': 'higher',
    'GF/G': 'higher',
    'GA/G': 'lower',
    'GF': 'higher',
    'GA': 'lower'
    // Add more if desired
  };

  const comparison = {};
  Object.keys(statPreference).forEach(stat => {
    const t1 = team1Stats[stat];
    const t2 = team2Stats[stat];

    if (t1 == null || t2 == null) return;

    if (t1 === t2) {
      comparison[stat] = { t1, t2, tie: true };
    } else {
      const t1Wins = (statPreference[stat] === 'higher' && t1 > t2) ||
                     (statPreference[stat] === 'lower' && t1 < t2);
      comparison[stat] = {
        t1: t1Wins ? `**${t1}**` : t1,
        t2: !t1Wins ? `**${t2}**` : t2,
        tie: false
      };
    }
  });

  return comparison;
}

// === Login to Discord ===
client.login(process.env.DISCORD_TOKEN).catch(err => console.error('❌ Discord login failed:', err));
