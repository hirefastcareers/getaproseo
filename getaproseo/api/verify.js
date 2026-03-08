const Stripe = require("stripe");

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

async function sendConfirmationEmail(email, url) {
  if (!process.env.RESEND_API_KEY || !email) return;
  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'GetAProSEO <hello@getaproseo.com>',
        to: email,
        subject: 'Your SEO Report is Ready 🎉',
        html: `
          <div style="font-family:sans-serif;max-width:500px;margin:0 auto;padding:32px;">
            <h1 style="font-size:24px;color:#0a0a0a;">Your SEO report is ready!</h1>
            <p style="color:#555;line-height:1.6;">Thanks for your purchase. Your full 12-section SEO report for <strong>${url}</strong> has been generated.</p>
            <p style="color:#555;line-height:1.6;">If you have any issues accessing your report, just reply to this email and we'll sort it out straight away.</p>
            <p style="color:#555;line-height:1.6;">Thanks,<br>Tom at GetAProSEO</p>
            <hr style="border:none;border-top:1px solid #eee;margin:24px 0;">
            <p style="font-size:12px;color:#aaa;">GetAProSEO · <a href="https://getaproseo.com">getaproseo.com</a></p>
          </div>
        `
      })
    });
  } catch (e) {
    console.error('Email send failed:', e);
  }
}

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
      await sendConfirmationEmail(session.customer_details?.email, session.metadata.url);
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
