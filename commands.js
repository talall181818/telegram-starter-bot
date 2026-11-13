
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

function buildManualAnalysis(values) {
  const [high, low, open, current, later] = values;

  const range = Math.max(high - low, 0.0000001);
  const movement = later - current;
  const candleMove = current - open;

  let direction;
  let reason;
  let confidence = "ضعيف";

  if (movement > 0 && candleMove >= 0) {
    direction = "شراء UP";
    reason = "السعر يتحرك صعودًا والشمعة فوق الافتتاح";
    confidence = "متوسط";
  } else if (movement < 0 && candleMove <= 0) {
    direction = "بيع DOWN";
    reason = "السعر يتحرك هبوطًا والشمعة تحت الافتتاح";
    confidence = "متوسط";
  } else if (movement > 0) {
    direction = "شراء UP";
    reason = "الحركة الأخيرة صاعدة، لكن الشمعة لا تؤكدها بالكامل";
  } else if (movement < 0) {
    direction = "بيع DOWN";
    reason = "الحركة الأخيرة هابطة، لكن الشمعة لا تؤكدها بالكامل";
  } else if (candleMove >= 0) {
    direction = "شراء UP";
    reason = "لا توجد حركة أخيرة واضحة؛ الترجيح حسب موقع السعر من الافتتاح";
  } else {
    direction = "بيع DOWN";
    reason = "لا توجد حركة أخيرة واضحة؛ الترجيح حسب موقع السعر من الافتتاح";
  }

  const strength = Math.abs(movement);

  let duration = "50 ثانية";
  if (strength >= range * 0.25) {
    duration = "دقيقتان";
  } else if (strength >= range * 0.10) {
    duration = "دقيقة واحدة";
  }

  const confirmed =
    (direction === "شراء UP" && movement > 0 && candleMove > 0) ||
    (direction === "بيع DOWN" && movement < 0 && candleMove < 0);

  if (confirmed) confidence = "متوسط";

  return (
    "📊 تحليل Smart - Masaad\n\n" +
    `🔺 أعلى الشمعة السابقة: ${high}\n` +
    `🔻 أدنى الشمعة السابقة: ${low}\n` +
    `افتتاح الشمعة الجديدة: ${open}\n` +
    `السعر الحالي: ${current}\n` +
    `السعر بعد 10 ثوانٍ: ${later}\n\n` +
    `🎯 الاتجاه الأقرب: ${direction}\n` +
    `📊 قوة الترجيح: ${confidence}\n` +
    `⏱️ المدة المختارة: ${duration}\n` +
    `🧭 السبب: ${reason}\n\n` +
    `🚦 حالة الدخول: ${confirmed ? "الترجيح متوافق مع الحركة، لكنه غير مضمون" : "ترجيح مبدئي، انتظر تأكيد الحركة"}\n\n` +
    "⚠️ هذا تحليل مبسط للأسعار المدخلة وليس إشارة مضمونة."
  );
}

async function analyzeChartImage(ctx) {
  const apiKey = process.env.GEMINI_API_KEY;

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
      throw new Error("تعذر الحصول على مسار الصورة.");
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
حلل الصورة فقط ولا تدّع أنك ترى الأسعار الحية.

المطلوب الأساسي:
لا تترك الاتجاه أو المدة بدون تحديد.
اختر دائمًا أفضل ترجيح اتجاهي واحد:
شراء UP أو بيع DOWN.
حتى لو كان الترجيح ضعيفًا، اختر الاتجاه الأقرب واشرح أنه غير مؤكد.
لا تجعل كلمة انتظار هي النتيجة الوحيدة.

اختر مدة واحدة فقط من هذه المدد:
50 ثانية أو دقيقة واحدة أو دقيقتان.

حلل:
1. اتجاه الشموع الأخيرة.
2. لون آخر شمعة مكتملة.
3. السعر الظاهر، إذا كان مقروءًا.
4. أقرب مقاومة ودعم، إذا كانا واضحين.
5. هل توجد شمعة انعكاسية أو اختراق أو كسر؟
6. هل ضغط الشراء أقوى أم ضغط البيع؟
7. ما الاتجاه الأقرب الآن؟
8. ما شرط تأكيد الدخول؟
9. ما الذي يلغي هذا الترجيح؟

أخرج النتيجة بهذا التنسيق حرفيًا:

📊 تحليل Smart - Masaad

📈 اتجاه الشارت:
🕯️ آخر شمعة مكتملة:
💰 السعر الظاهر:
🔺 المقاومة:
🔻 الدعم:

🎯 الاتجاه الأقرب الآن: شراء UP أو بيع DOWN
📊 قوة الترجيح: ضعيف أو متوسط أو قوي
⏱️ المدة المختارة: 50 ثانية أو دقيقة واحدة أو دقيقتان

🚦 حالة الدخول:
اكتب هل الترجيح مبدئي أم توجد علامة تأكيد واضحة.

🟢 شرط الشراء:
🔴 شرط البيع:
⭐ سبب اختيار الاتجاه:
❌ متى تلغى الإشارة؟

قواعد مهمة:
- لا تكتب "انتظار" وحدها. حدد الاتجاه الأقرب أولًا.
- لا تقل إن الإشارة مؤكدة إذا لم يظهر تأكيد واضح.
- لا تخترع أسعارًا أو مستويات غير ظاهرة.
- إذا تعذر قراءة السعر فاكتب "غير واضح".
- لا تضمن الربح.
- اختر مدة واحدة فقط ولا تتركها فارغة.
- لا تعتبر مجرد لمس مستوى سعري اختراقًا مؤكدًا.
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
            maxOutputTokens: 1400
          }
        })
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error("Gemini API error:", result);
      throw new Error(
        result.error?.message || "تعذر الاتصال بخدمة التحليل."
      );
    }

    const answer = result.candidates?.[0]?.content?.parts
      ?.map(part => part.text || "")
      .join("\n")
      .trim();

    if (!answer) {
      throw new Error("لم تصل نتيجة التحليل.");
    }

    await ctx.reply(answer);

  } catch (error) {
    console.error("Image analysis error:", error);
    await ctx.reply(
      "⚠️ تعذر تحليل الصورة.\n" +
      "حاول إرسال صورة أوضح، وتأكد من إعداد مفتاح Gemini."
    );
  }
}

export function registerCommands(bot) {
  bot.command("start", async ctx => {
    sessions.delete(ctx.from.id);

    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل شارت Smart\n\n" +
      "📷 أرسل صورة الشارت للتحليل.\n" +
      "/smart - إدخال الأسعار يدويًا\n" +
      "/help - المساعدة\n" +
      "/cancel - إلغاء الإدخال"
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📖 أوامر Masaad\n\n" +
      "📷 أرسل صورة شارت Smart للتحليل.\n" +
      "/smart - إدخال خمسة أسعار\n" +
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
      await ctx.reply("⚠️ أرسل السعر كرقم فقط، مثال: 264.2505");
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
