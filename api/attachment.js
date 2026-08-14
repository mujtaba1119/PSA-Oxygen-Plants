import { createClient } from "@supabase/supabase-js";
import { loadEnv } from "./_lib/loadEnv.js";

loadEnv();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req, res) {
  const admin = getAdmin();
  if (!admin) return json(res, 500, { error: "Server not configured" });

  // ─── UPLOAD (base64 JSON) ───
  if (req.method === "POST") {
    try {
      const { complaintId, fileName, contentType, base64Data } = req.body || {};

      if (!complaintId || !fileName || !base64Data) return json(res, 400, { error: "Missing fields" });

      const ext = fileName.split(".").pop().toLowerCase();
      const allowed = ["jpg", "jpeg", "png", "gif", "webp", "pdf"];
      if (!allowed.includes(ext)) return json(res, 400, { error: "File type not allowed" });

      const buffer = Buffer.from(base64Data, "base64");
      if (buffer.length > 10 * 1024 * 1024) return json(res, 400, { error: "File too large (max 10MB)" });

      const path = `${complaintId}/${Date.now()}-${fileName}`;
      const { error: uploadError } = await admin.storage.from("Attachments").upload(path, buffer, {
        contentType: contentType || "application/octet-stream",
        upsert: false,
      });

      if (uploadError) return json(res, 400, { error: "Storage: " + uploadError.message });

      const { data: complaint, error: fetchErr } = await admin.from("complaints").select("attachments").eq("id", complaintId).single();
      if (fetchErr) return json(res, 400, { error: "Fetch: " + fetchErr.message });

      const existing = Array.isArray(complaint?.attachments) ? complaint.attachments : [];
      existing.push({ path, name: fileName, uploaded_at: new Date().toISOString() });

      const { error: updateErr } = await admin.from("complaints").update({ attachments: existing }).eq("id", complaintId);
      if (updateErr) return json(res, 400, { error: "Update: " + updateErr.message });

      return json(res, 200, { success: true, path });
    } catch (err) {
      return json(res, 500, { error: "Upload failed: " + err.message });
    }
  }

  // ─── GET SIGNED URL ───
  if (req.method === "GET") {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const path = url.searchParams.get("path");
    if (!path) return json(res, 400, { error: "Missing path" });

    const { data, error } = await admin.storage.from("Attachments").createSignedUrl(path, 300);
    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, { url: data.signedUrl });
  }

  return json(res, 405, { error: "Method not allowed" });
}
