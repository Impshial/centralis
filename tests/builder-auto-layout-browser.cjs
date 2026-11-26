const assert = require('node:assert/strict');
const {setup} = require('./lexicon-browser-harness.cjs');

(async () => {
  const h = await setup(), {f,page,context,base} = h;
  try {
    await f.db.exec(`reset role;
      alter table universes add canvas_position_x real default 0, add canvas_position_y real default 0,
        add fmt_stroke_color text, add fmt_stroke_width real, add fmt_stroke_style text, add fmt_path_type text,
        add fmt_node_bg_opacity real, add fmt_node_border_width real, add fmt_node_image_placement text,
        add fmt_node_layout_gap real, add opened_at timestamptz;
      alter table elements add group_position_x real, add group_position_y real;
      alter table element_groups add description text, add position_x real, add position_y real, add width real, add height real,
        add background_color text, add is_collapsed boolean, add updated_at timestamptz, add created_at timestamptz default now(),
        add group_position_x real, add group_position_y real, add deleted_at timestamptz, add deleted_by integer;
      alter table element_links add stroke_color text, add stroke_width real, add stroke_style text, add path_type text;
      create table canvas_notes(id text, universe_id text, title text, content text, position_x real, position_y real, width real, height real,
        bg_color text, border_color text, text_color text, font_size real, is_collapsed boolean, created_at timestamptz, updated_at timestamptz, deleted boolean default false);
      create table universe_layers(id text, universe_id text, name text, sort_order integer, deleted boolean default false);
      grant select,insert,update,delete on canvas_notes,universe_layers to authenticated;
      insert into universes(id,user_id,name) values('layout',1,'Layout test');
      insert into element_groups(id,universe_id,name,position_x,position_y,width,height,is_collapsed)
        values('regions','layout','Thalis Regions',400,0,324,1000,false);
      insert into elements(id,user_id,universe_id,name,element_type_id,position_x,position_y,group_id,group_position_x,group_position_y) values
        ('thalis',1,'layout','Thalis','type1',0,0,null,null,null),
        ('ebria',1,'layout','Ebria','type1',0,300,null,null,null),
        ('frostveil',1,'layout','The Frostveil Wastes','type1',0,0,'regions',44,72),
        ('oakreach',1,'layout','Oakreach','type1',0,0,'regions',44,302),
        ('orrath',1,'layout','Orrath’s Fracture','type1',0,0,'regions',44,532),
        ('thalewynd',1,'layout','Thalewynd','type1',0,0,'regions',44,762),
        ('caldreth',1,'layout','Caldreth','type1',900,230,null,null,null),
        ('glacimor',1,'layout','Glacimor','type1',900,530,null,null,null),
        ('stormspire',1,'layout','Stormspire','type1',400,1100,null,null,null),
        ('stormhaven',1,'layout','Stormhaven','type1',900,0,null,null,null),
        ('oculus',1,'layout','The Oculus','type1',900,900,null,null,null);
      update elements set description=repeat('A description with enough text to fill the card and measure its visible height. ',3) where universe_id='layout';
      insert into element_links(id,universe_id,source_element_id,target_element_id) values
        ('l-root-t','layout','layout','thalis'),('l-root-e','layout','layout','ebria'),
        ('l-t-f','layout','thalis','frostveil'),('l-t-o','layout','thalis','oakreach'),
        ('l-t-r','layout','thalis','orrath'),('l-t-t','layout','thalis','thalewynd'),
        ('l-c','layout','thalewynd','caldreth'),('l-g','layout','frostveil','glacimor'),
        ('l-es','layout','ebria','stormspire'),('l-ss','layout','stormspire','stormhaven'),
        ('l-so','layout','stormspire','oculus');
      set role authenticated;`);
    await context.route(/cdn\.jsdelivr\.net\/npm\/(react@|react-dom@|reactflow@|elkjs@)/, route => {
      const url = route.request().url();
      const file = url.endsWith('.css') ? 'reactflow.css' : url.includes('react-dom@') ? 'react-dom.js'
        : url.includes('reactflow@') ? 'reactflow.js' : url.includes('elkjs@') ? 'elk.js' : 'react.js';
      return route.fulfill({path:'node_modules/.cache/lexicon/canvas-vendor/' + file,contentType:url.endsWith('.css')?'text/css':'text/javascript'});
    });
    const ready = async () => {
      await page.locator('.react-flow__node[data-id="element:caldreth"]').waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('.react-flow__node')].every(node => node.offsetHeight > 0));
    };
    await page.goto(base + '/universe-canvas.html?universe_id=layout');
    await ready();
    const autoLayout = async () => {
      await page.locator('[data-auto-layout]').click();
      await page.waitForFunction(() => !document.querySelector('[data-auto-layout]').disabled);
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    };
    const rects = () => page.evaluate(() => {
      const zoom = new DOMMatrix(getComputedStyle(document.querySelector('.react-flow__viewport')).transform).a;
      return Object.fromEntries([...document.querySelectorAll('.react-flow__node')].map(node => {
        const r = node.getBoundingClientRect();
        return [node.dataset.id,{x:r.x/zoom,y:r.y/zoom,width:r.width/zoom,height:r.height/zoom}];
      }));
    });
    const assertConnections = async () => {
      const boxes = await rects();
      for (const [left,right] of [['frostveil','glacimor'],['thalewynd','caldreth']]) {
        const a=boxes['element:'+left], b=boxes['element:'+right];
        assert.ok(b.x > a.x + a.width,`${right} is to the right of ${left}`);
        assert.ok(Math.abs(a.y+a.height/2-b.y-b.height/2)<=12,`${right} aligns with ${left}`);
      }
      const regionXs = ['frostveil','oakreach','orrath','thalewynd'].map(id => boxes['element:'+id].x);
      assert.ok(Math.max(...regionXs)-Math.min(...regionXs)<1,'Region left edges align');
      const roots = Object.entries(boxes).filter(([id]) => !id.startsWith('group:') &&
        (!boxes['group:regions'] || !['element:frostveil','element:oakreach','element:orrath','element:thalewynd'].includes(id)));
      if(boxes['group:regions']) roots.push(['group:regions',boxes['group:regions']]);
      for(let i=0;i<roots.length;i++) for(const [bid,b] of roots.slice(i+1)) {
        const [aid,a]=roots[i];
        assert.ok(a.x+a.width<=b.x || b.x+b.width<=a.x || a.y+a.height<=b.y || b.y+b.height<=a.y,`${aid} and ${bid} do not overlap`);
      }
    };
    await autoLayout();
    await assertConnections();
    const positions = async () => (await f.db.query("select id,position_x,position_y,group_position_x,group_position_y from elements where universe_id='layout' order by id")).rows;
    const saved = await positions();
    await page.reload();
    await ready();
    await assertConnections();
    assert.deepEqual(await positions(),saved,'Layout positions persist after reload');

    // Use the actual Ungroup command before running auto-layout again.
    await page.locator('[data-id="group:regions"] .group-flow-title').click({button:'right'});
    await page.locator('.node-context-menu').getByRole('button',{name:'Ungroup',exact:true}).click();
    await page.locator('.react-flow__node[data-id="group:regions"]').waitFor({state:'detached'});
    await autoLayout();
    await assertConnections();
    await page.reload();
    await ready();
    await assertConnections();
    assert.deepEqual(h.errors,[]);
    console.log('Browser auto-layout passed: linked city alignment, region left edges, no overlaps, ungrouping, saved positions and reload.');
  } finally { await h.close(); }
})().catch(error => {console.error(error);process.exitCode=1;});
