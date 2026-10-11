const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const base = 'http://127.0.0.1:4187';
const output = 'node_modules/.cache/header/screenshots';
fs.mkdirSync(output, { recursive: true });

async function isolate(page, errors) {
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin !== base) return route.fulfill({ status: 200, body: '' });
    if (url.pathname.endsWith('.html')) {
      const response = await route.fetch();
      // Keep the real shared header code, without signing in or loading module data.
      const body = (await response.text()).replace('<body data-page="home">', '<body data-auth-required="true" data-page="home">');
      return route.fulfill({ response, body });
    }
    if (/\.(?:js|mjs)$/.test(url.pathname) && !['/script.js', '/theme-bootstrap.js'].includes(url.pathname) && !url.pathname.startsWith('/assets/vendor/phosphor/')) {
      return route.fulfill({ contentType: 'text/javascript', body: '' });
    }
    return route.continue();
  });
}

async function assertReachable(link) {
  assert.equal(await link.isVisible(), true);
  const hit = await link.evaluate(el => {
    const r = el.getBoundingClientRect();
    const target = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
    return { reachable: r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight && el.contains(target),
      rect: r.toJSON(), target: target?.outerHTML.slice(0, 180), page: location.pathname, item: el.textContent,
      ancestors: [el.parentElement, el.parentElement.parentElement, el.parentElement.parentElement.parentElement, el.closest('.site-header')].map(a => {
        const s = getComputedStyle(a); return { class: a.className, position: s.position, z: s.zIndex, overflow: s.overflow, contain: s.contain, transform: s.transform };
      }) };
  });
  if (!hit.reachable) await link.page().screenshot({ path: `${output}/clipped-menu.png` });
  assert.equal(hit.reachable, true, `Menu item must be inside the screen and not clipped or covered: ${JSON.stringify(hit)}`);
}

(async () => {
  const browser = await chromium.launch({ headless: true, channel: 'chrome' });
  try {
    const errors = [];
    const mobile = await browser.newContext({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } });
    const page = await mobile.newPage();
    await isolate(page, errors);
    for (const width of [320, 390, 760]) {
      await page.setViewportSize({ width, height: 844 });
      for (const file of ['nfl.html', 'index.html', 'universe-builder.html', 'image-generation.html', 'arc-studio.html']) {
        await page.goto(`${base}/${file}`);
        await page.locator('.site-header .category-button').first().waitFor();
        for (const [name, destination] of [['World building', 'Universe Builder'], ['AI tools', 'Image Generation'], ['Entertainment', 'NFL'], ['Utilities', 'SecureIt']]) {
          const trigger = page.getByRole('button', { name, exact: true });
          const menu = trigger.locator('..').locator('.dropdown-menu');
          await trigger.tap();
          assert.equal(await trigger.getAttribute('aria-expanded'), 'true', `${width}/${file}/${name} opens on tap`);
          await assertReachable(menu.getByRole('menuitem', { name: destination, exact: true }));
          assert.equal(await page.locator('.site-header .menu-trigger[aria-expanded="true"]').count(), 1);
          await trigger.tap();
          assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
          assert.equal(await menu.isVisible(), false, 'Second tap closes, even while focused');
        }
        await page.getByRole('button', { name: 'Entertainment', exact: true }).tap();
        await page.getByRole('button', { name: 'Theme', exact: true }).tap();
        assert.equal(await page.getByRole('button', { name: 'Entertainment', exact: true }).getAttribute('aria-expanded'), 'false');
        await page.touchscreen.tap(8, 700);
        assert.equal(await page.locator('.site-header .menu-trigger[aria-expanded="true"]').count(), 0, 'Outside tap closes menus');
      }
      await page.getByRole('button', { name: 'Entertainment', exact: true }).tap();
      await page.screenshot({ path: `${output}/mobile-menu-${width}.png` });
      await page.getByRole('menuitem', { name: 'NFL', exact: true }).tap();
      await page.waitForURL('**/nfl.html');
      assert.equal(await page.getByRole('button', { name: 'Entertainment', exact: true }).getAttribute('aria-expanded'), 'false');
    }
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const mouse = await desktop.newPage();
    await isolate(mouse, errors);
    await mouse.goto(base + '/nfl.html');
    const trigger = mouse.getByRole('button', { name: 'Entertainment', exact: true });
    const menu = trigger.locator('..').locator('.dropdown-menu');
    await trigger.hover();
    await assertReachable(menu.getByRole('menuitem', { name: 'NFL', exact: true }));
    await trigger.click();
    assert.equal(await menu.isVisible(), true, 'First mouse click keeps a hovered menu open');
    await trigger.click();
    assert.equal(await menu.isVisible(), false, 'Second mouse click closes');
    await mouse.mouse.move(10, 500);
    await trigger.focus();
    await mouse.keyboard.press('Enter');
    assert.equal(await menu.isVisible(), true, 'Enter opens menu');
    await mouse.keyboard.press('Escape');
    assert.equal(await menu.isVisible(), false, 'Escape closes a focused menu');
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true);
    await mouse.keyboard.press('ArrowDown');
    assert.equal(await menu.getByRole('menuitem').first().evaluate(el => el === document.activeElement), true);
    await mouse.keyboard.press('Escape');
    assert.equal(await trigger.evaluate(el => el === document.activeElement), true, 'Escape returns focus to trigger');
    assert.equal(await menu.isVisible(), false);
    await mouse.setViewportSize({ width: 390, height: 844 });
    await trigger.focus();
    await mouse.keyboard.press('ArrowDown');
    await assertReachable(menu.getByRole('menuitem', { name: 'NFL', exact: true }));
    assert.deepEqual(errors, []);
    console.log('Shared header browser checks passed: touch menus on five modules at 320/390/760px, navigation, outside taps, desktop hover/click, and keyboard controls.');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
