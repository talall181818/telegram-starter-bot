
const sessions = new Map();

function parsePrice(text) {
  const normalized = text.trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/,/g, ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const price = Number(normalized);
  return Number.isFinite(price) && price > 0 ? price : null;
}

function registerCommands(bot) {
  bot.command("start", async ctx => {
    sessions.delete(ctx.from.id);

    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 محلل الأسعار الذكي\n\n" +
      "/smart - تحليل Smart\n" +
      "/eurusd - تحليل اليورو دولار\n" +
      "/reset - تصفير سجل الأسعار\n\n" +
      "اختر السوق ثم أرسل السعر فقط."
    );
  });

  bot.command("smart", async ctx => {
    sessions.set(ctx.from.id, {
      market: "Smart",
      prices: []
    });

    await ctx.reply(
      "📊 تم اختيار Smart\n\nأرسل سعر السوق الحالي فقط."
    );
  });

  bot.command("eurusd", async ctx => {
    sessions.set(ctx.from.id, {
      market: "EUR/USD",
      prices: []
    });

    await ctx.reply(
      "📊 تم اختيار EUR/USD\n\nأرسل سعر اليورو الحالي فقط."
    );
  });

  bot.command("reset", async ctx => {
    const session = sessions.get(ctx.from.id);

    if (session) session.prices = [];

    await ctx.reply("تم تصفير سجل الأسعار. أرسل السعر الجديد.");
  });

  bot.on("message:text", async ctx => {
    const session = sessions.get(ctx.from.id);

    if (!session) {
      return ctx.reply("اختر السوق أولاً:\n/smart\n/eurusd");
    }

    const price = parsePrice(ctx.message.text);

    if (price === null) {
      return ctx.reply("⚠️ أرسل السعر فقط، مثال:\n264.3930");
    }

    session.prices.push(price);

    if (session.prices.length > 12) {
      session.prices.shift();
    }

    const prices = session.prices;
    const last = prices[prices.length - 1];

    if (prices.length < 5) {
      return ctx.reply(
        `📊 تحليل ${session.market} - Masaad\n\n` +
        `💰 السعر الحالي: ${last}\n` +
        `📈 تم تسجيل ${prices.length} من 5 أسعار\n\n` +
        "⏳ نحتاج مزيداً من قراءات السعر لتحديد الاتجاه.\n" +
        "أرسل السعر التالي فقط."
      );
    }

    const recent = prices.slice(-5);
    const changes = [];

    for (let i = 1; i < recent.length; i++) {
      changes.push(recent[i] - recent[i - 1]);
    }

    const up = changes.filter(x => x > 0).length;
    const down = changes.filter(x => x < 0).length;

    let trend = "متذبذب";
    let signal = "⏳ انتظار";
    let duration = "غير محددة";
    let strength = "ضعيفة";

    if (up >= 4) {
      trend = "صاعد";
      signal = "🟢 شراء UP";
      strength = "قوية";
      duration = "30 ثانية";
    } else if (up === 3) {
      trend = "صاعد بحذر";
      signal = "🟢 شراء UP";
      strength = "متوسطة";
      duration = "5 ثوانٍ";
    } else if (down >= 4) {
      trend = "هابط";
      signal = "🔴 بيع DOWN";
      strength = "قوية";
      duration = "30 ثانية";
    } else if (down === 3) {
      trend = "هابط بحذر";
      signal = "🔴 بيع DOWN";
      strength = "متوسطة";
      duration = "5 ثوانٍ";
    }

    await ctx.reply(
      `📊 تحليل ${session.market} - Masaad\n\n` +
      `💰 السعر الحالي: ${last}\n` +
      `📈 الاتجاه: ${trend}\n` +
      `🎯 القرار: ${signal}\n` +
      `💪 قوة الترجيح: ${strength}\n` +
      `⏱ المدة المقترحة: ${duration}\n\n` +
      `📋 عدد القراءات: ${prices.length}\n\n` +
      "⚠️ تحليل مبسط لحركة الأسعار المسجلة، وليس ضماناً للربح."
    );
  });
}

export { registerCommands };
