
export function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply("أهلًا بك في Masaad 🤖\nأرسل /help للمساعدة");
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "🤖 Masaad\n\n" +
      "/gold - تحليل الذهب\n" +
      "/eurusd - تحليل اليورو دولار"
    );
  });

  bot.command("gold", async (ctx) => {
    await analyze(ctx, "XAUUSD", "الذهب");
  });

  bot.command("eurusd", async (ctx) => {
    await analyze(ctx, "EURUSD", "اليورو مقابل الدولار");
  });
}

async function analyze(ctx, symbol, name) {
  try {
    const response = await fetch("https://biquote.io/api/" + symbol);
    if (!response.ok) throw new Error("Price unavailable");

    const data = await response.json();

    await ctx.reply(
      "📊 " + name + "\n" +
      "سعر الشراء: " + data.ask + "\n" +
      "سعر البيع: " + data.bid + "\n" +
      "إشارة الدقيقة: انتظار\n" +
      "لا توجد إشارة مؤكدة حاليًا."
    );
  } catch (error) {
    await ctx.reply("تعذر جلب بيانات " + name + " الآن.");
  }
}
