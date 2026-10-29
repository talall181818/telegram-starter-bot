export function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply("أهلًا بك في بوت Masaad 🤖");
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Masaad - بوت ExpertOption\n\n" +
      "الأسواق: العملات والذهب والبيتكوين\n" +
      "الفريم: دقيقة واحدة\n" +
      "إشارات السوق الحقيقية غير مفعّلة بعد."
    );
  });

  bot.command("ping", async (ctx) => {
    await ctx.reply("البوت يعمل ✅");
  });
}
  
