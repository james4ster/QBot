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

// === Login to Discord ===
client.login(process.env.DISCORD_BOT_TOKEN)
  .catch(err => {
    console.error('❌ Discord login failed:', err);
  });


// === Bot Ready & Listener ===
client.once('clientReady', () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);

  // === Message listener for phrases (registered once) ===
  client.on('messageCreate', (message) => {
    if (message.author.bot) return;

    const content = message.content.toLowerCase().split(/\s+/); // split into words

    for (const obj of phrases) {
      for (const trigger of obj.triggers) {
        const triggerLower = trigger.toLowerCase();
        if (triggerLower.length <= 2) {
          // For very short triggers, check exact word match
          if (content.includes(triggerLower)) {
            message.channel.send(obj.response);
            return;
          }
        } else {
          // For longer triggers, use regex with word boundaries
          const regex = new RegExp(`\\b${triggerLower}\\b`, 'i');
          if (regex.test(message.content)) {
            message.channel.send(obj.response);
            return;
          }
        }
      }
    }
  });
});




