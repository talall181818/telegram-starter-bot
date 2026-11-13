
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
  const midpoint = (high + low) / 2;
  let signal = "⏳ انتظار";
  let direction = "الافتتاح داخل نطاق الشمعة السابقة";

  if (nextOpen > high) {
    signal = "🟢 شراء UP";
    direction = "افتتاح أعلى من قمة الشمعة السابقة";
  } else if (nextOpen < low) {
    signal = "🔴 بيع DOWN";
    direction = "افتتاح أدنى من قاع الشمعة السابقة";
  }

  return { midpoint, signal, direction };
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
      "أرسل /smart ثم أدخل القيم بالترتيب:\n\n" +
      "1️⃣ قمة الشمعة السابقة\n" +
      "2️⃣ قاع الشمعة السابقة\n" +
      "3️⃣ افتتاح الشمعة التالية\n\n" +
      "سيظهر التحليل بعد القيمة الثالثة."
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

      await ctx.reply(
        `✅ القمة: ${price}\n\n` +
        "أرسل الآن قاع الشمعة السابقة."
      );
      return;
    }

    if (session.step === 1) {
      if (price >= session.high) {
        await ctx.reply(
          "⚠️ القاع يجب أن يكون أقل من القمة. أرسل القاع الصحيح."
        );
        return;
      }

      session.low = price;
      session.step = 2;

      await ctx.reply(
        `✅ القاع: ${price}\n\n` +
        "أرسل الآن افتتاح الشمعة التالية."
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
        "📊 تحليل Smart - Masaad\n\n" +
        "⏱ فريم الدقيقة 1M\n\n" +
        `🔺 القمة: ${session.high}\n` +
        `🔻 القاع: ${session.low}\n` +
        `🕯 افتتاح الشمعة التالية: ${price}\n` +
        `📍 منتصف النطاق: ${result.midpoint.toFixed(5)}\n\n` +
        `📈 القراءة: ${result.direction}\n` +
        `🎯 الإشارة: ${result.signal}\n\n` +
        "⚠️ قراءة مبدئية وليست ضمانًا لاتجاه السوق.\n\n" +
        "لبدء تحليل جديد أرسل /smart"
      );
    }
  });
}

