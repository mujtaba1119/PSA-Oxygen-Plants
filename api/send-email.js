export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { to, hospital, title, description, provider } = body;

    if (!Array.isArray(to) || !to.length || !hospital || !title) {
      return res.status(400).json({ error: "Missing fields" });
    }

    const RESEND_KEY = process.env.RESEND_API_KEY;
    if (!RESEND_KEY) {
      return res.status(500).json({ error: "Email not configured" });
    }

    const esc = (v) =>
      String(v ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");

    const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
      <div style="background: #0e7c6b; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">O₂ PSA Oxygen Plant — New Complaint</h2>
      </div>
      <div style="border: 1px solid #e2e8f0; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="margin: 0 0 8px;"><strong>Hospital:</strong> ${esc(hospital)}</p>
        <p style="margin: 0 0 8px;"><strong>Service Provider:</strong> ${esc(provider)}</p>
        <p style="margin: 0 0 8px;"><strong>Complaint:</strong> ${esc(title)}</p>
        <p style="margin: 0 0 16px;"><strong>Description:</strong></p>
        <p style="margin: 0; padding: 12px; background: #f0f4f8; border-radius: 6px;">${esc(description).replace(/\n/g, "<br>")}</p>
        <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
        <p style="margin: 0; font-size: 13px; color: #718096;">Visit <a href="https://psacomplaints.com">psacomplaints.com</a> to view details.</p>
      </div>
    </div>
  `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_KEY}`,
      },
      body: JSON.stringify({
        from: "PSA Oxygen Plant <alerts@psacomplaints.com>",
        to: [...new Set(to.map(String))],
        subject: `New Complaint: ${hospital} — ${title}`,
        html,
      }),
    });

    const data = await response.json();
    if (!response.ok) return res.status(500).json({ error: data });
    return res.status(200).json({ success: true, data });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Email failed" });
  }
}
