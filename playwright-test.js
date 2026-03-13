const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOTS_DIR = path.join(__dirname, 'playwright-screenshots');
if (!fs.existsSync(SCREENSHOTS_DIR)) fs.mkdirSync(SCREENSHOTS_DIR);

let step = 0;
async function screenshot(page, name) {
  step++;
  const file = path.join(SCREENSHOTS_DIR, `${String(step).padStart(2,'0')}-${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  console.log(`[SCREENSHOT] ${file}`);
  return file;
}

(async () => {
  const browser = await chromium.launch({ headless: false, slowMo: 300 });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  // Capture console errors
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  page.on('pageerror', err => errors.push(err.message));

  try {
    // 1. Load homepage
    console.log('Step 1: Loading homepage...');
    await page.goto('https://getaproseo.com', { waitUntil: 'networkidle', timeout: 30000 });
    await screenshot(page, 'homepage');

    // 2. Find URL input and enter a URL
    console.log('Step 2: Entering URL...');
    const urlInput = await page.locator('input[type="url"], input[type="text"], input[placeholder*="url" i], input[placeholder*="website" i], input[placeholder*="domain" i], input[placeholder*="enter" i]').first();
    await urlInput.click();
    await urlInput.fill('https://example.com');
    await screenshot(page, 'url-entered');

    // 3. Submit / Generate report
    console.log('Step 3: Submitting for free preview...');
    const submitBtn = await page.locator('button[type="submit"], button:has-text("Analyze"), button:has-text("Generate"), button:has-text("Get"), button:has-text("Check"), button:has-text("Scan"), button:has-text("Start"), button:has-text("Run")').first();
    console.log('Submit button text:', await submitBtn.textContent());
    await submitBtn.click();
    await screenshot(page, 'after-submit');

    // 4. Wait for teaser/preview to load
    console.log('Step 4: Waiting for preview/teaser...');
    await page.waitForTimeout(5000);
    await screenshot(page, 'teaser-loading');

    // Wait up to 60s for something visible
    try {
      await page.waitForSelector('[class*="result"], [class*="report"], [class*="preview"], [class*="teaser"], [class*="score"], [class*="audit"], h2, h3', { timeout: 60000 });
    } catch (e) {
      console.log('Warning: no obvious result container found within 60s');
    }
    await screenshot(page, 'teaser-loaded');

    // 5. Look for Unlock button
    console.log('Step 5: Looking for Unlock button...');
    const unlockBtn = await page.locator('button:has-text("Unlock"), a:has-text("Unlock"), button:has-text("unlock"), button:has-text("Full Report"), button:has-text("Pay"), button:has-text("Get Full"), button:has-text("Purchase")').first();
    if (await unlockBtn.count() > 0) {
      console.log('Unlock button found:', await unlockBtn.textContent());
      await unlockBtn.scrollIntoViewIfNeeded();
      await screenshot(page, 'unlock-button-visible');
      await unlockBtn.click();
      await screenshot(page, 'after-unlock-click');
    } else {
      console.log('WARNING: No unlock button found — taking screenshot of current state');
      await screenshot(page, 'no-unlock-button');
    }

    // 6. Wait for payment/checkout page
    console.log('Step 6: Waiting for payment page...');
    await page.waitForTimeout(4000);
    await screenshot(page, 'payment-page');

    // Check if Stripe or payment form appeared
    const stripeFrame = page.frameLocator('iframe[src*="stripe"]');
    const hasStripe = await page.locator('iframe[src*="stripe"], [class*="stripe"], [id*="stripe"], [class*="payment"], [class*="checkout"]').count();
    console.log('Payment elements found:', hasStripe);

    if (hasStripe > 0) {
      console.log('Step 7: Filling in test payment details...');
      // Try to fill card number in Stripe iframe
      try {
        const cardFrame = page.frameLocator('iframe[name*="card"], iframe[title*="card" i]').first();
        await cardFrame.locator('[placeholder*="Card number" i], [name*="cardnumber" i]').fill('4242 4242 4242 4242');
        await cardFrame.locator('[placeholder*="MM" i], [placeholder*="expiry" i]').fill('12/26');
        await cardFrame.locator('[placeholder*="CVC" i], [placeholder*="security" i]').fill('123');
        await screenshot(page, 'payment-filled');
      } catch (e) {
        console.log('Could not fill Stripe iframe:', e.message);
        await screenshot(page, 'payment-iframe-error');
      }
    }

    // 7. Final state
    await page.waitForTimeout(3000);
    await screenshot(page, 'final-state');

  } catch (err) {
    console.error('ERROR:', err.message);
    await screenshot(page, 'error-state').catch(() => {});
  }

  console.log('\n=== CONSOLE ERRORS CAPTURED ===');
  if (errors.length === 0) {
    console.log('None');
  } else {
    errors.forEach(e => console.log(' -', e));
  }

  console.log('\nDone. Screenshots in:', SCREENSHOTS_DIR);
  await browser.close();
})();
