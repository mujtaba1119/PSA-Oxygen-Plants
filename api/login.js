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
    if (req.body && typeof req.body === "object") {
      resolve(req.body);
      return;
    }
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1e6) {
        reject(new Error("Body too large"));
        req.destroy();
      }
    });
    req.on("end", () => {
      try {
        resolve(raw ? JSON.parse(raw) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

function clean(s) {
  return String(s || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "");
}

function hashPassword(pw) {
  return createHash("sha256").update(clean(pw)).digest("hex");
}

function isSha256Hex(value) {
  return typeof value === "string" && /^[a-f0-9]{64}$/i.test(value);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  try {
    const { username, password } = await readJson(req);
    if (!username || !password) {
      return json(res, 400, { error: "Username and password required" });
    }

    const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      return json(res, 500, { error: "Server auth not configured (missing SUPABASE_SERVICE_ROLE_KEY)" });
    }

    const admin = createClient(url, key, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const needle = clean(username);
    const pwHash = hashPassword(password);

    let { data: user, error } = await admin
      .from("users")
      .select("id, name, role, password, company")
      .eq("id", needle)
      .maybeSingle();

    if (error) {
      console.error(error);
      return json(res, 500, { error: "Login failed" });
    }

    if (!user) {
      const { data: rows, error: listErr } = await admin
        .from("users")
        .select("id, name, role, password, company");
      if (listErr) {
        console.error(listErr);
        return json(res, 500, { error: "Login failed" });
      }
      user = (rows || []).find((u) => clean(u.name) === needle) || null;
    }

    if (!user) return json(res, 401, { error: "Invalid credentials" });

    let ok = false;
    if (isSha256Hex(user.password)) {
      ok = user.password === pwHash;
    } else {
      // Legacy plaintext row: allow once, then upgrade to SHA-256
      ok = clean(user.password) === clean(password);
      if (ok) {
        await admin.from("users").update({ password: pwHash }).eq("id", user.id);
      }
    }

    if (!ok) return json(res, 401, { error: "Invalid credentials" });

    return json(res, 200, {
      user: { id: user.id, name: user.name, role: user.role, company: user.company || null },
    });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: "Login failed" });
  }
}
