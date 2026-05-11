import type { Signal, SignalDirection, IndicatorResult } from "./indicators";
import type { JuneAIAnalysis } from "./juneai";
import type { Symbol, Interval } from "./binance";

function formatPrice(symbol: Symbol, price: number): string {
  return symbol === "BTCUSDT"
    ? `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    : `$${price.toFixed(4)}`;
}

function directionEmoji(dir: SignalDirection): string {
  switch (dir) {
    case "STRONG BUY":  return "🟢";
    case "BUY":         return "🔼";
    case "NEUTRAL":     return "⚪";
    case "SELL":        return "🔽";
    case "STRONG SELL": return "🔴";
  }
}

function confidenceBar(confidence: number): string {
  const filled = Math.round(confidence / 10);
  return "█".repeat(filled) + "░".repeat(10 - filled) + ` ${confidence}%`;
}

function intervalLabel(interval: Interval): string {
  const map: Record<Interval, string> = {
    "1m": "1 Minute", "3m": "3 Minutes", "5m": "5 Minutes",
    "15m": "15 Minutes", "30m": "30 Minutes",
    "1h": "1 Hour", "4h": "4 Hours", "1d": "1 Day",
  };
  return map[interval];
}

export function formatSignalMessage(
  symbol: Symbol, interval: Interval, ind: IndicatorResult,
  signal: Signal, ai: JuneAIAnalysis,
  stats24h: { priceChangePct: number; high: number; low: number; volume: number }
): string {
  const coin      = symbol === "BTCUSDT" ? "BTC" : "ETH";
  const emoji     = directionEmoji(signal.direction);
  const bar       = confidenceBar(signal.confidence);
  const fp        = (p: number) => formatPrice(symbol, p);
  const changeSign = stats24h.priceChangePct >= 0 ? "+" : "";

  const lines: string[] = [
    `╔══════════════════════════╗`,
    `  ${emoji} <b>${signal.direction}</b> — ${coin}/USDT`,
    `  ⏱ Timeframe: ${intervalLabel(interval)}`,
    `╚══════════════════════════╝`,
    ``,
    `💰 <b>Price:</b> ${fp(ind.currentPrice)}`,
    `📊 <b>24h Change:</b> ${changeSign}${stats24h.priceChangePct.toFixed(2)}%`,
    `📈 <b>24h High:</b> ${fp(stats24h.high)}`,
    `📉 <b>24h Low:</b>  ${fp(stats24h.low)}`,
    ``,
    `━━━━ SIGNAL ━━━━`,
    ``,
    `🎯 <b>Confidence:</b> ${bar}`,
    ``,
    `📌 <b>Entry:</b>      ${fp(signal.entry)}`,
    `🛑 <b>Stop Loss:</b>  ${fp(signal.stopLoss)}`,
    `✅ <b>Target 1:</b>   ${fp(signal.takeProfit1)}`,
    `🏆 <b>Target 2:</b>   ${fp(signal.takeProfit2)}`,
    `⚖️  <b>Risk/Reward:</b> ${signal.riskReward}`,
    ``,
    `━━━━ INDICATORS ━━━━`,
    ``,
    `• RSI(14): ${ind.rsi.toFixed(1)} ${ind.rsi < 30 ? "⬇️ Oversold" : ind.rsi > 70 ? "⬆️ Overbought" : "— Neutral"}`,
    `• MACD: ${ind.macd.histogram > 0 ? "🟢▲ Bullish" : "🔴▼ Bearish"} (hist: ${ind.macd.histogram.toFixed(4)})`,
    `• Stoch K/D: ${ind.stoch.k.toFixed(0)}/${ind.stoch.d.toFixed(0)} ${ind.stoch.k < 20 ? "⬇️ Oversold" : ind.stoch.k > 80 ? "⬆️ Overbought" : ""}`,
    `• EMA20/50: ${fp(ind.ema20)} / ${fp(ind.ema50)}`,
    `• ADX: ${ind.adx.toFixed(1)} ${ind.adx > 25 ? "💪 Strong trend" : "〰️ Weak trend"}`,
    `• BB: ${fp(ind.bb.lower)} — ${fp(ind.bb.upper)}`,
    `• Volume: ${ind.volumeSpike ? "🚀 Spike detected!" : "Normal"}`,
    ``,
    `━━━━ REASONS ━━━━`,
    ``,
    ...signal.reasons.map((r) => `• ${r}`),
  ];

  if (ai.available && ai.summary) {
    const aiSentiment = ai.sentiment === "bullish" ? "🤖 AI: 📈 Bullish"
      : ai.sentiment === "bearish" ? "🤖 AI: 📉 Bearish" : "🤖 AI: ➡️ Neutral";
    lines.push(``, `━━━━ AI ANALYSIS ━━━━`, ``, aiSentiment, ``, ai.summary);
  }

  lines.push(
    ``, `━━━━━━━━━━━━━━━━━━━━━━━━━━`,
    `⚠️ <i>Not financial advice. Always DYOR.</i>`,
    `🕐 ${new Date().toUTCString()}`
  );
  return lines.join("\n");
}

export function formatQuickSignal(
  symbol: Symbol, ind: IndicatorResult, signal: Signal, ai: JuneAIAnalysis
): string {
  const coin  = symbol === "BTCUSDT" ? "BTC" : "ETH";
  const fp    = (p: number) => formatPrice(symbol, p);
  const emoji = directionEmoji(signal.direction);
  const bar   = confidenceBar(signal.confidence);
  const isBuy = signal.direction === "STRONG BUY" || signal.direction === "BUY";

  const lines = [
    `⚡ <b>QUICK SIGNAL — ${coin}/USDT</b>`,
    ``,
    `${emoji} <b>${signal.direction}</b>`,
    `<code>${bar}</code>`,
    ``,
    `💰 Price:      <b>${fp(ind.currentPrice)}</b>`,
    ``,
    `📌 Entry:      <b>${fp(signal.entry)}</b>`,
    `🛑 Stop Loss:  <b>${fp(signal.stopLoss)}</b>`,
    `✅ Target 1:   <b>${fp(signal.takeProfit1)}</b>`,
    `🏆 Target 2:   <b>${fp(signal.takeProfit2)}</b>`,
    `⚖️  R/R:         <b>${signal.riskReward}</b>`,
    ``,
    `📊 RSI: ${ind.rsi.toFixed(1)}  |  MACD: ${ind.macd.histogram > 0 ? "🟢▲" : "🔴▼"}  |  ADX: ${ind.adx.toFixed(1)}`,
    `📍 Support: ${fp(ind.support)}  |  Resistance: ${fp(ind.resistance)}`,
  ];

  if (ai.available) {
    lines.push(``, ai.sentiment === "bullish" ? "🤖 AI: 📈 Bullish"
      : ai.sentiment === "bearish" ? "🤖 AI: 📉 Bearish" : "🤖 AI: ➡️ Neutral");
  }

  lines.push(
    ``,
    isBuy ? `💡 <b>Direction: LONG (Buy)</b>`
      : signal.direction === "NEUTRAL" ? `💡 <b>Direction: WAIT — no clear edge</b>`
      : `💡 <b>Direction: SHORT (Sell)</b>`,
    ``,
    `⚠️ <i>Not financial advice. DYOR.</i>`
  );
  return lines.join("\n");
}

export function formatHelpMessage(): string {
  return [
    `<b>🤖 SnapMarkets Signals Bot</b>`,
    ``,
    `Real-time crypto directional signals for BTC & ETH.`,
    ``,
    `<b>⚡ Live Snap Signals (25s auto-fire):</b>`,
    `/snapbtc  — BTC arrow every 25s`,
    `/snapeth  — ETH arrow every 25s`,
    `/snapboth — BTC + ETH side-by-side every 25s`,
    `/stop     — Stop live signals`,
    ``,
    `<b>🎯 Quick Trade Signal (one tap):</b>`,
    `/quicksignal BTC — Entry, SL & TP for BTC`,
    `/quicksignal ETH — Entry, SL & TP for ETH`,
    ``,
    `<b>📊 Deep Analysis:</b>`,
    `/signal BTC — Full 1m analysis`,
    `/signal ETH — Full 1m analysis`,
    `/signal BTC 1h — 1 hour analysis`,
    `/signal BTC 1d — Daily analysis`,
    ``,
    `<b>💰 Price:</b>`,
    `/price BTC — BTC price`,
    `/price ETH — ETH price`,
    ``,
    `/help — Show this message`,
  ].join("\n");
}

export function formatPriceMessage(
  symbol: Symbol, price: number,
  stats: { priceChangePct: number; high: number; low: number; volume: number }
): string {
  const coin        = symbol === "BTCUSDT" ? "BTC" : "ETH";
  const fp          = (p: number) => formatPrice(symbol, p);
  const changeEmoji = stats.priceChangePct >= 0 ? "📈" : "📉";
  const changeSign  = stats.priceChangePct >= 0 ? "+" : "";
  return [
    `${changeEmoji} <b>${coin}/USDT</b>`,
    ``,
    `💰 Price: <b>${fp(price)}</b>`,
    `🕐 24h Change: ${changeSign}${stats.priceChangePct.toFixed(2)}%`,
    `📈 High: ${fp(stats.high)}`,
    `📉 Low:  ${fp(stats.low)}`,
    `📦 Volume: ${stats.volume.toLocaleString("en-US", { maximumFractionDigits: 0 })} ${coin}`,
    ``,
    `🕐 ${new Date().toUTCString()}`,
  ].join("\n");
}
