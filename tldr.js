// tldr.js
import { CohereClient } from "cohere-ai";

const client = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

export async function summarizeChat(messages, hours) {
  if (!messages || messages.length === 0) {
    console.log("➡️ summarizeChat called with no messages");
    return "🤷 Nothing to summarize.";
  }

  console.log("➡️ summarizeChat called with", messages.length, "messages; cutoff (hours):", hours);

  // Format messages as a chat log
  const chatLog = messages
    .map(m => `${m.username}: ${m.message}`)
    .join("\n")
    .slice(-5000); // take last 5000 characters

  try {
    const response = await client.chat({
      model: "command-r-plus",
      messages: [
        { role: "system", content: "You are TickleBot and you love the movie Nyad. You summarize Discord chat sarcastically." },
        { role: "user", content: `Summarize the following Discord chat log (last ${hours} hours):\n${chatLog}` }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    // Chat API returns text in response.output[0].content[0].text
    const summary = response.output[0].content[0].text;
    console.log("✅ Cohere responded:", summary);
    return summary.trim();
  } catch (err) {
    console.error("❌ Cohere chat error:", err);
    return "⚠️ Failed to generate TL;DR summary.";
  }
}

