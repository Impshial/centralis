(function initUsefulThings() {
  const usefulThingsSupabase = window.centralisSupabase;

  const els = {
    tabs: Array.from(document.querySelectorAll("[data-useful-tab]")),
    panels: Array.from(document.querySelectorAll("[data-useful-panel]")),
    modeSelect: document.querySelector("[data-text-converter-mode]"),
    richWrap: document.querySelector("[data-rich-input-wrap]"),
    richEditor: document.querySelector("[data-text-rich-editor]"),
    rawInput: document.querySelector("[data-text-raw-input]"),
    output: document.querySelector("[data-text-output]"),
    status: document.querySelector("[data-text-converter-status]"),
    conversionButtons: Array.from(document.querySelectorAll("[data-convert-target]")),
    richCommandButtons: Array.from(document.querySelectorAll("[data-rich-command]")),
    richBlockButtons: Array.from(document.querySelectorAll("[data-rich-block]")),
    richHeading: document.querySelector("[data-rich-heading]"),
    richLinkButton: document.querySelector("[data-rich-link]"),
    richInlineCodeButton: document.querySelector("[data-rich-inline-code]"),
  };

  if (!els.modeSelect || !els.richEditor || !els.rawInput || !els.output) {
    return;
  }

  let isConverting = false;

  function setStatus(message, type = "") {
    if (!els.status) return;
    els.status.textContent = message || "";
    els.status.classList.toggle("is-error", type === "error");
    els.status.classList.toggle("is-success", type === "success");
  }

  function setConverting(nextValue) {
    isConverting = nextValue;
    els.conversionButtons.forEach((button) => {
      button.disabled = nextValue;
    });
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function sanitizeRichHtml(html) {
    const template = document.createElement("template");
    template.innerHTML = html || "";
    const blockedSelector = [
      "script",
      "style",
      "noscript",
      "template",
      "iframe",
      "object",
      "embed",
      "svg",
      "canvas",
      "form",
      "input",
      "button",
      "select",
      "textarea",
    ].join(",");

    template.content.querySelectorAll(blockedSelector).forEach((node) => node.remove());
    template.content.querySelectorAll("*").forEach((node) => {
      Array.from(node.attributes).forEach((attribute) => {
        const name = attribute.name.toLowerCase();
        const value = attribute.value || "";

        if (name.startsWith("on")) {
          node.removeAttribute(attribute.name);
          return;
        }

        if (name === "href" && node.tagName.toLowerCase() === "a") {
          const cleanValue = value.trim();
          if (/^(https?:|mailto:|#)/i.test(cleanValue)) {
            node.setAttribute("href", cleanValue);
            node.setAttribute("rel", "noopener noreferrer");
          } else {
            node.removeAttribute(attribute.name);
          }
          return;
        }

        if (name === "style") {
          const match = value.match(/text-align\s*:\s*(left|right|center|justify)/i);
          if (match) {
            node.setAttribute("style", `text-align: ${match[1].toLowerCase()};`);
          } else {
            node.removeAttribute(attribute.name);
          }
          return;
        }

        node.removeAttribute(attribute.name);
      });
    });

    return template.innerHTML.trim();
  }

  function getCurrentMode() {
    return els.modeSelect.value === "raw" ? "raw" : "wysiwyg";
  }

  function getRichEditorText() {
    return (els.richEditor.textContent || "").replace(/\s+/g, " ").trim();
  }

  function getConverterInput() {
    if (getCurrentMode() === "raw") {
      return els.rawInput.value.trim();
    }

    const sanitizedHtml = sanitizeRichHtml(els.richEditor.innerHTML);
    return getRichEditorText() ? sanitizedHtml : "";
  }

  function switchInputMode(mode) {
    const nextMode = mode === "raw" ? "raw" : "wysiwyg";
    if (nextMode === "raw" && !els.rawInput.value.trim() && getRichEditorText()) {
      els.rawInput.value = els.richEditor.innerText.trim();
    }

    if (nextMode === "wysiwyg" && !getRichEditorText() && els.rawInput.value.trim()) {
      els.richEditor.textContent = els.rawInput.value;
    }

    els.modeSelect.value = nextMode;
    els.richWrap.hidden = nextMode === "raw";
    els.rawInput.hidden = nextMode !== "raw";
    setStatus("");
  }

  function focusRichEditor() {
    els.richEditor.focus({ preventScroll: true });
  }

  function runRichCommand(command, value = null) {
    focusRichEditor();
    document.execCommand(command, false, value);
  }

  function selectionIsInsideRichEditor() {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return false;
    const anchor = selection.anchorNode;
    return Boolean(anchor && els.richEditor.contains(anchor));
  }

  function insertHtmlAtSelection(html) {
    focusRichEditor();
    document.execCommand("insertHTML", false, html);
  }

  function insertInlineCode() {
    const selection = window.getSelection();
    const selectedText = selectionIsInsideRichEditor() ? selection.toString() : "";
    insertHtmlAtSelection(`<code>${escapeHtml(selectedText || "code")}</code>`);
  }

  function createLink() {
    if (!selectionIsInsideRichEditor()) {
      focusRichEditor();
    }

    const url = window.prompt("Enter the link URL:");
    if (!url) return;
    const cleanUrl = url.trim();
    if (!/^(https?:|mailto:)/i.test(cleanUrl)) {
      setStatus("Links must start with http://, https://, or mailto:.", "error");
      return;
    }

    runRichCommand("createLink", cleanUrl);
  }

  async function getFunctionResponse(name, options = {}) {
    if (!usefulThingsSupabase) {
      throw new Error("Supabase is not initialized.");
    }

    const { data: sessionData, error: sessionError } = await usefulThingsSupabase.auth.getSession();
    if (sessionError || !sessionData.session?.access_token) {
      throw sessionError || new Error("You must be signed in.");
    }

    const config = window.CENTRALIS_SUPABASE_CONFIG;
    if (!config?.url || !config?.publishableKey) {
      throw new Error("Supabase configuration is missing.");
    }

    return fetch(`${config.url}/functions/v1/${name}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sessionData.session.access_token}`,
        apikey: config.publishableKey,
        ...(options.headers || {}),
      },
      body: options.body,
    });
  }

  async function parseFunctionError(response, fallback) {
    try {
      const payload = await response.json();
      return payload?.error || payload?.message || fallback;
    } catch {
      return fallback;
    }
  }

  async function convertText(targetFormat) {
    if (isConverting) return;

    const input = getConverterInput();
    if (!input) {
      setStatus("Add text on the left before converting.", "error");
      return;
    }

    setConverting(true);
    setStatus(`Converting to ${targetFormat.replaceAll("-", " ")}...`);

    try {
      const response = await getFunctionResponse("convert-text-format", {
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inputMode: getCurrentMode(),
          targetFormat,
          input,
        }),
      });

      if (!response.ok) {
        throw new Error(await parseFunctionError(response, "Could not convert text."));
      }

      const payload = await response.json();
      els.output.value = String(payload.output || "").trim();
      setStatus("Conversion complete.", "success");
    } catch (error) {
      console.error(error);
      setStatus(error instanceof Error ? error.message : "Could not convert text.", "error");
    } finally {
      setConverting(false);
    }
  }

  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.dataset.usefulTab;
      els.tabs.forEach((button) => {
        const isActive = button === tab;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-selected", String(isActive));
      });
      els.panels.forEach((panel) => {
        const isActive = panel.dataset.usefulPanel === tabName;
        panel.classList.toggle("is-active", isActive);
        panel.hidden = !isActive;
      });
    });
  });

  els.modeSelect.addEventListener("change", () => {
    switchInputMode(els.modeSelect.value);
  });

  els.richCommandButtons.forEach((button) => {
    button.addEventListener("click", () => {
      runRichCommand(button.dataset.richCommand);
    });
  });

  els.richBlockButtons.forEach((button) => {
    button.addEventListener("click", () => {
      runRichCommand("formatBlock", button.dataset.richBlock);
    });
  });

  if (els.richHeading) {
    els.richHeading.addEventListener("change", () => {
      runRichCommand("formatBlock", els.richHeading.value);
      els.richHeading.value = "P";
    });
  }

  if (els.richLinkButton) {
    els.richLinkButton.addEventListener("click", createLink);
  }

  if (els.richInlineCodeButton) {
    els.richInlineCodeButton.addEventListener("click", insertInlineCode);
  }

  els.conversionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      convertText(button.dataset.convertTarget);
    });
  });

  switchInputMode("wysiwyg");
})();
