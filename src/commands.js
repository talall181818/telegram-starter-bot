// import { InlineKeyboard } from "grammy";

export function registerCommands(bot) {
  bot.command("start", (ctx) =>
    ctx.reply("أهلًا بك في Masaad 🤖\nبوت إشارات ExpertOption قيد التجهيز.")
  );

  bot.command("help", (ctx) =>
    ctx.reply(
      "📊 Masaad\n\n" +
      "الأسواق: العملات والذهب والبيتكوين.\n" +
      "الفريم: دقيقة واحدة.\n\n" +
      "تنبيه: إشارات التداول الفعلية لم تُربط ببيانات السوق بعد."
    )
  );

  bot.command("ping", (ctx) => ctx.reply("البوت يعمل ✅"));
}import { InlineKeyboard } from "grammy"Your bot's behaviour. Add commands here; grammY's docs (grammy.dev) cover
// keyboards, sessions, files, inline queries and everything else.

