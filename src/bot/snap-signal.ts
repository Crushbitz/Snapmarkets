import { EMA, RSI, MACD, Stochastic } from "technicalindicators";
import { getKlines, getPrice, type Symbol } from "./binance";
import { getJuneAISnapVote } from "./juneai";

export type SnapDirection = "UP" | "DOWN";

export interface SnapResult {
  direction: SnapDirection;
  price: number;
  strength: number; // 1-5
  symbol: Symbol;
  aiConfirmed: boolean;
  indicators: {
    rsi: number;
    macdHist: number;
    ema5: number;
    ema10: number;
    stochK: number;
  };
}

export async function getSnapSignal(symbol: Symbol): Promise<SnapResult> {
  const [klines1m, klines3m, livePrice] = await Promise.all([
    getKlines(symbol, "1m", 50),
    getKlines(symbol, "3m", 30),
    getPrice(symbol),
  ]);

  const closes1m = klines1m.map((k) => k.close);
  const highs1m  = klines1m.map((k) => k.high);
  const lows1m   = klines1m.map((k) => k.low);
  const closes3m = klines3m.map((k) => k.close);
  const all1m    = [...closes1m, livePrice];

  let bullScore = 0;

  const ema5     = EMA.calculate({ values: all1m, period: 5 });
  const ema10    = EMA.calculate({ values: all1m, period: 10 });
  const e5       = ema5[ema5.length - 1]   ?? livePrice;
  const e5Prev   = ema5[ema5.length - 4]   ?? e5;
  const e10      = ema10[ema10.length - 1] ?? livePrice;

  if (e5 > e10)    bullScore += 1; else bullScore -= 1;
  if (e5 > e5Prev) bullScore += 1; else bullScore -= 1;

  const rsi1m   = RSI.calculate({ values: all1m, period: 14 });
  const rsi     = rsi1m[rsi1m.length - 1] ?? 50;
  const rsiPrev = rsi1m[rsi1m.length - 4] ?? rsi;
  if      (rsi > 52 && rsi > rsiPrev) bullScore += 1;
  else if (rsi < 48 && rsi < rsiPrev) bullScore -= 1;

  const macd1m   = MACD.calculate({
    values: all1m, fastPeriod: 3, slowPeriod: 8, signalPeriod: 5,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  const mLast    = macd1m[macd1m.length - 1];
  const mPrev    = macd1m[macd1m.length - 2];
  const macdHist = mLast?.histogram ?? 0;
  const macdPrev = mPrev?.histogram ?? 0;
  if      (macdHist > 0 && macdHist >= macdPrev) bullScore += 1;
  else if (macdHist < 0 && macdHist <= macdPrev) bullScore -= 1;

  const stoch1m = Stochastic.calculate({ high: highs1m, low: lows1m, close: closes1m, period: 14, signalPeriod: 3 });
  const stochK  = stoch1m[stoch1m.length - 1]?.k ?? 50;
  if      (stochK > 55) bullScore += 1;
  else if (stochK < 45) bullScore -= 1;

  const lastClose1m = closes1m[closes1m.length - 1] ?? livePrice;
  if      (livePrice > lastClose1m) bullScore += 1;
  else if (livePrice < lastClose1m) bullScore -= 1;

  const ema5_3m  = EMA.calculate({ values: closes3m, period: 5 });
  const ema10_3m = EMA.calculate({ values: closes3m, period: 10 });
  const e5_3m    = ema5_3m[ema5_3m.length - 1]   ?? livePrice;
  const e10_3m   = ema10_3m[ema10_3m.length - 1] ?? livePrice;
  if (e5_3m > e10_3m) bullScore += 1; else bullScore -= 1;

  const rsi3m = RSI.calculate({ values: closes3m, period: 14 });
  const r3m   = rsi3m[rsi3m.length - 1] ?? 50;
  if      (r3m > 52) bullScore += 1;
  else if (r3m < 48) bullScore -= 1;

  const taDirection: SnapDirection = bullScore >= 0 ? "UP" : "DOWN";
  const aiVote = await getJuneAISnapVote(symbol, livePrice, rsi, macdHist, e5, e10);

  let aiConfirmed = false;
  if (aiVote.available && aiVote.direction !== "NEUTRAL") {
    if (aiVote.direction === taDirection) {
      bullScore += taDirection === "UP" ? 2 : -2;
      aiConfirmed = true;
    } else {
      bullScore = Math.trunc(bullScore * 0.6);
    }
  }

  const direction: SnapDirection = bullScore >= 0 ? "UP" : "DOWN";
  const strength = Math.min(5, Math.max(1, Math.round((Math.abs(bullScore) / 12) * 5)));

  return { direction, price: livePrice, strength, symbol, aiConfirmed,
    indicators: { rsi, macdHist, ema5: e5, ema10: e10, stochK } };
}
