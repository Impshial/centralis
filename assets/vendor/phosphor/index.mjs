const PHOSPHOR_TAG_PATTERN = /^ph-[a-z0-9]+(?:-[a-z0-9]+)*$/;
const loadingTags = new Set();

function toIconModuleName(tagName) {
  return tagName
    .slice(3)
    .split("-")
    .map((part) => part ? part[0].toUpperCase() + part.slice(1) : "")
    .join("");
}

function isPhosphorElement(element) {
  return element?.localName && PHOSPHOR_TAG_PATTERN.test(element.localName);
}

async function definePhosphorElement(tagName) {
  if (customElements.get(tagName) || loadingTags.has(tagName)) {
    return;
  }

  loadingTags.add(tagName);
  try {
    await import(`./icons/Ph${toIconModuleName(tagName)}.mjs`);
  } catch (error) {
    console.warn(`Could not load Phosphor icon ${tagName}.`, error);
  } finally {
    loadingTags.delete(tagName);
  }
}

function queuePhosphorElements(root = document) {
  if (!root?.querySelectorAll) {
    return;
  }

  const tags = new Set();
  if (isPhosphorElement(root)) {
    tags.add(root.localName);
  }

  root.querySelectorAll("*").forEach((element) => {
    if (isPhosphorElement(element)) {
      tags.add(element.localName);
    }
  });

  tags.forEach((tagName) => {
    definePhosphorElement(tagName);
  });
}

queuePhosphorElements();

const observer = new MutationObserver((mutations) => {
  mutations.forEach((mutation) => {
    mutation.addedNodes.forEach((node) => {
      if (node.nodeType === Node.ELEMENT_NODE) {
        queuePhosphorElements(node);
      }
    });
  });
});

observer.observe(document.documentElement, {
  childList: true,
  subtree: true
});
