export function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    await ctx.reply(
      "أهلًا بك في Masaad 🤖\n\n" +
      "اختر السوق:\n" +
      "/eurusd - اليورو مقابل الدولار\n" +
      "/gold - الذهب\n\n" +
      "مدة الصفقة: دقيقة واحدة"
    );
  });

  bot.command("eurusd", async (ctx) => {
    await sendPrice(ctx, "EURUSD", "اليورو مقابل الدولار");
  });

  bot.command("gold", async (ctx) => {
    await sendPrice(ctx, "XAUUSD", "الذهب");
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "أوامر Masaad:\n" +
      "/eurusd - سعر اليورو\n" +
      "/gold - سعر الذهب\n\n" +
      "هذه أسعار السوق وليست إشارات شراء أو بيع."
    );
  });

  bot.command("ping", async (ctx) => {
    await ctx.reply("البوت يعمل ✅");
  });
}

async function sendPrice(ctx, symbol, name) {
  try {
    const response = await fetch(
      "https://biquote.io/api/" + symbol
    );

    if (!response.ok) {
      await ctx.reply("تعذر جلب سعر " + name + " الآن.");
      return;
    }

    const data = await response.json();

    await ctx.reply(
      "📊 " + name + "\n" +
      "سعر الشراء: " + data.ask + "\n" +
      "سعر البيع: " + data.bid + "\n\n" +
      "⏱️ مدة الصفقة المطلوبة: دقيقة واحدة\n" +
      "⚠️ السعر وحده لا يحدد إشارة شراء أو بيع."
    );
  } catch (error) {
    await ctx.reply("تعذر الاتصال ببيانات السوق. حاول لاحقًا.");
  }
}
