
const sessions = new Map();

// تحويل السعر إلى رقم
function parsePrice(text) {
  const normalized = text.trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/,/g, ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;

  const value = Number(normalized);
  return Number.isFinite(value) && value > 0 ? value : null;
}

// تحليل الأسعار اليدوي
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
    current <= high &&
    after10 > high &&
    after10 > current;

  const continuationUp =
    current > high &&
    after10 > current;

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

// تحليل صورة الشارت باستخدام Gemini
async function analyzeChartImage(ctx) {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    await ctx.reply("⚠️ مفتاح Gemini غير موجود في الإعدادات.");
    return;
  }

  const token =
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TELEGRAM_TOKEN ||
    process.env.TOKEN;

  if (!token) {
    await ctx.reply("⚠️ مفتاح تيليجرام غير موجود في الإعدادات.");
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

    const prompt = `
أنت محلل فني لصور الشارت في ExpertOption Smart.

حلل الصورة بدقة، ولا تخترع أسعاراً أو مستويات غير ظاهرة.

أجب بالعربية بهذا الترتيب:

1. وضوح الصورة.
2. لون آخر شمعة مكتملة: خضراء أو حمراء أو غير واضح.
3. اتجاه السوق: صاعد أو هابط أو متذبذب.
4. القمة والقاع الظاهران.
5. السعر الحالي إذا كان مقروءاً.
6. هل يوجد اختراق للقمة أو كسر للقاع؟

7. الإشارة الحالية:
شراء UP أو بيع DOWN أو انتظار.

8. أقرب فرصة محتملة:
- فرصة شراء: اذكر مستوى السعر أو الشرط الذي يؤكدها.
- فرصة بيع: اذكر مستوى السعر أو الشرط الذي يؤكدها.
- حدد أي الفرصتين أقرب حسب الصورة، أو قل غير واضحة.

9. المدة التجريبية عند تأكيد الفرصة:
30 أو 45 أو 60 ثانية.

10. سبب اختيار الإشارة وشرط إلغائها.

مهم:
- فرّق بين الإشارة الحالية والفرصة المحتملة.
- لا تجبر التحليل على إعطاء شراء أو بيع.
- لا تخترع أسعاراً أو مؤشرات غير ظاهرة.
- لا تدّعِ معرفة السعر المباشر أو المستقبل.
- إذا لم تكن الصورة واضحة، اطلب صورة أوضح.
- لا تعتبر لون شمعة واحدة دليلاً كافياً للدخول.
- اذكر أن التحليل تقديري وليس ضماناً للربح.
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
                  mime_type: "image/jpeg",
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
      await ctx.reply(
        "⚠️ لم أستطع قراءة الشارت. أرسل صورة أوضح."
      );
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

// تسجيل أوامر البوت
export function registerCommands(bot) {

  bot.command("start", async ctx => {
    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart بالصور والأسعار\n\n" +
      "📷 أرسل صورة الشارت لتحليلها.\n\n" +
      "/smart - تحليل الأسعار يدوياً\n" +
      "/cancel - إلغاء التحليل\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📌 مساعدة Masaad\n\n" +
      "📷 أرسل صورة واضحة لشارت Smart لتحليلها.\n\n" +
      "أو أرسل /smart لإدخال الأسعار يدوياً.\n\n" +
      "⏱ الفريم المستهدف: 5 دقائق (5M).\n\n" +
      "سيعرض البوت الإشارة الحالية وأقرب فرصة محتملة."
    );
  });

  // بدء التحليل اليدوي
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

  // إلغاء التحليل
  bot.command("cancel", async ctx => {
    const key = `${ctx.chat.id}:${ctx.from.id}`;

    sessions.delete(key);

    await ctx.reply("✅ تم إلغاء التحليل.");
  });

  // استقبال صور الشارت
  bot.on("message:photo", async ctx => {
    await analyzeChartImage(ctx);
  });

  // استقبال الأسعار اليدوية
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
        "✅ تم تسجيل القمة.\n" +
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
        "✅ تم تسجيل القاع.\n" +
        "أرسل افتتاح الشمعة الجديدة."
      );
      return;
    }

    if (session.step === 2) {
      session.open = price;
      session.step = 3;

      await ctx.reply(
        "✅ تم تسجيل الافتتاح.\n" +
        "أرسل السعر الحالي."
      );
      return;
    }

    if (session.step === 3) {
      session.current = price;
      session.step = 4;

      await ctx.reply(
        "✅ تم تسجيل السعر الحالي.\n" +
        "انتظر 10 ثوانٍ ثم أرسل السعر مرة ثانية."
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

