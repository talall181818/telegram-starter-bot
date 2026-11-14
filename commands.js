
const sessions = new Map();

function normalizeDigits(value) {
  return String(value)
    .replace(/[٠-٩]/g, d => "٠١٢٣٤٥٦٧٨٩".indexOf(d))
    .replace(/٫/g, ".")
    .replace(/٬/g, "")
    .replace(/,/g, ".");
}

function parsePrice(value) {
  const cleaned = normalizeDigits(value).trim();
  if (!/^\d+(\.\d+)?$/.test(cleaned)) return null;

  const number = Number(cleaned);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function durationFor(strength) {
  if (strength === "strong") return "دقيقتان";
  if (strength === "medium") return "45 ثانية";
  return "30 ثانية";
}

function analyzeSmart(data) {
  const { high, low, open, current } = data;
  const range = high - low;

  if (range <= 0) {
    return "⚠️ الأسعار غير صحيحة. أعد المحاولة باستخدام أعلى سعر أكبر من أقل سعر.";
  }

  const position = (current - low) / range;
  const change = current - open;
  const threshold = range * 0.08;

  let decision = "⏸ انتظار";
  let strength = "weak";
  let duration = "لا توجد مدة مقترحة";

  if (current > high) {
    decision = "🟢 شراء UP";
    strength = "strong";
  } else if (current < low) {
    decision = "🔴 بيع DOWN";
    strength = "strong";
  } else if (change > threshold && position >= 0.65) {
    decision = "🟢 شراء UP";
    strength = "medium";
  } else if (change < -threshold && position <= 0.35) {
    decision = "🔴 بيع DOWN";
    strength = "medium";
  }

  if (decision !== "⏸ انتظار") {
    duration = durationFor(strength);
  }

  const trend =
    current > open ? "صاعد" :
    current < open ? "هابط" : "مستقر";

  const confidence =
    strength === "strong" ? "قوية نسبيًا" :
    strength === "medium" ? "متوسطة" : "غير كافية";

  return (
    `📊 تحليل Smart - Masaad\n\n` +
    `🔺 أعلى الشمعة السابقة: ${high}\n` +
    `🔻 أقل الشمعة السابقة: ${low}\n` +
    `🕯️ افتتاح الشمعة الجديدة: ${open}\n` +
    `💰 السعر الحالي: ${current}\n\n` +
    `📈 الحركة الحالية: ${trend}\n` +
    `🎯 القرار: ${decision}\n` +
    `💪 قوة الترجيح: ${confidence}\n` +
    `⏱️ المدة المقترحة: ${duration}\n` +
    `📉 فريم التحليل: دقيقة واحدة\n\n` +
    `⚠️ هذا تحليل تقديري من الأسعار المدخلة، وليس ضمانًا لنتيجة الصفقة.`
  );
}

function analyzeEurUsd(prices) {
  const first = prices[0];
  const last = prices[prices.length - 1];
  const difference = last - first;

  let trend = "متذبذب";
  let decision = "⏸ انتظار";

  if (difference > 0) {
    trend = "صاعد";
    decision = "🟢 شراء UP";
  } else if (difference < 0) {
    trend = "هابط";
    decision = "🔴 بيع DOWN";
  }

  const strength =
    Math.abs(difference) > first * 0.0005
      ? "متوسطة"
      : "ضعيفة";

  if (strength === "ضعيفة") {
    decision = "⏸ انتظار";
  }

  return (
    `📊 تحليل EUR/USD - Masaad\n\n` +
    `💰 أول سعر: ${first}\n` +
    `💰 آخر سعر: ${last}\n` +
    `📈 الاتجاه: ${trend}\n` +
    `🎯 القرار: ${decision}\n` +
    `💪 قوة الترجيح: ${strength}\n` +
    `⏱️ الفريم: دقيقة واحدة\n\n` +
    `⚠️ التحليل مبني على الأسعار التي أرسلتها، وليس على بيانات سوق مباشرة.`
  );
}

export function registerCommands(bot) {
  bot.command("start", async ctx => {
    sessions.delete(ctx.chat.id);

    await ctx.reply(
      "أهلًا بك في Masaad 🤖\n\n" +
      "📊 تحليل Smart اليدوي\n" +
      "💱 تحليل EUR/USD\n\n" +
      "أرسل /help لمعرفة الأوامر."
    );
  });

  bot.command("help", async ctx => {
    await ctx.reply(
      "📋 أوامر Masaad\n\n" +
      "/smart - تحليل Smart\n" +
      "/eurusd - تحليل EUR/USD\n" +
      "/cancel - إلغاء التحليل الحالي\n\n" +
      "أرسل الأسعار عندما يطلبها منك البوت."
    );
  });

  bot.command("smart", async ctx => {
    sessions.set(ctx.chat.id, {
      type: "smart",
      step: 0,
      values: {}
    });

    await ctx.reply(
      "📊 بدأ تحليل Smart اليدوي.\n\n" +
      "أرسل أعلى سعر للشمعة السابقة:"
    );
  });

  bot.command("eurusd", async ctx => {
    sessions.set(ctx.chat.id, {
      type: "eurusd",
      step: 0,
      prices: []
    });

    await ctx.reply(
      "📊 تحليل EUR/USD\n\n" +
      "أرسل السعر الأول، ثم سأطلب منك 4 أسعار أخرى."
    );
  });

  bot.command("cancel", async ctx => {
    sessions.delete(ctx.chat.id);
    await ctx.reply("تم إلغاء التحليل. أرسل /smart أو /eurusd للبدء من جديد.");
  });

  bot.on("message:text", async ctx => {
    const chatId = ctx.chat.id;
    const text = ctx.message.text.trim();

    if (text.startsWith("/")) return;

    const session = sessions.get(chatId);

    if (!session) {
      await ctx.reply(
        "اختر نوع التحليل:\n\n" +
        "/smart لتحليل Smart\n" +
        "/eurusd لتحليل EUR/USD"
      );
      return;
    }

    const price = parsePrice(text);

    if (price === null) {
      await ctx.reply("⚠️ أرسل سعرًا رقميًا صحيحًا، مثل: 264.3930");
      return;
    }

    if (session.type === "smart") {
      const prompts = [
        "🔻 أرسل أقل سعر للشمعة السابقة:",
        "🕯️ أرسل سعر افتتاح الشمعة الجديدة:",
        "💰 أرسل السعر الحالي:"
      ];

      const fields = ["high", "low", "open", "current"];
      session.values[fields[session.step]] = price;
      session.step++;

      if (session.step < 4) {
        sessions.set(chatId, session);
        await ctx.reply(prompts[session.step - 1]);
        return;
      }

      sessions.delete(chatId);

      if (session.values.high <= session.values.low) {
        await ctx.reply(
          "⚠️ أعلى سعر يجب أن يكون أكبر من أقل سعر.\nأرسل /smart للبدء من جديد."
        );
        return;
      }

      await ctx.reply(analyzeSmart(session.values));
      return;
    }

    if (session.type === "eurusd") {
      session.prices.push(price);
      session.step++;

      if (session.prices.length < 5) {
        sessions.set(chatId, session);
        await ctx.reply(
          `تم تسجيل السعر ${session.prices.length} من 5.\nأرسل السعر التالي:`
        );
        return;
      }

      sessions.delete(chatId);
      await ctx.reply(analyzeEurUsd(session.prices));
    }
  });
}
