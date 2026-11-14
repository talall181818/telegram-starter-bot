
const sessions = new Map();

function getPrice(text) {
  const value = text.trim().replace(/,/g, ".");
  if (!/^\d+(\.\d+)?$/.test(value)) return null;
  return Number(value);
}

function analyzePrices(prices) {
  if (prices.length < 5) {
    return "⚠️ نحتاج 5 قراءات على الأقل لتحليل اتجاه مبدئي.";
  }

  const first = prices[0];
  const last = prices[prices.length - 1];
  const change = last - first;

  let direction = "متذبذب";
  let decision = "⏸ انتظار";

  if (change > 0) {
    direction = "صاعد";
    decision = "📈 ترجيح شراء UP";
  } else if (change < 0) {
    direction = "هابط";
    decision = "📉 ترجيح بيع DOWN";
  }

  return `📊 تحليل ${sessions.market || "Smart"} - Masaad

💰 آخر سعر: ${last}
📈 الاتجاه: ${direction}
🎯 القرار: ${decision}
⏱️ المدة: غير محددة

⚠️ تحليل أولي وليس إشارة مضمونة.`;
}

export function registerCommands(bot) {
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
      "/eurusd - تحليل EUR/USD"
    );
  });

  bot.command("smart", async (ctx) => {
    sessions.set(ctx.chat.id, {
      market: "Smart",
      prices: []
    });

    await ctx.reply(
      "📊 بدأ تحليل Smart.\nأرسل السعر الحالي."
    );
  });

  bot.command("eurusd", async (ctx) => {
    sessions.set(ctx.chat.id, {
      market: "EUR/USD",
      prices: []
    });

    await ctx.reply(
      "📊 بدأ تحليل EUR/USD.\nأرسل السعر الحالي."
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
      `💰 السعر المستلم: ${price}\n\n` +
      `عدد القراءات: ${session.prices.length}\n\n` +
      analyzePrices(session.prices)
    );
  });
}

