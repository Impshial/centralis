const assert = require('node:assert/strict');
const fs = require('node:fs');
const { setup } = require('./lexicon-browser-harness.cjs');

(async () => {
  const h = await setup(), { page, f, base } = h;
  try {
    const sourceBefore = await f.snapshot();
    await page.goto(base + '/chronicle-editor.html#universe/u1/element/a');
    await page.getByRole('button', { name: 'Generate with AI', exact: true }).waitFor();
    // Hold each real frontend request boundary independently. No paid AI calls.
    await page.evaluate(() => {
      const original = centralisSupabase.functions.invoke;
      window.generationCalls = [];
      window.generationPending = {};
      centralisSupabase.functions.invoke = (name, options) => {
        if (!['sync-universe-ai-source', 'generate-chronicle-details'].includes(name)) return original(name, options);
        generationCalls.push(name);
        return new Promise((resolve, reject) => { generationPending[name] = { resolve, reject }; });
      };
    });
    const modal = page.locator('#chronicle-ai-module-generate-modal');
    const overlay = modal.locator('[data-chronicle-ai-generation-overlay]');
    const form = modal.locator('form');
    const stage = overlay.getByRole('status');
    const generate = modal.locator('[data-chronicle-ai-module-generate-submit]');
    const status = modal.locator('[data-chronicle-ai-module-generate-status]');
    const resolve = (name, data, error = null) => page.evaluate(({ name, data, error }) => generationPending[name].resolve({ data, error }), { name, data, error });
    async function idle() {
      await page.waitForFunction(() => !document.querySelector('[data-chronicle-ai-module-generate-submit]').disabled);
      assert.equal(await form.evaluate(el => el.inert), false);
      assert.equal(await form.getAttribute('aria-busy'), 'false');
      assert.equal(await overlay.isVisible(), false);
      assert.ok(!(await modal.getAttribute('class')).includes('is-generating'));
      assert.equal(await overlay.locator('.chronicle-ai-loading-icon').evaluate(el => getComputedStyle(el).animationName), 'none');
    }
    await page.getByRole('button', { name: 'Generate with AI', exact: true }).click();
    await modal.locator('[data-chronicle-ai-module-instructions]').fill('Keep this direction.');
    await generate.click();
    await stage.getByText('Preparing universe knowledge…', { exact: true }).waitFor();
    assert.equal(await form.evaluate(el => el.inert), true);
    assert.equal(await form.getAttribute('aria-busy'), 'true');
    assert.equal(await generate.isDisabled(), true);
    assert.equal(await overlay.evaluate(el => document.activeElement === el), true);
    assert.equal(await overlay.getByRole('progressbar').getAttribute('aria-valuenow'), null, 'Unknown completion must not be presented as a percentage');
    assert.equal(await stage.getAttribute('aria-live'), 'polite');
    assert.equal(await overlay.locator('.chronicle-ai-loading-icon').evaluate(el => getComputedStyle(el).borderRadius), '50%');
    const animation = await overlay.evaluate(async el => {
      const nodes = [el.querySelector('.chronicle-ai-loading-icon'), el.querySelector('.chronicle-ai-progress-bar > span')];
      const names = nodes.map(n => getComputedStyle(n).animationName);
      const before = nodes.map(n => getComputedStyle(n).transform);
      for (let i = 0; i < 8; i++) await new Promise(requestAnimationFrame);
      return { names, before, after: nodes.map(n => getComputedStyle(n).transform) };
    });
    assert.deepEqual(animation.names, ['chronicle-ai-loading-spin', 'chronicle-ai-progress-sweep']);
    assert.ok(animation.before.every((value, i) => value !== animation.after[i]), 'Both spinner and bar actually animate');
    // Re-submission during a pending request cannot start a second operation.
    await form.dispatchEvent('submit');
    assert.deepEqual(await page.evaluate(() => generationCalls), ['sync-universe-ai-source']);
    await resolve('sync-universe-ai-source', { source: { sync_status: 'ready' } });
    await stage.getByText('Generating suggestions…', { exact: true }).waitFor();
    fs.mkdirSync('node_modules/.cache/chronicle/screenshots', { recursive: true });
    await page.screenshot({ path: 'node_modules/.cache/chronicle/screenshots/generating-details.png' });
    await page.setViewportSize({ width: 390, height: 844 });
    const bar = await overlay.getByRole('progressbar').boundingBox();
    assert.ok(bar.x >= 0 && bar.x + bar.width <= 390);
    await page.screenshot({ path: 'node_modules/.cache/chronicle/screenshots/generating-details-mobile.png' });
    await page.emulateMedia({ reducedMotion: 'reduce' });
    assert.deepEqual(await overlay.evaluate(el => [...el.querySelectorAll('.chronicle-ai-loading-icon,.chronicle-ai-progress-bar > span')].map(n => getComputedStyle(n).animationName)), ['none', 'none']);
    assert.equal(await stage.innerText(), 'Generating suggestions…');
    await resolve('generate-chronicle-details', { proposal: { modules: [{ sectionId: 's1', sectionName: 'Geography', isExisting: true, fields: [{ fieldId: 'f3', label: 'Empty field', fieldType: 'text', value: 'Suggested detail', options: [] }] }] } });
    await page.locator('#chronicle-ai-module-review-modal').waitFor({ state: 'visible' });
    await idle();
    assert.ok(await page.locator('#chronicle-ai-module-review-modal').evaluate(el => el.contains(document.activeElement)));
    assert.equal(await page.locator('[data-chronicle-ai-review-field]').inputValue(), 'Suggested detail');
    assert.equal(await page.locator('[data-chronicle-dirty]').innerText(),'');
    await page.locator('#chronicle-ai-module-review-modal').getByRole('button',{name:'Add to Editor',exact:true}).click();
    assert.equal(await page.locator('[data-chronicle-dirty]').innerText(),'Unsaved changes');
    await page.locator('[name="workspace-field:f3"]').fill('');
    assert.equal(await page.locator('[data-chronicle-dirty]').innerText(),'');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.emulateMedia({ reducedMotion: 'no-preference' });

    // Reopening after success starts clean; sync errors restore editing/retry.
    await page.getByRole('button', { name: 'Generate with AI', exact: true }).click();
    await idle();
    await generate.click();
    await resolve('sync-universe-ai-source', null, { message: 'Sync failed' });
    await status.getByText('Could not generate Chronicle details: Sync failed', { exact: true }).waitFor();
    await idle();
    assert.equal(await generate.evaluate(el => document.activeElement === el), true);
    assert.equal(await generate.getAttribute('aria-describedby'), await status.getAttribute('id'));
    await modal.locator('[data-chronicle-ai-module-instructions]').fill('Retry direction.');

    // A generation failure and an empty result both remove every busy state.
    await generate.click();
    await resolve('sync-universe-ai-source', { skipped: true });
    await stage.getByText('Generating suggestions…', { exact: true }).waitFor();
    await page.evaluate(() => generationPending['generate-chronicle-details'].reject(new Error('Network unavailable')));
    await status.getByText('Could not generate Chronicle details: Network unavailable', { exact: true }).waitFor();
    await idle();
    assert.equal(await modal.locator('[data-chronicle-ai-module-instructions]').inputValue(), 'Retry direction.');
    await generate.click();
    await resolve('sync-universe-ai-source', { skipped: true });
    await stage.getByText('Generating suggestions…', { exact: true }).waitFor();
    await resolve('generate-chronicle-details', { proposal: { modules: [] } });
    await status.getByText(/No suitable blank Chronicle fields/).waitFor();
    await idle();
    await modal.locator('[data-chronicle-ai-module-generate-cancel]').click();
    await modal.waitFor({ state: 'hidden' });
    assert.deepEqual(await f.snapshot(), sourceBefore, 'Loading feedback and review do not save source fields');
    assert.deepEqual(h.errors, []);
    console.log('Chronicle generation passed: animated icon/bar, actual request stages, no fake percentages, duplicate-submit protection, keyboard/status accessibility, reduced motion, desktop/mobile layout, success/reopen and sync/network/empty-result cleanup.');
  } finally { await h.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
