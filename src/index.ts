import app from "./app";
import { logger } from "./lib/logger";
import { createBot } from "./bot/bot";
import type TelegramBot from "node-telegram-bot-api";

const port = Number(process.env["PORT"] ?? "8080");

let botInstance: TelegramBot | null = null;

const server = app.listen(port, () => {
  logger.info({ port }, "Server listening");
  createBot()
    .then((bot) => { botInstance = bot; })
    .catch((err) => { logger.error({ err }, "Bot startup failed"); });
});

function shutdown(signal: string) {
  logger.info({ signal }, "Shutting down gracefully");
  if (botInstance) botInstance.stopPolling().catch(() => {});
  server.close(() => {
    logger.info("HTTP server closed");
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
