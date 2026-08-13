import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { loadEnv } from "./_lib/loadEnv.js";

loadEnv();

function json(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    if (req.body && typeof req.body === "object") { resolve(req.body); return; }
    let raw = "";
    req.on("data", (c) => { raw += c; if (raw.length > 1e6) { reject(new Error("Body too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function hashPassword(pw) {
  return createHash("sha256").update(String(pw).trim().toLowerCase().replace(/\s+/g, "")).digest("hex");
}

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const body = await readJson(req);
    const { action } = body;

    const admin = getAdmin();
    if (!admin) return json(res, 500, { error: "Server not configured" });

    // ─── FETCH USERS (no passwords returned) ───
    if (action === "fetch") {
      const { data, error } = await admin.from("users").select("id, name, role, company, email");
      if (error) return json(res, 500, { error: error.message });
      return json(res, 200, { users: data });
    }

    // ─── CREATE USER ───
    if (action === "create") {
      const { id, name, role, password, company, email } = body;
      if (!id || !name || !role || !password) return json(res, 400, { error: "Missing required fields" });
      if (password.trim().length < 8) return json(res, 400, { error: "Password must be at least 8 characters" });

      const hashed = hashPassword(password);
      const row = { id: id.trim().toLowerCase().replace(/\s+/g, ""), name: name.trim(), role, password: hashed };
      if (company) row.company = company;
      if (email) row.email = email.trim();

      const { data, error } = await admin.from("users").insert([row]).select("id, name, role, company, email");
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { user: data[0] });
    }

    // ─── DELETE USER ───
    if (action === "delete") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing user id" });

      // Prevent deleting admin
      const { data: user } = await admin.from("users").select("role").eq("id", id).maybeSingle();
      if (user?.role === "admin") return json(res, 403, { error: "Cannot delete admin account" });

      // Delete notification preferences first
      await admin.from("notification_preferences").delete().eq("user_id", id);
      await admin.from("push_tokens").delete().eq("user_id", id);

      const { error } = await admin.from("users").delete().eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // ─── UPDATE PASSWORD ───
    if (action === "update_password") {
      const { id, password } = body;
      if (!id || !password) return json(res, 400, { error: "Missing id or password" });
      if (password.trim().length < 8) return json(res, 400, { error: "Password must be at least 8 characters" });

      const hashed = hashPassword(password);
      const { error } = await admin.from("users").update({ password: hashed }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // ─── UPDATE NOTIFICATION PREFERENCES ───
    if (action === "update_prefs") {
      const { user_id, prefs } = body;
      if (!user_id || !prefs) return json(res, 400, { error: "Missing user_id or prefs" });

      const { data: existing } = await admin.from("notification_preferences").select("id").eq("user_id", user_id).maybeSingle();
      if (existing) {
        await admin.from("notification_preferences").update(prefs).eq("user_id", user_id);
      } else {
        await admin.from("notification_preferences").insert([{ user_id, ...prefs }]);
      }
      return json(res, 200, { success: true });
    }

    return json(res, 400, { error: "Unknown action" });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: "Server error" });
  }
}
