import TelegramBot from "node-telegram-bot-api";
import axios from "axios";
import { getKlines, getPrice, get24hStats, type Symbol, type Interval } from "./binance";
import { computeIndicators, generateSignal } from "./indicators";
import { getJuneAIAnalysis } from "./juneai";
import { formatSignalMessage, formatQuickSignal, formatHelpMessage, formatPriceMessage } from "./formatter";
import { getSnapSignal } from "./snap-signal";
import { formatSnapMessage, formatSnapBothMessage, formatSnapStart, formatSnapStop, formatSnapHelp } from "./snap-formatter";
import { hasSubscription, addSubscription, removeSubscription, getSubscription } from "./subscriptions";
import { logger } from "../lib/logger";

const TOKEN = process.env["TELEGRAM_BOT_TOKEN"];

const VALID_INTERVALS: Interval[] = ["1m", "3m", "5m", "15m", "30m", "1h", "4h", "1d"];
const SHORT_INTERVALS: Interval[] = ["1m", "3m", "5m"];
const SNAP_INTERVAL_SEC = 25;

function parseSymbol(input: string): Symbol | null {
  const up = input.toUpperCase();
  if (up === "BTC" || up === "BTCUSDT") return "BTCUSDT";
  if (up === "ETH" || up === "ETHUSDT") return "ETHUSDT";
  return null;
}

function parseInterval(input: string): Interval | null {
  const low = input.toLowerCase() as Interval;
  return VALID_INTERVALS.includes(low) ? low : null;
}

async function clearTelegramSession(token: string): Promise<void> {
  try {
    await axios.post(
      `https://api.telegram.org/bot${token}/deleteWebhook`,
      { drop_pending_updates: true },
      { timeout: 5000 }
    );
    await new Promise((r) => setTimeout(r, 1500));
    logger.info("Telegram session cleared — starting polling");
  } catch (err) {
    logger.warn({ err }, "Could not clear Telegram session, proceeding anyway");
  }
}

async function generateFullSignal(symbol: Symbol, interval: Interval): Promise<string> {
  const [klines, stats] = await Promise.all([
    getKlines(symbol, interval, 200),
    get24hStats(symbol),
  ]);
  const ind    = computeIndicators(klines);
  const signal = generateSignal(ind);
  const ai     = await getJuneAIAnalysis(symbol, interval, ind, signal);
  return formatSignalMessage(symbol, interval, ind, signal, ai, stats);
}

async function startSnapSingle(
  bot: TelegramBot,
  chatId: number | string,
  symbol: Symbol
): Promise<void> {
  const send = (text: string) =>
    bot.sendMessage(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });

  if (hasSubscription(chatId)) {
    await send(`⚠️ A session is already running. Send /stop first.`);
    return;
  }

  const noop = setInterval(() => {}, 999999);
  addSubscription(chatId, [symbol], "single", SNAP_INTERVAL_SEC * 1000, noop);

  await send(formatSnapStart([symbol], SNAP_INTERVAL_SEC));

  const fireSnap = async () => {
    const sub = getSubscription(chatId);
    if (!sub) return;
    try {
      const snap = await getSnapSignal(symbol);
      sub.count += 1;
      await send(formatSnapMessage(snap, sub.count));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "Snap error");
      await send(`⚠️ Signal fetch failed — retrying in ${SNAP_INTERVAL_SEC}s`);
    }
  };

  void fireSnap();
  clearInterval(noop);
  const timer = setInterval(fireSnap, SNAP_INTERVAL_SEC * 1000);
  const sub = getSubscription(chatId);
  if (sub) sub.timer = timer;
}

async function startSnapBoth(
  bot: TelegramBot,
  chatId: number | string
): Promise<void> {
  const send = (text: string) =>
    bot.sendMessage(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });

  if (hasSubscription(chatId)) {
    await send(`⚠️ A session is already running. Send /stop first.`);
    return;
  }

  const symbols: Symbol[] = ["BTCUSDT", "ETHUSDT"];
  const noop = setInterval(() => {}, 999999);
  addSubscription(chatId, symbols, "both", SNAP_INTERVAL_SEC * 1000, noop);

  await send(formatSnapStart(symbols, SNAP_INTERVAL_SEC));

  const fireSnap = async () => {
    const sub = getSubscription(chatId);
    if (!sub) return;
    try {
      const [btc, eth] = await Promise.all([
        getSnapSignal("BTCUSDT"),
        getSnapSignal("ETHUSDT"),
      ]);
      sub.count += 1;
      await send(formatSnapBothMessage(btc, eth, sub.count));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ err: msg }, "Snap both error");
      await send(`⚠️ Signal fetch failed — retrying in ${SNAP_INTERVAL_SEC}s`);
    }
  };

  void fireSnap();
  clearInterval(noop);
  const timer = setInterval(fireSnap, SNAP_INTERVAL_SEC * 1000);
  const sub = getSubscription(chatId);
  if (sub) sub.timer = timer;
}

export async function createBot(): Promise<TelegramBot | null> {
  if (!TOKEN) {
    logger.error("TELEGRAM_BOT_TOKEN is not set — bot will not start");
    return null;
  }

  await clearTelegramSession(TOKEN);

  const bot = new TelegramBot(TOKEN, {
    polling: { interval: 1000, autoStart: true, params: { timeout: 10 } },
  });

  const send = (chatId: number | string, text: string) =>
    bot.sendMessage(chatId, text, { parse_mode: "HTML", disable_web_page_preview: true });

  const sendTyping = (chatId: number | string) =>
    bot.sendChatAction(chatId, "typing");

  bot.onText(/\/start/, async (msg) => {
    await send(msg.chat.id, formatHelpMessage() + "\n\n" + formatSnapHelp());
  });

  bot.onText(/\/help/, async (msg) => {
    await send(msg.chat.id, formatHelpMessage() + "\n\n" + formatSnapHelp());
  });

  bot.onText(/\/snapbtc/, async (msg) => {
    await startSnapSingle(bot, msg.chat.id, "BTCUSDT");
  });

  bot.onText(/\/snapeth/, async (msg) => {
    await startSnapSingle(bot, msg.chat.id, "ETHUSDT");
  });

  bot.onText(/\/snapboth/, async (msg) => {
    await startSnapBoth(bot, msg.chat.id);
  });

  bot.onText(/\/stop/, async (msg) => {
    const sub = removeSubscription(msg.chat.id);
    if (!sub) {
      await send(msg.chat.id, `ℹ️ No active snap session to stop.`);
      return;
    }
    const durationSec = Math.round((Date.now() - sub.startedAt.getTime()) / 1000);
    await send(msg.chat.id, formatSnapStop(sub.symbols, sub.count, durationSec));
  });

  bot.onText(/\/quicksignal(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    await sendTyping(chatId);
    const args   = (match?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
    const symbol = args.length > 0 ? parseSymbol(args[0] ?? "") : null;
    if (!symbol) {
      await send(chatId, `⚡ <b>Quick Signal</b>\n\nSpecify a coin:\n\n/quicksignal BTC\n/quicksignal ETH`);
      return;
    }
    try {
      const klines = await getKlines(symbol, "1m", 200);
      const ind    = computeIndicators(klines);
      const signal = generateSignal(ind);
      const ai     = await getJuneAIAnalysis(symbol, "1m", ind, signal);
      await send(chatId, formatQuickSignal(symbol, ind, signal, ai));
    } catch (err) {
      logger.error({ err }, "Quick signal error");
      await send(chatId, `❌ Failed to generate quick signal. Try again.`);
    }
  });

  bot.onText(/\/price(.*)/, async (msg, match) => {
    const chatId  = msg.chat.id;
    await sendTyping(chatId);
    const args    = (match?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
    const symbols: Symbol[] = args.length > 0
      ? [parseSymbol(args[0] ?? "")].filter((s): s is Symbol => s !== null)
      : ["BTCUSDT", "ETHUSDT"];
    if (symbols.length === 0) {
      await send(chatId, "❌ Unknown coin. Use BTC or ETH.");
      return;
    }
    for (const symbol of symbols) {
      try {
        const [price, stats] = await Promise.all([getPrice(symbol), get24hStats(symbol)]);
        await send(chatId, formatPriceMessage(symbol, price, stats));
      } catch (err) {
        logger.error({ err }, "Price fetch error");
        await send(chatId, `❌ Failed to fetch price for ${symbol}.`);
      }
    }
  });

  bot.onText(/\/signal(.*)/, async (msg, match) => {
    const chatId = msg.chat.id;
    await sendTyping(chatId);
    const args = (match?.[1] ?? "").trim().split(/\s+/).filter(Boolean);
    let symbol: Symbol | null = null;
    let interval: Interval | null = null;
    for (const arg of args) {
      if (!symbol)   { const s  = parseSymbol(arg);   if (s)  { symbol   = s;  continue; } }
      if (!interval) { const iv = parseInterval(arg); if (iv) { interval = iv; continue; } }
    }
    const resolvedInterval = interval ?? "1m";
    const isLong = !SHORT_INTERVALS.includes(resolvedInterval);
    if (isLong && !symbol) {
      await send(chatId,
        `⚠️ For timeframes above 5m, specify a coin:\n\n` +
        `/signal BTC ${resolvedInterval}\n/signal ETH ${resolvedInterval}`
      );
      return;
    }
    const symbols: Symbol[] = symbol ? [symbol] : ["BTCUSDT", "ETHUSDT"];
    for (const sym of symbols) {
      try {
        await sendTyping(chatId);
        await send(chatId, await generateFullSignal(sym, resolvedInterval));
      } catch (err) {
        logger.error({ err }, "Signal error");
        await send(chatId, `❌ Failed to generate signal for ${sym}. Try again.`);
      }
    }
  });

  bot.on("message", async (msg) => {
    const known = [
      "/signal", "/price", "/start", "/help",
      "/snapbtc", "/snapeth", "/snapboth", "/stop", "/quicksignal",
    ];
    if (msg.text?.startsWith("/") && !known.some((c) => msg.text!.startsWith(c))) {
      await send(msg.chat.id, `❓ Unknown command. Type /help to see all commands.`);
    }
  });

  bot.on("polling_error", (err) => {
    logger.error({ err: err.message }, "Telegram polling error");
  });

  logger.info("Telegram bot started and polling");
  return bot;
  }
