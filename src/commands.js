export function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "أهلًا بك في Masaad 🤖\n" +
      "بوت متابعة الأسواق"
    );
  });

  bot.command("price", async (ctx) => {
    try {
      const response = await fetch(
        "https://biquote.io/api/EURUSD"
      );

      if (!response.ok) {
        throw new Error("تعذر جلب السعر");
      }

      const data = await response.json();

      await ctx.reply(
        "📊 EUR/USD\n" +
        "سعر الشراء: " + data.ask + "\n" +
        "سعر البيع: " + data.bid
      );
    } catch (error) {
      await ctx.reply("تعذر جلب السعر الآن، حاول لاحقًا.");
    }
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "Masaad 📊\n\n" +
      "أرسل /price لعرض سعر EUR/USD.\n" +
      "هذا عرض للسعر فقط، وليس إشارة شراء أو بيع."
    );
  });

  bot.command("ping", async (ctx) => {
    await ctx.reply("البوت يعمل ✅");
  });
}
