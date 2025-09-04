// recapLLM.js
import 'dotenv/config';

export async function generateRecapText(gameData, highlights = []) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    console.error('❌ OPENROUTER_API_KEY not set.');
    return '❌ API key missing.';
  }

  const { homeTeam, awayTeam, homeScore, awayScore } = gameData;

  // simple prompt with score and highlights
  const prompt = `
Write a short, funny, chaotic recap of this NHL '95 game:

${homeTeam} ${homeScore} vs ${awayTeam} ${awayScore}

Include the following highlights if possible:
${highlights.map(h => `- ${h.team}: ${h.goalScorer} (${h.assist1 || 'no assist'}, ${h.assist2 || 'no assist'}) [Period ${h.period}, ${h.time}]`).join('\n')}

Keep it under 150 words.
Use humor, sarcasm, and a hockey blogger voice.
`;

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.9,
        max_tokens: 300,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      console.error('OpenRouter API Error:', error);
      return '🚨 Could not generate recap.';
    }

    const data = await response.json();
    return data.choices[0].message.content.trim();

  } catch (err) {
    console.error('Request failed:', err);
    return '❌ Recap generation failed due to network error.';
  }
}
