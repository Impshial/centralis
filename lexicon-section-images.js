// Reader-only illustrations derived from article references in a section.
// Keep them separate from saved prose and its text-selection anchors.
export function renderSectionImages(root, model, article, choices) {
  if (!root) return;
  root.querySelectorAll('.lexicon-section-image').forEach(el => el.remove());
  root.querySelectorAll('.lexicon-illustrated-section,.lexicon-image-section-heading').forEach(el => {
    el.classList.remove('lexicon-illustrated-section', 'lexicon-image-section-heading');
  });
  const imageKey = src => new URL(src, location.href).href;
  // Existing article illustrations and the Article Details image take priority.
  const usedImages = new Set([...(root.closest('.lexicon-reader') || root).querySelectorAll('img[src]')].map(img => imageKey(img.getAttribute('src'))));
  const usedElements = new Set();
  const scopes = [];
  function proseScopes(prose) {
    const nodes = [...prose.children];
    const headings = nodes.filter(el => /^H[1-6]$/.test(el.tagName));
    const level = Math.min(...headings.map(el => Number(el.tagName[1])));
    const boundaries = headings.filter(el => Number(el.tagName[1]) === level);
    let group = { host: prose, key: prose.dataset.prose, nodes: [], boundaries };
    scopes.push(group);
    for (const node of nodes) {
      if (boundaries.includes(node)) {
        group = { host: prose, key: node.id, heading: node, nodes: [], boundaries };
        scopes.push(group);
      }
      group.nodes.push(node);
    }
  }
  for (const child of root.children) {
    if (child.matches('[data-prose]')) proseScopes(child);
    else if (child.tagName === 'SECTION') {
      const body = child.querySelector(':scope > [data-prose]');
      if (child.querySelector(':scope > #article-body') && body) proseScopes(body);
      else scopes.push({ host: child, key: child.dataset.sectionId || 'details', heading: child.querySelector(':scope > h2'), nodes: [...child.children], boundaries: [] });
    }
  }
  // Empty introduction placeholders must not count as the first article section.
  const sections = scopes.filter(scope => scope.nodes.some(node => node.textContent.trim() || node.querySelector('img')));
  for (const scope of sections.slice(1)) {
    const candidates = new Map();
    for (const node of scope.nodes) for (const link of node.querySelectorAll('a[href],[data-article-mention]')) {
      if (link.closest('figure')) continue;
      const href = new URL(link.getAttribute('href') || '', location.href);
      const id = link.dataset.articleMention || link.dataset.articleId || (href.origin === location.origin && href.pathname.endsWith('/lexicon-wiki.html') && href.searchParams.get('wiki') === model.wiki.id ? href.searchParams.get('article') || model.wiki.universe_id : null);
      const target = model.articles.get(id);
      if (target && target.id !== article.id && !target.hidden && target.image && !usedElements.has(target.id) && !usedImages.has(imageKey(target.image))) candidates.set(target.id, target);
    }
    if (!candidates.size) continue;
    const key = JSON.stringify([article.id, scope.key]);
    let target = candidates.get(choices.get(key));
    if (!target) {
      target = [...candidates.values()][Math.floor(Math.random() * candidates.size)];
      choices.set(key, target.id);
    }
    usedElements.add(target.id);
    usedImages.add(imageKey(target.image));
    const figure = document.createElement('figure');
    figure.className = 'lexicon-section-image';
    figure.dataset.linkedElement = target.id;
    const img = document.createElement('img');
    img.src = target.image;
    img.alt = target.title;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => figure.remove(), { once: true });
    const caption = document.createElement('figcaption');
    caption.textContent = target.title;
    figure.append(img, caption);
    scope.host.classList.add('lexicon-illustrated-section');
    scope.boundaries.forEach(heading => heading.classList.add('lexicon-image-section-heading'));
    if (scope.heading) scope.heading.after(figure);
    else scope.host.prepend(figure);
  }
}
