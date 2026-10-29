export function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "أهلًا بك في Masaad 🤖\n" +
      "بوت متابعة الأسواق"
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📊 Masaad\n\n" +
      "الأسواق: العملات والذهب والبيتكوين.\n" +
      "الفريم: دقيقة واحدة.\n" +
      "بيانات السوق: قيد الربط.\n\n" +
      "تنبيه: لا توجد إشارات شراء أو بيع فعلية حتى الآن."
    );
  });

  bot.command("ping", async (ctx) => {
    await ctx.reply("البوت يعمل ✅");
  });
}
