import type { SnapResult } from "./snap-signal";
import type { Symbol } from "./binance";

function formatPrice(symbol: Symbol, price: number): string {
  return `$${price.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function strengthDots(s: number): string {
  return "●".repeat(s) + "○".repeat(5 - s);
}

function strengthLabel(s: number): string {
  if (s >= 5) return "Very Strong";
  if (s >= 4) return "Strong";
  if (s >= 3) return "Moderate";
  if (s >= 2) return "Weak";
  return "Very Weak";
}

export function formatSnapMessage(result: SnapResult, count: number): string {
  const coin   = result.symbol === "BTCUSDT" ? "BTC" : "ETH";
  const isUp   = result.direction === "UP";
  const color  = isUp ? "🟢" : "🔴";
  const arrow  = isUp ? "⬆️" : "⬇️";
  const label  = isUp ? "BULLISH — GOING UP" : "BEARISH — GOING DOWN";
  const dots   = strengthDots(result.strength);
  const slabel = strengthLabel(result.strength);
  const aiLine = result.aiConfirmed ? "🤖 AI confirmed  ·  " : "";
  const rsi    = result.indicators.rsi.toFixed(1);
  const macdDir  = result.indicators.macdHist >= 0 ? "🟢▲" : "🔴▼";
  const stoch    = result.indicators.stochK.toFixed(0);
  const stochColor = result.indicators.stochK > 50 ? "🟢" : "🔴";

  return [
    `${arrow}${color}  <b>${label}</b>  ${color}${arrow}`,
    ``,
    `<b>${coin}/USDT</b>  ·  Next 30s  ·  #${count}`,
    `💰 <b>${formatPrice(result.symbol, result.price)}</b>`,
    ``,
    `<code>${dots}</code>  ${color} <b>${slabel}</b>`,
    `📊 RSI: ${rsi}  ·  MACD: ${macdDir}  ·  Stoch: ${stochColor}${stoch}`,
    `${aiLine}`,
  ].join("\n").trimEnd();
}

export function formatSnapBothMessage(btc: SnapResult, eth: SnapResult, count: number): string {
  const btcUp    = btc.direction === "UP";
  const ethUp    = eth.direction === "UP";
  const btcColor = btcUp ? "🟢" : "🔴";
  const ethColor = ethUp ? "🟢" : "🔴";
  const btcArrow = btcUp ? "⬆️" : "⬇️";
  const ethArrow = ethUp ? "⬆️" : "⬇️";
  const btcDir   = btcUp ? "BULLISH ▲" : "BEARISH ▼";
  const ethDir   = ethUp ? "BULLISH ▲" : "BEARISH ▼";
  const btcMacd  = btc.indicators.macdHist >= 0 ? "🟢▲" : "🔴▼";
  const ethMacd  = eth.indicators.macdHist >= 0 ? "🟢▲" : "🔴▼";
  const stronger = btc.strength > eth.strength ? "BTC" : eth.strength > btc.strength ? "ETH" : null;
  const btcAi    = btc.aiConfirmed ? "  🤖" : "";
  const ethAi    = eth.aiConfirmed ? "  🤖" : "";

  const lines = [
    `<b>━━━━ #${count} · Next 30s ━━━━</b>`,
    ``,
    `${btcArrow}${btcColor} <b>BTC/USDT — ${btcDir}</b>${btcAi}`,
    `💰 ${formatPrice("BTCUSDT", btc.price)}`,
    `<code>${strengthDots(btc.strength)}</code> ${btcColor} ${strengthLabel(btc.strength)}  ·  RSI: ${btc.indicators.rsi.toFixed(1)}  ·  MACD: ${btcMacd}`,
    ``,
    `${ethArrow}${ethColor} <b>ETH/USDT — ${ethDir}</b>${ethAi}`,
    `💰 ${formatPrice("ETHUSDT", eth.price)}`,
    `<code>${strengthDots(eth.strength)}</code> ${ethColor} ${strengthLabel(eth.strength)}  ·  RSI: ${eth.indicators.rsi.toFixed(1)}  ·  MACD: ${ethMacd}`,
  ];

  if (stronger) {
    const wColor = stronger === "BTC" ? btcColor : ethColor;
    const wArrow = stronger === "BTC" ? btcArrow : ethArrow;
    lines.push(``, `🎯 <b>Stronger signal: ${wArrow}${wColor} ${stronger}</b>`);
  }

  return lines.join("\n");
}

export function formatSnapStart(symbols: Symbol[], intervalSec: number): string {
  const label = symbols.length > 1 ? "BTC + ETH" : symbols[0] === "BTCUSDT" ? "BTC" : "ETH";
  return [
    `<b>🟢 SnapSignal LIVE — ${label}/USDT</b>`,
    ``,
    `⬆️ or ⬇️ every <b>${intervalSec}s</b>`,
    `Predicting next 30s direction`,
    `Multi-timeframe (1m + 3m) + AI`,
    ``,
    `Send /stop to end.`,
  ].join("\n");
}

export function formatSnapStop(symbols: Symbol[], count: number, durationSec: number): string {
  const mins  = Math.floor(durationSec / 60);
  const secs  = durationSec % 60;
  const dur   = mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  const label = symbols.length > 1 ? "BTC + ETH" : symbols[0] === "BTCUSDT" ? "BTC" : "ETH";
  return (
    `<b>🔴 SnapSignal STOPPED — ${label}/USDT</b>\n\n` +
    `Signals sent: <b>${count}</b>\n` +
    `Session duration: <b>${dur}</b>`
  );
}

export function formatSnapHelp(): string {
  return [
    `<b>⚡ SnapSignal Commands</b>`,
    ``,
    `/snapbtc  — BTC arrow every 25s`,
    `/snapeth  — ETH arrow every 25s`,
    `/snapboth — BTC + ETH together every 25s`,
    `/stop     — Stop live signals`,
    ``,
    `Each signal shows:`,
    `⬆️🟢 or ⬇️🔴 — direction for next 30s`,
    `●●●●● — confidence (1–5 dots)`,
    `RSI · MACD · Stoch — key indicators`,
    `🤖 — AI confirmed direction`,
  ].join("\n");
}
