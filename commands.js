
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

  if (
    current > high &&
    current > open &&
    after10 > current
  ) {
    signal = "🟢 شراء UP";
    direction = "اختراق القمة واستمرار الصعود";

    const strength = movement / range;

    if (strength >= 0.25) duration = "30 ثانية";
    else if (strength >= 0.10) duration = "45 ثانية";
    else duration = "دقيقة واحدة";
  }

  else if (
    current < low &&
    current < open &&
    after10 < current
  ) {
    signal = "🔴 بيع DOWN";
    direction = "كسر القاع واستمرار الهبوط";

    const strength = Math.abs(movement) / range;

    if (strength >= 0.25) duration = "30 ثانية";
    else if (strength >= 0.10) duration = "45 ثانية";
    else duration = "دقيقة واحدة";
  }

  return {
    signal,
    direction,
    duration,
    movement
  };
}

export function registerCommands(bot) {
  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart - فريم الدقيقة\n\n" +
      "/smart - بدء التحليل\n" +
      "/cancel - إلغاء التحليل\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 طريقة تحليل Smart\n\n" +
      "أرسل /smart ثم أدخل:\n" +
      "1- قمة الشمعة السابقة\n" +
      "2- قاع الشمعة السابقة\n" +
      "3- افتتاح الشمعة التالية\n" +
      "4- السعر الحالي\n" +
      "5- السعر بعد 10 ثوانٍ\n\n" +
      "سيحسب البوت الاتجاه والمدة التجريبية."
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
      "📊 تحليل Smart - Masaad\n" +
      "⏱ فريم الدقيقة 1M\n\n" +
      "أرسل قمة الشمعة السابقة."
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
      await ctx.reply("⚠️ أرسل السعر فقط، مثال: 264.273");
      return;
    }

    if (session.step === 0) {
      session.high = price;
      session.step = 1;
      await ctx.reply("✅ تم تسجيل القمة.\n\nأرسل قاع الشمعة السابقة.");
      return;
    }

    if (session.step === 1) {
      if (price >= session.high) {
        await ctx.reply("⚠️ القاع يجب أن يكون أقل من القمة.");
        return;
      }

      session.low = price;
      session.step = 2;
      await ctx.reply("✅ تم تسجيل القاع.\n\nأرسل افتتاح الشمعة التالية.");
      return;
    }

    if (session.step === 2) {
      session.open = price;
      session.step = 3;
      await ctx.reply("✅ تم تسجيل الافتتاح.\n\nأرسل السعر الحالي.");
      return;
    }

    if (session.step === 3) {
      session.current = price;
      session.step = 4;

      await ctx.reply(
        "✅ تم تسجيل السعر الحالي.\n\n" +
        "⏳ انتظر 10 ثوانٍ من الآن، ثم أرسل السعر مرة ثانية."
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
        "⏱ فريم الدقيقة 1M\n\n" +
        `🔺 القمة: ${session.high}\n` +
        `🔻 القاع: ${session.low}\n` +
        `🕯 الافتتاح: ${session.open}\n` +
        `💰 السعر الأول: ${session.current}\n` +
        `💰 السعر بعد 10 ثوانٍ: ${price}\n\n` +
        `📈 الحركة خلال 10 ثوانٍ: ${result.movement.toFixed(5)}\n` +
        `📍 القراءة: ${result.direction}\n\n` +
        `🎯 الإشارة: ${result.signal}\n` +
        `⏱ المدة التجريبية: ${result.duration}\n\n` +
        "⚠️ المدة تقديرية وغير مثبتة؛ اختبر النتائج قبل استخدامها في التداول.\n\n" +
        "لبدء تحليل جديد أرسل /smart"
      );
    }
  });
}
