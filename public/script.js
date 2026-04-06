// ================= SITE CONFIG HELPERS =================
function whatsappHref() {
  const c = window.SITE_CONFIG || {};
  const phone = String(c.whatsappPhone || "").replace(/\D/g, "");
  if (!phone) return "#";
  const text = encodeURIComponent(c.whatsappDefaultMessage || "");
  return "https://wa.me/" + phone + (text ? "?text=" + text : "");
}

function apiUrl(path) {
  const base = (window.SITE_CONFIG && window.SITE_CONFIG.apiBase) || "";
  return (base ? base.replace(/\/$/, "") : "") + path;
}

function initWhatsAppLinks() {
  const href = whatsappHref();
  document.querySelectorAll("[data-whatsapp-link]").forEach(function (a) {
    a.href = href;
    if (href === "#") {
      a.addEventListener("click", function (e) {
        e.preventDefault();
        alert("WhatsApp number is not configured yet. Edit public/site-config.js.");
      });
    }
  });

  const phone = String((window.SITE_CONFIG || {}).whatsappPhone || "").replace(/\D/g, "");
  if (!phone || document.querySelector(".whatsapp-float")) return;

  const float = document.createElement("a");
  float.className = "whatsapp-float";
  float.href = whatsappHref();
  float.target = "_blank";
  float.rel = "noopener noreferrer";
  float.setAttribute("aria-label", "Chat on WhatsApp");
  float.innerHTML =
    '<svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="#fff" aria-hidden="true"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.435 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>';
  document.body.appendChild(float);
}

// ================= LIVE ANNOUNCEMENTS (from /api/site) =================
let lastAnnouncementText = "";
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function refreshSiteAnnouncement() {
  fetch(apiUrl("/api/site"), { cache: "no-store" })
    .then(function (r) {
      if (!r.ok) return null;
      return r.json();
    })
    .then(function (data) {
      if (!data || typeof data !== "object") return;
      const ann = typeof data.announcement === "string" ? data.announcement.trim() : "";
      const elId = "site-announcement";

      if (!ann) {
        lastAnnouncementText = "";
        const el = document.getElementById(elId);
        if (el) el.remove();
        return;
      }

      if (ann === lastAnnouncementText) return;
      lastAnnouncementText = ann;

      let el = document.getElementById(elId);
      if (!el) {
        el = document.createElement("div");
        el.id = elId;
        el.setAttribute("role", "status");
        document.body.insertBefore(el, document.body.firstChild);
      }
      el.className =
        "site-announcement site-announcement--" + (data.announcementType || "info");
      el.textContent = ann;
    })
    .catch(function () {});
}

// ================= DISCLAIMER GATE (before site use) =================
(function () {
  const STORAGE_KEY = "lexLadderDisclaimerAccepted";

  if (localStorage.getItem(STORAGE_KEY) === "1") {
    return;
  }

  document.body.classList.add("human-gate-active");

  const gate = document.createElement("div");
  gate.id = "human-gate";
  gate.className = "human-gate";
  gate.setAttribute("role", "dialog");
  gate.setAttribute("aria-modal", "true");
  gate.setAttribute("aria-labelledby", "human-gate-title");

  gate.innerHTML =
    '<div class="human-gate__card human-gate__card--disclaimer">' +
    '<p class="human-gate__eyebrow">Disclaimer & Confirmation</p>' +
    '<h2 id="human-gate-title">Before You Continue</h2>' +
    "<p>As per the rules of the Bar Council of India, we are not permitted to solicit work or advertise. By clicking the I AGREE button below, you acknowledge the following:</p>" +
    '<ul class="human-gate__list">' +
    "<li>there has been no advertisement, personal communication, solicitation, invitation or inducement of any sort whatsoever from us or any of our members to solicit any work through this website;</li>" +
    "<li>you wish to gain more information about us for your own information and use;</li>" +
    "<li>the information about us is provided to you on your specific request and any information obtained or materials downloaded from this website is completely at your own volition and any transmission, receipt or use of this site does not create any lawyer-client relationship; and</li>" +
    "<li>we are not liable for any consequence of any action taken by you relying on the material or information provided on this website.</li>" +
    "</ul>" +
    "<p>If you have any legal issues, you must seek independent legal advice.</p>" +
    "<p>We use cookies to enhance your experience. By continuing to visit this website you agree to our use of cookies.</p>" +
    '<div class="human-gate__actions">' +
    '<button type="button" class="btn human-gate__continue" id="human-gate-submit">AGREE</button>' +
    '<button type="button" class="human-gate__decline" id="human-gate-decline">DISAGREE</button>' +
    "</div>" +
    "</div>";

  document.body.appendChild(gate);

  const submitBtn = gate.querySelector("#human-gate-submit");
  const declineBtn = gate.querySelector("#human-gate-decline");
  submitBtn.focus();

  submitBtn.addEventListener("click", function () {
    localStorage.setItem(STORAGE_KEY, "1");
    gate.remove();
    document.body.classList.remove("human-gate-active");
  });

  declineBtn.addEventListener("click", function () {
    window.location.replace("https://www.google.com/");
  });
})();

// ================= SCROLL ANIMATION =================
if (!prefersReducedMotion && "IntersectionObserver" in window) {
  const observer = new IntersectionObserver(
    function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add("show");
        }
      });
    },
    { threshold: 0.2 }
  );

  document.querySelectorAll(".feature, .page, section:not(.hero)").forEach(function (el) {
    el.classList.add("hidden");
    observer.observe(el);
  });
}

// ================= NAV SMOOTH SCROLL =================
document.querySelectorAll("a[href^='#']").forEach(function (link) {
  if (link.hasAttribute("data-whatsapp-link")) return;
  link.addEventListener("click", function (e) {
    const href = this.getAttribute("href");
    if (!href || href.length < 2) return;
    e.preventDefault();
    const target = document.querySelector(href);
    if (target) {
      target.scrollIntoView({ behavior: prefersReducedMotion ? "auto" : "smooth" });
    }
  });
});

// ================= BUTTON RIPPLE EFFECT =================
document.querySelectorAll(".btn").forEach(function (btn) {
  btn.addEventListener("click", function () {
    if (prefersReducedMotion) return;
    const ripple = document.createElement("span");
    ripple.classList.add("ripple");
    this.appendChild(ripple);
    setTimeout(function () {
      ripple.remove();
    }, 500);
  });
});

// ================= CONTACT FORM → BACKEND =================
(function () {
  const form = document.getElementById("contact-form");
  if (!form) return;

  const statusEl = document.getElementById("form-status");
  const submitBtn = form.querySelector('button[type="submit"]');

  function setStatus(type, message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = "form-status is-visible form-status--" + type;
  }

  function clearStatus() {
    if (!statusEl) return;
    statusEl.textContent = "";
    statusEl.className = "form-status";
  }

  form.addEventListener("submit", function (e) {
    e.preventDefault();
    clearStatus();

    if (!form.reportValidity()) {
      return;
    }

    const name = ((form.elements.namedItem("name") && form.elements.namedItem("name").value) || "").trim();
    const email = ((form.elements.namedItem("email") && form.elements.namedItem("email").value) || "").trim();
    const message =
      ((form.elements.namedItem("message") && form.elements.namedItem("message").value) || "").trim();

    if (!name || !email || !message) {
      setStatus("err", "Please complete all required contact fields.");
      return;
    }

    submitBtn.disabled = true;

    fetch(apiUrl("/api/contact"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name,
        email: email,
        message: message
      })
    })
      .then(function (r) {
        return r.text().then(function (text) {
          let data = {};
          try {
            data = text ? JSON.parse(text) : {};
          } catch (_) {}
          return { ok: r.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok && result.data && result.data.ok) {
          setStatus("ok", "Thank you. Your message was sent. We will get back to you soon.");
          form.reset();
        } else {
          const err =
            (result.data && result.data.error) ||
            "Something went wrong. Please try WhatsApp or email us directly.";
          setStatus("err", err);
        }
      })
      .catch(function () {
        setStatus(
          "err",
          "Could not reach the server. Check your connection or use WhatsApp to contact us."
        );
      })
      .finally(function () {
        submitBtn.disabled = false;
      });
  });
})();

// ================= INIT (WhatsApp + live content) =================
initWhatsAppLinks();
refreshSiteAnnouncement();
setInterval(refreshSiteAnnouncement, 60000);
