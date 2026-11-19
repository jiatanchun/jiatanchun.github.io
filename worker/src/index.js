// Contact form backend for recursionlab.ai
// Verifies Cloudflare Turnstile, validates input, and forwards the enquiry
// to your inbox via Cloudflare Email Routing (send_email binding).
import { EmailMessage } from "cloudflare:email";

const LIMITS = { name: 100, email: 200, company: 150, topic: 100, message: 5000 };

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = (env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
    const cors = {
      "Access-Control-Allow-Origin": allowed.includes(origin) ? origin : allowed[0] || "",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin",
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply(405, { error: "Method not allowed." });
    if (!allowed.includes(origin)) return reply(403, { error: "Forbidden." });

    let data;
    try {
      data = await request.json();
    } catch {
      return reply(400, { error: "Invalid request." });
    }

    // Honeypot: pretend success so bots learn nothing.
    if (data.website) return reply(200, { ok: true });

    const clean = {};
    for (const [key, max] of Object.entries(LIMITS)) {
      clean[key] = String(data[key] ?? "").trim().slice(0, max);
    }
    if (!clean.name || !clean.message || clean.message.length < 10) {
      return reply(400, { error: "Please fill in your name and a short message." });
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean.email)) {
      return reply(400, { error: "Please enter a valid email address." });
    }
    if (!data.consent) return reply(400, { error: "Please accept the privacy policy." });

    // Turnstile verification
    const form = new FormData();
    form.append("secret", env.TURNSTILE_SECRET);
    form.append("response", String(data["cf-turnstile-response"] || ""));
    const ip = request.headers.get("CF-Connecting-IP");
    if (ip) form.append("remoteip", ip);
    const verify = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body: form });
    const outcome = await verify.json();
    if (!outcome.success) return reply(403, { error: "Verification failed. Please try again." });

    try {
      const raw = buildEmail(env, clean);
      await env.SEND_EMAIL.send(new EmailMessage(env.MAIL_FROM, env.MAIL_TO, raw));
    } catch (err) {
      console.error("send failed", err);
      return reply(502, { error: "We could not send your message right now. Please try again later." });
    }
    return reply(200, { ok: true });
  },
};

// --- helpers ---------------------------------------------------------------

const oneLine = (s) => s.replace(/[\r\n]+/g, " ");

function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

const encodeHeader = (s) => `=?UTF-8?B?${b64(oneLine(s))}?=`;

function buildEmail(env, f) {
  const subject = `[Website] ${f.topic || "Enquiry"} — ${f.name}${f.company ? ` (${f.company})` : ""}`;
  const body = [
    `Name:    ${f.name}`,
    `Email:   ${f.email}`,
    `Company: ${f.company || "-"}`,
    `Topic:   ${f.topic || "-"}`,
    "",
    f.message,
    "",
    "--",
    "Sent from the contact form on recursionlab.ai",
  ].join("\r\n");
  const domain = env.MAIL_FROM.split("@")[1];
  return [
    `From: ${encodeHeader("Recursion Lab Website")} <${env.MAIL_FROM}>`,
    `To: <${env.MAIL_TO}>`,
    `Reply-To: ${encodeHeader(f.name)} <${oneLine(f.email)}>`,
    `Subject: ${encodeHeader(subject)}`,
    `Message-ID: <${crypto.randomUUID()}@${domain}>`,
    `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    b64(body).replace(/.{76}/g, "$&\r\n"),
  ].join("\r\n");
}
