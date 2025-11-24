import { GoogleGenAI, Type } from "@google/genai";
import { SocialInsightsResponse, TrendingData, TrendingItem } from "../types";

// Initialize Gemini Client
const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

export const fetchSocialInsights = async (
  industry: string,
  timezone: string
): Promise<SocialInsightsResponse> => {
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
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
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
                  currentStatus: { type: Type.STRING, enum: ["Excellent", "Good", "Fair", "Poor"] },
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
    if (!jsonText) throw new Error("No data received from Gemini");

    return JSON.parse(jsonText) as SocialInsightsResponse;

  } catch (error) {
    console.error("Error fetching Gemini insights:", error);
    throw error;
  }
};

export const fetchTrendingTopics = async (industry: string): Promise<TrendingData> => {
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
    
    Example:
    TREND: Artificial Intelligence
    DESC: New models are breaking benchmarks.
    TAGS: #AI, #TechTrends, #MachineLearning
    KEYS: LLM, generative ai, tech news
    
    Do not use bolding (**) or other markdown. Keep it plain text.
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
      }
    });

    const text = response.text || "";
    
    const items: TrendingItem[] = [];
    const lines = text.split('\n');
    let currentItem: Partial<TrendingItem> = {};

    for (const line of lines) {
      const l = line.trim();
      
      if (l.startsWith('TREND:')) {
        // Save previous item if it exists
        if (currentItem.topic) {
          items.push(currentItem as TrendingItem);
        }
        // Start new item
        currentItem = { 
          topic: l.substring(6).trim(), 
          description: "", 
          hashtags: [], 
          keywords: [] 
        };
      } else if (l.startsWith('DESC:') && currentItem.topic) {
        currentItem.description = l.substring(5).trim();
      } else if (l.startsWith('TAGS:') && currentItem.topic) {
        currentItem.hashtags = l.substring(5).split(',').map(s => s.trim()).filter(s => s);
      } else if (l.startsWith('KEYS:') && currentItem.topic) {
        currentItem.keywords = l.substring(5).split(',').map(s => s.trim()).filter(s => s);
      }
    }
    
    // Push the last item
    if (currentItem.topic) {
      items.push(currentItem as TrendingItem);
    }

    // Extract grounding metadata
    const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks || [];
    const sources = groundingChunks
      .map((chunk: any) => chunk.web ? { title: chunk.web.title, uri: chunk.web.uri } : null)
      .filter((s: any) => s !== null);

    return {
      rawText: text,
      items,
      sources
    };

  } catch (error) {
    console.error("Error fetching trending topics:", error);
    // Return empty state on error rather than throwing to avoid blocking main insights
    return { items: [], rawText: "Could not fetch trending topics.", sources: [] };
  }
};
