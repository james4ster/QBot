import { Client, GatewayIntentBits } from "discord.js";

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Listen for the 'ready' event
client.once("ready", () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Log in using your bot token from environment variables
client.login(process.env.DISCORD_BOT_TOKEN);
