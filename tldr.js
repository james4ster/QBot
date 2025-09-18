import { CohereClient } from "cohere-ai";

const client = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

export async function summarizeChat(messages, hours) {
  if (!messages || messages.length === 0) {
    console.log("➡️ summarizeChat called with no messages");
    return "🤷 Nothing to summarize.";
  }

  const safeMessages = messages
    .filter(m => m && typeof m.content === "string" && m.content.trim())
    .map(m => ({
      username: m.author?.username || "Unknown",
      content: m.content.trim(),
    }));

  if (!safeMessages.length) {
    return "🤷 No valid messages to summarize.";
  }

  console.log(`➡️ summarizeChat called with ${safeMessages.length} messages; cutoff (hours): ${hours}`);

  const chatLog = safeMessages
    .map(m => `${m.username}: ${m.content}`)
    .join("\n")
    .slice(-5000);

  try {
    const response = await client.chat({
      model: "command-xlarge-nightly",
      message: `Write a sarcastic TL;DR of the last ${hours} hours of Discord chat. 
      1. Roast the overall vibe of the conversation. 
      2. Call out usernames for being quirky and petty. 
      3. Don't mention TLDR in the response.
      4. Be concise and funny.
      Messages:\n${chatLog}`,
      temperature: 0.8,
      max_tokens: 400,
    });

    const summaryText = response.text?.trim();
    if (!summaryText) {
      console.warn("⚠️ Cohere response text is empty:", JSON.stringify(response, null, 2));
      return "⚠️ Couldn’t get summary text from Cohere.";
    }

    console.log("✅ Cohere responded:", summaryText);
    return summaryText;
  } catch (err) {
    console.error("❌ Cohere chat error:", err);
    return "⚠️ Failed to generate TL;DR summary.";
  }
}
