const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const { session_id } = req.body;

  if (!session_id) return res.status(400).json({ error: "Session ID required" });

  try {
    const session = await stripe.checkout.sessions.retrieve(session_id);

    if (session.payment_status === "paid" || session.status === "complete") {
      res.status(200).json({
        paid: true,
        plan: session.mode,
        email: session.customer_details?.email || '',
        url: session.metadata.url,
        context: session.metadata.context,
      });
    } else {
      res.status(200).json({ paid: false });
    }
  } catch (error) {
    console.error("Stripe verify error:", error);
    res.status(500).json({ error: error.message });
  }
};
