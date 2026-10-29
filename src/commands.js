// 
export function registerCommands(bot) {
  bot.command("start", (ctx) => {
    return ctx.reply(
      "أهلًا بك في Masaad 🤖\nبوت إشارات ExpertOption قيد التجهيز."
    );
  });

  bot.command("help", (ctx) => {
    return ctx.reply(
      "📊 Masaad\n\n" +
      "الأسواق: العملات والذهب والبيتكوين.\n" +
      "الفريم: دقيقة واحدة.\n\n" +
      "تنبيه: إشارات التداول الفعلية لم تُربط ببيانات السوق بعد."
    );
  });

  bot.command("ping", (ctx) => {
    return ctx.reply("البوت يعمل ✅");
  });
}
