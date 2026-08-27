import { createClient } from "@supabase/supabase-js";
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
    req.on("data", (c) => { raw += c; if (raw.length > 2e6) { reject(new Error("Body too large")); req.destroy(); } });
    req.on("end", () => { try { resolve(raw ? JSON.parse(raw) : {}); } catch (e) { reject(e); } });
    req.on("error", reject);
  });
}

function getAdmin() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

function normId(s) {
  return String(s || "").toLowerCase().replace(/[\s-]+/g, "");
}

// Send push notifications to a list of user IDs via Expo's push service.
// Looks up each user's saved push tokens and sends the message. Best-effort: never throws.
async function sendPushToUsers(admin, userIds, title, body, data) {
  try {
    const ids = [...new Set((userIds || []).filter(Boolean))];
    if (!ids.length) return;
    const { data: tokenRows, error } = await admin
      .from("push_tokens")
      .select("token")
      .in("user_id", ids);
    if (error || !tokenRows || !tokenRows.length) return;

    // Build Expo push messages (dedupe tokens)
    const tokens = [...new Set(tokenRows.map((r) => r.token).filter(Boolean))];
    const messages = tokens.map((to) => ({
      to,
      sound: "default",
      title: title || "OxyTrack",
      body: body || "",
      data: data || {},
      priority: "high",
      channelId: "default",
    }));

    // Expo accepts up to 100 messages per request; chunk to be safe
    for (let i = 0; i < messages.length; i += 100) {
      const chunk = messages.slice(i, i + 100);
      try {
        await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "Accept-Encoding": "gzip, deflate",
          },
          body: JSON.stringify(chunk),
        });
      } catch (e) {
        console.error("Expo push send failed:", e);
      }
    }
  } catch (e) {
    console.error("sendPushToUsers error:", e);
  }
}

export default async function handler(req, res) {
  if (req.method !== "POST") return json(res, 405, { error: "Method not allowed" });

  const admin = getAdmin();
  if (!admin) return json(res, 500, { error: "Server not configured" });

  let body;
  try { body = await readJson(req); } catch (e) { return json(res, 400, { error: "Bad JSON" }); }
  const action = body.action;

  try {
// ─────────── COMPLAINTS ───────────
    if (action === "insert_complaint") {
      const { hospital, title, description, submitted_by, created_at, severity } = body;
      if (!hospital || !title || !description) return json(res, 400, { error: "Missing fields" });
      const row = { hospital, title, description, status: "Open" };
      if (submitted_by) row.submitted_by = submitted_by;
      if (created_at) row.created_at = created_at;
      if (severity) row.severity = severity;
      const { data, error } = await admin.from("complaints").insert([row]).select();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { complaint: data[0] });
    }

    if (action === "request_resolution") {
      const { id, requested_by } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("complaints").update({
        status: "Pending Resolution",
        resolution_requested_at: new Date().toISOString(),
        resolution_requested_by: requested_by || null,
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "resolve_complaint" || action === "approve_resolution") {
      const { id, resolved_by, resolved_at } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const pre = await admin.from("complaints").select("resolution_requested_at").eq("id", id).single();
      const update = { status: "Resolved", resolved_by: resolved_by || null };
      update.resolved_at = resolved_at || (pre.data && pre.data.resolution_requested_at) || new Date().toISOString();
      const { error } = await admin.from("complaints").update(update).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "reject_resolution") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("complaints").update({
        status: "Open",
        resolution_requested_at: null,
        resolution_requested_by: null,
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "unresolve_complaint") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("complaints").update({
        status: "Open", resolved_at: null, resolved_by: null,
        resolution_requested_at: null, resolution_requested_by: null,
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "update_complaint_fields") {
      const { id, fields } = body;
      if (!id || !fields || typeof fields !== "object") return json(res, 400, { error: "Missing fields" });
      const { error } = await admin.from("complaints").update(fields).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "delete_complaint") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      await admin.from("comments").delete().eq("complaint_id", id);
      const { error } = await admin.from("complaints").delete().eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // ─────────── STRUCTURED WORKFLOW (Point 1) ───────────
    // New 4-status model: Open -> In Progress -> Resolved -> Verified
    // "In Progress" is never written directly — it's derived on the frontend
    // from status "Open" + a visit_date that has arrived. Kept here as a comment
    // since both website and mobile must compute it the same way.

    if (action === "assign_complaint") {
      const { id, assigned_to, assigned_by } = body;
      if (!id || !assigned_to) return json(res, 400, { error: "Missing id or assigned_to" });
      // A ticket can have multiple assignees — merge the new name(s) into the existing list rather
      // than overwriting it, so a manager can assign additional people over time.
      const { data: current } = await admin.from("complaints").select("assigned_to").eq("id", id).maybeSingle();
      const existing = Array.isArray(current?.assigned_to) ? current.assigned_to : (current?.assigned_to ? [current.assigned_to] : []);
      const incoming = Array.isArray(assigned_to) ? assigned_to : [assigned_to];
      const merged = [...new Set([...existing, ...incoming].filter(Boolean))];
      const { error } = await admin.from("complaints").update({
        assigned_to: merged, assigned_by: assigned_by || null, assigned_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "log_visit") {
      const { id, visit_date, logged_by } = body;
      if (!id || !visit_date) return json(res, 400, { error: "Missing id or visit_date" });
      // A ticket can be visited more than once — merge the new date into the existing list
      // rather than overwriting it, so a manager can log follow-up visits.
      const { data: current } = await admin.from("complaints").select("visit_date").eq("id", id).maybeSingle();
      const existing = Array.isArray(current?.visit_date) ? current.visit_date : (current?.visit_date ? [current.visit_date] : []);
      const merged = [...new Set([...existing, visit_date])];
      const { error } = await admin.from("complaints").update({
        visit_date: merged, visit_logged_by: logged_by || null, visit_logged_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "mark_resolved") {
      const { id, resolved_by } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("complaints").update({
        status: "Resolved", resolved_by: resolved_by || null, resolved_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "verify_complaint") {
      const { id, verified_by } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("complaints").update({
        status: "Verified", verified_by: verified_by || null, verified_at: new Date().toISOString(),
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // Amex rejects a resolution -> ticket goes all the way back to Open,
    // assignment/visit/resolution data is cleared so the manager must reassign from scratch.
    // Before wiping, the full pre-rejection state is snapshotted so admin can undo this specific
    // action later (see "undo_reject" below).
    if (action === "reject_verification") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { data: current } = await admin.from("complaints").select(
        "assigned_to, assigned_by, assigned_at, visit_date, visit_logged_by, visit_logged_at, resolved_by, resolved_at, verified_by, verified_at"
      ).eq("id", id).maybeSingle();
      const { error } = await admin.from("complaints").update({
        status: "Open",
        assigned_to: null, assigned_by: null, assigned_at: null,
        visit_date: null, visit_logged_by: null, visit_logged_at: null,
        resolved_by: null, resolved_at: null,
        verified_by: null, verified_at: null,
        pre_reject_snapshot: current || null,
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // ─────────── ADMIN UNDO ACTIONS (Point 1 follow-up) ───────────

    // Remove one person from the assignee list (does not touch anything else)
    if (action === "remove_assignee") {
      const { id, name } = body;
      if (!id || !name) return json(res, 400, { error: "Missing id or name" });
      const { data: current } = await admin.from("complaints").select("assigned_to").eq("id", id).maybeSingle();
      const existing = Array.isArray(current?.assigned_to) ? current.assigned_to : (current?.assigned_to ? [current.assigned_to] : []);
      const updated = existing.filter((n) => n !== name);
      // If that was the last assignee, also clear assigned_by/assigned_at so the ticket
      // fully reverts to "Open" rather than showing a stale assignment date with nobody assigned.
      const update = updated.length
        ? { assigned_to: updated }
        : { assigned_to: null, assigned_by: null, assigned_at: null };
      const { error } = await admin.from("complaints").update(update).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // Remove one logged visit date (does not touch anything else)
    if (action === "remove_visit") {
      const { id, visit_date } = body;
      if (!id || !visit_date) return json(res, 400, { error: "Missing id or visit_date" });
      const { data: current } = await admin.from("complaints").select("visit_date").eq("id", id).maybeSingle();
      const existing = Array.isArray(current?.visit_date) ? current.visit_date : (current?.visit_date ? [current.visit_date] : []);
      const updated = existing.filter((d) => d !== visit_date);
      // If that was the last visit, also clear visit_logged_by/visit_logged_at for the same
      // reason as remove_assignee above — no stale metadata left behind.
      const update = updated.length
        ? { visit_date: updated }
        : { visit_date: null, visit_logged_by: null, visit_logged_at: null };
      const { error } = await admin.from("complaints").update(update).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // Step "Resolved" back to Open (assignment + visit data are untouched, so the derived
    // status correctly falls back to "In Progress" or "Assigned" rather than raw "Open")
    if (action === "undo_resolve") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("complaints").update({
        status: "Open", resolved_by: null, resolved_at: null,
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // Step "Verified" back to Resolved
    if (action === "undo_verify") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("complaints").update({
        status: "Resolved", verified_by: null, verified_at: null,
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // Restore the state a ticket was in immediately before its last rejection
    // (only available while that snapshot still exists — see reject_verification above)
    if (action === "undo_reject") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { data: current, error: fetchErr } = await admin.from("complaints").select("pre_reject_snapshot").eq("id", id).maybeSingle();
      if (fetchErr) return json(res, 400, { error: fetchErr.message });
      const snap = current?.pre_reject_snapshot;
      if (!snap) return json(res, 400, { error: "No rejection to undo" });
      // Restoring implies the ticket was Resolved (possibly Verified) right before rejection —
      // resolved_at presence tells us which; if verified_at was also set, restore to Verified.
      const restoredStatus = snap.verified_at ? "Verified" : (snap.resolved_at ? "Resolved" : "Open");
      const { error } = await admin.from("complaints").update({
        status: restoredStatus,
        assigned_to: snap.assigned_to || null, assigned_by: snap.assigned_by || null, assigned_at: snap.assigned_at || null,
        visit_date: snap.visit_date || null, visit_logged_by: snap.visit_logged_by || null, visit_logged_at: snap.visit_logged_at || null,
        resolved_by: snap.resolved_by || null, resolved_at: snap.resolved_at || null,
        verified_by: snap.verified_by || null, verified_at: snap.verified_at || null,
        pre_reject_snapshot: null,
      }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // ─────────── COMMENTS ───────────
    if (action === "insert_comment") {
      const { complaint_id, author, author_role, content } = body;
      if (!complaint_id || !content) return json(res, 400, { error: "Missing fields" });
      const { data, error } = await admin.from("comments").insert([{
        complaint_id, author: author || "", author_role: author_role || null, content,
      }]).select();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { comment: data[0] });
    }

    if (action === "update_comment") {
      const { id, content } = body;
      if (!id || !content) return json(res, 400, { error: "Missing fields" });
      const { error } = await admin.from("comments").update({ content }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "delete_comment") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("comments").delete().eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // ─────────── PUSH TOKENS ───────────
    if (action === "save_push_token") {
      const { user_id, token, platform } = body;
      if (!user_id || !token) return json(res, 400, { error: "Missing user_id or token" });
      // Upsert: one row per token; if the token exists, update its user_id (device re-login)
      const { data: existing, error: selErr } = await admin.from("push_tokens").select("id").eq("token", token).maybeSingle();
      if (selErr) return json(res, 400, { error: "select failed: " + selErr.message });
      let writeErr;
      if (existing) {
        const { error } = await admin.from("push_tokens").update({ user_id, platform: platform || null }).eq("token", token);
        writeErr = error;
      } else {
        const { error } = await admin.from("push_tokens").insert([{ user_id, token, platform: platform || null }]);
        writeErr = error;
      }
      if (writeErr) return json(res, 400, { error: "write failed: " + writeErr.message });
      return json(res, 200, { success: true });
    }

    if (action === "delete_push_token") {
      const { token } = body;
      if (!token) return json(res, 400, { error: "Missing token" });
      await admin.from("push_tokens").delete().eq("token", token);
      return json(res, 200, { success: true });
    }

    // ─────────── NOTIFICATIONS ───────────
    if (action === "insert_notifications") {
      // body.rows = array of notification objects
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) return json(res, 200, { success: true, inserted: 0 });
      const clean = rows.map((r) => ({
        user_id: r.user_id,
        type: r.type || null,
        title: r.title || null,
        message: r.message || null,
        complaint_id: r.complaint_id || null,
        hospital: r.hospital || null,
      }));
      const { error } = await admin.from("notifications").insert(clean);
      if (error) return json(res, 400, { error: error.message });

      // Also send push notifications to these users (best-effort, non-blocking failure)
      try {
        const first = clean[0] || {};
        const pushTitle = first.hospital ? `${first.title || "OxyTrack"}` : (first.title || "OxyTrack");
        const pushBody = first.hospital
          ? `${first.hospital}${first.message ? " — " + first.message : ""}`
          : (first.message || "");
        const userIds = clean.map((r) => r.user_id);
        await sendPushToUsers(admin, userIds, pushTitle, pushBody, {
          complaint_id: first.complaint_id || null,
          hospital: first.hospital || null,
          type: first.type || null,
        });
      } catch (e) { console.error("push hook error:", e); }

      return json(res, 200, { success: true, inserted: clean.length });
    }

    if (action === "mark_notification_read") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("notifications").update({ is_read: true }).eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "mark_all_read") {
      const { user_id, company } = body;
      const ids = [];
      if (user_id) ids.push(user_id);
      if (company) ids.push(normId(company));
      if (!ids.length) return json(res, 400, { error: "Missing user_id" });
      const { error } = await admin.from("notifications").update({ is_read: true }).in("user_id", ids).eq("is_read", false);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "delete_notification") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("notifications").delete().eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    if (action === "reset_all_notifications") {
      const { error } = await admin.from("notifications").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // ─────────── SITE NOTES ───────────
    if (action === "update_site_note") {
      const { hospital, site_status, equipment_note } = body;
      if (!hospital) return json(res, 400, { error: "Missing hospital" });
      const patch = { updated_at: new Date().toISOString() };
      if (site_status !== undefined) patch.site_status = site_status;
      if (equipment_note !== undefined) patch.equipment_note = equipment_note;

      const { data: existing } = await admin.from("site_notes").select("hospital").eq("hospital", hospital).maybeSingle();
      let error;
      if (existing) {
        ({ error } = await admin.from("site_notes").update(patch).eq("hospital", hospital));
      } else {
        ({ error } = await admin.from("site_notes").insert([{ hospital, ...patch }]));
      }
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    // ─────────── NOTIFICATION EMAILS ───────────
    if (action === "insert_email") {
      const { email, group_name } = body;
      if (!email || !group_name) return json(res, 400, { error: "Missing fields" });
      const { data, error } = await admin.from("notification_emails").insert([{ email: email.trim(), group_name }]).select();
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { row: data[0] });
    }

    if (action === "delete_email") {
      const { id } = body;
      if (!id) return json(res, 400, { error: "Missing id" });
      const { error } = await admin.from("notification_emails").delete().eq("id", id);
      if (error) return json(res, 400, { error: error.message });
      return json(res, 200, { success: true });
    }

    return json(res, 400, { error: "Unknown action: " + action });
  } catch (err) {
    console.error(err);
    return json(res, 500, { error: "Server error" });
  }
}
