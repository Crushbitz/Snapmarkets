import axios from "axios";
import type { Signal, IndicatorResult } from "./indicators";
import type { Symbol, Interval } from "./binance";
import { logger } from "../lib/logger";

const JUNEAI_KEY  = process.env["JUNEAI_API_KEY"];
const SNAP_MODELS = ["june-pro", "june-2", "june-1"];

export interface JuneAIAnalysis {
  sentiment: "bullish" | "bearish" | "neutral";
  summary: string;
  available: boolean;
}

export interface JuneAISnapVote {
  direction: "UP" | "DOWN" | "NEUTRAL";
  available: boolean;
}

async function callJuneAI(
  model: string,
  messages: { role: string; content: string }[],
  maxTokens: number
): Promise<string> {
  const res = await axios.post(
    "https://api.june.ag/v1/chat/completions",
    { model, messages, max_tokens: maxTokens, temperature: 0.2 },
    {
      headers: { Authorization: `Bearer ${JUNEAI_KEY}`, "Content-Type": "application/json" },
      timeout: 6000,
    }
  );
  return res.data?.choices?.[0]?.message?.content?.trim() ?? "";
}

async function callWithFallback(
  messages: { role: string; content: string }[],
  maxTokens: number
): Promise<string> {
  for (const model of SNAP_MODELS) {
    try {
      const text = await callJuneAI(model, messages, maxTokens);
      if (text) { logger.info({ model }, "JuneAI responded"); return text; }
    } catch { /* try next */ }
  }
  throw new Error("All JuneAI models failed");
}

export async function getJuneAISnapVote(
  symbol: Symbol,
  price: number,
  rsi: number,
  macdHist: number,
  ema5: number,
  ema10: number
): Promise<JuneAISnapVote> {
  if (!JUNEAI_KEY) return { direction: "NEUTRAL", available: false };
  try {
    const coin     = symbol === "BTCUSDT" ? "BTC" : "ETH";
    const trend    = ema5 > ema10 ? "EMA5 > EMA10 (bullish)" : "EMA5 < EMA10 (bearish)";
    const macdDir  = macdHist > 0 ? "positive (bullish)" : "negative (bearish)";
    const rsiState = rsi > 55 ? "above 55 (bullish)" : rsi < 45 ? "below 45 (bearish)" : "neutral zone";
    const prompt =
      `You are a crypto scalping AI. ${coin}/USDT price is $${price.toFixed(2)}. ` +
      `RSI: ${rsi.toFixed(1)} (${rsiState}). MACD histogram: ${macdHist.toFixed(6)} (${macdDir}). ` +
      `${trend}. For a 25-second trade right now, reply with exactly one word: UP, DOWN, or NEUTRAL.`;
    const text      = await callWithFallback([{ role: "user", content: prompt }], 5);
    const upper     = text.toUpperCase().trim();
    const direction = upper.includes("UP") ? "UP" : upper.includes("DOWN") ? "DOWN" : "NEUTRAL";
    return { direction, available: true };
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "JuneAI snap vote failed");
    return { direction: "NEUTRAL", available: false };
  }
}

export async function getJuneAIAnalysis(
  symbol: Symbol,
  interval: Interval,
  ind: IndicatorResult,
  signal: Signal
): Promise<JuneAIAnalysis> {
  if (!JUNEAI_KEY) return { sentiment: "neutral", summary: "", available: false };
  try {
    const prompt =
      `You are a professional crypto trader. Analyze ${symbol} on the ${interval} timeframe:\n` +
      `Price: $${ind.currentPrice.toFixed(2)}, RSI: ${ind.rsi.toFixed(1)}, ` +
      `MACD hist: ${ind.macd.histogram.toFixed(5)}, ` +
      `EMA20: ${ind.ema20.toFixed(2)}, EMA50: ${ind.ema50.toFixed(2)}, EMA200: ${ind.ema200.toFixed(2)}, ` +
      `BB upper/lower: ${ind.bb.upper.toFixed(2)}/${ind.bb.lower.toFixed(2)}, ` +
      `Stoch K/D: ${ind.stoch.k.toFixed(1)}/${ind.stoch.d.toFixed(1)}, ` +
      `ADX: ${ind.adx.toFixed(1)}, Support: $${ind.support.toFixed(2)}, Resistance: $${ind.resistance.toFixed(2)}. ` +
      `Technical signal: ${signal.direction} (${signal.confidence}% confidence). ` +
      `In 1-2 short sentences, give your market assessment. Start with BULLISH, BEARISH, or NEUTRAL.`;
    const text = await callWithFallback([{ role: "user", content: prompt }], 120);
    if (!text) return { sentiment: "neutral", summary: "", available: false };
    const lower     = text.toLowerCase();
    const sentiment = lower.startsWith("bullish") ? "bullish" : lower.startsWith("bearish") ? "bearish" : "neutral";
    return { sentiment, summary: text, available: true };
  } catch (err: unknown) {
    logger.warn({ err: err instanceof Error ? err.message : String(err) }, "JuneAI analysis failed");
    return { sentiment: "neutral", summary: "", available: false };
  }
}
