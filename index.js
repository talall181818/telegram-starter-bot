import { Bot } from "grammy";
import { registerCommands } from "./commands.js";

const token = process.env.TELEGRAM_BOT_TOKEN;

if (!token) {
  console.error("TELEGRAM_BOT_TOKEN is missing!");
  process.exit(1);
}

const bot = new Bot(token);

registerCommands(bot);

bot.catch((err) => {
  console.error("Bot error:", err.error);
});

async function main() {
  try {
    await bot.api.deleteWebhook({
      drop_pending_updates: false
    });

    await bot.start({
      onStart: (botInfo) => {
        console.log(`Masaad started: @${botInfo.username}`);
        console.log("Bot is polling for updates...");
      }
    });
  } catch (error) {
    console.error("Bot startup failed:", error);
    process.exit(1);
  }
}

main();
