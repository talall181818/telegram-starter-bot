
const sessions = new Map();

function getPrice(text) {
  const normalized = text
    .trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/,/g, ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function analyzePrices(prices, market) {
  if (prices.length < 5) {
    return `📊 تم استلام ${prices.length} من 5 قراءات.
أرسل السعر التالي لإكمال التحليل.`;
  }

  const changes = [];

  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const positive = changes.filter(x => x > 0).length;
  const negative = changes.filter(x => x < 0).length;
  const total = changes.reduce((sum, x) => sum + Math.abs(x), 0);
  const net = prices[prices.length - 1] - prices[0];

  const consistency = total === 0 ? 0 : Math.abs(net) / total;

  let direction = "متذبذب";
  let decision = "⏸ انتظار";
  let strength = "ضعيفة";
  let duration = "لا توجد مدة";

  if (net > 0 && consistency >= 0.5) {
    direction = "صاعد";
    decision = "📈 شراء UP";
  } else if (net < 0 && consistency >= 0.5) {
    direction = "هابط";
    decision = "📉 بيع DOWN";
  }

  if (consistency >= 0.9) {
    strength = "قوية";
    duration = "45 ثانية";
  } else if (consistency >= 0.75) {
    strength = "جيدة";
    duration = "40 ثانية";
  } else if (consistency >= 0.6) {
    strength = "متوسطة";
    duration = "35 ثانية";
  } else if (consistency >= 0.5) {
    strength = "محدودة";
    duration = "30 ثانية";
  }

  if (consistency >= 0.9 && changes.length >= 4) {
    duration = "دقيقتان";
  }

  if (consistency >= 0.95 && changes.length >= 5) {
    duration = "3 دقائق";
  }

  if (consistency >= 0.98 && changes.length >= 6) {
    duration = "5 دقائق";
  }

  if (decision.includes("انتظار")) {
    duration = "لا تدخل حالياً";
  }

  return `📊 تحليل ${market} - Masaad

💰 السعر الحالي: ${prices[prices.length - 1]}

📈 الاتجاه: ${direction}

🎯 القرار: ${decision}

💪 قوة الإشارة: ${strength}

⏱️ المدة المقترحة: ${duration}

📊 توافق الحركة: ${(consistency * 100).toFixed(1)}%

⚠️ المدة تجريبية مبنية على القراءات، وليست توقعاً مضموناً لمدة حركة السوق.`;
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
      "/eurusd - تحليل EUR/USD\n\n" +
      "أرسل الأسعار بالتتابع."
    );
  });

  bot.command("smart", async (ctx) => {
    sessions.set(ctx.chat.id, {
      market: "Smart",
      prices: []
    });

    await ctx.reply("📊 بدأ تحليل Smart.\nأرسل السعر الحالي.");
  });

  bot.command("eurusd", async (ctx) => {
    sessions.set(ctx.chat.id, {
      market: "EUR/USD",
      prices: []
    });

    await ctx.reply("📊 بدأ تحليل EUR/USD.\nأرسل السعر الحالي.");
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
    session.prices = session.prices.slice(-7);

    if (session.prices.length < 5) {
      await ctx.reply(
        `💰 السعر: ${price}\n` +
        `📊 القراءات: ${session.prices.length}/5`
      );
      return;
    }

    await ctx.reply(
      analyzePrices(session.prices, session.market)
    );
  });
}
