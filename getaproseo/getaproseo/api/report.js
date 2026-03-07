const Anthropic = require("@anthropic-ai/sdk");

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const TEASER_SYSTEM = `You are a world-class SEO specialist writing for NON-TECHNICAL small business owners. 
Write in plain English — no jargon. Imagine you're explaining to a local tradesperson or shop owner who has never done SEO before.
Avoid terms like "canonical tags", "crawlability", "SERP" without explaining them simply.
Be specific, friendly, and actionable.

Generate ONLY these 2 sections as a teaser:

## SEO Snapshot
## Keyword Strategy

Use ## for section headings, ### for sub-headings, - for bullet points, **bold** for emphasis.
Keep each section meaty and genuinely useful — this is what sells the full report.`;

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

Use ## for sections, ### for sub-headings, - for bullets, **bold** for key points, and include code blocks for any technical snippets.`;

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
  const system = isTeaser ? TEASER_SYSTEM : FULL_SYSTEM;

  const userMessage = `Please generate an SEO report for this website:

Website URL: ${url}
${context ? `Business Description: ${context}` : ""}

Be highly specific to this website and business type. Write everything in plain English that a non-technical business owner will understand and find genuinely useful.${isTeaser ? "\n\nRemember: generate ONLY the SEO Snapshot and Keyword Strategy sections." : ""}`;

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
