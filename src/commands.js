
const REQUIRED_CANDLES = 5;
const sessions = new Map();

function parsePrice(text) {
  const normalized = text
    .trim()
    .replace(/[٠-٩]/g, digit => "٠١٢٣٤٥٦٧٨٩".indexOf(digit))
    .replace(/٫/g, ".")
    .replace(/,/g, ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) {
    return null;
  }

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function analyzeSmart(candles) {
  const midpoints = candles.map(c => (c.high + c.low) / 2);

  let up = 0;
  let down = 0;

  for (let i = 1; i < midpoints.length; i++) {
    if (midpoints[i] > midpoints[i - 1]) up++;
    if (midpoints[i] < midpoints[i - 1]) down++;
  }

  const last = candles[4];
  const range = last.high - last.low;

  let signal = "⏳ انتظار";
  let direction = "غير واضح";
  let duration = "لا توجد مدة مناسبة";

  if (up === 4) {
    signal = "🟢 شراء UP";
    direction = "صاعد";
    duration = "30 ثانية";
  } else if (down === 4) {
    signal = "🔴 بيع DOWN";
    direction = "هابط";
    duration = "30 ثانية";
  }

  return {
    signal,
    direction,
    duration,
    lastHigh: last.high,
    lastLow: last.low,
    range,
    midpoints
  };
}

export function registerCommands(bot) {
  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart\n\n" +
      "/smart - بدء تحليل 5 شمعات\n" +
      "/cancel - إلغاء التحليل\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 أوامر Masaad\n\n" +
      "/smart - تحليل آخر 5 شمعات Smart\n" +
      "/cancel - إلغاء التحليل\n\n" +
      "لكل شمعة أرسل:\n" +
      "1- القمة أولاً\n" +
      "2- القاع بعدها\n\n" +
      "كرر ذلك لخمس شمعات، من الأقدم للأحدث."
    );
  });

  bot.command("smart", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    sessions.set(key, {
      candles: [],
      pendingHigh: null
    });

    await ctx.reply(
      "📊 بدأ تحليل Smart\n\n" +
      "سنحلل 5 شمعات دقيقة.\n\n" +
      "أرسل الآن قمة الشمعة الأولى.\n" +
      "بعدها سأطلب منك القاع.\n\n" +
      "📈 الشموع: 0 من 5"
    );
  });

  bot.command("cancel", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    sessions.delete(key);
    await ctx.reply("تم إلغاء التحليل.");
  });

  bot.on("message:text", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;
    const session = sessions.get(key);

    if (!session) return;

    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    const price = parsePrice(text);

    if (price === null) {
      await ctx.reply(
        "⚠️ أرسل السعر فقط بالأرقام.\n" +
        "مثال: 264.273"
      );
      return;
    }

    // استقبال القمة
    if (session.pendingHigh === null) {
      session.pendingHigh = price;

      await ctx.reply(
        `✅ تم تسجيل القمة: ${price}\n\n` +
        `أرسل الآن قاع الشمعة رقم ${session.candles.length + 1}.`
      );

      return;
    }

    // استقبال القاع
    const high = session.pendingHigh;
    const low = price;

    if (low > high) {
      session.pendingHigh = null;

      await ctx.reply(
        "⚠️ القاع لا يمكن أن يكون أعلى من القمة.\n" +
        "أعد إرسال قمة الشمعة ثم قاعها."
      );

      return;
    }

    session.candles.push({ high, low });
    session.pendingHigh = null;

    const count = session.candles.length;

    if (count < REQUIRED_CANDLES) {
      await ctx.reply(
        `✅ تم تسجيل الشمعة ${count} من 5\n` +
        `القمة: ${high}\n` +
        `القاع: ${low}\n\n` +
        `أرسل قمة الشمعة رقم ${count + 1}.`
      );

      return;
    }

    const result = analyzeSmart(session.candles);

    sessions.delete(key);

    let details = "";

    session.candles.forEach((candle, index) => {
      details +=
        `الشمعة ${index + 1}: ` +
        `القمة ${candle.high} | القاع ${candle.low}\n`;
    });

    await ctx.reply(
      "📊 نتيجة تحليل Smart - Masaad\n\n" +
      "✅ اكتمل تحليل 5 شمعات\n\n" +
      details + "\n" +
      "📍 الاتجاه: " + result.direction + "\n" +
      "🎯 الإشارة: " + result.signal + "\n" +
      "⏱ المدة المقترحة: " + result.duration + "\n\n" +
      "آخر قمة: " + result.lastHigh + "\n" +
      "آخر قاع: " + result.lastLow + "\n" +
      "نطاق آخر شمعة: " + result.range.toFixed(5) + "\n\n" +
      "⚠️ هذا تحليل تقديري لنطاقات الشموع، " +
      "وليس إشارة مؤكدة أو ضماناً للربح.\n\n" +
      "لبدء تحليل جديد أرسل /smart"
    );
  });
}
