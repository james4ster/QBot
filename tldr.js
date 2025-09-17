// tldr.js
import { CohereClient } from "cohere-ai";

const client = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

export async function summarizeChat(messages, hours) {
  console.log("➡️ summarizeChat called with", messages.size, "messages; cutoff (hours):", hours);

  const chatLog = messages
    .map(m => `${m.author.username}: ${m.content}`)
    .join("\n");

  const prompt = `
Summarize the following Discord chat log into a sarcastic, newspaper-style narrative.
Ignore all bot messages. Maximum length: 150 words. Write as a single narrative paragraph.

Chat Log (last ${hours} hours):
${chatLog}
`;

  try {
    const response = await client.generate({
      model: "command-xlarge", // use stable model
      prompt,
      max_tokens: 500,
      temperature: 0.7,
    });

    console.log("✅ Cohere responded:", response);
    return response.generations[0].text.trim();
  } catch (err) {
    console.error("❌ Cohere generate error:", err);
    return "⚠️ Failed to generate TL;DR summary.";
  }
}
