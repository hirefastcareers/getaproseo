const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { plan, url, context } = req.body;
  const baseUrl = process.env.NEXT_PUBLIC_URL || "https://getaproseo.com";

  try {
    const sessionConfig = {
      payment_method_types: ["card"],
      success_url: `${baseUrl}/success.html?session_id={CHECKOUT_SESSION_ID}&url=${encodeURIComponent(url)}&context=${encodeURIComponent(context || "")}`,
      cancel_url: `${baseUrl}/?cancelled=true`,
      metadata: { url, context: context || "" },
    };

    if (plan === "subscription") {
      sessionConfig.mode = "subscription";
      sessionConfig.line_items = [{
        price: process.env.STRIPE_PRICE_SUBSCRIPTION,
        quantity: 1,
      }];
    } else {
      sessionConfig.mode = "payment";
      sessionConfig.line_items = [{
        price_data: {
          currency: "gbp",
          product_data: {
            name: "GetAProSEO — Full SEO Report",
            description: "Complete 12-section SEO report including AI Search Visibility, Competitor Analysis, Schema Markup, and 90-Day Action Plan",
          },
          unit_amount: 799,
        },
        quantity: 1,
      }];
    }

    const session = await stripe.checkout.sessions.create(sessionConfig);
    res.status(200).json({ url: session.url });
  } catch (error) {
    console.error("Stripe error:", error);
    res.status(500).json({ error: error.message || "Failed to create checkout session" });
  }
};
