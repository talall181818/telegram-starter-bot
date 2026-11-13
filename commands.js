
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

  const breakoutUp =
    current <= high && after10 > high && after10 > current;

  const continuationUp =
    current > high && after10 > current;

  const breakoutDown =
    current >= low && after10 < low && after10 < current;

  const continuationDown =
    current < low && after10 < current;

  if (breakoutUp || continuationUp) {
    signal = "🟢 شراء UP";
    direction = breakoutUp
      ? "اختراق القمة خلال 10 ثوانٍ"
      : "استمرار الصعود فوق القمة";

    const strength = movement / range;
    duration = strength >= 0.25
      ? "30 ثانية"
      : strength >= 0.10
        ? "45 ثانية"
        : "دقيقة واحدة";
  } else if (breakoutDown || continuationDown) {
    signal = "🔴 بيع DOWN";
    direction = breakoutDown
      ? "كسر القاع خلال 10 ثوانٍ"
      : "استمرار الهبوط تحت القاع";

    const strength = Math.abs(movement) / range;
    duration = strength >= 0.25
      ? "30 ثانية"
      : strength >= 0.10
        ? "45 ثانية"
        : "دقيقة واحدة";
  }

  return { signal, direction, duration, movement };
}

async function analyzeChartImage(ctx) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    await ctx.reply("⚠️ مفتاح Gemini غير موجود في إعدادات البوت.");
    return;
  }

  const token =
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TELEGRAM_TOKEN ||
    process.env.TOKEN;

  if (!token) {
    await ctx.reply("⚠️ لم أجد مفتاح اتصال تيليجرام في الإعدادات.");
    return;
  }

  await ctx.reply("⏳ استلمت صورة الشارت. جارٍ قراءة الشموع...");

  try {
    const photo = ctx.message.photo.at(-1);
    const file = await ctx.api.getFile(photo.file_id);

    const telegramUrl =
      `https://api.telegram.org/file/bot${token}/${file.file_path}`;

    const imageResponse = await fetch(telegramUrl);

    if (!imageResponse.ok) {
      throw new Error("تعذر تحميل الصورة من تيليجرام");
    }

    const imageBuffer = Buffer.from(
      await imageResponse.arrayBuffer()
    );

    const mimeType = "image/jpeg";

    const prompt = `
أنت مساعد لتحليل صور الشارت فقط.
حلل صورة أصل Smart في ExpertOption على فريم 5 دقائق إذا كان ظاهراً.

أجب بالعربية وبالترتيب:
1- هل الصورة واضحة أم لا؟
2- لون آخر شمعة مكتملة: خضراء أم حمراء، إذا أمكن رؤيتها.
3- اتجاه الحركة الظاهر: صاعد أو هابط أو متذبذب.
4- القمم والقيعان الظاهرة، ولا تخترع أرقاماً غير مقروءة.
5- هل يوجد اختراق للقمة أو كسر للقاع؟
6- القراءة: شراء UP أو بيع DOWN أو انتظار.
7- المدة التجريبية المقترحة: 30 أو 45 أو 60 ثانية.

إذا كانت الصورة لا تكفي لتحديد الاتجاه، قل انتظار.
لا تخترع أسعاراً أو مؤشرات غير ظاهرة.
لا تدّعِ أنك تعرف السعر المباشر أو المستقبل.
اذكر أن التحليل تقديري وليس ضماناً للربح.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{
            parts: [
              { text: prompt },
              {
                inline_data: {
                  mime_type: mimeType,
                  data: imageBuffer.toString("base64")
                }
              }
            ]
          }]
        })
      }
    );

    const data = await response.json();

    if (!response.ok) {
      throw new Error(
        data.error?.message || "خطأ في خدمة Gemini"
      );
    }

    const result = data.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!result) {
      await ctx.reply("⚠️ لم أستطع قراءة الشارت. أرسل صورة أوضح.");
      return;
    }

    await ctx.reply(
      "📊 تحليل صورة Smart - Masaad\n\n" +
      result +
      "\n\n⚠️ التحليل تقديري وليس ضماناً للربح."
    );

  } catch (error) {
    console.error("Image analysis error:", error);

    await ctx.reply(
      "⚠️ تعذر تحليل الصورة.\n" +
      "تأكد من مفتاح Gemini وحاول مرة أخرى."
    );
  }
}

export function registerCommands(bot) {

  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart بالصور والأسعار\n\n" +
      "أرسل صورة الشارت لتحليلها.\n\n" +
      "/smart - تحليل بالأسعار\n" +
      "/cancel - إلغاء التحليل\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 مساعدة Masaad\n\n" +
      "📷 أرسل صورة واضحة للشارت وسيحللها البوت.\n\n" +
      "أو استخدم /smart لإدخال الأسعار يدوياً.\n\n" +
      "الفريم المستهدف: 5 دقائق (5M)."
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

  bot.on("message:photo", async ctx => {
    await analyzeChartImage(ctx);
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
        "⚠️ أرسل السعر فقط بدون رموز.\nمثال: 263.98240"
      );
      return;
    }

    if (session.step === 0) {
      session.high = price;
      session.step = 1;
      await ctx.reply("✅ تم تسجيل القمة.\nأرسل قاع الشمعة السابقة المكتملة.");
      return;
    }

    if (session.step === 1) {
      if (price >= session.high) {
        await ctx.reply("⚠️ القاع يجب أن يكون أقل من القمة.");
        return;
      }

      session.low = price;
      session.step = 2;
      await ctx.reply("✅ تم تسجيل القاع.\nأرسل افتتاح الشمعة الجديدة.");
      return;
    }

    if (session.step === 2) {
      session.open = price;
      session.step = 3;
      await ctx.reply("✅ تم تسجيل الافتتاح.\nأرسل السعر الحالي.");
      return;
    }

    if (session.step === 3) {
      session.current = price;
      session.step = 4;
      await ctx.reply("✅ تم تسجيل السعر الحالي.\nانتظر 10 ثوانٍ ثم أرسل السعر مرة ثانية.");
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
        `📈 الحركة: ${result.movement.toFixed(5)}\n` +
        `📍 القراءة: ${result.direction}\n` +
        `🎯 الإشارة: ${result.signal}\n` +
        `⏱ المدة التجريبية: ${result.duration}\n\n` +
        "⚠️ الإشارات تجريبية وليست ضماناً للربح.\n" +
        "لبدء تحليل جديد أرسل /smart"
      );
    }
  });
}
