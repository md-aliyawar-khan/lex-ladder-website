# Lex Ladder – website + backend

Static pages live in `public/`. The Node server in `server/` serves those files and provides:

- `POST /api/contact` — sends contact form messages to your email (SMTP)
- `GET /api/site` — reads `server/data/site.json` for a live announcement banner (refreshes about every minute in the browser)
- `GET /api/health` — uptime check for hosting

## Quick start (local)

1. Install dependencies:

   ```bash
   cd server
   npm install
   ```

2. Copy `server/.env.example` to `server/.env` and fill in SMTP details (see below).

3. Edit `public/site-config.js`: set `whatsappPhone` to your full international number, digits only (example for India: `919876543210`).

4. Start the server from the `server` folder:

   ```bash
   npm start
   ```

5. Open **http://localhost:3000** (use this URL, not “Live Server” on another port, so the contact form can reach `/api/contact`).

## Email (SMTP)

The contact form does not send mail by itself; the server does, using Nodemailer.

Set in `server/.env`:

| Variable | Purpose |
|----------|---------|
| `CONTACT_TO` | Inbox that receives enquiries |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE` | Your provider’s SMTP settings |
| `SMTP_USER`, `SMTP_PASS` | SMTP login (use an app password for Gmail) |
| `SMTP_FROM` | From address allowed by your provider |

Examples: Gmail (App Password), Microsoft 365, Zoho Mail, your web host’s SMTP, or transactional providers that expose SMTP.

## WhatsApp

- Configure `whatsappPhone` in `public/site-config.js`.
- Header buttons, the contact page block, and the floating button use `https://wa.me/...` — no backend required for WhatsApp itself.

## “Real-time” updates

This is not a full CMS. For quick site-wide notices without redeploying HTML:

1. Edit `server/data/site.json`.
2. Set `"announcement"` to your text (or `""` to hide).
3. Optional: `"announcementType"` — `info`, `success`, or `warn` (controls styling).

Visitors who already have the site open will see changes within about a minute, or immediately on refresh.

## Domain and production hosting

1. **Single server (simplest)**  
   Deploy the whole project (or at least `public/` + `server/`) to a VPS, Railway, Render, Fly.io, etc.  
   Point your domain’s **A/AAAA** or **CNAME** to that host.  
   Run `npm start` (or use PM2 / the host’s process manager).  
   Set `NODE_ENV=production` and all `.env` variables on the host.

2. **HTTPS**  
   Use your host’s TLS (often automatic) or a reverse proxy (Caddy, Nginx) with Let’s Encrypt.

3. **Frontend and API on different URLs**  
   Set `apiBase` in `public/site-config.js` to your API origin (e.g. `https://api.yourdomain.com`).  
   On the server, set `CORS_ORIGIN` to your **website** origin (e.g. `https://www.yourdomain.com`).

## Project layout

```
public/           # HTML, CSS, client JS (served as static files)
  site-config.js  # WhatsApp number + optional API base URL
server/
  index.js        # Express app
  data/site.json  # Optional announcement text
  .env            # Secrets (create from .env.example; never commit)
```

The old copies of HTML/CSS/JS at the repository root can be removed; the live site is served from `public/`.
