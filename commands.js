
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

function analyzeSmart(high, low, nextOpen, currentPrice) {
  let signal = "⏳ انتظار";
  let direction = "لم يحدث اختراق أو كسر واضح";

  if (currentPrice > high && currentPrice > nextOpen) {
    signal = "🟢 شراء UP";
    direction = "اختراق القمة مع حركة صاعدة";
  } else if (currentPrice < low && currentPrice < nextOpen) {
    signal = "🔴 بيع DOWN";
    direction = "كسر القاع مع حركة هابطة";
  }

  return {
    signal,
    direction,
    change: currentPrice - nextOpen
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
      "أرسل /smart ثم أدخل:\n\n" +
      "1️⃣ قمة الشمعة السابقة\n" +
      "2️⃣ قاع الشمعة السابقة\n" +
      "3️⃣ افتتاح الشمعة التالية\n" +
      "4️⃣ السعر الحالي\n\n" +
      "سيظهر التحليل تلقائياً بعد القيمة الرابعة."
    );
  });

  bot.command("smart", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    sessions.set(key, {
      step: 0,
      high: null,
      low: null,
      nextOpen: null
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
        await ctx.reply("⚠️ القاع يجب أن يكون أقل من القمة. أعد إرسال القاع.");
        return;
      }

      session.low = price;
      session.step = 2;
      await ctx.reply("✅ تم تسجيل القاع.\n\nأرسل افتتاح الشمعة التالية.");
      return;
    }

    if (session.step === 2) {
      session.nextOpen = price;
      session.step = 3;
      await ctx.reply("✅ تم تسجيل الافتتاح.\n\nأرسل السعر الحالي الآن.");
      return;
    }

    if (session.step === 3) {
      const result = analyzeSmart(
        session.high,
        session.low,
        session.nextOpen,
        price
      );

      sessions.delete(key);

      await ctx.reply(
        "📊 تحليل Smart - Masaad\n\n" +
        "⏱ فريم الدقيقة 1M\n\n" +
        `🔺 القمة السابقة: ${session.high}\n` +
        `🔻 القاع السابق: ${session.low}\n` +
        `🕯 الافتتاح: ${session.nextOpen}\n` +
        `💰 السعر الحالي: ${price}\n\n` +
        `📈 الحركة من الافتتاح: ${result.change.toFixed(5)}\n` +
        `📍 القراءة: ${result.direction}\n\n` +
        `🎯 الإشارة: ${result.signal}\n\n` +
        "⚠️ قراءة مبدئية؛ يُفضّل انتظار إغلاق الشمعة لتأكيد الاختراق أو الكسر.\n\n" +
        "لبدء تحليل جديد أرسل /smart"
      );
    }
  });
}

