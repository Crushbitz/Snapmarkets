import { RSI, MACD, EMA, BollingerBands, Stochastic, ADX } from "technicalindicators";
import type { Kline } from "./binance";

export interface IndicatorResult {
  rsi: number;
  macd: { MACD: number; signal: number; histogram: number };
  ema20: number;
  ema50: number;
  ema200: number;
  bb: { upper: number; middle: number; lower: number };
  stoch: { k: number; d: number };
  adx: number;
  atr: number;
  currentPrice: number;
  support: number;
  resistance: number;
  volumeSpike: boolean;
}

export function computeIndicators(klines: Kline[]): IndicatorResult {
  const closes  = klines.map((k) => k.close);
  const highs   = klines.map((k) => k.high);
  const lows    = klines.map((k) => k.low);
  const volumes = klines.map((k) => k.volume);

  const rsiVals  = RSI.calculate({ values: closes, period: 14 });
  const rsi      = rsiVals[rsiVals.length - 1] ?? 50;

  const macdVals = MACD.calculate({
    values: closes, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9,
    SimpleMAOscillator: false, SimpleMASignal: false,
  });
  const lastMacd = macdVals[macdVals.length - 1] ?? { MACD: 0, signal: 0, histogram: 0 };

  const ema20Vals  = EMA.calculate({ values: closes, period: 20 });
  const ema50Vals  = EMA.calculate({ values: closes, period: 50 });
  const ema200Vals = EMA.calculate({ values: closes, period: 200 });

  const bbVals  = BollingerBands.calculate({ values: closes, period: 20, stdDev: 2 });
  const lastBb  = bbVals[bbVals.length - 1] ?? { upper: 0, middle: 0, lower: 0 };

  const stochVals = Stochastic.calculate({ high: highs, low: lows, close: closes, period: 14, signalPeriod: 3 });
  const lastStoch = stochVals[stochVals.length - 1] ?? { k: 50, d: 50 };

  const adxVals = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const adx     = adxVals[adxVals.length - 1]?.adx ?? 0;

  const trueRanges: number[] = [];
  for (let i = 1; i < klines.length; i++) {
    trueRanges.push(Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]!  - closes[i - 1]!)
    ));
  }
  const atr = trueRanges.slice(-14).reduce((a, b) => a + b, 0) / Math.min(14, trueRanges.length);

  const recent     = klines.slice(-20);
  const support    = Math.min(...recent.map((k) => k.low));
  const resistance = Math.max(...recent.map((k) => k.high));

  const recentVols = volumes.slice(-20);
  const avgVol     = recentVols.slice(0, -1).reduce((a, b) => a + b, 0) / (recentVols.length - 1);
  const volumeSpike = (volumes[volumes.length - 1] ?? 0) > avgVol * 1.5;

  const currentPrice = closes[closes.length - 1]!;

  return {
    rsi,
    macd: { MACD: lastMacd.MACD ?? 0, signal: lastMacd.signal ?? 0, histogram: lastMacd.histogram ?? 0 },
    ema20:  ema20Vals[ema20Vals.length - 1]   ?? currentPrice,
    ema50:  ema50Vals[ema50Vals.length - 1]   ?? currentPrice,
    ema200: ema200Vals[ema200Vals.length - 1] ?? currentPrice,
    bb:     { upper: lastBb.upper, middle: lastBb.middle, lower: lastBb.lower },
    stoch:  { k: lastStoch.k, d: lastStoch.d },
    adx, atr, currentPrice, support, resistance, volumeSpike,
  };
}

export type SignalDirection = "STRONG BUY" | "BUY" | "NEUTRAL" | "SELL" | "STRONG SELL";

export interface Signal {
  direction: SignalDirection;
  confidence: number;
  reasons: string[];
  entry: number;
  stopLoss: number;
  takeProfit1: number;
  takeProfit2: number;
  riskReward: string;
}

export function generateSignal(ind: IndicatorResult): Signal {
  let score = 0;
  const reasons: string[] = [];

  if (ind.rsi < 30)      { score += 2; reasons.push(`RSI oversold (${ind.rsi.toFixed(1)})`); }
  else if (ind.rsi < 45) { score += 1; reasons.push(`RSI below neutral (${ind.rsi.toFixed(1)})`); }
  else if (ind.rsi > 70) { score -= 2; reasons.push(`RSI overbought (${ind.rsi.toFixed(1)})`); }
  else if (ind.rsi > 55) { score -= 1; reasons.push(`RSI above neutral (${ind.rsi.toFixed(1)})`); }

  if (ind.macd.MACD > ind.macd.signal && ind.macd.histogram > 0) {
    score += 2; reasons.push("MACD bullish crossover");
  } else if (ind.macd.MACD < ind.macd.signal && ind.macd.histogram < 0) {
    score -= 2; reasons.push("MACD bearish crossover");
  }

  if (ind.currentPrice > ind.ema20 && ind.ema20 > ind.ema50)      { score += 2; reasons.push("Price above EMA20 > EMA50 (uptrend)"); }
  else if (ind.currentPrice < ind.ema20 && ind.ema20 < ind.ema50) { score -= 2; reasons.push("Price below EMA20 < EMA50 (downtrend)"); }

  if (ind.currentPrice > ind.ema200) { score += 1; reasons.push("Above EMA200 (long-term bullish)"); }
  else                               { score -= 1; reasons.push("Below EMA200 (long-term bearish)"); }

  if (ind.currentPrice <= ind.bb.lower)      { score += 2; reasons.push("Price at lower Bollinger Band (oversold)"); }
  else if (ind.currentPrice >= ind.bb.upper) { score -= 2; reasons.push("Price at upper Bollinger Band (overbought)"); }

  if (ind.stoch.k < 20 && ind.stoch.d < 20)     { score += 1; reasons.push(`Stoch oversold (K:${ind.stoch.k.toFixed(0)}, D:${ind.stoch.d.toFixed(0)})`); }
  else if (ind.stoch.k > 80 && ind.stoch.d > 80) { score -= 1; reasons.push(`Stoch overbought (K:${ind.stoch.k.toFixed(0)}, D:${ind.stoch.d.toFixed(0)})`); }

  if (ind.volumeSpike) {
    if (score > 0)      { score += 1; reasons.push("Volume spike confirms bullish move"); }
    else if (score < 0) { score -= 1; reasons.push("Volume spike confirms bearish move"); }
  }

  if (ind.adx > 25) reasons.push(`Strong trend (ADX: ${ind.adx.toFixed(1)})`);

  let direction: SignalDirection;
  if      (score >= 6)  direction = "STRONG BUY";
  else if (score >= 2)  direction = "BUY";
  else if (score <= -6) direction = "STRONG SELL";
  else if (score <= -2) direction = "SELL";
  else                  direction = "NEUTRAL";

  const confidence = Math.min(100, Math.round((Math.abs(score) / 11) * 100));
  const entry = ind.currentPrice;
  const atr   = ind.atr;

  const stopLoss    = score >= 0 ? entry - atr * 1.5 : entry + atr * 1.5;
  const takeProfit1 = score >= 0 ? entry + atr * 2   : entry - atr * 2;
  const takeProfit2 = score >= 0 ? entry + atr * 3.5 : entry - atr * 3.5;
  const risk        = Math.abs(entry - stopLoss);
  const reward      = Math.abs(takeProfit1 - entry);
  const riskReward  = `1:${(reward / risk).toFixed(1)}`;

  return { direction, confidence, reasons, entry, stopLoss, takeProfit1, takeProfit2, riskReward };
}
