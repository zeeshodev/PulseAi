import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { GoogleGenAI, Type } from '@google/genai';

// Load .env.local in development so GEMINI_API_KEY is available locally
dotenv.config({ path: '.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

if (!process.env.GEMINI_API_KEY) {
  console.warn('GEMINI_API_KEY is not set. Set it in the environment before starting the server.');
}

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

app.post('/api/insights', async (req, res) => {
  const { industry, timezone } = req.body || {};

  if (!industry || !timezone) {
    return res.status(400).json({ error: 'industry and timezone are required' });
  }

  const now = new Date();
  const day = now.toLocaleDateString('en-US', { weekday: 'long' });
  const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const prompt = `
    You are a world-class social media strategist.
    Current Context:
    - Industry/Niche: ${industry}
    - Current Day: ${day}
    - Current Time: ${time}
    - Timezone: ${timezone}

    Task:
    Analyze real-time engagement patterns for the following platforms: Instagram, Twitter (X), LinkedIn, TikTok, and YouTube Shorts.
    Provide a forecast for the next 12 hours.
    Determine the 'currentStatus' (Excellent, Good, Fair, Poor) for posting RIGHT NOW.
    Provide the 'nextBestSlot' (e.g. 'Today 4:30 PM') if now is not ideal.
    Give a 'viralityScore' (0-100) representing the potential reach if posted now.
    Provide a short 'reasoning' (max 1 sentence).
    Provide an 'hourlyForecast' array for the next 6 hours with a score (0-100) for engagement potential.
    Provide a 'generalAdvice' summary for the user.
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            generalAdvice: { type: Type.STRING },
            platforms: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  name: { type: Type.STRING },
                  currentStatus: { type: Type.STRING },
                  nextBestSlot: { type: Type.STRING },
                  reasoning: { type: Type.STRING },
                  viralityScore: { type: Type.INTEGER },
                  hourlyForecast: {
                    type: Type.ARRAY,
                    items: {
                      type: Type.OBJECT,
                      properties: {
                        hour: { type: Type.STRING },
                        score: { type: Type.INTEGER }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    const jsonText = response.text;
    if (!jsonText) return res.status(502).json({ error: 'No data received from Gemini' });

    const parsed = JSON.parse(jsonText);
    return res.json(parsed);

  } catch (err) {
    console.error('Error in /api/insights:', err);
    return res.status(500).json({ error: 'Error fetching insights' });
  }
});

app.post('/api/trending', async (req, res) => {
  const { industry } = req.body || {};
  if (!industry) return res.status(400).json({ error: 'industry is required' });

  const prompt = `
    Find 5 currently trending topics, news stories, or viral conversations relevant to the '${industry}' industry.
    Use Google Search to get real-time data.
    
    For each topic, provide:
    1. The Topic Name
    2. A brief description (why it is trending)
    3. 3-5 relevant hashtags (e.g. #Example)
    4. 3-5 short-term keywords for SEO
    
    Format the output strictly as a structured list using these prefixes for each item:
    TREND: [Topic Name]
    DESC: [Description]
    TAGS: [comma separated hashtags]
    KEYS: [comma separated keywords]
  `;

  try {
    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: { tools: [{ googleSearch: {} }] }
    });

    const text = response.text || '';
    const items = [];
    const lines = text.split('\n');
    let current = null;

    for (const line of lines) {
      const l = line.trim();
      if (!l) continue;
      if (l.startsWith('TREND:')) {
        if (current) items.push(current);
        current = { topic: l.substring(6).trim(), description: '', hashtags: [], keywords: [] };
      } else if (l.startsWith('DESC:') && current) {
        current.description = l.substring(5).trim();
      } else if (l.startsWith('TAGS:') && current) {
        current.hashtags = l.substring(5).split(',').map(s => s.trim()).filter(Boolean);
      } else if (l.startsWith('KEYS:') && current) {
        current.keywords = l.substring(5).split(',').map(s => s.trim()).filter(Boolean);
      }
    }
    if (current) items.push(current);

    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .map(chunk => chunk.web ? { title: chunk.web.title, uri: chunk.web.uri } : null)
      .filter(Boolean);

    return res.json({ rawText: text, items, sources });

  } catch (err) {
    console.error('Error in /api/trending:', err);
    return res.status(500).json({ error: 'Error fetching trending topics' });
  }
});

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
