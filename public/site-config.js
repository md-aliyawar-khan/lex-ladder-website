/**
 * Public site settings (safe to expose in the browser).
 * Replace whatsappPhone with your full international number, digits only (no + or spaces).
 * Example India: 919876543210
 */
window.SITE_CONFIG = {
  whatsappPhone: "918532803907",
  whatsappDefaultMessage:
    "Hello Lex Ladder, I would like to inquire about legal services.",

  /**
   * Leave empty when the site and API are served from the same domain (recommended).
   * If the frontend is hosted separately, set this to your API base URL, e.g. "https://api.yourdomain.com"
   */
  apiBase: ""
};
