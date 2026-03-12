const https = require('https');

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { timeout: 25000 }, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(new Error('JSON parse failed')); }
      });
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { url } = req.body;
  if (!url) return res.status(400).json({ error: 'Missing url' });

  const key = process.env.PAGESPEED_API_KEY ? `&key=${process.env.PAGESPEED_API_KEY}` : '';
  const base = `https://www.googleapis.com/pagespeedonline/v5/runPagespeed?url=${encodeURIComponent(url)}${key}`;

  try {
    const [mobile, desktop] = await Promise.all([
      httpsGet(base + '&strategy=mobile'),
      httpsGet(base + '&strategy=desktop')
    ]);

    if (!mobile?.lighthouseResult?.categories?.performance) {
      return res.status(200).json({ success: false, error: 'No performance data' });
    }

    const lhr = mobile.lighthouseResult;
    res.status(200).json({
      success: true,
      mobileScore: Math.round((lhr.categories.performance.score || 0) * 100),
      desktopScore: desktop?.lighthouseResult ? Math.round((desktop.lighthouseResult.categories.performance.score || 0) * 100) : null,
      fcp: lhr.audits['first-contentful-paint']?.displayValue || null,
      lcp: lhr.audits['largest-contentful-paint']?.displayValue || null,
      tbt: lhr.audits['total-blocking-time']?.displayValue || null,
      cls: lhr.audits['cumulative-layout-shift']?.displayValue || null,
      tti: lhr.audits['interactive']?.displayValue || null,
      opportunities: Object.values(lhr.audits)
        .filter(a => a.details?.type === 'opportunity' && a.score !== null && a.score < 0.9)
        .slice(0, 5)
        .map(a => a.title)
    });
  } catch (e) {
    res.status(200).json({ success: false, error: e.message });
  }
};
