const Anthropic = require("@anthropic-ai/sdk");
const https = require('https');
const http = require('http');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

// In-memory IP rate limit for teaser: { count, firstRequestAt }
const TEASER_RATE_LIMIT = new Map();
const TEASER_MAX_PER_IP = 2;
const TEASER_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function getClientIp(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const first = typeof forwarded === "string" ? forwarded.split(",")[0] : forwarded[0];
    return (first || "").trim();
  }
  return req.socket?.remoteAddress || "";
}

function checkTeaserRateLimit(ip) {
  if (!ip) return { allowed: true };
  const now = Date.now();
  let record = TEASER_RATE_LIMIT.get(ip);
  if (!record) {
    TEASER_RATE_LIMIT.set(ip, { count: 1, firstRequestAt: now });
    return { allowed: true };
  }
  if (now - record.firstRequestAt > TEASER_WINDOW_MS) {
    record = { count: 1, firstRequestAt: now };
    TEASER_RATE_LIMIT.set(ip, record);
    return { allowed: true };
  }
  if (record.count >= TEASER_MAX_PER_IP) {
    return { allowed: false };
  }
  record.count += 1;
  return { allowed: true };
}

const TEASER_SYSTEM = `You are a world-class SEO specialist writing for NON-TECHNICAL small business owners. 
Write in plain English — no jargon. Imagine you're explaining to a local tradesperson or shop owner who has never done SEO before.
Avoid terms like "canonical tags", "crawlability", "SERP" without explaining them simply.

This is a FREE PREVIEW. Keep it higher-level and less actionable than the full report.

Generate ONLY these 2 sections as a teaser:

## SEO Snapshot
## Keyword Strategy

For each section:
- Identify what the problems and opportunities ARE in plain English — name them clearly so the reader feels understood.
- Stop short of giving specific fixes, formulas, or step-by-step instructions. Be genuinely useful and credible, but not fully actionable without paying.
- End each section with a natural hook like: "The full report shows you exactly how to fix this" (or similar). Do not give the actual how-to here.

Use ## for section headings, ### for sub-headings, - for bullet points, **bold** for emphasis.
Keep each section meaty and credible — this is what sells the full report.`;

const FULL_SYSTEM = `You are a world-class SEO specialist writing for NON-TECHNICAL small business owners.
Write in plain, friendly English — imagine explaining to a local tradesperson or shop owner.
No jargon without explanation. Be warm, specific, and genuinely actionable.
Every recommendation must feel tailored to THIS specific business.

Generate ALL of these sections:

## SEO Snapshot
A plain English summary of how Google likely sees this site right now. What are the top 3 biggest opportunities? Write like you're a trusted advisor giving honest feedback over a coffee.

## Keyword Strategy
Primary keywords (explain what "search intent" means simply), long-tail opportunities, local keywords if relevant. Give real keyword examples they could actually target.

## On-Page SEO
Title tag formula + real example for their homepage. Meta description formula + example. Heading structure explained simply. What to write and how much.

## Technical SEO
Explain technical issues in plain English — no jargon. Core Web Vitals explained simply. Mobile checklist. What a sitemap is and why it matters.

## Content Strategy
10 specific blog or page topics they should create. Explain WHY each one will help. Content calendar idea. FAQ page ideas.

## Local SEO & Google Business Profile
Step by step Google Business Profile optimisation. Review strategy. Local keywords. Explain what a Google Business Profile IS first.

## AI Search Visibility (NEW — ChatGPT & Google AI)
This is cutting edge — explain that Google and ChatGPT now answer questions directly without people clicking links. How can THIS business get mentioned in those AI answers? Specific tactics for appearing in ChatGPT, Google AI Overviews, and Perplexity. This is a huge new opportunity most businesses don't know about yet.

## Competitor Analysis
Who are their likely top 3 Google competitors based on their niche/location? What are those competitors probably doing better? What gaps can this business exploit? Be specific.

## Schema Markup (Rich Results)
Explain what schema markup IS in plain English (it's like giving Google extra information about your business). Provide actual JSON-LD code they can paste into their website.

## Backlink Building
Plain English explanation of what backlinks are and why they matter. 5-10 specific, realistic tactics for THIS type of business to get quality backlinks.

## Google Search Console Setup
What is Google Search Console? Why does it matter? Step by step setup guide. What to look at weekly. What the numbers mean.

## Your 90-Day Action Plan
Week 1-4: Quick wins — what to do first and why
Week 5-8: Building momentum  
Week 9-12: Long term growth

Format as a clear prioritised checklist. Be realistic — this is a small business owner, not a full time marketer.

Use ## for sections, ### for sub-headings, - for bullets, **bold** for key points, and include code blocks for any technical snippets.

Never include raw HTML tags, XML, or code snippets in your response unless they are inside a markdown code block (\`\`\`). Do not output heading structure examples as raw HTML. Do not output sitemap XML as raw text.`;

async function fetchWebsiteContent(url) {
  return new Promise((resolve) => {
    const protocol = url.startsWith('https') ? https : http;
    const request = protocol.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; GetAProSEO/1.0; +https://getaproseo.com)',
      },
      timeout: 8000,
    }, (response) => {
      // Follow redirects
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        fetchWebsiteContent(response.headers.location).then(resolve);
        return;
      }
      let data = '';
      response.on('data', (chunk) => { data += chunk; });
      response.on('end', () => {
        try {
          // Extract useful content from HTML
          const title = (data.match(/<title[^>]*>([^<]+)<\/title>/i) || [])[1] || '';
          const metaDesc = (data.match(/<meta[^>]*name=["\']description["\'][^>]*content=["\']([^"\']+)["\']/) || 
                           data.match(/<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']description["\']/) || [])[1] || '';
          const h1s = [...data.matchAll(/<h1[^>]*>([^<]+)<\/h1>/gi)].map(m => m[1]).slice(0, 3).join(', ');
          const h2s = [...data.matchAll(/<h2[^>]*>([^<]+)<\/h2>/gi)].map(m => m[1]).slice(0, 5).join(', ');
          // Strip all HTML tags and get plain text, limit to 2000 chars
          const plainText = data
            .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .slice(0, 2000);
          resolve({
            title,
            metaDesc,
            h1s,
            h2s,
            plainText,
            success: true
          });
        } catch (e) {
          resolve({ success: false });
        }
      });
    });
    request.on('error', () => resolve({ success: false }));
    request.on('timeout', () => { request.destroy(); resolve({ success: false }); });
  });
}

module.exports = async (req, res) => {
  // CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url, context, type } = req.body;

  if (!url) return res.status(400).json({ error: "URL is required" });

  const isTeaser = type === "teaser";
  if (isTeaser) {
    const clientIp = getClientIp(req);
    const { allowed } = checkTeaserRateLimit(clientIp);
    if (!allowed) {
      return res.status(429).json({
        error: "You've used your free previews. Please unlock the full report to continue.",
        limitReached: true,
      });
    }
  }

  const system = isTeaser ? TEASER_SYSTEM : FULL_SYSTEM;

  // Fetch the actual website content
  const siteContent = await fetchWebsiteContent(url);

  const websiteData = siteContent.success ? `
ACTUAL WEBSITE DATA (fetched directly from the site — use this as your primary source of truth):
- Page Title: ${siteContent.title}
- Meta Description: ${siteContent.metaDesc || 'Not set'}
- H1 Headings: ${siteContent.h1s || 'None found'}
- H2 Headings: ${siteContent.h2s || 'None found'}
- Page Content Preview: ${siteContent.plainText}
` : 'Website content could not be fetched — base your analysis on the URL and any context provided.';

  const userMessage = `Please generate an SEO report for this website:

Website URL: ${url}
${context ? `Business Description: ${context}` : ""}

${websiteData}

IMPORTANT: Base your entire report on the actual website data above. The business is located where the website says it is — do not assume a location. Be highly specific to this website and business type. Write everything in plain English that a non-technical business owner will understand and find genuinely useful.${isTeaser ? "\n\nRemember: generate ONLY the SEO Snapshot and Keyword Strategy sections." : ""}`;

  try {
    const message = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: isTeaser ? 1500 : 6000,
      system,
      messages: [{ role: "user", content: userMessage }],
    });

    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim();

    res.status(200).json({ report: text, type: isTeaser ? "teaser" : "full" });
  } catch (error) {
    console.error("Anthropic error:", error);
    res.status(500).json({ error: error.message || "Failed to generate report" });
  }
};
