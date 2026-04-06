"use strict";

require("dotenv").config();
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");
const express = require("express");
const nodemailer = require("nodemailer");
const rateLimit = require("express-rate-limit");
const cors = require("cors");

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const PUBLIC_DIR = path.join(__dirname, "..", "public");
const BLOG_PATH = path.join(__dirname, "data", "blog.json");
const MAX_BLOG_IMAGE_BYTES = 2 * 1024 * 1024;

let cachedTransporter = null;
let cachedTransportConfigKey = "";

if (process.env.NODE_ENV === "production") {
  app.set("trust proxy", 1);
}

const corsOrigin = process.env.CORS_ORIGIN;
if (corsOrigin) {
  app.use(cors({ origin: corsOrigin, methods: ["GET", "POST", "OPTIONS"] }));
}

app.use(express.json({ limit: "5mb" }));
app.disable("x-powered-by");
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  next();
});

const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function readSiteData() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, "data", "site.json"), "utf8");
    return JSON.parse(raw);
  } catch {
    return { announcement: "", announcementType: "info", updatedAt: null };
  }
}

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.get("/api/site", (_req, res) => {
  res.set("Cache-Control", "no-store");
  res.json(readSiteData());
});

function readBlogData() {
  try {
    const raw = fs.readFileSync(BLOG_PATH, "utf8");
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.posts)) return { posts: [] };
    return data;
  } catch {
    return { posts: [] };
  }
}

function writeJsonFileAtomic(targetPath, data) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tempPath = path.join(dir, `${path.basename(targetPath)}.${process.pid}.${Date.now()}.tmp`);
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), "utf8");
  fs.renameSync(tempPath, targetPath);
}

function writeBlogData(data) {
  writeJsonFileAtomic(BLOG_PATH, data);
}

function mutateBlogData(mutator) {
  const data = readBlogData();
  mutator(data);
  writeBlogData(data);
  return data;
}

function getBase64DecodedSize(dataUrl) {
  const raw = String(dataUrl || "");
  const parts = raw.split(",");
  if (parts.length !== 2 || !/^data:image\/(png|jpeg|webp|gif);base64$/i.test(parts[0])) {
    return 0;
  }
  const clean = parts[1].replace(/\s+/g, "");
  return Buffer.from(clean, "base64").length;
}

function getMailTransporter() {
  const smtpHost = String(process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const secure = String(process.env.SMTP_SECURE).toLowerCase() === "true";
  const user = String(process.env.SMTP_USER || "").trim();
  const pass = String(process.env.SMTP_PASS || "").trim();
  const configKey = JSON.stringify({ smtpHost, port, secure, user, pass });

  if (cachedTransporter && cachedTransportConfigKey === configKey) {
    return cachedTransporter;
  }

  cachedTransporter = nodemailer.createTransport({
    host: smtpHost,
    port,
    secure,
    auth: { user, pass }
  });
  cachedTransportConfigKey = configKey;
  return cachedTransporter;
}

function newPostId() {
  return `${Date.now()}-${crypto.randomBytes(6).toString("hex")}`;
}

function blogBearerToken(req) {
  const auth = req.headers.authorization || "";
  const m = String(auth).match(/^Bearer\s+(.+)$/i);
  return m ? m[1].trim() : "";
}

function blogTokenConfigured() {
  return Boolean(String(process.env.BLOG_POST_TOKEN || "").trim());
}

function blogTokenMatches(provided) {
  const expected = String(process.env.BLOG_POST_TOKEN || "").trim();
  if (!expected) return false;
  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(provided || ""), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

app.get("/api/blog", (_req, res) => {
  res.set("Cache-Control", "no-store");
  const { posts } = readBlogData();
  const published = posts
    .filter((p) => p && p.status === "published")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .map((p) => ({
      id: p.id,
      title: p.title,
      author: p.author,
      content: p.content,
      createdAt: p.createdAt,
      imageDataUrl: p.imageDataUrl || "",
      imageAlt: p.imageAlt || p.title || ""
    }));
  res.json({ ok: true, posts: published });
});

const blogSubmitLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many submissions. Please try again later." }
});

const blogPublishLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 40,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many requests. Please try again later." }
});

app.post("/api/blog/submit", blogSubmitLimiter, (req, res) => {
  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const author = typeof body.author === "string" ? body.author.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const imageDataUrl = typeof body.imageDataUrl === "string" ? body.imageDataUrl.trim() : "";
  const imageName = typeof body.imageName === "string" ? body.imageName.trim() : "";
  const imageType = typeof body.imageType === "string" ? body.imageType.trim() : "";

  if (!title || title.length > 200) {
    return res.status(400).json({ ok: false, error: "Please enter a title (max 200 characters)." });
  }
  if (!author || author.length > 120) {
    return res.status(400).json({ ok: false, error: "Please enter your name (max 120 characters)." });
  }
  if (!content || content.length < 40) {
    return res.status(400).json({ ok: false, error: "Article text should be at least 40 characters." });
  }
  if (content.length > 50000) {
    return res.status(400).json({ ok: false, error: "Article is too long." });
  }
  if (!email) {
    return res.status(400).json({ ok: false, error: "Please enter your email address." });
  }
  if (!emailRe.test(email) || email.length > 254) {
    return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
  }

  const imageTypeAllowed = !imageType || ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(imageType);
  const imageLooksValid = !imageDataUrl || /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=\r\n]+$/.test(imageDataUrl);
  if (!imageTypeAllowed || !imageLooksValid) {
    return res.status(400).json({ ok: false, error: "Please attach a valid PNG, JPG, WEBP, or GIF image." });
  }
  if (imageDataUrl && getBase64DecodedSize(imageDataUrl) > MAX_BLOG_IMAGE_BYTES) {
    return res.status(400).json({ ok: false, error: "Attached image is too large." });
  }

  mutateBlogData((data) => {
    data.posts.push({
      id: newPostId(),
      title,
      author,
      content,
      createdAt: new Date().toISOString(),
      status: "pending",
      submitterEmail: email,
      imageDataUrl: imageDataUrl || undefined,
      imageName: imageName || undefined,
      imageType: imageType || undefined,
      imageAlt: title
    });
  });
  return res.json({
    ok: true,
    message:
      "Thank you. Your submission was received and will be reviewed by our team before it may appear on the blog."
  });
});

app.post("/api/blog/publish", blogPublishLimiter, (req, res) => {
  if (!blogTokenConfigured()) {
    return res.status(503).json({
      ok: false,
      error: "Blog publishing is not configured on the server (missing BLOG_POST_TOKEN)."
    });
  }
  if (!blogTokenMatches(blogBearerToken(req))) {
    return res.status(401).json({ ok: false, error: "Invalid or missing publication key." });
  }

  const body = req.body || {};
  const title = typeof body.title === "string" ? body.title.trim() : "";
  const author = typeof body.author === "string" ? body.author.trim() : "";
  const content = typeof body.content === "string" ? body.content.trim() : "";

  if (!title || title.length > 200) {
    return res.status(400).json({ ok: false, error: "Please enter a title (max 200 characters)." });
  }
  if (!author || author.length > 120) {
    return res.status(400).json({ ok: false, error: "Please enter the author name (max 120 characters)." });
  }
  if (!content || content.length < 20) {
    return res.status(400).json({ ok: false, error: "Article text is too short." });
  }
  if (content.length > 50000) {
    return res.status(400).json({ ok: false, error: "Article is too long." });
  }

  mutateBlogData((data) => {
    data.posts.push({
      id: newPostId(),
      title,
      author,
      content,
      createdAt: new Date().toISOString(),
      status: "published"
    });
  });
  return res.json({ ok: true });
});

app.get("/api/blog/pending", blogPublishLimiter, (req, res) => {
  if (!blogTokenConfigured()) {
    return res.status(503).json({ ok: false, error: "Blog moderation is not configured on the server." });
  }
  if (!blogTokenMatches(blogBearerToken(req))) {
    return res.status(401).json({ ok: false, error: "Invalid or missing publication key." });
  }
  const { posts } = readBlogData();
  const pending = posts
    .filter((p) => p && p.status === "pending")
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, 30)
    .map((p) => ({
      id: p.id,
      title: p.title,
      author: p.author,
      content: p.content,
      createdAt: p.createdAt,
      submitterEmail: p.submitterEmail || "",
      imageDataUrl: p.imageDataUrl || "",
      imageName: p.imageName || "",
      imageAlt: p.imageAlt || p.title || ""
    }));
  res.json({ ok: true, posts: pending });
});

app.post("/api/blog/approve", blogPublishLimiter, (req, res) => {
  if (!blogTokenConfigured()) {
    return res.status(503).json({ ok: false, error: "Blog moderation is not configured on the server." });
  }
  if (!blogTokenMatches(blogBearerToken(req))) {
    return res.status(401).json({ ok: false, error: "Invalid or missing publication key." });
  }
  const body = req.body || {};
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing post id." });
  }
  try {
    mutateBlogData((data) => {
      const post = data.posts.find((p) => p && p.id === id);
      if (!post) {
        throw Object.assign(new Error("Post not found."), { statusCode: 404 });
      }
      if (post.status !== "pending") {
        throw Object.assign(new Error("This post is not awaiting approval."), { statusCode: 400 });
      }
      post.status = "published";
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message || "Could not approve post." });
  }
});

app.post("/api/blog/reject", blogPublishLimiter, (req, res) => {
  if (!blogTokenConfigured()) {
    return res.status(503).json({ ok: false, error: "Blog moderation is not configured on the server." });
  }
  if (!blogTokenMatches(blogBearerToken(req))) {
    return res.status(401).json({ ok: false, error: "Invalid or missing publication key." });
  }
  const body = req.body || {};
  const id = typeof body.id === "string" ? body.id.trim() : "";
  if (!id) {
    return res.status(400).json({ ok: false, error: "Missing post id." });
  }
  try {
    mutateBlogData((data) => {
      const idx = data.posts.findIndex((p) => p && p.id === id);
      if (idx === -1) {
        throw Object.assign(new Error("Post not found."), { statusCode: 404 });
      }
      const post = data.posts[idx];
      if (post.status !== "pending") {
        throw Object.assign(new Error("Only pending posts can be rejected."), { statusCode: 400 });
      }
      data.posts.splice(idx, 1);
    });
    return res.json({ ok: true });
  } catch (err) {
    return res.status(err.statusCode || 500).json({ ok: false, error: err.message || "Could not reject post." });
  }
});

const contactLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Too many submissions. Please try again later." }
});

app.post("/api/contact", contactLimiter, async (req, res) => {
  const contactTo = process.env.CONTACT_TO;
  const smtpHost = process.env.SMTP_HOST;
  const smtpFrom = process.env.SMTP_FROM;
  const smtpUser = process.env.SMTP_USER;
  const smtpPassVal = process.env.SMTP_PASS;
  if (
    !String(contactTo || "").trim() ||
    !String(smtpHost || "").trim() ||
    !String(smtpFrom || "").trim() ||
    !String(smtpUser || "").trim() ||
    !String(smtpPassVal || "").trim()
  ) {
    return res.status(503).json({
      ok: false,
      error: "Contact email is not configured. Set CONTACT_TO and SMTP variables on the server."
    });
  }

  const body = req.body || {};
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || name.length > 200) {
    return res.status(400).json({ ok: false, error: "Please enter a valid name." });
  }
  if (!email || !emailRe.test(email) || email.length > 254) {
    return res.status(400).json({ ok: false, error: "Please enter a valid email address." });
  }
  if (!message || message.length < 10) {
    return res.status(400).json({ ok: false, error: "Please enter a message (at least 10 characters)." });
  }
  if (message.length > 8000) {
    return res.status(400).json({ ok: false, error: "Message is too long." });
  }

  const transporter = getMailTransporter();

  const textBody =
    `New message from Lex Ladder website\n\n` +
    `Name: ${name}\n` +
    `Email: ${email}\n\n` +
    `${message}\n`;

  const htmlBody =
    `<p><strong>Name:</strong> ${escapeHtml(name)}</p>` +
    `<p><strong>Email:</strong> ${escapeHtml(email)}</p>` +
    `<hr><pre style="white-space:pre-wrap;font-family:inherit;">${escapeHtml(message)}</pre>`;

  try {
    await transporter.sendMail({
      from: `"Lex Ladder Website" <${smtpFrom}>`,
      to: contactTo,
      replyTo: email,
      subject: `Website enquiry from ${name}`,
      text: textBody,
      html: htmlBody
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error("Contact mail error:", err.message);
    return res.status(502).json({
      ok: false,
      error: "Could not send your message. Please try again later or use WhatsApp."
    });
  }
});

app.use(express.static(PUBLIC_DIR, { index: ["index.html"] }));

app.use((req, res) => {
  if (req.path.startsWith("/api/")) {
    return res.status(404).json({ ok: false, error: "Not found." });
  }
  return res.status(404).type("html").send("<!DOCTYPE html><html lang=\"en\"><head><meta charset=\"UTF-8\"><title>Not found</title></head><body><h1>404</h1><p>Page not found.</p><a href=\"/\">Home</a></body></html>");
});

app.listen(PORT, () => {
  console.log(`Lex Ladder server at http://localhost:${PORT}`);
});
