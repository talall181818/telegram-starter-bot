
const sessions = new Map();

function getPrice(text) {
  const value = text.trim().replace(/,/g, ".");
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  return Number(value);
}

function analyzePrices(prices) {
  if (prices.length < 5) {
    return "⚠️ البيانات غير كافية لتحديد اتجاه موثوق.";
  }

  const first = prices[0];
  const last = prices[prices.length - 1];
  const change = last - first;

  const direction =
    change > 0 ? "صاعد" :
    change < 0 ? "هابط" : "متذبذب";

  let decision = "⏸ انتظار";

  if (change > 0) decision = "📈 شراء UP (ترجيح)";
  if (change < 0) decision = "📉 بيع DOWN (ترجيح)";

  return `📊 تحليل Smart - Masaad

💰 آخر سعر: ${last}
📈 الاتجاه: ${direction}
🎯 القرار: ${decision}
⏱️ المدة: غير محددة
📌 التحليل مبني على القراءات المرسلة فقط.

⚠️ هذه قراءة أولية وليست ضماناً للنتيجة.`;
}

function registerCommands(bot) {
  bot.command("start", async (ctx) => {
    sessions.delete(ctx.chat.id);
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart و EUR/USD\n\n" +
      "/smart - تحليل Smart اليدوي\n" +
      "/eurusd - تحليل اليورو دولار عند الطلب\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📊 Masaad - المساعدة\n\n" +
      "/smart - تحليل Smart\n" +
      "/eurusd - تحليل EUR/USD\n\n" +
      "أرسل السعر بعد بدء التحليل."
    );
  });

  bot.command("smart", async (ctx) => {
    sessions.set(ctx.chat.id, {
      market: "Smart",
      prices: []
    });

    await ctx.reply(
      "📊 بدأ تحليل Smart.\n\n" +
      "أرسل السعر الحالي فقط.\n" +
      "لن تحتاج إلى 22 قراءة."
    );
  });

  bot.command("eurusd", async (ctx) => {
    sessions.set(ctx.chat.id, {
      market: "EUR/USD",
      prices: []
    });

    await ctx.reply(
      "📊 بدأ تحليل EUR/USD.\n\n" +
      "أرسل السعر الحالي."
    );
  });

  bot.on("message:text", async (ctx) => {
    const session = sessions.get(ctx.chat.id);
    if (!session) return;

    if (ctx.message.text.startsWith("/")) return;

    const price = getPrice(ctx.message.text);

    if (price === null) {
      await ctx.reply("⚠️ أرسل السعر بالأرقام فقط.");
      return;
    }

    session.prices.push(price);
    session.prices = session.prices.slice(-10);

    await ctx.reply(
      `💰 تم استلام السعر: ${price}\n\n` +
      `📊 عدد القراءات: ${session.prices.length}\n\n` +
      analyzePrices(session.prices)
    );
  });
}

module.exports = { registerCommands };

