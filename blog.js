(function () {
  var MAX_GUEST_IMAGE_BYTES = 2 * 1024 * 1024;
  var ALLOWED_IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

  function apiUrl(path) {
    const base = (window.SITE_CONFIG && window.SITE_CONFIG.apiBase) || "";
    return (base ? base.replace(/\/$/, "") : "") + path;
  }

  function formatDate(iso) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric"
      });
    } catch (_) {
      return iso;
    }
  }

  function setFormStatus(el, type, message) {
    if (!el) return;
    el.textContent = message || "";
    if (!message) {
      el.className = "form-status";
      return;
    }
    el.className = "form-status is-visible form-status--" + type;
  }

  function readImageAsDataUrl(file) {
    return new Promise(function (resolve, reject) {
      if (!file) {
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = function () {
        resolve(typeof reader.result === "string" ? reader.result : null);
      };
      reader.onerror = function () {
        reject(new Error("Could not read the selected image."));
      };
      reader.readAsDataURL(file);
    });
  }

  function createImageElement(post, className) {
    if (!post || !post.imageDataUrl) return null;
    const img = document.createElement("img");
    img.className = className;
    img.src = post.imageDataUrl;
    img.alt = post.imageAlt || post.title || "Blog article image";
    img.loading = "lazy";
    img.decoding = "async";
    return img;
  }

  const postsEl = document.getElementById("blog-posts");
  const emptyEl = document.getElementById("blog-empty");
  const loadErrEl = document.getElementById("blog-load-err");

  function renderPosts(posts) {
    if (!postsEl || !emptyEl) return;
    postsEl.innerHTML = "";
    if (!posts || !posts.length) {
      emptyEl.hidden = false;
      return;
    }
    emptyEl.hidden = true;
    posts.forEach(function (p) {
      const art = document.createElement("article");
      art.className = "blog-post";

      const image = createImageElement(p, "blog-post__image");
      if (image) art.appendChild(image);

      const h = document.createElement("h3");
      h.className = "blog-post__title";
      h.textContent = p.title || "";

      const meta = document.createElement("p");
      meta.className = "blog-post__meta";
      meta.textContent =
        (p.author || "Author") + (p.createdAt ? " · " + formatDate(p.createdAt) : "");

      const body = document.createElement("div");
      body.className = "blog-post__body";
      body.textContent = p.content || "";

      art.appendChild(h);
      art.appendChild(meta);
      art.appendChild(body);
      postsEl.appendChild(art);
    });
  }

  function loadPosts() {
    if (loadErrEl) {
      loadErrEl.hidden = true;
      loadErrEl.textContent = "";
    }
    fetch(apiUrl("/api/blog"), { cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.data || !result.data.ok) {
          if (loadErrEl) {
            loadErrEl.textContent = "Could not load articles. Try refreshing the page.";
            loadErrEl.hidden = false;
          }
          return;
        }
        renderPosts(result.data.posts);
      })
      .catch(function () {
        if (loadErrEl) {
          loadErrEl.textContent = "Could not load articles. Check your connection.";
          loadErrEl.hidden = false;
        }
      });
  }

  const guestForm = document.getElementById("blog-guest-form");
  const guestStatus = document.getElementById("blog-guest-status");

  if (guestForm) {
    guestForm.addEventListener("submit", async function (e) {
      e.preventDefault();
      setFormStatus(guestStatus, "ok", "");

      if (!guestForm.reportValidity()) {
        return;
      }

      const title = ((guestForm.elements.namedItem("title") && guestForm.elements.namedItem("title").value) || "").trim();
      const author = ((guestForm.elements.namedItem("author") && guestForm.elements.namedItem("author").value) || "").trim();
      const email = ((guestForm.elements.namedItem("email") && guestForm.elements.namedItem("email").value) || "").trim();
      const content =
        ((guestForm.elements.namedItem("content") && guestForm.elements.namedItem("content").value) || "").trim();
      const imageInput = guestForm.elements.namedItem("image");
      const imageFile = imageInput && imageInput.files ? imageInput.files[0] : null;
      const btn = guestForm.querySelector('button[type="submit"]');

      if (!title) {
        setFormStatus(guestStatus, "err", "Please enter an article title.");
        return;
      }
      if (!author) {
        setFormStatus(guestStatus, "err", "Please enter your name.");
        return;
      }
      if (!email) {
        setFormStatus(guestStatus, "err", "Please enter your email address.");
        return;
      }
      if (!content || content.length < 40) {
        setFormStatus(guestStatus, "err", "Please enter at least a few sentences for the article.");
        return;
      }

      if (imageFile) {
        if (ALLOWED_IMAGE_TYPES.indexOf(imageFile.type) === -1) {
          setFormStatus(guestStatus, "err", "Please attach a PNG, JPG, WEBP, or GIF image.");
          return;
        }
        if (imageFile.size > MAX_GUEST_IMAGE_BYTES) {
          setFormStatus(guestStatus, "err", "Image must be 2 MB or smaller.");
          return;
        }
      }

      if (btn) btn.disabled = true;

      try {
        const imageDataUrl = imageFile ? await readImageAsDataUrl(imageFile) : "";

        const response = await fetch(apiUrl("/api/blog/submit"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title,
            author: author,
            email: email,
            content: content,
            imageName: imageFile ? imageFile.name : "",
            imageType: imageFile ? imageFile.type : "",
            imageDataUrl: imageDataUrl || ""
          })
        });

        const data = await response.json();
        const result = { ok: response.ok, data: data };

        if (result.ok && result.data && result.data.ok) {
          setFormStatus(guestStatus, "ok", result.data.message || "Thank you. Your submission was received.");
          guestForm.reset();
        } else {
          const err = (result.data && result.data.error) || "Submission failed. Please try again.";
          setFormStatus(guestStatus, "err", err);
        }
      } catch (_error) {
        setFormStatus(guestStatus, "err", "Could not reach the server. Try again later.");
      } finally {
        if (btn) btn.disabled = false;
      }
    });
  }

  const tokenInput = document.getElementById("blog-team-token");
  const publishForm = document.getElementById("blog-publish-form");
  const publishStatus = document.getElementById("blog-publish-status");
  const pendingList = document.getElementById("blog-pending-list");
  const pendingStatus = document.getElementById("blog-pending-status");
  const loadPendingBtn = document.getElementById("blog-load-pending");

  function teamHeaders() {
    const t = tokenInput && tokenInput.value ? tokenInput.value.trim() : "";
    return {
      "Content-Type": "application/json",
      Authorization: "Bearer " + t
    };
  }

  if (publishForm) {
    publishForm.addEventListener("submit", function (e) {
      e.preventDefault();
      setFormStatus(publishStatus, "ok", "");

      if (!publishForm.reportValidity()) {
        return;
      }

      const title = ((publishForm.elements.namedItem("title") && publishForm.elements.namedItem("title").value) || "").trim();
      const author = ((publishForm.elements.namedItem("author") && publishForm.elements.namedItem("author").value) || "").trim();
      const content =
        ((publishForm.elements.namedItem("content") && publishForm.elements.namedItem("content").value) || "").trim();
      const btn = publishForm.querySelector('button[type="submit"]');

      if (!title || !author || !content) {
        setFormStatus(publishStatus, "err", "Please complete all publication fields.");
        return;
      }

      if (btn) btn.disabled = true;

      fetch(apiUrl("/api/blog/publish"), {
        method: "POST",
        headers: teamHeaders(),
        body: JSON.stringify({
          title: title,
          author: author,
          content: content
        })
      })
        .then(function (r) {
          return r.json().then(function (data) {
            return { ok: r.ok, data: data };
          });
        })
        .then(function (result) {
          if (result.ok && result.data && result.data.ok) {
            setFormStatus(publishStatus, "ok", "Published. It should appear in the list above after refresh.");
            publishForm.reset();
            loadPosts();
          } else {
            const err = (result.data && result.data.error) || "Could not publish.";
            setFormStatus(publishStatus, "err", err);
          }
        })
        .catch(function () {
          setFormStatus(publishStatus, "err", "Could not reach the server.");
        })
        .finally(function () {
          if (btn) btn.disabled = false;
        });
    });
  }

  function renderPending(posts) {
    if (!pendingList) return;
    pendingList.innerHTML = "";
    if (!posts || !posts.length) {
      const p = document.createElement("p");
      p.className = "blog-pending-empty";
      p.textContent = "No pending submissions.";
      pendingList.appendChild(p);
      return;
    }
    posts.forEach(function (item) {
      const card = document.createElement("div");
      card.className = "blog-pending-card";

      const head = document.createElement("p");
      head.className = "blog-pending-card__head";
      head.textContent =
        (item.title || "(no title)") +
        " — " +
        (item.author || "?") +
        (item.createdAt ? " · " + formatDate(item.createdAt) : "");

      card.appendChild(head);

      if (item.submitterEmail) {
        const em = document.createElement("p");
        em.className = "blog-pending-card__email";
        em.textContent = "Email: " + item.submitterEmail;
        card.appendChild(em);
      }

      const image = createImageElement(item, "blog-pending-card__image");
      if (image) {
        card.appendChild(image);
        if (item.imageName) {
          const imageMeta = document.createElement("p");
          imageMeta.className = "blog-pending-card__email";
          imageMeta.textContent = "Image: " + item.imageName;
          card.appendChild(imageMeta);
        }
      }

      const details = document.createElement("details");
      const sum = document.createElement("summary");
      sum.textContent = "Show article text";
      const pre = document.createElement("pre");
      pre.className = "blog-pending-card__pre";
      pre.textContent = item.content || "";
      details.appendChild(sum);
      details.appendChild(pre);

      const actions = document.createElement("div");
      actions.className = "blog-pending-card__actions";

      const approveBtn = document.createElement("button");
      approveBtn.type = "button";
      approveBtn.className = "btn blog-pending-approve";
      approveBtn.textContent = "Approve & publish";
      approveBtn.dataset.id = item.id;

      const rejectBtn = document.createElement("button");
      rejectBtn.type = "button";
      rejectBtn.className = "blog-pending-reject";
      rejectBtn.textContent = "Reject";
      rejectBtn.dataset.id = item.id;

      actions.appendChild(approveBtn);
      actions.appendChild(rejectBtn);

      card.appendChild(details);
      card.appendChild(actions);
      pendingList.appendChild(card);
    });
  }

  function fetchPending() {
    setFormStatus(pendingStatus, "ok", "");
    fetch(apiUrl("/api/blog/pending"), { headers: teamHeaders(), cache: "no-store" })
      .then(function (r) {
        return r.json().then(function (data) {
          return { ok: r.ok, data: data };
        });
      })
      .then(function (result) {
        if (!result.ok || !result.data || !result.data.ok) {
          const err = (result.data && result.data.error) || "Could not load pending list.";
          setFormStatus(pendingStatus, "err", err);
          renderPending([]);
          return;
        }
        renderPending(result.data.posts);
      })
      .catch(function () {
        setFormStatus(pendingStatus, "err", "Could not reach the server.");
      });
  }

  if (loadPendingBtn) {
    loadPendingBtn.addEventListener("click", function () {
      fetchPending();
    });
  }

  if (pendingList) {
    pendingList.addEventListener("click", function (e) {
      const t = e.target;
      if (!(t instanceof HTMLElement)) return;
      const id = t.dataset.id;
      if (!id) return;
      if (t.classList.contains("blog-pending-approve")) {
        fetch(apiUrl("/api/blog/approve"), {
          method: "POST",
          headers: teamHeaders(),
          body: JSON.stringify({ id: id })
        })
          .then(function (r) {
            return r.json().then(function (data) {
              return { ok: r.ok, data: data };
            });
          })
          .then(function (result) {
            if (result.ok && result.data && result.data.ok) {
              setFormStatus(pendingStatus, "ok", "Published.");
              loadPosts();
              fetchPending();
            } else {
              setFormStatus(pendingStatus, "err", (result.data && result.data.error) || "Approve failed.");
            }
          })
          .catch(function () {
            setFormStatus(pendingStatus, "err", "Network error.");
          });
      }
      if (t.classList.contains("blog-pending-reject")) {
        if (!window.confirm("Reject and permanently delete this submission?")) return;
        fetch(apiUrl("/api/blog/reject"), {
          method: "POST",
          headers: teamHeaders(),
          body: JSON.stringify({ id: id })
        })
          .then(function (r) {
            return r.json().then(function (data) {
              return { ok: r.ok, data: data };
            });
          })
          .then(function (result) {
            if (result.ok && result.data && result.data.ok) {
              setFormStatus(pendingStatus, "ok", "Rejected.");
              fetchPending();
            } else {
              setFormStatus(pendingStatus, "err", (result.data && result.data.error) || "Reject failed.");
            }
          })
          .catch(function () {
            setFormStatus(pendingStatus, "err", "Network error.");
          });
      }
    });
  }

  loadPosts();
})();