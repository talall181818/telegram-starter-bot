export function registerCommands(bot) {
bot.command(“start”, async (ctx) => {
await ctx.reply(“أهلًا بك في Masaad 🤖\n\nأرسل /gold لتحليل الذهب\nأرسل /eurusd لتحليل اليورو”);
});

bot.command(“gold”, async (ctx) => {
await analyze(ctx, “XAUUSD”, “الذهب”);
});

bot.command(“eurusd”, async (ctx) => {
await analyze(ctx, “EURUSD”, “اليورو مقابل الدولار”);
});

bot.command(“help”, async (ctx) => {
await ctx.reply(”/gold - الذهب\n/eurusd - اليورو”);
});

bot.command(“ping”, async (ctx) => {
await ctx.reply(“البوت يعمل ✅”);
});
}

async function analyze(ctx, symbol, name) {
try {
const response = await fetch(“https://biquote.io/api/” + symbol);
if (!response.ok) throw new Error(“Price unavailable”);

const data = await response.json();
const bid = Number(data.bid);
const ask = Number(data.ask);
const change = Number(data.dayDiffPercent);
let trend = "متذبذب";
if (data.direction === "UP") trend = "صاعد يوميًا";
if (data.direction === "DOWN") trend = "هابط يوميًا";
await ctx.reply(
  "📊 " + name + "\n" +
  "سعر الشراء: " + ask + "\n" +
  "سعر البيع: " + bid + "\n" +
  "الاتجاه اليومي: " + trend + "\n" +
  "التغير اليومي: " +
  (Number.isFinite(change) ? change.toFixed(3) + "%" : "غير متاح") +
  "\n\nإشارة الدقيقة: انتظار\n" +
  "الاتجاه اليومي ليس إشارة مؤكدة للدقيقة."
);

} catch (error) {
await ctx.reply(“تعذر جلب بيانات “ + name + “ الآن.”);
}
}
