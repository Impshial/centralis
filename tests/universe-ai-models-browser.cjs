const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {stripTypeScriptTypes}=require('node:module');
const {setup}=require('./lexicon-browser-harness.cjs');
const models=['gpt-6.2-astra','gpt-6.2-sol','gpt-6.1-terra','gpt-6-luna'];
const labels=['GPT-6.2 Astra','GPT-6.2 Sol','GPT-6.1 Terra','GPT-6 Luna'];

(async()=>{
 const h=await setup(),{f,page,context,base}=h;
 try{
  await f.db.exec(`reset role;
   create table user_settings(user_id integer primary key);
   insert into user_settings values(1);
   alter table universes add canvas_position_x real default 0,add canvas_position_y real default 0,add fmt_stroke_color text,add fmt_stroke_width real,add fmt_stroke_style text,add fmt_path_type text,add fmt_node_bg_opacity real,add fmt_node_border_width real,add fmt_node_image_placement text,add fmt_node_layout_gap real,add opened_at timestamptz;
   alter table elements add group_position_x real,add group_position_y real;
   alter table element_groups add created_at timestamptz default now();
   alter table element_links add stroke_color text,add stroke_width real,add stroke_style text,add path_type text;
   create table canvas_notes(id text,universe_id text,created_at timestamptz,deleted boolean default false);
   create table universe_layers(id text,universe_id text,name text,sort_order integer,deleted boolean default false);
   grant select on canvas_notes,universe_layers to authenticated;`);
  await f.db.exec(fs.readFileSync('supabase/migrations/202607140002_add_user_ai_settings.sql','utf8'));
  const original=(await f.db.query('select * from user_settings where user_id=1')).rows[0];
  await f.db.exec(fs.readFileSync('supabase/migrations/20261125062156_update_universe_ai_models.sql','utf8'));
  assert.deepEqual((await f.db.query('select * from user_settings where user_id=1')).rows[0],original,'Migration preserves saved preferences');
  await assert.rejects(f.db.query("update user_settings set ai_model='invalid-model' where user_id=1"),/user_settings_ai_model_check/);
  await f.db.exec('grant select,update on user_settings to authenticated;set role authenticated');

  // Exercise the real server validation and request builder with a stubbed OpenAI transport.
  let request;
  const server=vm.createContext({Headers,FormData,TextDecoder,Response,TextEncoder,AbortSignal,
   getEnv:()=> 'test-key',Deno:{env:{get:()=>undefined}},TEXT_MODEL:'gpt-5.5',FICTIONAL_NAMING_PROMPT_SECTION:'',
   fetch:async(url,init)=>{request={url,body:JSON.parse(init.body)};return new Response(JSON.stringify({output_text:'Fixture response'}));}});
  const source=fs.readFileSync('supabase/functions/_shared/universe-ai.ts','utf8').replace(/^import .*;\r?\n/gm,'').replace(/^export /gm,'');
  vm.runInContext(stripTypeScriptTypes(source)+'\nglobalThis.api={cleanUniverseAiSettings,loadUserUniverseAiSettings,sendUniverseExpertRequest};',server);
  const client={from(table){const query=f.client().from(table),select=query.select;query.select=columns=>select(columns.replace(/\s/g,''));return query;}};
  for(const model of models){
   await f.db.query('update user_settings set ai_model=$1 where user_id=1',[model]);
   const settings=await server.api.loadUserUniverseAiSettings(client,1);
   await server.api.sendUniverseExpertRequest({universeName:'Fixture',vectorStoreId:'test-store',messages:[{role:'user',content:'Describe this world.'}],settings});
   assert.equal(request.url,'https://api.openai.com/v1/responses');assert.equal(request.body.model,model);
   assert.equal(request.body.reasoning.effort,'high');assert.equal(request.body.tools[0].type,'file_search');
  }
  assert.throws(()=>server.api.cleanUniverseAiSettings({model:'invalid-model'}),/not available/);
  await f.db.query('update user_settings set ai_model=$1 where user_id=1',[original.ai_model]);

  await context.exposeBinding('aiPreferences',async(_,{update}={})=>{
   if(update)await f.db.query('update user_settings set ai_model=$1,ai_reasoning_effort=$2,ai_verbosity=$3 where user_id=1',[update.ai_model,update.ai_reasoning_effort,update.ai_verbosity]);
   return (await f.db.query('select * from user_settings where user_id=1')).rows[0];
  });
  await context.addInitScript(()=>{
   Object.defineProperty(window,'centralisGetUserSettings',{configurable:true,get:()=>()=>window.aiPreferences({}),set(){}});
   Object.defineProperty(window,'centralisUpdateUserSettings',{configurable:true,get:()=>async update=>{const settings=await window.aiPreferences({update});window.dispatchEvent(new CustomEvent('centralis:user-settings-changed',{detail:{settings}}));return settings;},set(){}});
  });
  await context.route(/cdn\.jsdelivr\.net\/npm\/(react@|react-dom@|reactflow@|elkjs@)/,route=>{
   const u=route.request().url(),file=u.endsWith('.css')?'reactflow.css':u.includes('react-dom@')?'react-dom.js':u.includes('reactflow@')?'reactflow.js':u.includes('elkjs@')?'elk.js':'react.js';
   return route.fulfill({path:'node_modules/.cache/lexicon/canvas-vendor/'+file,contentType:u.endsWith('.css')?'text/css':'text/javascript'});
  });
  await page.goto(base+'/universe-canvas.html?universe_id=u1');await page.locator('.react-flow__node').first().waitFor();
  // No external chat request is needed to test model selection.
  await page.locator('[data-open-ai-expert]').click();
  const trigger=()=>page.locator('[data-ai-settings-trigger]:visible');
  assert.match(await trigger().innerText(),/GPT-5.6 Terra/,'Existing selection survives the update');
  for(let i=0;i<models.length;i++){
   await trigger().click();await page.locator('[data-ai-settings-toggle="model"]:visible').click();
   const menu=page.locator('[data-ai-settings-options="model"]:visible');
   assert.deepEqual((await menu.locator('[data-ai-setting]').allTextContents()).slice(0,4).map(s=>s.trim()),labels);
   await menu.locator(`[data-ai-setting-value="${models[i]}"]`).click();
   await page.waitForFunction(label=>document.querySelector('[data-ai-settings-trigger]')?.textContent.includes(label),labels[i]);
   await page.waitForFunction(async model=>(await window.aiPreferences({})).ai_model===model,models[i]);
  }
  await page.reload();await page.locator('.react-flow__node').first().waitFor();await page.locator('[data-open-ai-expert]').click();
  await page.waitForFunction(()=>document.querySelector('[data-ai-settings-trigger]')?.textContent.includes('GPT-6 Luna'));
  await page.setViewportSize({width:1440,height:600});await trigger().click();await page.locator('[data-ai-settings-toggle="model"]:visible').click();
  assert.ok(await page.locator('[data-ai-settings-options="model"]:visible').evaluate(el=>el.scrollHeight>el.clientHeight&&getComputedStyle(el).overflowY==='auto'),'Long model list scrolls on short screens');
  await page.goto(base+'/settings.html#ai');await page.locator('[data-settings-tab="ai"]').click();
  const select=page.locator('[data-settings-ai-model]');
  await page.waitForFunction(()=>document.querySelector('[data-settings-ai-model]')?.value==='gpt-6-luna');
  assert.deepEqual((await select.locator('option').allTextContents()).slice(0,4),labels);
  for(const model of models){await select.selectOption(model);await page.getByText('AI settings saved.',{exact:true}).waitFor();assert.equal((await f.db.query('select ai_model from user_settings where user_id=1')).rows[0].ai_model,model);}
  await page.reload();await page.waitForFunction(()=>document.querySelector('[data-settings-ai-model]')?.value==='gpt-6-luna');
  assert.deepEqual(h.errors,[]);
  console.log('AI models passed: saved preference preservation, constraint rejection, current-model persistence in Builder/Settings, menu scrolling, server validation and Responses model/tool payloads. No live model requests.');
 }finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
