const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 1024,
      messages: [{
        role: "user",
        content: `Generate 10 fresh tweets for GetAProSEO (getaproseo.com) — an AI-powered SEO report tool for UK small business owners. £7.99 per report, plain English, results in 60 seconds.

Rules:
- Mix of SEO tips and subtle product promotion
- Strong hooks and marketing techniques
- Casual but authoritative tone
- Some include getaproseo.com, most don't
- 280 characters max each
- No hashtags
- Return ONLY a JSON array of strings, no preamble, no markdown backticks

Example format: ["tweet one text", "tweet two text"]`
      }]
    });

    const raw = message.content[0].text.trim();
    const tweets = JSON.parse(raw);
    res.status(200).json({ tweets });
  } catch (error) {
    console.error("Generate error:", error);
    res.status(500).json({ error: error.message });
  }
};
