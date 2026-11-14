
const sessions = new Map();

function getPrice(text) {
  const normalized = text.trim()
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/,/g, ".");

  if (!/^\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function analyzePrices(prices, market) {
  if (prices.length < 5) {
    return `📊 القراءات: ${prices.length}/5\nأرسل السعر التالي.`;
  }

  const changes = [];
  for (let i = 1; i < prices.length; i++) {
    changes.push(prices[i] - prices[i - 1]);
  }

  const net = prices.at(-1) - prices[0];
  const total = changes.reduce((s, x) => s + Math.abs(x), 0);
  const consistency = total === 0 ? 0 : Math.abs(net) / total;

  let direction = "متذبذب";
  let decision = "⏸ انتظار";
  let strength = "ضعيفة";
  let duration = "لا توجد مدة";

  if (consistency >= 0.5 && net > 0) {
    direction = "صاعد";
    decision = "📈 ترجيح شراء UP";
  } else if (consistency >= 0.5 && net < 0) {
    direction = "هابط";
    decision = "📉 ترجيح بيع DOWN";
  }

  if (consistency >= 0.9) {
    strength = "قوية";
    duration = "45 ثانية";
  } else if (consistency >= 0.75) {
    strength = "جيدة";
    duration = "40 ثانية";
  } else if (consistency >= 0.6) {
    strength = "متوسطة";
    duration = "35 ثانية";
  } else if (consistency >= 0.5) {
    strength = "محدودة";
    duration = "30 ثانية";
  }

  if (consistency >= 0.9 && changes.length >= 4) duration = "دقيقتان";
  if (consistency >= 0.95 && changes.length >= 5) duration = "3 دقائق";
  if (consistency >= 0.98 && changes.length >= 6) duration = "5 دقائق";

  if (decision.includes("انتظار")) duration = "لا تدخل حالياً";

  return `📊 تحليل ${market} - Masaad

💰 السعر الحالي: ${prices.at(-1)}
📈 الاتجاه: ${direction}
🎯 القرار: ${decision}
💪 قوة الإشارة: ${strength}
⏱️ المدة المقترحة: ${duration}
📊 توافق الحركة: ${(consistency * 100).toFixed(1)}%

⚠️ تحليل تجريبي وليس ضماناً للربح.`;
}

async function downloadTelegramPhoto(ctx, fileId) {
  const token = process.env.TELEGRAM_BOT_TOKEN ||
                process.env.BOT_TOKEN;

  if (!token) throw new Error("TELEGRAM_BOT_TOKEN غير موجود");

  const file = await ctx.api.getFile(fileId);

  if (!file.file_path) {
    throw new Error("تعذر العثور على ملف الصورة");
  }

  const response = await fetch(
    `https://api.telegram.org/file/bot${token}/${file.file_path}`
  );

  if (!response.ok) {
    throw new Error("تعذر تحميل صورة تيليجرام");
  }

  const buffer = Buffer.from(await response.arrayBuffer());

  return `data:image/jpeg;base64,${buffer.toString("base64")}`;
}

async function analyzeSmartImages(image1m, image5m = null) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) {
    throw new Error("أضف OPENAI_API_KEY في إعدادات FadeHost");
  }

  const prompt = `
أنت محلل فني للرسوم البيانية.

حلل صور Smart من ExpertOption.

الفريم الأساسي: دقيقة واحدة 1M.
فريم التأكيد: خمس دقائق 5M.

إذا وصلت صورة واحدة فقط:
حلل الدقيقة، واذكر أن تأكيد 5M غير متوفر.

إذا وصلت الصورتان:
قارن الاتجاهين وحدد هل هما متوافقان أم متعارضان.

افحص:
1. اتجاه الشموع.
2. آخر شمعة مكتملة.
3. القمم والقيعان.
4. الدعم والمقاومة إذا كانا واضحين.
5. قوة الحركة.
6. هل توجد إشارة شراء أو بيع أم انتظار.

اختر القرار:
شراء UP أو بيع DOWN أو انتظار.

المدد المتاحة:
30 أو 35 أو 40 أو 45 ثانية،
دقيقتان أو 3 دقائق أو 5 دقائق.

اقترح مدة فقط إذا كانت الصورة تسمح بتقدير فني معقول.
لا تخترع بيانات أو أسعاراً أو مؤشرات غير ظاهرة.
إذا كانت الصورة غير واضحة أو الاتجاه متعارضاً، اختر انتظار.

اكتب النتيجة بالعربية بهذا التنسيق:

📊 تحليل صورة Smart - Masaad

💰 السعر الظاهر:
📈 اتجاه 1M:
📉 اتجاه 5M:
🕯️ آخر شمعة مكتملة:
🔺 المقاومة:
🔻 الدعم:
🎯 القرار:
💪 قوة الإشارة:
⏱️ المدة المقترحة:
📝 سبب القرار:

اذكر بوضوح أي معلومة لا يمكن قراءتها.
لا تدّعِ ضمان الربح أو دقة مؤكدة.
`;

  const content = [
    { type: "input_text", text: prompt },
    {
      type: "input_image",
      image_url: image1m,
      detail: "high"
    }
  ];

  if (image5m) {
    content.push({
      type: "input_image",
      image_url: image5m,
      detail: "high"
    });
  }

  const response = await fetch(
    "https://api.openai.com/v1/responses",
    {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "gpt-4.1-mini",
        instructions: "حلل الصور بدقة ولا تخترع معلومات.",
        input: [
          {
            role: "user",
            content
          }
        ],
        max_output_tokens: 900
      })
    }
  );

  const result = await response.json();

  if (!response.ok) {
    throw new Error(
      result.error?.message || "فشل تحليل الصورة"
    );
  }

  const answer = (result.output || [])
    .filter(item => item.type === "message")
    .flatMap(item => item.content || [])
    .filter(item => item.type === "output_text")
    .map(item => item.text)
    .join("\n");

  if (!answer) throw new Error("لم يصل رد التحليل");

  return answer;
}

export function registerCommands(bot) {

  bot.command("start", async (ctx) => {
    sessions.delete(ctx.chat.id);

    await ctx.reply(
      "أهلاً بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart و EUR/USD\n\n" +
      "/smart - تحليل Smart بالصور\n" +
      "/eurusd - تحليل اليورو دولار عند الطلب\n" +
      "/help - المساعدة"
    );
  });

  bot.command("help", async (ctx) => {
    await ctx.reply(
      "📊 Masaad - المساعدة\n\n" +
      "/smart - تحليل Smart بالصور\n" +
      "/analyze1m - تحليل صورة الدقيقة فقط\n" +
      "/eurusd - تحليل اليورو دولار\n\n" +
      "أرسل صورة الشارت بعد /smart."
    );
  });

  bot.command("smart", async (ctx) => {
    sessions.set(ctx.chat.id, {
      market: "Smart",
      mode: "image",
      image1m: null
    });

    await ctx.reply(
      "📊 بدأ تحليل Smart بالصور.\n\n" +
      "1️⃣ اختر فريم الدقيقة 1M.\n" +
      "2️⃣ أرسل صورة الشارت.\n" +
      "3️⃣ بعدها أرسل صورة فريم 5M للتأكيد.\n\n" +
      "يمكنك استخدام /analyze1m لتحليل صورة الدقيقة وحدها."
    );
  });

  bot.command("analyze1m", async (ctx) => {
    const session = sessions.get(ctx.chat.id);

    if (!session?.image1m) {
      await ctx.reply("⚠️ أرسل صورة فريم 1M أولاً بعد /smart.");
      return;
    }

    await ctx.reply("🔍 جارٍ تحليل صورة الدقيقة...");

    try {
      const answer = await analyzeSmartImages(session.image1m);
      await ctx.reply(answer);
    } catch (error) {
      await ctx.reply("⚠️ تعذر التحليل: " + error.message);
    } finally {
      sessions.delete(ctx.chat.id);
    }
  });

  bot.command("eurusd", async (ctx) => {
    sessions.set(ctx.chat.id, {
      market: "EUR/USD",
      mode: "prices",
      prices: []
    });

    await ctx.reply(
      "📊 بدأ تحليل EUR/USD.\n\nأرسل السعر الحالي."
    );
  });

  bot.on("message:photo", async (ctx) => {
    const session = sessions.get(ctx.chat.id);

    if (!session || session.market !== "Smart" ||
        session.mode !== "image") {
      await ctx.reply("ابدأ بإرسال /smart أولاً.");
      return;
    }

    try {
      const photos = ctx.message.photo;
      const photo = photos[photos.length - 1];

      await ctx.reply("📥 تم استلام الصورة، جارٍ تجهيزها...");

      const image = await downloadTelegramPhoto(
        ctx,
        photo.file_id
      );

      if (!session.image1m) {
        session.image1m = image;

        await ctx.reply(
          "✅ تم استلام صورة 1M.\n\n" +
          "أرسل الآن صورة فريم 5M للتأكيد، " +
          "أو أرسل /analyze1m لتحليل الدقيقة فقط."
        );
        return;
      }

      await ctx.reply("🔍 تم استلام الصورتين. جارٍ التحليل...");

      const answer = await analyzeSmartImages(
        session.image1m,
        image
      );

      await ctx.reply(answer);
      sessions.delete(ctx.chat.id);

    } catch (error) {
      await ctx.reply("⚠️ حدث خطأ: " + error.message);
    }
  });

  bot.on("message:text", async (ctx) => {
    const session = sessions.get(ctx.chat.id);

    if (!session) return;

    if (ctx.message.text.startsWith("/")) return;

    if (session.market === "Smart") {
      await ctx.reply(
        "📷 أرسل صورة الشارت على فريم 1M أو 5M."
      );
      return;
    }

    if (session.market !== "EUR/USD") return;

    const price = getPrice(ctx.message.text);

    if (price === null) {
      await ctx.reply("⚠️ أرسل السعر بالأرقام فقط.");
      return;
    }

    session.prices.push(price);
    session.prices = session.prices.slice(-7);

    if (session.prices.length < 5) {
      await ctx.reply(
        `💰 السعر: ${price}\n` +
        `📊 القراءات: ${session.prices.length}/5`
      );
      return;
    }

    await ctx.reply(
      analyzePrices(session.prices, "EUR/USD")
    );
  });
}

