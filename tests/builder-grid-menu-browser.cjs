const assert = require('node:assert/strict');
const {setup} = require('./lexicon-browser-harness.cjs');

(async () => {
  const h = await setup(), {f, page, context, base} = h;
  try {
    await f.db.exec(`reset role;
      alter table universes add canvas_position_x real default 0, add canvas_position_y real default 0,
        add fmt_stroke_color text, add fmt_stroke_width real, add fmt_stroke_style text, add fmt_path_type text,
        add fmt_node_bg_opacity real, add fmt_node_border_width real, add fmt_node_image_placement text,
        add fmt_node_layout_gap real, add opened_at timestamptz;
      alter table elements add group_position_x real, add group_position_y real;
      alter table element_groups add description text, add position_x real, add position_y real, add width real, add height real,
        add background_color text, add is_collapsed boolean, add updated_at timestamptz, add created_at timestamptz default now(),
        add group_position_x real, add group_position_y real;
      alter table element_links add stroke_color text, add stroke_width real, add stroke_style text, add path_type text;
      create table canvas_notes(id text, universe_id text, title text, content text, position_x real, position_y real, width real, height real,
        bg_color text, border_color text, text_color text, font_size real, is_collapsed boolean, created_at timestamptz, updated_at timestamptz, deleted boolean default false);
      create table universe_layers(id text, universe_id text, name text, sort_order integer, deleted boolean default false);
      grant select,insert,update,delete on canvas_notes,universe_layers to authenticated;
      insert into universes(id,user_id,name) values('grid',1,'Grid test');
      insert into elements(id,user_id,universe_id,name,element_type_id,position_x,position_y) values('existing',1,'grid','Existing element','type1',500,300);
      set role authenticated;`);
    await context.route(/cdn\.jsdelivr\.net\/npm\/(react@|react-dom@|reactflow@|elkjs@)/, route => {
      const url = route.request().url();
      const file = url.endsWith('.css') ? 'reactflow.css' : url.includes('react-dom@') ? 'react-dom.js'
        : url.includes('reactflow@') ? 'reactflow.js' : url.includes('elkjs@') ? 'elk.js' : 'react.js';
      return route.fulfill({path:'node_modules/.cache/lexicon/canvas-vendor/' + file,contentType:url.endsWith('.css')?'text/css':'text/javascript'});
    });
    await page.goto(base + '/universe-canvas.html?universe_id=grid');
    await page.locator('.react-flow__node[data-id="element:existing"]').waitFor();
    const menu = page.locator('.node-context-menu');
    const add = page.locator('#add-element-modal');
    const group = page.locator('#create-group-modal');
    const gridMenu = async (corner = false) => {
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const spot = await page.locator('.react-flow__pane').evaluate((pane, corner) => {
        const bounds = pane.getBoundingClientRect();
        const view = document.querySelector('.react-flow__viewport');
        const transform = new DOMMatrix(getComputedStyle(view).transform);
        const bottom = Math.min(bounds.bottom,innerHeight);
        const edgePoints = [];
        for (let y=bottom-20;y>bounds.top+20;y-=40) {
          for (let x=Math.min(bounds.right,innerWidth)-40;x>bounds.left+20;x-=80) edgePoints.push([x,y]);
        }
        const points = corner ? edgePoints :
          [[bounds.right-50,bounds.top+80],[bounds.left+50,bounds.top+80],[bounds.right-50,bounds.bottom-80]];
        const point = points.find(([x,y]) => document.elementFromPoint(x,y) === pane);
        if (!point) throw new Error('No blank grid point');
        const [x,y] = point;
        return {x,y,flowX:(x-bounds.left-transform.e)/transform.a,flowY:(y-bounds.top-transform.f)/transform.d};
      }, corner);
      await page.mouse.click(spot.x,spot.y,{button:'right'});
      await menu.waitFor();
      assert.deepEqual(await menu.getByRole('button').allTextContents(), ['Add Element','Add Group','Add Note']);
      return spot;
    };
    const assertPosition = (row, spot) => {
      assert.ok(Math.abs(row.position_x-spot.flowX)<1, 'Canvas x uses the clicked position');
      assert.ok(Math.abs(row.position_y-spot.flowY)<1, 'Canvas y uses the clicked position');
    };

    await gridMenu();
    await menu.getByRole('button',{name:'Add Element',exact:true}).click();
    await add.waitFor();
    await add.getByRole('button',{name:'Cancel',exact:true}).click();
    assert.equal((await f.db.query("select count(*)::int n from elements where universe_id='grid'")).rows[0].n, 1);

    const elementSpot = await gridMenu();
    await menu.getByRole('button',{name:'Add Element',exact:true}).click();
    await add.locator('[name="element-name"]').fill('Grid element');
    await add.locator('[data-element-type-trigger]').click();
    await page.getByRole('option',{name:'Place',exact:true}).click();
    h.failNext('elements');
    await add.getByRole('button',{name:'Add Element',exact:true}).click();
    await add.getByText(/Could not add element: Fixture save failed/).waitFor();
    await add.getByRole('button',{name:'Add Element',exact:true}).click();
    await add.waitFor({state:'hidden'});
    const element = (await f.db.query("select * from elements where name='Grid element'")).rows[0];
    assertPosition(element,elementSpot);
    assert.equal((await f.db.query("select count(*)::int n from element_links where universe_id='grid'")).rows[0].n, 0, 'Grid creation does not create a connection');

    // Grid groups are empty even when another node remains selected.
    await page.locator('.react-flow__node[data-id="element:existing"]').click();
    const groupSpot = await gridMenu();
    await menu.getByRole('button',{name:'Add Group',exact:true}).click();
    await group.locator('[name="group-name"]').fill('Empty grid group');
    h.failNext('element_groups');
    await group.getByRole('button',{name:'Create Group',exact:true}).click();
    await page.getByText(/Could not create group: Fixture save failed/).waitFor();
    assert.equal(await group.isVisible(), true);
    await group.getByRole('button',{name:'Create Group',exact:true}).click();
    await group.waitFor({state:'hidden'});
    const emptyGroup = (await f.db.query("select * from element_groups where name='Empty grid group'")).rows[0];
    assertPosition(emptyGroup,groupSpot);
    assert.equal((await f.db.query('select count(*)::int n from elements where group_id=$1',[emptyGroup.id])).rows[0].n, 0);
    assert.equal(emptyGroup.width,280);assert.equal(emptyGroup.height,190);

    await gridMenu();
    await menu.getByRole('button',{name:'Add Group',exact:true}).click();
    await group.getByRole('button',{name:'Cancel',exact:true}).click();
    await page.locator('.react-flow__node[data-id="element:existing"]').click();
    await page.locator('[data-create-group]').click();
    await group.getByText('Name the group for the selected elements.',{exact:true}).waitFor();
    await group.locator('[name="group-name"]').fill('Selection group');
    await group.getByRole('button',{name:'Create Group',exact:true}).click();
    await group.waitFor({state:'hidden'});
    const selectionGroup = (await f.db.query("select id from element_groups where name='Selection group'")).rows[0];
    assert.equal((await f.db.query("select group_id from elements where id='existing'")).rows[0].group_id,selectionGroup.id);

    const groupNode = page.locator(`.react-flow__node[data-id="group:${selectionGroup.id}"]`);
    await groupNode.waitFor();
    assert.equal(await groupNode.locator('.group-flow-title small').count(),0,'Expanded group hides its count');
    await groupNode.locator('.group-flow-title').click({button:'right'});
    await menu.getByRole('button',{name:'Auto Layout Group',exact:true}).click();
    await page.getByText('Auto-layout complete for group.',{exact:true}).waitFor();
    const gap = await page.evaluate(id => {
      const header = document.querySelector(`[data-id="group:${id}"] .group-flow-header`).getBoundingClientRect();
      const child = document.querySelector('[data-id="element:existing"]').getBoundingClientRect();
      const zoom = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a;
      return (child.top-header.bottom)/zoom;
    },selectionGroup.id);
    assert.ok(gap>=12,`Auto-layout leaves space below the header (${gap}px)`);
    await groupNode.getByRole('button',{name:'Collapse group',exact:true}).click();
    await groupNode.locator('.group-flow-title small').getByText('1 element',{exact:true}).waitFor();
    await groupNode.getByRole('button',{name:'Expand group',exact:true}).click();
    await groupNode.locator('.group-flow-title small').waitFor({state:'detached'});

    const noteSpot = await gridMenu(true);
    assert.ok(await menu.evaluate(el => {const r=el.getBoundingClientRect();return r.right<=innerWidth&&r.bottom<=innerHeight;}),'Menu stays inside the viewport at the lower edge');
    await menu.getByRole('button',{name:'Add Note',exact:true}).click();
    await page.locator('.react-flow__node-note').waitFor();
    const note = (await f.db.query("select * from canvas_notes where universe_id='grid'")).rows[0];
    assertPosition(note,noteSpot);
    await page.reload();
    await page.locator(`.react-flow__node[data-id="element:${element.id}"]`).waitFor();
    await page.locator(`.react-flow__node[data-id="group:${emptyGroup.id}"]`).waitFor();
    assert.deepEqual(h.errors,[]);
    console.log('Grid context menu passed: element/group creation at clicked canvas positions, cancellation, failed-save retry, empty groups, selection grouping, auto-layout header spacing, collapsed counts, note creation, edge placement and reload persistence.');
  } catch(error) {
    console.error((await page.locator('body').innerText()).slice(-3500));
    throw error;
  } finally {await h.close();}
})().catch(error => {console.error(error);process.exitCode=1;});
