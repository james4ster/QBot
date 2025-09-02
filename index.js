// === Imports ===
import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits } from 'discord.js';
import { google } from 'googleapis';
import fetch from 'node-fetch'; // Make sure node-fetch is installed

import fs from 'fs';
const phrases = JSON.parse(fs.readFileSync('./phrases.json', 'utf-8'));



// === Express Server ===
const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

app.get('/', (req, res) => {
  res.send('QBot is alive!');
});


// === Start Express Server ===
app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});

// === Discord Bot ===
const client = new Client({ 
  intents: [
    GatewayIntentBits.Guilds, 
    GatewayIntentBits.GuildMessages, 
    GatewayIntentBits.MessageContent 
  ] 
});

// === Google Sheets Setup ===
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);
const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
});
const sheets = google.sheets({ version: 'v4', auth });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;


// === Bot Ready ===
client.once('clientready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
});


// === Login to Discord ===
client.login(process.env.DISCORD_BOT_TOKEN)
  .catch(err => {
    console.error('❌ Discord login failed:', err);
  });

// === Message listener for phrases ===
client.on('messageCreate', (message) => {
  if (message.author.bot) return; // ignore other bots

  const content = message.content.toLowerCase();

  for (const obj of phrases) {
    for (const trigger of obj.triggers) {
      if (content.includes(trigger.toLowerCase())) {
        message.channel.send(obj.response);
        return; // respond only once per message
      }
    }
  }
});
