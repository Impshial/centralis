(() => {
  const grid = document.querySelector('[data-lexicon-grid]');
  if (!grid) return;
  const search = document.querySelector('[data-lexicon-search]');
  const status = document.querySelector('[data-lexicon-status]');
  const create = document.querySelector('[data-lexicon-create]');
  const dialog = document.querySelector('[data-lexicon-create-dialog]');
  const form = dialog.querySelector('form');
  const message = dialog.querySelector('[role="status"]');
  const field = name => form.elements.namedItem(name);
  let store, wikis = [], universes = [];
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
  function render() {
    const query = search.value.trim().toLowerCase();
    const shown = wikis.filter(w => `${w.name} ${w.universe?.description || ''}`.toLowerCase().includes(query));
    status.textContent = `${shown.length} ${shown.length === 1 ? 'wiki' : 'wikis'}`;
    grid.innerHTML = shown.map(w => `<article class="universe-card-wrap" data-lexicon-wiki>
      <a class="universe-card" href="lexicon-wiki.html?wiki=${encodeURIComponent(w.id)}">
        <span class="card-icon" aria-hidden="true"><ph-book-open weight="duotone"></ph-book-open></span>
        <span class="universe-card-copy"><strong>${escape(w.name)}</strong>
          <span class="universe-card-description-short">${escape(w.universe?.description || (w.kind === 'standalone' ? 'Standalone wiki' : 'Source universe unavailable'))}</span>
          <span class="universe-card-description-long">${escape(w.universe?.description || (w.kind === 'standalone' ? 'Standalone wiki' : 'Source universe unavailable'))}</span>
        </span>
      </a></article>`).join('') || `<p class="empty-state">${query ? 'No matching wikis.' : 'No wikis yet.'}</p>`;
  }
  search.addEventListener('input', render);
  const views = document.querySelectorAll('[data-lexicon-view]');
  views.forEach(button => button.addEventListener('click', () => {
    const list = button.dataset.lexiconView === 'list';
    grid.classList.toggle('is-list-view', list); grid.classList.toggle('is-card-view', !list);
    views.forEach(v => v.setAttribute('aria-pressed', String(v === button)));
  }));
  function setKind() {
    const fromUniverse = field('kind').value === 'universe';
    document.querySelector('[data-lexicon-universe-field]').hidden = !fromUniverse;
    field('universe_id').required = fromUniverse;
    field('name').value = fromUniverse ? universes.find(u => u.id === field('universe_id').value)?.name || '' : '';
  }
  field('kind').addEventListener('change', setKind);
  field('universe_id').addEventListener('change', setKind);
  create.addEventListener('click', async () => {
    form.reset(); form.dataset.requestId = crypto.randomUUID(); message.textContent = 'Loading universes...';
    dialog.showModal(); form.querySelector('[type="submit"]').disabled = true;
    try {
      universes = await store.universes();
      field('universe_id').innerHTML = '<option value="">Select a universe</option>' + universes.map(u => `<option value="${escape(u.id)}">${escape(u.name)}</option>`).join('');
      message.textContent = universes.length ? '' : 'No universes available. You can create an empty wiki.';
      setKind();
    } catch (error) { message.textContent = error.message; }
    finally { form.querySelector('[type="submit"]').disabled = false; }
  });
  dialog.querySelector('[data-lexicon-cancel]').addEventListener('click', () => dialog.close());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (!field('name').value.trim()) { message.textContent = 'Enter a wiki name.'; return; }
    const button = form.querySelector('[type="submit"]'); button.disabled = true; message.textContent = 'Creating wiki...';
    try {
      const wiki = await store.createWiki({ id: form.dataset.requestId, kind: field('kind').value, name: field('name').value.trim(), universe_id: field('kind').value === 'universe' ? field('universe_id').value : null });
      location.href = `lexicon-wiki.html?wiki=${encodeURIComponent(wiki.id)}${wiki.kind === 'standalone' ? '&edit=1' : ''}`;
    } catch (error) { message.textContent = error.message; button.disabled = false; }
  });
  (async () => {
    try {
      const user = await window.centralisGetCurrentAppUser?.();
      if (!user || !window.centralisSupabase) throw new Error('Sign in to load wikis.');
      store = new LexiconData.Store(window.centralisSupabase, user);
      wikis = await store.home(); render(); create.disabled = false;
    } catch (error) { status.textContent = error.message; grid.innerHTML = ''; }
  })();
})();
