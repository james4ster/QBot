// tldr.js
import { CohereClient } from "cohere-ai";

const client = new CohereClient({
  token: process.env.COHERE_API_KEY,
});

/**
 * Summarize a set of Discord messages in a sarcastic TL;DR.
 * @param {Array} messages - Array of objects: { author: { username }, content: string }
 * @param {number} hours - Number of hours of messages being summarized
 * @returns {string} - Summary text
 */
export async function summarizeChat(messages, hours) {
  if (!messages || messages.length === 0) {
    console.log("➡️ summarizeChat called with no messages");
    return "🤷 Nothing to summarize.";
  }

  // Filter out messages without content and make a safe map
  const safeMessages = messages
    .filter(m => m && m.content && typeof m.content === 'string' && m.content.trim())
    .map(m => ({
      username: m.author?.username || "Unknown",
      content: m.content.trim(),
    }));

  if (!safeMessages.length) {
    return "🤷 No valid messages to summarize.";
  }

  console.log(`➡️ summarizeChat called with ${safeMessages.length} messages; cutoff (hours): ${hours}`);

  // Concatenate messages into a single chat log string
  const chatLog = safeMessages
    .map(m => `${m.username}: ${m.content}`)
    .join("\n")
    .slice(-5000); // last 5000 characters to stay under token limit

  try {
    const response = await client.chat({
      model: "command-r-plus",
      messages: [
        {
          role: "system",
          content: "You are TickleBot, a sarcastic Discord summarizer who loves the movie Nyad."
        },
        {
          role: "user",
          content: `Summarize the following Discord chat log (last ${hours} hours) in a funny, sarcastic way:\n${chatLog}`
        }
      ],
      max_tokens: 500,
      temperature: 0.7,
    });

    // ✅ Correctly access the text depending on API response
    let summary = "";
    if (response.output?.[0]?.content?.[0]?.text) {
      summary = response.output[0].content[0].text;
    } else if (response.output?.[0]?.content?.[0]?.content?.[0]?.text) {
      summary = response.output[0].content[0].content[0].text;
    } else {
      console.warn("⚠️ Cohere response had unexpected structure:", JSON.stringify(response.output, null, 2));
      return "⚠️ Failed to parse TL;DR summary from Cohere response.";
    }

    console.log("✅ Cohere responded:", summary);
    return summary.trim();

  } catch (err) {
    console.error("❌ Cohere chat error:", err);
    return "⚠️ Failed to generate TL;DR summary.";
  }
}
