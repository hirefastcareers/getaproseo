const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const DIR = path.join(__dirname, 'playwright-screenshots');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR);

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 200 });
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

  // 1. Homepage
  console.log('Step 1: Loading homepage...');
  await page.goto('https://getaproseo.com', { waitUntil: 'networkidle', timeout: 30000 });

  // 2. Enter URL
  console.log('Step 2: Entering URL...');
  await page.locator('#urlInput').fill('https://example.com');

  // 3. Submit
  console.log('Step 3: Clicking Generate...');
  await page.locator('#generateBtn').click();

  // 4. Wait for teaser / unlock button to appear
  console.log('Step 4: Waiting for teaser + Unlock button (up to 90s)...');
  await page.locator('#unlockBtn').waitFor({ state: 'visible', timeout: 90000 });
  console.log('Unlock button visible.');

  // Screenshot teaser with pricing box
  await page.screenshot({ path: path.join(DIR, 'checkout-01-teaser.png'), fullPage: true });

  // 5. Click Unlock
  console.log('Step 5: Clicking Unlock...');
  await page.locator('#unlockBtn').scrollIntoViewIfNeeded();

  // Watch for navigation or new tab
  const [newTab] = await Promise.all([
    page.context().waitForEvent('page', { timeout: 12000 }).catch(() => null),
    page.locator('#unlockBtn').click(),
  ]);

  let checkoutPage = newTab ?? page;

  // Wait for the checkout to settle
  console.log('Waiting for checkout to load...');
  await checkoutPage.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  await checkoutPage.waitForTimeout(2000);

  const finalUrl = checkoutPage.url();
  console.log('Checkout URL:', finalUrl);

  // Screenshot full checkout
  await checkoutPage.screenshot({ path: path.join(DIR, 'checkout-02-stripe.png'), fullPage: true });
  console.log('Screenshot saved: checkout-02-stripe.png');

  // Extract visible text to confirm product + price
  const text = await checkoutPage.evaluate(() => document.body.innerText);
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  console.log('\n=== CHECKOUT PAGE TEXT (first 50 lines) ===');
  lines.slice(0, 50).forEach(l => console.log(' ', l));

  await browser.close();
})();
