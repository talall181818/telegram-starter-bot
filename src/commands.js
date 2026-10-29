export function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply("أهلًا بك في Masaad 🤖\nأرسل /gold للذهب أو /eurusd لليورو");
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
    const bid = Number(data.bid);
    const ask = Number(data.ask);
    const change = Number(data.dayDiffPercent);

    let trend = "متذبذب";
    if (data.direction === "UP") trend = "صاعد يوميًا";
    if (data.direction === "DOWN") trend = "هابط يوميًا";

    await ctx.reply(
      "📊 " + name + "\n" +
      "سعر الشراء: " + ask + "\n" +
      "سعر البيع: " + bid + "\n" +
      "الاتجاه اليومي: " + trend + "\n" +
      "التغير اليومي: " +
      (Number.isFinite(change) ? change.toFixed(3) + "%" : "غير متاح") +
      "\nإشارة الدقيقة: انتظار\n" +
      "الاتجاه اليومي ليس إشارة مؤكدة للدقيقة."
    );
  } catch (error) {
    await ctx.reply("تعذر جلب بيانات " + name + " الآن.");
  }
}
