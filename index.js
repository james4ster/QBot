import 'dotenv/config';
import express from 'express';
import { Client, GatewayIntentBits, Events } from 'discord.js';

// --- Discord client ---
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

client.once(Events.ClientReady, () => {
  console.log(`🤖 Logged in as ${client.user.tag}!`);
});

client.login(process.env.DISCORD_BOT_TOKEN);

// --- Express keepalive server ---
const app = express();

app.get('/', (req, res) => {
  res.send('Tickle Bot is running in the Q ✅');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🌐 Express server listening on port ${PORT}`);
});
