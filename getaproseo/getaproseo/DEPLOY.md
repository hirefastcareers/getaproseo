# GetAProSEO — Deployment Instructions

## Step 1: Create a GitHub Repository

1. Go to github.com and sign in (create a free account if needed)
2. Click the "+" button → "New repository"
3. Name it: getaproseo
4. Set to Private
5. Click "Create repository"

## Step 2: Upload the files to GitHub

In the GitHub repo page, click "uploading an existing file" and upload:
- vercel.json
- package.json
- .gitignore
- .env.example
- The entire /api folder (report.js, checkout.js)
- The entire /public folder (index.html)

OR if you have Git installed, run these commands in the getaproseo folder:
```
git init
git add .
git commit -m "Initial commit"
git remote add origin https://github.com/YOUR_USERNAME/getaproseo.git
git push -u origin main
```

## Step 3: Deploy to Vercel

1. Go to vercel.com and sign in with your GitHub account
2. Click "New Project"
3. Import your getaproseo repository
4. Click "Deploy" (leave all settings as default)

## Step 4: Add Environment Variables in Vercel

1. In your Vercel project, go to Settings → Environment Variables
2. Add these one by one:

| Name | Value |
|------|-------|
| ANTHROPIC_API_KEY | your key from platform.anthropic.com |
| STRIPE_SECRET_KEY | your key from stripe.com/dashboard/apikeys |
| BASE_URL | https://getaproseo.com |

3. Click Save, then go to Deployments and click "Redeploy"

## Step 5: Connect your domain

1. In Vercel project → Settings → Domains
2. Add: getaproseo.com
3. Vercel will give you DNS records to add
4. Log into your domain registrar (where you bought getaproseo.com)
5. Add the DNS records Vercel shows you
6. Wait 10-30 minutes for it to go live

## Step 6: Set up Stripe Webhook (so paid users get their reports)

1. Go to stripe.com → Developers → Webhooks
2. Click "Add endpoint"
3. URL: https://getaproseo.com/api/webhook
4. Select event: checkout.session.completed
5. Copy the webhook secret

## Step 7: Test it!

1. Go to getaproseo.com
2. Enter a URL and click "Preview Free"
3. You should see the first two sections of the report
4. Click to pay and you should be redirected to Stripe

## Stripe Keys Location
- Dashboard: https://dashboard.stripe.com/apikeys
- Use the SECRET key (starts with sk_live_ for live, sk_test_ for testing)
- Test first with sk_test_ key before going live!

## Anthropic Key Location  
- Dashboard: https://platform.anthropic.com/settings/keys
- Click "Create Key"
