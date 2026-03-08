# GetAProSEO — Deployment Guide

## Setup in 4 steps

### Step 1 — Create your Stripe products

1. Go to https://dashboard.stripe.com/products
2. Click "Add product"
3. Create **"GetAProSEO — Single Report"**
   - Price: £7.99 one-time
   - Copy the **Price ID** (starts with `price_...`)
4. Create **"GetAProSEO — Monthly Unlimited"**
   - Price: £19.99/month (recurring)
   - Copy the **Price ID**

---

### Step 2 — Deploy to Vercel

1. Go to https://vercel.com and sign in (or create free account)
2. Click **"Add New Project"**
3. Click **"Upload"** (or connect GitHub if you push this code there)
4. Upload this entire `getaproseo` folder as a zip
5. **Set Environment Variables** (Settings → Environment Variables):

```
ANTHROPIC_API_KEY = sk-ant-...your key...
STRIPE_SECRET_KEY = sk_live_...your key...  (or sk_test_ for testing)
STRIPE_PUBLISHABLE_KEY = pk_live_...your key...
STRIPE_PRICE_SUBSCRIPTION = price_...subscription price ID...
NEXT_PUBLIC_URL = https://getaproseo.com
```

6. Click **Deploy**

---

### Step 3 — Connect your domain

1. In Vercel → Your Project → Settings → Domains
2. Add `getaproseo.com`
3. Vercel will show you DNS records to add
4. Go to your domain registrar (Namecheap, GoDaddy, etc.)
5. Add the DNS records as shown by Vercel
6. Wait up to 48 hours (usually minutes) for DNS to propagate

---

### Step 4 — Test it

1. Visit your Vercel URL (e.g. `getaproseo.vercel.app`)
2. Enter a test URL
3. A teaser should generate (2 free sections)
4. Click unlock — use Stripe test card `4242 4242 4242 4242` with any future expiry
5. Full report should appear after payment

---

## Testing Stripe locally

Use test keys (`sk_test_...`) for development, live keys (`sk_live_...`) for production.

Test card numbers:
- Success: `4242 4242 4242 4242`
- Declined: `4000 0000 0000 0002`

---

## File structure

```
getaproseo/
├── api/
│   ├── report.js      ← Generates SEO reports via Anthropic
│   ├── checkout.js    ← Creates Stripe checkout sessions
│   └── verify.js      ← Verifies payment was completed
├── public/
│   ├── index.html     ← Main landing page + tool
│   └── success.html   ← Post-payment redirect page
├── package.json
├── vercel.json
└── .env.example       ← Copy to .env.local with your keys
```

---

## Customisation

- **Change pricing**: Edit `unit_amount: 799` in `api/checkout.js` (in pence)
- **Change model**: Edit `model: "claude-haiku-4-5-20251001"` in `api/report.js`
- **Add sections**: Edit the `FULL_SYSTEM` prompt in `api/report.js`

---

## Support

Email: getaproseo@gmail.com
