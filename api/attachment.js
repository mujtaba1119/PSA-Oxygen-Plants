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

export const config = { api: { bodyParser: false } };

export default async function handler(req, res) {
  const admin = getAdmin();
  if (!admin) return json(res, 500, { error: "Server not configured" });

  // ─── UPLOAD ───
  if (req.method === "POST") {
    try {
      const chunks = [];
      for await (const chunk of req) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
      const body = Buffer.concat(chunks);

      const contentType = req.headers["content-type"] || "";
      const fileName = req.headers["x-file-name"] || `${Date.now()}.jpg`;
      const complaintId = req.headers["x-complaint-id"] || "";

      if (!complaintId) return json(res, 400, { error: "Missing complaint ID" });
      if (body.length === 0) return json(res, 400, { error: "Empty file" });
      if (body.length > 10 * 1024 * 1024) return json(res, 400, { error: "File too large (max 10MB)" });

      const ext = fileName.split(".").pop().toLowerCase();
      const allowed = ["jpg", "jpeg", "png", "gif", "webp", "pdf"];
      if (!allowed.includes(ext)) return json(res, 400, { error: "File type not allowed" });

      const path = `${complaintId}/${Date.now()}-${fileName}`;
      const { error: uploadError } = await admin.storage.from("attachments").upload(path, body, {
        contentType: contentType.split(";")[0] || "application/octet-stream",
        upsert: false,
      });

      if (uploadError) return json(res, 400, { error: "Storage: " + uploadError.message });

      // Update complaint attachments JSON
      const { data: complaint, error: fetchErr } = await admin.from("complaints").select("attachments").eq("id", complaintId).single();
      if (fetchErr) return json(res, 400, { error: "Fetch complaint: " + fetchErr.message });
      
      const existing = Array.isArray(complaint?.attachments) ? complaint.attachments : [];
      existing.push({ path, name: fileName, uploaded_at: new Date().toISOString() });
      
      const { error: updateErr } = await admin.from("complaints").update({ attachments: existing }).eq("id", complaintId);
      if (updateErr) return json(res, 400, { error: "Update complaint: " + updateErr.message });

      return json(res, 200, { success: true, path });
    } catch (err) {
      console.error(err);
      return json(res, 500, { error: "Upload failed: " + err.message });
    }
  }

  // ─── GET SIGNED URL ───
  if (req.method === "GET") {
    const path = req.url.split("?path=")[1];
    if (!path) return json(res, 400, { error: "Missing path" });

    const decoded = decodeURIComponent(path);
    const { data, error } = await admin.storage.from("attachments").createSignedUrl(decoded, 300); // 5 min expiry

    if (error) return json(res, 400, { error: error.message });
    return json(res, 200, { url: data.signedUrl });
  }

  return json(res, 405, { error: "Method not allowed" });
}
