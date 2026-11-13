
const sessions = new Map();

function parsePrice(text) {
  const normalized = text.trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/,/g, ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function analyzeSmart(high, low, open, current, after10) {
  const range = high - low;
  const movement = after10 - current;

  let signal = "⏳ انتظار";
  let direction = "الحركة غير مؤكدة";
  let duration = "لا توجد مدة مقترحة";

  if (range <= 0) {
    return { signal, direction, duration, movement };
  }

  // اختراق القمة أو استمرار الصعود
  const breakoutUp =
    current <= high &&
    after10 > high &&
    after10 > current;

  const continuationUp =
    current > high &&
    after10 > current;

  // كسر القاع أو استمرار الهبوط
  const breakoutDown =
    current >= low &&
    after10 < low &&
    after10 < current;

  const continuationDown =
    current < low &&
    after10 < current;

  if (breakoutUp || continuationUp) {
    signal = "🟢 شراء UP";

    direction = breakoutUp
      ? "اختراق القمة خلال 10 ثوانٍ"
      : "استمرار الصعود فوق القمة";

    const strength = movement / range;

    if (strength >= 0.25) {
      duration = "30 ثانية";
    } else if (strength >= 0.10) {
      duration = "45 ثانية";
    } else {
      duration = "دقيقة واحدة";
    }
  }

  else if (breakoutDown || continuationDown) {
    signal = "🔴 بيع DOWN";

    direction = breakoutDown
      ? "كسر القاع خلال 10 ثوانٍ"
      : "استمرار الهبوط تحت القاع";

    const strength = Math.abs(movement) / range;

    if (strength >= 0.25) {
      duration = "30 ثانية";
    } else if (strength >= 0.10) {
      duration = "45 ثانية";
    } else {
      duration = "دقيقة واحدة";
    }
  }

  return { signal, direction, duration, movement };
}

export function registerCommands(bot) {

  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart\n" +
      "⏱ الفريم المعتمد: 5 دقائق (5M)\n\n" +
      "/smart - بدء التحليل\n" +
      "/cancel - إلغاء التحليل\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 طريقة تحليل Smart - Masaad\n\n" +
      "⏱ الفريم: 5 دقائق (5M)\n\n" +
      "أرسل /smart ثم أدخل:\n\n" +
      "1- قمة الشمعة السابقة المكتملة\n" +
      "2- قاع الشمعة السابقة المكتملة\n" +
      "3- افتتاح الشمعة الجديدة\n" +
      "4- السعر الحالي\n" +
      "5- السعر بعد 10 ثوانٍ\n\n" +
      "سيحلل البوت اختراق القمة وكسر القاع."
    );
  });

  bot.command("smart", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    sessions.set(key, {
      step: 0,
      high: null,
      low: null,
      open: null,
      current: null
    });

    await ctx.reply(
      "📊 تحليل Smart - Masaad\n\n" +
      "⏱ الفريم: 5 دقائق (5M)\n\n" +
      "أرسل قمة الشمعة السابقة المكتملة."
    );
  });

  bot.command("cancel", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    sessions.delete(key);

    await ctx.reply("✅ تم إلغاء التحليل.");
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
        "⚠️ أرسل السعر فقط بدون رموز.\n" +
        "مثال: 263.98240"
      );
      return;
    }

    if (session.step === 0) {
      session.high = price;
      session.step = 1;

      await ctx.reply(
        "✅ تم تسجيل القمة.\n\n" +
        "أرسل قاع الشمعة السابقة المكتملة."
      );
      return;
    }

    if (session.step === 1) {
      if (price >= session.high) {
        await ctx.reply(
          "⚠️ القاع يجب أن يكون أقل من القمة."
        );
        return;
      }

      session.low = price;
      session.step = 2;

      await ctx.reply(
        "✅ تم تسجيل القاع.\n\n" +
        "أرسل افتتاح الشمعة الجديدة."
      );
      return;
    }

    if (session.step === 2) {
      session.open = price;
      session.step = 3;

      await ctx.reply(
        "✅ تم تسجيل الافتتاح.\n\n" +
        "أرسل السعر الحالي."
      );
      return;
    }

    if (session.step === 3) {
      session.current = price;
      session.step = 4;

      await ctx.reply(
        "✅ تم تسجيل السعر الحالي.\n\n" +
        "⏳ انتظر 10 ثوانٍ بالضبط، ثم أرسل السعر مرة ثانية."
      );
      return;
    }

    if (session.step === 4) {
      const result = analyzeSmart(
        session.high,
        session.low,
        session.open,
        session.current,
        price
      );

      sessions.delete(key);

      await ctx.reply(
        "📊 تحليل Smart - Masaad\n\n" +
        "⏱ فريم 5 دقائق (5M)\n\n" +

        `🔺 القمة: ${session.high.toFixed(5)}\n` +
        `🔻 القاع: ${session.low.toFixed(5)}\n` +
        `🕯 الافتتاح: ${session.open.toFixed(5)}\n` +
        `💰 السعر الأول: ${session.current.toFixed(5)}\n` +
        `💰 السعر بعد 10 ثوانٍ: ${price.toFixed(5)}\n\n` +

        `📈 الحركة خلال 10 ثوانٍ: ${result.movement.toFixed(5)}\n` +
        `📍 القراءة: ${result.direction}\n\n` +

        `🎯 الإشارة: ${result.signal}\n` +
        `⏱ المدة التجريبية: ${result.duration}\n\n` +

        "⚠️ الإشارات والمدة تجريبية وليست ضماناً للربح.\n\n" +
        "لبدء تحليل جديد أرسل /smart"
      );
    }
  });
}

