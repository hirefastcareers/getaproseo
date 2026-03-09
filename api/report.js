const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

async function fetchWebsiteContent(url) {
  const https = require('https');
  const http = require('http');
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GetAProSEO/1.0; +https://getaproseo.com)' },
      timeout: 8000,
    }, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchWebsiteContent(response.headers.location).then(resolve);
        return;
      }
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          const title = (data.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
          const metaDesc = (data.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']/) ||
                           data.match(/<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']description["\']/) || [])[1] || '';
          const h1s = [...data.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)].map(m => m[1]).slice(0, 3).join(', ');
          const h2s = [...data.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi)].map(m => m[1]).slice(0, 5).join(', ');
          const plainText = data
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 2000);
          resolve({ title, metaDesc, h1s, h2s, plainText, success: true });
        } catch (e) { resolve({ success: false }); }
      });
    });
    request.on('error', () => resolve({ success: false }));
    request.on('timeout', () => { request.destroy(); resolve({ success: false }); });
  });
}

async function generatePDFAndEmail(fullText, url, email, sessionId) {
  if (!email || !process.env.RESEND_API_KEY) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'GetAProSEO <hello@getaproseo.com>',
        to: email,
        subject: `Your SEO Report is Ready — ${url}`,
        html: `
          <div style="font-family:sans-serif;max-width:540px;margin:0 auto;padding:32px;">
            <div style="text-align:center;margin-bottom:32px;">
              <span style="font-family:Georgia,serif;font-size:24px;font-weight:900;color:#0a0a0a;">GetAPro<span style="color:#0d9488;">SEO</span></span>
            </div>
            <h1 style="font-size:22px;color:#0a0a0a;margin-bottom:8px;">Your SEO report is ready! 🎉</h1>
            <p style="color:#555;line-height:1.6;margin-bottom:24px;">Your full 12-section SEO report for <strong>${url}</strong> has been generated.</p>
            <div style="background:#f8f9fa;border-radius:12px;padding:20px;margin-bottom:24px;">
              <p style="color:#555;font-size:14px;margin:0 0 16px;">Click below to access your report at any time. You can also download it as a PDF from within the report.</p>
              <a href="https://getaproseo.com/?session_id=${sessionId}" style="display:inline-block;background:#0d9488;color:white;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">View My SEO Report →</a>
            </div>
            <p style="color:#888;font-size:13px;line-height:1.6;">If you have any questions, just reply to this email and we'll help straight away.</p>
            <p style="color:#555;font-size:14px;">Thanks,<br>Tom at GetAProSEO</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
            <p style="font-size:12px;color:#aaa;text-align:center;">GetAProSEO · <a href="https://getaproseo.com" style="color:#0d9488;">getaproseo.com</a> · Plain English SEO Reports</p>
          </div>
        `
      })
    });
  } catch (e) {
    console.error('Email send failed:', e);
  }
}

// IP rate limiting
const ipRequests = new Map();

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url, context, type, email } = req.body;
  const sessionIdOnly = !url && req.body.session_id && type === 'full';
  if (!url && !sessionIdOnly) return res.status(400).json({ error: "URL required" });

  // Email link: fetch saved report by session_id only (no url in query)
  if (sessionIdOnly) {
    try {
      const { data } = await supabase
        .from('reports')
        .select('url, report_text')
        .eq('session_id', req.body.session_id)
        .single();
      if (!data?.report_text) {
        return res.status(400).json({ error: "Report not found. The link may have expired or the report is still generating." });
      }
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.write(`data: ${JSON.stringify({ url: data.url || '' })}\n\n`);
      res.write(`data: ${JSON.stringify({ text: data.report_text })}\n\n`);
      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
      return;
    } catch (e) {
      console.error('Supabase fetch by session_id error:', e);
      return res.status(500).json({ error: "Failed to load report." });
    }
  }

  // Rate limit free previews
  if (type === 'teaser') {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now();
    const requests = ipRequests.get(ip) || [];
    const recent = requests.filter(t => now - t < 24 * 60 * 60 * 1000);
    if (recent.length >= 2) {
      return res.status(429).json({ error: "You've used your free previews for today. Please try again tomorrow or unlock the full report." });
    }
    recent.push(now);
    ipRequests.set(ip, recent);
  }

  const isTeaser = type === 'teaser';

  // Check for existing saved report
  if (!isTeaser && req.body.session_id) {
    try {
      const { data } = await supabase
        .from('reports')
        .select('report_text')
        .eq('session_id', req.body.session_id)
        .single();

      if (data?.report_text) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(`data: ${JSON.stringify({ text: data.report_text })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }
    } catch (e) {
      console.error('Supabase fetch error:', e);
    }
  }

  const siteContent = await fetchWebsiteContent(url);
  const websiteData = siteContent.success ? `
ACTUAL WEBSITE DATA (fetched directly — use as primary source of truth):
- Page Title: ${siteContent.title}
- Meta Description: ${siteContent.metaDesc || 'Not set'}
- H1 Headings: ${siteContent.h1s || 'None found'}
- H2 Headings: ${siteContent.h2s || 'None found'}
- Page Content Preview: ${siteContent.plainText}
` : 'Website content could not be fetched — base analysis on the URL and context provided.';

  const systemPrompt = `You are an expert SEO consultant writing plain-English SEO reports for website owners. Your reports are specific, actionable, and written so anyone can understand them — no technical jargon unless you explain it simply. Never use generic advice. Always base your report on the actual website data provided. Never include raw HTML tags, XML, or code snippets outside of markdown code blocks. Do not output heading structure examples as raw HTML. Do not output sitemap XML as raw text.`;

  const userMessage = isTeaser
    ? `Generate a FREE PREVIEW SEO report for: ${url}\n${context ? `Business context: ${context}` : ''}\n\n${websiteData}\n\nIMPORTANT: Generate ONLY these 2 sections:\n## SEO Snapshot\n## Keyword Strategy\n\nMake the preview genuinely useful but leave the reader wanting more. Do not mention the other sections exist.`
    : `Generate a FULL SEO report for: ${url}\n${context ? `Business context: ${context}` : ''}\n\n${websiteData}\n\nIMPORTANT: Base your entire report on the actual website data above. Generate ALL 12 sections:\n## SEO Snapshot\n## Keyword Strategy\n## On-Page SEO\n## Technical SEO\n## Content Strategy\n## Local SEO & Google Business Profile\n## AI Search Visibility\n## Competitor Analysis\n## Schema Markup\n## Backlink Building\n## Google Search Console\n## 90-Day Action Plan\n\nBe highly specific to this website. Write in plain English. Never output raw HTML or XML.`;

  // Use SSE streaming for full reports
  if (!isTeaser) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');

    let fullText = '';

    try {
      const stream = await client.messages.stream({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      });

      for await (const chunk of stream) {
        if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
          const text = chunk.delta.text;
          fullText += text;
          res.write(`data: ${JSON.stringify({ text })}\n\n`);
        }
      }

      // Save report to Supabase
      try {
        await supabase.from('reports').upsert({
          session_id: req.body.session_id || '',
          url: url,
          context: context || '',
          email: email || '',
          report_text: fullText
        }, { onConflict: 'session_id' });
      } catch (e) {
        console.error('Supabase save error:', e);
      }

      // Send email before ending response
      if (email) {
        await generatePDFAndEmail(fullText, url, email, req.body.session_id || '');
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();

    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }

  } else {
    // Teaser — regular JSON response
    try {
      const message = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1500,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      });
      res.status(200).json({ report: message.content[0].text });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  }
};
