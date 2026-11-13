
const sessions = new Map();

function normalizeNumber(text) {
  const normalized = String(text)
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/٬/g, "")
    .replace(/,/g, "")
    .replace(/[^\d.-]/g, "");

  const value = Number(normalized);
  return Number.isFinite(value) ? value : null;
}

function getToken(bot) {
  return (
    bot.token ||
    process.env.TELEGRAM_BOT_TOKEN ||
    process.env.BOT_TOKEN ||
    process.env.TELEGRAM_TOKEN ||
    process.env.TOKEN
  );
}

function buildManualAnalysis(values) {
  const [high, low, open, current, later] = values;

  const range = high - low;
  const movement = later - current;
  const candleMove = current - open;

  let direction = "شراء UP";
  let reason = "الأسعار تميل للصعود";
  let confidence = "ضعيف";

  if (movement > 0 && candleMove > 0) {
    direction = "شراء UP";
    reason = "السعر أعلى من الافتتاح ويتحرك صعودًا";
    confidence = "متوسط";
  } else if (movement < 0 && candleMove < 0) {
    direction = "بيع DOWN";
    reason = "السعر أقل من الافتتاح ويتحرك هبوطًا";
    confidence = "متوسط";
  } else if (movement > 0) {
    direction = "شراء UP";
    reason = "الحركة الأخيرة صاعدة رغم اختلاف حركة الشمعة";
  } else if (movement < 0) {
    direction = "بيع DOWN";
    reason = "الحركة الأخيرة هابطة رغم اختلاف حركة الشمعة";
  } else {
    direction = candleMove >= 0 ? "شراء UP" : "بيع DOWN";
    reason = "الحركة غير واضحة، وهذا مجرد ترجيح";
  }

  if (range > 0 && Math.abs(movement) > range * 0.08) {
    confidence = "متوسط";
  }

  let duration = 30;
  if (Math.abs(movement) > range * 0.15) duration = 45;
  if (Math.abs(movement) > range * 0.3) duration = 60;

  return (
    "📊 تحليل Smart - Masaad\n\n" +
    "⏱️ الفريم: 5 دقائق\n" +
    `🔺 أعلى الشمعة السابقة: ${high}\n` +
    `🔻 أدنى الشمعة السابقة: ${low}\n` +
    `افتتاح الشمعة: ${open}\n` +
    `السعر الحالي: ${current}\n` +
    `السعر بعد 10 ثوانٍ: ${later}\n\n` +
    `🎯 أفضل ترجيح: ${direction}\n` +
    `📈 قوة الترجيح: ${confidence}\n` +
    `🧭 السبب: ${reason}\n` +
    `⏳ المدة التجريبية: ${duration} ثانية\n\n` +
    "⚠️ هذا ترجيح آلي مبسط وليس إشارة مؤكدة. لا تدخل إذا كانت الحركة متذبذبة."
  );
}

async function analyzeChartImage(ctx) {
  const apiKey = process.env.GEMINI_API_KEY;
  const token = getToken(ctx.me ? ctx.api : ctx.bot);

  if (!apiKey) {
    await ctx.reply("⚠️ مفتاح GEMINI_API_KEY غير موجود في إعدادات الاستضافة.");
    return;
  }

  try {
    await ctx.reply("⏳ استلمت صورة الشارت. جارٍ تحليلها...");

    const photos = ctx.message.photo;
    const photo = photos[photos.length - 1];

    const file = await ctx.api.getFile(photo.file_id);

    if (!file.file_path) {
      throw new Error("تعذر الحصول على مسار الصورة من تيليجرام.");
    }

    const botToken = ctx.api.token;
    const imageUrl =
      `https://api.telegram.org/file/bot${botToken}/${file.file_path}`;

    const imageResponse = await fetch(imageUrl);

    if (!imageResponse.ok) {
      throw new Error("تعذر تحميل صورة الشارت.");
    }

    const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());

    if (imageBuffer.length > 15 * 1024 * 1024) {
      await ctx.reply("⚠️ الصورة كبيرة جدًا. أرسل صورة أصغر.");
      return;
    }

    const mimeType = file.file_path.endsWith(".png")
      ? "image/png"
      : file.file_path.endsWith(".webp")
      ? "image/webp"
      : "image/jpeg";

    const prompt = `
أنت مساعد تحليل فني بصري لشارت ExpertOption Smart.
حلل الصورة المرفقة فقط. لا تدّع أنك ترى الأسعار الحية أو تعرف ما سيحدث مستقبلًا.

المطلوب:
1. صف اتجاه الشموع الأخيرة: صاعد أو هابط أو متذبذب.
2. حدد لون آخر شمعة مكتملة إن كان واضحًا.
3. اقرأ السعر وأقرب قمة وقاع ومستويات المقاومة والدعم الظاهرة فقط.
4. هل يوجد اختراق أو كسر واضح؟ لا تخترع مستويات غير مقروءة.
5. أعطني أفضل ترجيح اتجاهي الآن، ولا تجعل الإجابة كلها انتظارًا:
   - شراء UP إذا كانت دلائل الصعود أقوى.
   - بيع DOWN إذا كانت دلائل الهبوط أقوى.
   - إذا كانت الصورة غير واضحة جدًا، قل إن الترجيح غير موثوق واختر الاتجاه الأقرب فقط إذا أمكن.
6. اكتب درجة الترجيح: ضعيف أو متوسط أو قوي.
7. اكتب أقرب فرصة شراء محتملة وشرط تحققها.
8. اكتب أقرب فرصة بيع محتملة وشرط تحققها.
9. اختر الأقرب بين فرصتي الشراء والبيع.
10. اقترح مدة تجريبية واحدة: 30 أو 45 أو 60 ثانية، واذكر سبب الاختيار.
11. اذكر متى تلغى الفكرة أو يصبح الدخول غير مناسب.

اكتب بالعربية وبشكل واضح بهذا التنسيق:

📊 تحليل Smart - Masaad

📈 اتجاه الشارت:
🕯️ آخر شمعة مكتملة:
💰 السعر الظاهر:
🔺 المقاومة:
🔻 الدعم:

🎯 أفضل ترجيح الآن: شراء UP أو بيع DOWN
📊 قوة الترجيح: ضعيف / متوسط / قوي
⏳ المدة التجريبية: 30 أو 45 أو 60 ثانية

🟢 فرصة الشراء:
🔴 فرصة البيع:
⭐ الفرصة الأقرب:
⚠️ شرط إلغاء الترجيح:

مهم:
- أعطني ترجيحًا اتجاهيًا بدل تكرار كلمة انتظار.
- لا تصف الترجيح بأنه مؤكد إذا لم يوجد تأكيد.
- لا تخترع أسعارًا أو أرقامًا غير ظاهرة.
- إذا كانت الصورة لا تسمح بقراءة السعر، اكتب "غير واضح".
- لا تضمن الربح ولا تقدم مدة على أنها مضمونة.
`;

    const response = await fetch(
      "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.8-flash:generateContent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: imageBuffer.toString("base64")
                  }
                }
              ]
            }
          ],
          generationConfig: {
            temperature: 0.2,
            maxOutputTokens: 1200
          }
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", result);
      throw new Error(
        result.error?.message || "حدث خطأ أثناء الاتصال بخدمة التحليل."
      );
    }

    const answer =
      result.candidates?.[0]?.content?.parts
        ?.map(part => part.text || "")
        .join("\n")
        .trim();

    if (!answer) {
      throw new Error("لم يرجع التحليل نتيجة. حاول بصورة أوضح.");
    }

    await ctx.reply(answer);

  } catch (error) {
    console.error("Image analysis error:", error);
    await ctx.reply(
      "⚠️ تعذر تحليل الصورة هذه المرة.\n" +
      "تأكد أن الصورة واضحة وأن مفتاح Gemini مضبوط في الاستضافة."
    );
  }
}

export function registerCommands(bot) {
  bot.command("start", async ctx => {
    sessions.delete(ctx.from.id);

    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل شارت Smart\n\n" +
      "📷 أرسل صورة الشارت لتحليلها.\n" +
      "/smart - تحليل الأسعار يدويًا\n" +
      "/help - المساعدة\n" +
      "/cancel - إلغاء الإدخال"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📖 قائمة أوامر Masaad\n\n" +
      "📷 أرسل صورة شارت Smart لتحليلها.\n\n" +
      "/smart - إدخال خمسة أسعار للتحليل\n" +
      "/cancel - إلغاء الإدخال\n" +
      "/start - القائمة الرئيسية"
    );
  });

  bot.command("cancel", async ctx => {
    sessions.delete(ctx.from.id);
    await ctx.reply("تم إلغاء الإدخال.");
  });

  bot.command("smart", async ctx => {
    sessions.set(ctx.from.id, {
      step: 0,
      values: []
    });

    await ctx.reply(
      "📊 تحليل Smart اليدوي\n\n" +
      "أرسل أعلى سعر للشمعة السابقة:"
    );
  });

  bot.on("message:photo", async ctx => {
    sessions.delete(ctx.from.id);
    await analyzeChartImage(ctx);
  });

  bot.on("message:text", async ctx => {
    const userId = ctx.from.id;
    const session = sessions.get(userId);

    if (!session) return;

    const value = normalizeNumber(ctx.message.text);

    if (value === null) {
      await ctx.reply("⚠️ أرسل رقم السعر فقط، مثال: 264.2505");
      return;
    }

    const questions = [
      "أرسل أدنى سعر للشمعة السابقة:",
      "أرسل سعر افتتاح الشمعة الجديدة:",
      "أرسل السعر الحالي:",
      "أرسل السعر بعد 10 ثوانٍ:"
    ];

    session.values.push(value);
    session.step++;

    if (session.step < 5) {
      await ctx.reply(questions[session.step - 1]);
      return;
    }

    const result = buildManualAnalysis(session.values);
    sessions.delete(userId);

    await ctx.reply(result);
  });
}

