// Vercel Serverless Function: secure Gemini text-to-speech proxy.
const MODEL = "gemini-2.5-flash-preview-tts";
const MAX_TEXT_LENGTH = 6000;
const ALLOWED_VOICES = new Set([
  "Zephyr", "Puck", "Charon", "Kore", "Fenrir", "Leda", "Orus",
  "Aoede", "Callirrhoe", "Autonoe", "Enceladus", "Iapetus",
  "Umbriel", "Algieba", "Despina", "Erinome", "Algenib",
  "Rasalgethi", "Laomedeia", "Achernar", "Achird", "Zubenelgenubi",
  "Vindemiatrix", "Sadachbia", "Sadaltager", "Sulafat", "Gacrux",
  "Schedar", "Pulcherrima", "Achernar", "Alnilam", "Algieba",
  "Zubenelgenubi", "Callirrhoe", "Autonoe", "Enceladus",
  "Iapetus", "Umbriel", "Despina", "Erinome", "Algenib",
  "Rasalgethi", "Laomedeia", "Achird", "Vindemiatrix",
  "Sadachbia", "Sadaltager", "Sulafat", "Leda", "Kore", "Zephyr"
]);

module.exports = async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "طريقة الطلب غير مدعومة." });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(503).json({
      error: "خدمة توليد الصوت غير مهيأة. أضف GEMINI_API_KEY في إعدادات Vercel."
    });
  }

  const body = req.body || {};
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const voiceName = typeof body.voiceName === "string" ? body.voiceName.trim() : "";
  const style = typeof body.style === "string" ? body.style.trim() : "";

  if (!text) return res.status(400).json({ error: "اكتب النص المطلوب تحويله إلى صوت." });
  if (text.length > MAX_TEXT_LENGTH) {
    return res.status(413).json({ error: `النص طويل جداً. الحد الأقصى ${MAX_TEXT_LENGTH} حرف.` });
  }
  if (!ALLOWED_VOICES.has(voiceName)) {
    return res.status(400).json({ error: "الصوت المحدد غير مدعوم." });
  }

  const spokenText = style ? `${style.slice(0, 500)}\n${text}` : text;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 55000);

  try {
    const upstream = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent?key=${encodeURIComponent(apiKey)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: spokenText }] }],
          generationConfig: {
            responseModalities: ["AUDIO"],
            speechConfig: {
              voiceConfig: { prebuiltVoiceConfig: { voiceName } }
            }
          }
        })
      }
    );

    const result = await upstream.json().catch(() => ({}));
    if (!upstream.ok) {
      const upstreamMessage = result?.error?.message;
      const status = upstream.status === 429 ? 429 :
        upstream.status >= 500 ? 502 : upstream.status;
      return res.status(status).json({
        error: upstream.status === 429
          ? "تم تجاوز حد طلبات توليد الصوت. انتظر قليلاً ثم حاول مجدداً."
          : (upstreamMessage || "فشلت خدمة Google في توليد الصوت.").slice(0, 500)
      });
    }

    const parts = result?.candidates?.[0]?.content?.parts || [];
    const audioParts = parts.filter(part => part?.inlineData?.data);
    if (!audioParts.length) {
      const reason = result?.candidates?.[0]?.finishReason;
      return res.status(502).json({
        error: reason === "OTHER"
          ? "لم تُرجع خدمة الصوت ملفاً صوتياً هذه المرة. أعد المحاولة."
          : "لم يصل ملف صوتي من خدمة Google. جرّب نصاً أقصر."
      });
    }

    const mimeType = audioParts[0].inlineData.mimeType || "audio/L16;rate=24000";
    const audioBuffer = Buffer.concat(audioParts.map(part =>
      Buffer.from(part.inlineData.data, "base64")
    ));
    if (!audioBuffer.length) {
      return res.status(502).json({ error: "ملف الصوت الناتج فارغ." });
    }

    return res.status(200).json({
      audioBase64: audioBuffer.toString("base64"),
      mimeType,
      model: MODEL
    });
  } catch (error) {
    const timedOut = error?.name === "AbortError";
    return res.status(504).json({
      error: timedOut
        ? "استغرق توليد الصوت وقتاً أطول من المتوقع. حاول بنص أقصر."
        : "تعذر الوصول إلى خدمة توليد الصوت. تحقق من الاتصال ثم أعد المحاولة."
    });
  } finally {
    clearTimeout(timeout);
  }
};
