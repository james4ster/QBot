import fetch from "node-fetch";

export async function generateRecapText(gameData) {
  const { homeTeam, awayTeam, homeScore, awayScore, highlights } = gameData;

  // Only keep first 3–5 highlights to avoid prompt overload
  const shortHighlights = highlights.slice(0, 5)
    .map(h => `- ${h}`)
    .join("\n");

  const prompt = `
Write a 4-5 sentence sarcastic hockey game recap.
Do NOT include any reasoning, commentary about the task, or extra notes.
Include team names, final score, and highlights clearly.
Use only the information provided below:

Home Team: ${homeTeam} (${homeScore})
Away Team: ${awayTeam} (${awayScore})
Highlights:
${shortHighlights}
`;

  try {
    const response = await fetch("https://api.openrouter.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "openai/gpt-5-mini",
        messages: [{ role: "user", content: prompt }],
        max_tokens: 1200,   // Increased limit
        temperature: 0.7
      })
    });

    const data = await response.json();

    const content = data.choices?.[0]?.message?.content;

    if (!content || content.trim() === "") {
      return "No recap could be generated at this time.";
    }

    return content.trim();
  } catch (err) {
    console.error("Error generating recap:", err);
    return "Error generating recap.";
  }
}
