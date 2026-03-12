const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);
const Anthropic = require("@anthropic-ai/sdk");
const client = new Anthropic();

// Get today's date in plain English
function getTodayDate() {
  const now = new Date();
  return now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

// ─── 1. FETCH WEBSITE CONTENT + META/OG TAGS + INTERNAL LINKS ────────────────
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

          // Meta & OG tags
          const ogTitle = (data.match(/<meta[^>]*property=["\']og:title["\'][^>]*content=["\']([^"\']+)["\']/) ||
                          data.match(/<meta[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:title["\']/) || [])[1] || '';
          const ogDesc = (data.match(/<meta[^>]*property=["\']og:description["\'][^>]*content=["\']([^"\']+)["\']/) ||
                         data.match(/<meta[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:description["\']/) || [])[1] || '';
          const ogImage = (data.match(/<meta[^>]*property=["\']og:image["\'][^>]*content=["\']([^"\']+)["\']/) ||
                          data.match(/<meta[^>]*content=["\']([^"\']+)["\'][^>]*property=["\']og:image["\']/) || [])[1] || '';
          const twitterCard = (data.match(/<meta[^>]*name=["\']twitter:card["\'][^>]*content=["\']([^"\']+)["\']/) ||
                               data.match(/<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']twitter:card["\']/) || [])[1] || '';
          const canonical = (data.match(/<link[^>]*rel=["\']canonical["\'][^>]*href=["\']([^"\']+)["\']/) ||
                             data.match(/<link[^>]*href=["\']([^"\']+)["\'][^>]*rel=["\']canonical["\']/) || [])[1] || '';
          const robotsMeta = (data.match(/<meta[^>]*name=["\']robots["\'][^>]*content=["\']([^"\']+)["\']/) ||
                              data.match(/<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']robots["\']/) || [])[1] || '';
          const viewport = (data.match(/<meta[^>]*name=["\']viewport["\'][^>]*content=["\']([^"\']+)["\']/) ||
                            data.match(/<meta[^>]*content=["\']([^"\']+)["\'][^>]*name=["\']viewport["\']/) || [])[1] || '';

          // Title & meta description length checks
          const titleLength = title.length;
          const titleLengthStatus = titleLength === 0 ? 'Missing' :
            titleLength < 30 ? `Too short at ${titleLength} characters — aim for 50-60` :
            titleLength > 60 ? `Too long at ${titleLength} characters — aim for 50-60` :
            `Good at ${titleLength} characters`;

          const metaDescLength = metaDesc.length;
          const metaDescStatus = metaDescLength === 0 ? 'Missing — this needs adding urgently' :
            metaDescLength < 120 ? `Too short at ${metaDescLength} characters — aim for 150-160` :
            metaDescLength > 160 ? `Too long at ${metaDescLength} characters — Google will truncate this` :
            `Good at ${metaDescLength} characters`;

          // Internal links for broken link check
          const baseUrlObj = new URL(url);
          const baseOrigin = baseUrlObj.origin;
          const internalLinks = [...new Set(
            [...data.matchAll(/href=["\']([^"\'#?][^"\']*)["\']/gi)]
              .map(m => m[1])
              .filter(href => {
                if (href.startsWith('http')) return href.startsWith(baseOrigin);
                if (href.startsWith('/')) return true;
                if (href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return false;
                return true;
              })
              .map(href => href.startsWith('/') ? baseOrigin + href : href)
              .filter(href => href.startsWith(baseOrigin))
          )].slice(0, 15);

          resolve({
            title, metaDesc, h1s, h2s, plainText,
            ogTitle, ogDesc, ogImage, twitterCard,
            canonical, robotsMeta, viewport,
            titleLength, titleLengthStatus, metaDescStatus,
            internalLinks,
            success: true
          });
        } catch (e) { resolve({ success: false }); }
      });
    });
    request.on('error', () => resolve({ success: false }));
    request.on('timeout', () => { request.destroy(); resolve({ success: false }); });
  });
}

// ─── 2. BROKEN LINK CHECKER ───────────────────────────────────────────────────
async function checkBrokenLinks(links) {
  const https = require('https');
  const http = require('http');
  if (!links || links.length === 0) return { broken: [], working: 0, checked: 0 };

  async function checkLink(url) {
    return new Promise((resolve) => {
      try {
        const protocol = url.startsWith('https') ? https : http;
        const urlObj = new URL(url);
        const req = protocol.request({
          hostname: urlObj.hostname,
          path: urlObj.pathname + urlObj.search,
          method: 'HEAD',
          timeout: 5000,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; GetAProSEO/1.0)' }
        }, (res) => {
          resolve({ url, status: res.statusCode, broken: res.statusCode === 404 || res.statusCode === 410 });
        });
        req.on('error', () => resolve({ url, status: 'error', broken: false }));
        req.on('timeout', () => { req.destroy(); resolve({ url, status: 'timeout', broken: false }); });
        req.end();
      } catch (e) {
        resolve({ url, status: 'error', broken: false });
      }
    });
  }

  const results = [];
  for (let i = 0; i < links.length; i += 5) {
    const batch = links.slice(i, i + 5);
    const batchResults = await Promise.all(batch.map(checkLink));
    results.push(...batchResults);
  }

  const broken = results.filter(r => r.broken).map(r => r.url);
  const working = results.filter(r => !r.broken).length;
  return { broken, working, checked: results.length };
}

// ─── 3. OPEN PAGERANK — FREE DOMAIN AUTHORITY ─────────────────────────────────
async function fetchDomainAuthority(url) {
  const https = require('https');
  try {
    const domain = new URL(url).hostname.replace('www.', '');
    const body = JSON.stringify({ domains: [{ domain }] });

    return new Promise((resolve) => {
      const req = https.request({
        hostname: 'openpagerank.com',
        path: '/api/v1.0/getPageRank',
        method: 'POST',
        timeout: 8000,
        headers: {
          'API-OPR': 'wggswkwoo4g8k04wk8kcwc4cgscocsc0c08ksgck',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => {
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            const result = parsed.response?.[0];
            if (!result) return resolve(null);
            resolve({
              domain,
              pageRank: result.page_rank_integer ?? null,
              pageRankDecimal: result.page_rank_decimal ?? null,
              rank: result.rank ?? null
            });
          } catch (e) { resolve(null); }
        });
      });
      req.on('error', () => resolve(null));
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.write(body);
      req.end();
    });
  } catch (e) {
    console.error('Domain authority fetch error:', e.message);
    return null;
  }
}

// ─── 4. PAGESPEED ─────────────────────────────────────────────────────────────
async function fetchPageSpeedData(url) {
  const https = require('https');

  function httpsGet(apiUrl) {
    return new Promise((resolve, reject) => {
      const req = https.get(apiUrl, { timeout: 25000 }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return httpsGet(res.headers.location).then(resolve).catch(reject);
        }
        let data = '';
        res.on('data', chunk => { data += chunk; });
        res.on('end', () => {
          try {
            const parsed = JSON.parse(data);
            if (parsed.error) {
              console.error('PageSpeed API error:', parsed.error.message);
              reject(new Error(parsed.error.message));
            } else {
              resolve(parsed);
            }
          } catch (e) { reject(new Error('JSON parse failed')); }
        });
      });
      req.on('error', (e) => { console.error('PageSpeed request error:', e.message); reject(e); });
      req.on('timeout', () => { req.destroy(); reject(new Error('PageSpeed request timed out')); });
    });
  }

  try {
    const encodedUrl = encodeURIComponent(url);
    const apiKey = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : '';
    const mobileApiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodedUrl}&strategy=mobile&category=performance${apiKey}`;
    const desktopApiUrl = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodedUrl}&strategy=desktop&category=performance${apiKey}`;

    console.log('Fetching PageSpeed for:', url); console.log('API key present:', !!process.env.PAGESPEED_API_KEY, '| Key starts with:', (process.env.PAGESPEED_API_KEY || '').substring(0, 6));

    // Fetch mobile first, then desktop — sequential to avoid Vercel timeout
    let mobileData, desktopData;
    try {
      mobileData = await httpsGet(mobileApiUrl);
    } catch (e) {
      console.error('Mobile PageSpeed failed:', e.message);
      return null;
    }

    const categories = mobileData.lighthouseResult?.categories;
    const audits = mobileData.lighthouseResult?.audits;

    if (!categories?.performance) {
      console.error('PageSpeed: no performance category in response');
      return null;
    }

    const mobileScore = Math.round((categories.performance.score || 0) * 100);

    // Attempt desktop — if it fails, we still have mobile data
    let desktopScore = null;
    try {
      desktopData = await httpsGet(desktopApiUrl);
      desktopScore = Math.round((desktopData.lighthouseResult?.categories?.performance?.score || 0) * 100);
    } catch (e) {
      console.error('Desktop PageSpeed failed (non-critical):', e.message);
      desktopScore = null;
    }
    const fcp = audits?.['first-contentful-paint']?.displayValue || null;
    const lcp = audits?.['largest-contentful-paint']?.displayValue || null;
    const tbt = audits?.['total-blocking-time']?.displayValue || null;
    const cls = audits?.['cumulative-layout-shift']?.displayValue || null;
    const speedIndex = audits?.['speed-index']?.displayValue || null;
    const serverResponseTime = audits?.['server-response-time']?.displayValue || null;
    const usesHttps = audits?.['is-on-https']?.score === 1;
    const hasViewport = audits?.['viewport']?.score === 1;

    const opportunities = [];
    const oppAudits = ['render-blocking-resources', 'unused-css-rules', 'unused-javascript', 'uses-optimized-images', 'uses-text-compression'];
    oppAudits.forEach(key => {
      if (audits?.[key] && audits[key].score !== null && audits[key].score < 0.9) {
        opportunities.push(audits[key].title);
      }
    });

    console.log(`PageSpeed success - mobile: ${mobileScore}, desktop: ${desktopScore}`);
    return { mobileScore, desktopScore, fcp, lcp, tbt, cls, speedIndex, serverResponseTime, usesHttps, hasViewport, opportunities, success: true };

  } catch (e) {
    console.error('PageSpeed fetch failed:', e.message);
    return null;
  }
}

function scoreRating(score) {
  if (score >= 90) return 'Good';
  if (score >= 50) return 'Needs Improvement';
  return 'Poor — this is likely hurting your rankings';
}

// ─── EMAIL ────────────────────────────────────────────────────────────────────
async function sendEmail(fullText, url, email, sessionId) {
  if (!email || !process.env.RESEND_API_KEY) return;
  const https = require('https');
  try {
    const body = JSON.stringify({
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
            <p style="color:#555;font-size:14px;margin:0 0 16px;">Click below to access your report at any time.</p>
            <a href="https://getaproseo.com/?session_id=${sessionId}" style="display:inline-block;background:#0d9488;color:white;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:700;font-size:15px;">View My SEO Report →</a>
          </div>
          <p style="color:#888;font-size:13px;line-height:1.6;">If you have any questions, just reply to this email and we'll help straight away.</p>
          <p style="color:#555;font-size:14px;">Thanks,<br>Tom at GetAProSEO</p>
          <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
          <p style="font-size:12px;color:#aaa;text-align:center;">GetAProSEO · <a href="https://getaproseo.com" style="color:#0d9488;">getaproseo.com</a> · Plain English SEO Reports</p>
        </div>
      `
    });
    await new Promise((resolve, reject) => {
      const req = https.request({
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body)
        }
      }, (res) => { res.on('data', () => {}); res.on('end', resolve); });
      req.on('error', reject);
      req.write(body);
      req.end();
    });
  } catch (e) { console.error('Email send failed:', e); }
}

// ─── RATE LIMITING & ADMIN ────────────────────────────────────────────────────
const ipRequests = new Map();
const ADMIN_PASSWORD = 'marley';

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────
module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { url, context, type, email, browserPageSpeed } = req.body;
  const isAdmin = req.body.admin === true && req.body.admin_password === ADMIN_PASSWORD;
  const sessionIdOnly = !url && req.body.session_id && type === 'full';
  if (!url && !sessionIdOnly) return res.status(400).json({ error: "URL required" });

  // Email link: fetch saved report by session_id only
  if (sessionIdOnly) {
    try {
      const { data } = await supabase.from('reports').select('url, report_text').eq('session_id', req.body.session_id).single();
      if (!data?.report_text) return res.status(400).json({ error: "Report not found. The link may have expired or the report is still generating." });
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

  // Rate limit free previews (skip for admin)
  if (type === 'teaser' && !isAdmin) {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const now = Date.now();
    const requests = ipRequests.get(ip) || [];
    const recent = requests.filter(t => now - t < 24 * 60 * 60 * 1000);
    if (recent.length >= 2) return res.status(429).json({ error: "You've used your free previews for today. Please try again tomorrow or unlock the full report." });
    recent.push(now);
    ipRequests.set(ip, recent);
  }

  const isTeaser = type === 'teaser';

  // Check for existing saved report (skip for admin)
  if (!isTeaser && !isAdmin && req.body.session_id) {
    try {
      const { data } = await supabase.from('reports').select('report_text').eq('session_id', req.body.session_id).single();
      if (data?.report_text) {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
        res.write(`data: ${JSON.stringify({ text: data.report_text })}\n\n`);
        res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
        res.end();
        return;
      }
    } catch (e) { console.error('Supabase fetch error:', e); }
  }

  // Fetch all data in parallel
  const [siteContent, pageSpeedData, domainAuthority] = await Promise.all([
    fetchWebsiteContent(url),
    isTeaser ? Promise.resolve(null) : (browserPageSpeed ? Promise.resolve({ success: true, ...browserPageSpeed }) : fetchPageSpeedData(url)),
    isTeaser ? Promise.resolve(null) : fetchDomainAuthority(url)
  ]);

  // Broken links — sequential after site content
  let brokenLinkData = null;
  if (!isTeaser && siteContent.success && siteContent.internalLinks?.length > 0) {
    brokenLinkData = await checkBrokenLinks(siteContent.internalLinks);
  }

  const todayDate = getTodayDate();

  // ── Build data blocks ───────────────────────────────────────────────────────
  const websiteData = siteContent.success ? `
ACTUAL WEBSITE DATA (fetched directly — use as primary source of truth):
- Page Title: "${siteContent.title}" — ${siteContent.titleLengthStatus}
- Meta Description: "${siteContent.metaDesc || 'NOT SET'}" — ${siteContent.metaDescStatus}
- H1 Headings: ${siteContent.h1s || 'NONE FOUND — this is a significant issue'}
- H2 Headings: ${siteContent.h2s || 'None found'}
- Canonical Tag: ${siteContent.canonical || 'Not set'}
- Robots Meta Tag: ${siteContent.robotsMeta || 'Not set — recommend adding "index, follow" explicitly'}
- Viewport Meta Tag: ${siteContent.viewport || 'Not set — this is a mobile issue'}
- Page Content Preview: ${siteContent.plainText}

SOCIAL SHARING DATA (Open Graph & Twitter Cards):
- OG Title: ${siteContent.ogTitle || 'NOT SET'}
- OG Description: ${siteContent.ogDesc || 'NOT SET'}
- OG Image: ${siteContent.ogImage || 'NOT SET — pages will show no preview image when shared on Facebook, LinkedIn etc'}
- Twitter Card: ${siteContent.twitterCard || 'NOT SET'}
` : 'Website content could not be fetched — base analysis on the URL and context provided.';

  const brokenLinkInfo = brokenLinkData ? `
BROKEN LINK DATA (checked ${brokenLinkData.checked} internal links):
- Broken links found: ${brokenLinkData.broken.length === 0 ? 'None — all internal links working correctly' : brokenLinkData.broken.join(', ')}
- Working links: ${brokenLinkData.working} of ${brokenLinkData.checked}
` : '';

  const domainAuthorityInfo = domainAuthority ? `
DOMAIN AUTHORITY DATA (Open PageRank — must include this in the Backlink Building section):
- Domain: ${domainAuthority.domain}
- PageRank Score: ${domainAuthority.pageRank !== null ? `${domainAuthority.pageRank}/10` : 'Not yet scored — domain is new or unindexed'}
- Global Rank: ${domainAuthority.rank ? `#${domainAuthority.rank.toLocaleString()} globally` : 'Not yet globally ranked'}
- Plain English interpretation: ${
    domainAuthority.pageRank === null ? 'This domain has no measurable authority yet — it is effectively invisible to Google in competitive searches. Building quality backlinks is the single highest priority action.' :
    domainAuthority.pageRank <= 2 ? 'Low authority (score ' + domainAuthority.pageRank + '/10). The site exists but has very few quality backlinks. Competitors with higher scores will consistently outrank it.' :
    domainAuthority.pageRank <= 4 ? 'Below average authority (score ' + domainAuthority.pageRank + '/10). A foundation exists but significant backlink building is needed to compete.' :
    domainAuthority.pageRank <= 6 ? 'Average authority (score ' + domainAuthority.pageRank + '/10). Reasonable foundation — focused backlink building will push rankings higher.' :
    domainAuthority.pageRank <= 8 ? 'Good authority (score ' + domainAuthority.pageRank + '/10). Strong domain trust — maintain and build on this.' :
    'Strong authority (score ' + domainAuthority.pageRank + '/10). Well-established domain with solid Google trust.'
  }
` : 'Domain authority data unavailable for this report.';

  let performanceData = '';
  if (!isTeaser) {
    if (pageSpeedData && pageSpeedData.success) {
      performanceData = `
REAL PAGESPEED DATA (from Google — use these exact numbers in the Technical SEO section, do not omit them):
- Mobile Speed Score: ${pageSpeedData.mobileScore}/100 — ${scoreRating(pageSpeedData.mobileScore)}
- Desktop Speed Score: ${pageSpeedData.desktopScore}/100 — ${scoreRating(pageSpeedData.desktopScore)}
- First Contentful Paint (time until something first appears): ${pageSpeedData.fcp || 'not available'}
- Largest Contentful Paint (time until main content loads): ${pageSpeedData.lcp || 'not available'}
- Total Blocking Time (time page is unresponsive): ${pageSpeedData.tbt || 'not available'}
- Cumulative Layout Shift (page jumping while loading): ${pageSpeedData.cls || 'not available'}
- Speed Index: ${pageSpeedData.speedIndex || 'not available'}
- Server Response Time: ${pageSpeedData.serverResponseTime || 'not available'}
- HTTPS: ${pageSpeedData.usesHttps ? 'Yes — secure' : 'NO — site is not using HTTPS, this must be fixed'}
- Mobile Viewport: ${pageSpeedData.hasViewport ? 'Configured correctly' : 'NOT configured — mobile users will have a poor experience'}
- Issues to fix: ${pageSpeedData.opportunities.length > 0 ? pageSpeedData.opportunities.join(', ') : 'No major blockers detected'}
`;
    } else {
      performanceData = `
PAGESPEED DATA: Could not be retrieved for this site.
IMPORTANT INSTRUCTION FOR TECHNICAL SEO SECTION: Do NOT say data is unknown. Do NOT tell the user to check another tool. Instead, explain what each Core Web Vitals metric means in plain English, why it matters for their specific type of business, what a good score looks like, and give 3-5 specific actionable recommendations they can implement to improve speed. Make it feel complete and useful, not like a placeholder.
`;
    }
  }

  // ── System prompt ───────────────────────────────────────────────────────────
  const systemPrompt = `You are an expert SEO consultant writing concise plain-English SEO reports. Each of the 12 sections must be brief: maximum 150 words and 3-5 action points per section. Prioritise completing ALL 12 sections over detail in any one section — a complete concise report is better than a detailed incomplete one.

Today's date is ${todayDate}. Use this exact date in the report header. Never guess the date.

CRITICAL RULES:
- Never say any data point is "unknown"
- Never tell the user to go and check another tool
- Never leave any section incomplete or cut off
- Never output raw HTML tags in the body of the report — if you need to show a tag value, describe it in plain English
- Never use code blocks for plain text recommendations like suggested titles or meta descriptions — write them as normal text with quote marks
- Always use the exact data provided — do not invent or assume figures
- Write every section fully — the report must feel complete from start to finish
- UK English spelling throughout (optimisation not optimization, etc.)

For the Robots Meta Tag recommendation: describe what it should say in plain English (e.g., 'Add a robots meta tag set to index, follow') — do not show raw HTML code.

For the Domain Authority section: always include the exact PageRank score and global rank from the data provided. Explain what the score means for this specific website in plain English.

For the Google Business Profile section: never say status is unknown. Explain what GBP is, why it matters for their type of business, and give clear step-by-step instructions for setting it up or checking their existing profile at google.com/business.`;

  const userMessage = isTeaser
    ? `Generate a FREE PREVIEW SEO report for: ${url}\n${context ? `Business context: ${context}` : ''}\n\n${websiteData}\n\nGenerate ONLY these 2 sections:\n## SEO Snapshot\n## Keyword Strategy\n\nMake the preview genuinely useful. Do not mention other sections exist.`
    : `Generate a FULL SEO report for: ${url}\n${context ? `Business context: ${context}` : ''}\n\n${websiteData}\n\n${performanceData}\n\n${brokenLinkInfo}\n\n${domainAuthorityInfo}\n\nGenerate ALL 12 sections. Rules: max 120 words per section, max 5 bullet points per section, no long paragraphs. The 90-Day Action Plan must be the shortest section — a simple week-by-week list only, no explanations. Complete all 12 sections — finishing the report is the top priority:\n## SEO Snapshot\n## Keyword Strategy\n## On-Page SEO\n## Technical SEO\n## Content Strategy\n## Local SEO & Google Business Profile\n## AI Search Visibility\n## Competitor Analysis\n## Schema Markup\n## Backlink Building\n## Google Search Console\n## 90-Day Action Plan\n\nBe specific to this website. Plain English. Concise. All 12 sections must be present — prioritise completing the report over adding detail.`;

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  if (!isTeaser) {
    let fullText = '';
    try {
      const stream = await client.messages.stream({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 10000,
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

      if (!isAdmin) {
        try {
          await supabase.from('reports').upsert({
            session_id: req.body.session_id || '',
            url, context: context || '', email: email || '', report_text: fullText
          }, { onConflict: 'session_id' });
        } catch (e) { console.error('Supabase save error:', e); }
        if (email) await sendEmail(fullText, url, email, req.body.session_id || '');
      }

      res.write(`data: ${JSON.stringify({ done: true })}\n\n`);
      res.end();
    } catch (err) {
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
    }
  } else {
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
