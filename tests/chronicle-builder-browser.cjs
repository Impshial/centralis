const assert=require('node:assert/strict');const fs=require('node:fs');const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{const h=await setup(),{f,page,context,base}=h;try{
 const cache='node_modules/.cache/lexicon/canvas-vendor';fs.mkdirSync(cache,{recursive:true});
 for(const [name,path]of [['react.js','react@18.3.1/umd/react.production.min.js'],['react-dom.js','react-dom@18.3.1/umd/react-dom.production.min.js'],['reactflow.js','reactflow@11.11.4/dist/umd/index.js'],['reactflow.css','reactflow@11.11.4/dist/style.css'],['elk.js','elkjs@0.9.3/lib/elk.bundled.js']])if(!fs.existsSync(`${cache}/${name}`)){const response=await fetch('https://cdn.jsdelivr.net/npm/'+path);if(!response.ok)throw Error('Could not download '+name);fs.writeFileSync(`${cache}/${name}`,Buffer.from(await response.arrayBuffer()));}
 await f.db.exec(`reset role;
 alter table universes add canvas_position_x real default 0,add canvas_position_y real default 0,add fmt_stroke_color text,add fmt_stroke_width real,add fmt_stroke_style text,add fmt_path_type text,add fmt_node_bg_opacity real,add fmt_node_border_width real,add fmt_node_image_placement text,add fmt_node_layout_gap real,add opened_at timestamptz;
 alter table elements add position_x real,add position_y real,add group_position_x real,add group_position_y real;
 alter table element_groups add created_at timestamptz default now();
 alter table element_links add stroke_color text,add stroke_width real,add stroke_style text,add path_type text;
 create table canvas_notes(id text,universe_id text,created_at timestamptz,deleted boolean default false);
 create table universe_layers(id text,universe_id text,name text,sort_order integer,deleted boolean default false);
 grant select on canvas_notes,universe_layers to authenticated;
 insert into universes(id,user_id,name,description) values('empty',1,'Empty root','A prose-only root.'),('city',1,'City root','A city.'),('saga',1,'Multi-planet story','Several worlds.');
 set role authenticated;`);
 await context.route(/cdn\.jsdelivr\.net\/npm\/(react@|react-dom@|reactflow@|elkjs@)/,route=>{const u=route.request().url(),file=u.endsWith('.css')?'reactflow.css':u.includes('react-dom@')?'react-dom.js':u.includes('reactflow@')?'reactflow.js':u.includes('elkjs@')?'elk.js':'react.js';return route.fulfill({path:'node_modules/.cache/lexicon/canvas-vendor/'+file,contentType:u.endsWith('.css')?'text/css':'text/javascript'});});
 await page.goto(base+'/universe-canvas.html?universe_id=empty');
 await page.locator('.react-flow__node').first().waitFor({timeout:30000});
 await page.locator('.react-flow__node').first().dblclick();await page.getByRole('button',{name:'Open in Chronicle',exact:true}).click();
 await page.waitForURL('**/chronicle-editor.html#universe/empty');await page.getByRole('button',{name:'Save Universe',exact:true}).waitFor();
 await page.getByRole('button',{name:'Add field',exact:true}).click();const d=page.getByRole('dialog');await d.getByLabel('Name',{exact:true}).fill('Era');await d.getByLabel('Value',{exact:true}).fill('Early');await d.getByRole('button',{name:'Apply',exact:true}).click();await page.getByRole('button',{name:'Save Universe',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-chronicle-workspace-save]').disabled);
 await page.getByRole('link',{name:'Back to Builder',exact:true}).click();await page.locator('.react-flow__node').first().waitFor();await page.locator('.react-flow__node').first().dblclick();await page.getByText('Early',{exact:true}).waitFor();
 assert.ok(await page.getByRole('button',{name:'Edit in Chronicle',exact:true}).isEnabled());
 assert.equal((await f.db.query("select count(*)::int n from elements where universe_id='empty'")).rows[0].n,0);
 assert.equal((await f.db.query("select count(*)::int n from lexicon_wikis where universe_id='empty'")).rows[0].n,0);
 assert.deepEqual(h.errors,[]);console.log('Builder UI: double-click empty root -> enabled Chronicle action -> save first detail -> Back to Builder -> double-click Chronicle preview; no placeholder, child or wiki created.');
}catch(e){console.error((await page.locator('body').innerText()).slice(-5000));throw e;}finally{await h.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
