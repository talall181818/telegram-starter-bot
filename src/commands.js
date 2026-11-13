
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

function analyzeSmart(high, low, nextOpen) {
  const range = high - low;
  const midpoint = (high + low) / 2;

  let signal = "⏳ انتظار";
  let direction = "غير مؤكد";

  if (range > 0 && nextOpen > high) {
    signal = "🟢 شراء UP";
    direction = "افتتاح أعلى من القمة";
  } else if (range > 0 && nextOpen < low) {
    signal = "🔴 بيع DOWN";
    direction = "افتتاح أدنى من القاع";
  } else if (nextOpen > midpoint) {
    direction = "الافتتاح داخل النصف العلوي";
  } else if (nextOpen < midpoint) {
    direction = "الافتتاح داخل النصف السفلي";
  }

  return { range, midpoint, signal, direction };
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
      "1- قمة الشمعة السابقة\n" +
      "2- قاع الشمعة السابقة\n" +
      "3- افتتاح الشمعة الثانية\n\n" +
      "سيظهر التحليل تلقائياً بعد القيمة الثالثة."
    );
  });

  bot.command("smart", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    sessions.set(key, {
      step: 0,
      high: null,
      low: null
    });

    await ctx.reply(
      "📊 تحليل Smart - فريم الدقيقة 1M\n\n" +
      "أرسل قمة الشمعة السابقة فقط."
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

      await ctx.reply(
        `✅ القمة: ${price}\n\n` +
        "أرسل الآن قاع الشمعة السابقة."
      );
      return;
    }

    if (session.step === 1) {
      if (price > session.high) {
        await ctx.reply(
          "⚠️ القاع لا يمكن أن يكون أعلى من القمة. أرسل القاع الصحيح."
        );
        return;
      }

      if (price === session.high) {
        await ctx.reply(
          "⚠️ القمة والقاع لا يمكن أن يكونا متساويين. أرسل القاع الصحيح."
        );
        return;
      }

      session.low = price;
      session.step = 2;

      await ctx.reply(
        `✅ القاع: ${price}\n\n` +
        "أرسل الآن افتتاح الشمعة الثانية."
      );
      return;
    }

    if (session.step === 2) {
      const result = analyzeSmart(
        session.high,
        session.low,
        price
      );

      sessions.delete(key);

      await ctx.reply(
        "📊 تحليل Smart - Masaad\n" +
        "⏱ فريم الدقيقة 1M\n\n" +
        "🔺 القمة: " + session.high + "\n" +
        "🔻 القاع: " + session.low + "\n" +
        "🕯 افتتاح الشمعة الثانية: " + price + "\n\n" +
        "📏 نطاق الشمعة: " + result.range.toFixed(5) + "\n" +
        "📍 منتصف النطاق: " + result.midpoint.toFixed(5) + "\n" +
        "📈 القراءة: " + result.direction + "\n\n" +
        "🎯 الإشارة: " + result.signal + "\n\n" +
        "⚠️ تحليل مبدئي فقط؛ لا يمكن تأكيد اتجاه الشمعة من هذه القيم وحدها.\n\n" +
        "لبدء تحليل جديد أرسل /smart"
      );
    }
  });
}
