// tldr.js
import { CohereClient } from "cohere-ai";

const client = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

export async function summarizeChat(messages, hours) {
  console.log(`➡️ summarizeChat called with ${messages.length} messages; cutoff (hours): ${hours}`);

  // Turn the array of messages into a single block of text
  const chatText = messages
    .map((m) => `${m.role === "user" ? m.username || "User" : m.role}: ${m.content}`)
    .join("\n");

  const prompt = `
You are Ticklebot, a sarcastic and insulting summarizer. 
Summarize the following Discord messages from the last ${hours} hours in a funny, mocking TL;DR style. 
Keep it short, biting, and dismissive.

Messages:
${chatText}
`;

  try {
    const response = await client.chat({
      model: "command-r-plus",
      message: prompt,
      temperature: 0.8,
      max_tokens: 400,
    });

    console.log("✅ Cohere chat success");
    return response.text?.trim() || "⚠️ No TL;DR could be generated.";
  } catch (err) {
    console.error("❌ Cohere chat error:", err);
    return "⚠️ Failed to generate TL;DR from Cohere.";
  }
}
