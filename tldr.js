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
    .slice(-5000); // keep last 5000 chars

  try {
    const response = await client.chat({
      model: "command-xlarge-nightly",
      message: `Summarize the last ${hours} hours of Discord messages in a sarcastic TL;DR style:\n${chatLog}`,
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
