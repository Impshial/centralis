const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');
const {fixture,sourceTables}=require('./lexicon-fixture.cjs');
const {Store}=require('../lexicon-data.js');
const assert=require('node:assert/strict');
const base=process.env.CENTRALIS_BASE_URL||'http://127.0.0.1:4173';
async function setup(){
 const f=await fixture(),store=new Store(f.client(),{id:1}),browser=await chromium.launch({headless:true,channel:'chrome'}),context=await browser.newContext({viewport:{width:1440,height:1000}}),errors=[],calls=[];
 let failTable='',failUpload=false;const readGates=new Map();
 await context.exposeBinding('lexiconDb',async(_,{op,route})=>{calls.push({op,route});if(op.method==='select'&&readGates.has(op.table))await readGates.get(op.table);if(op.method!=='select'&&sourceTables.includes(op.table))assert.ok(/chronicle-editor|universe-canvas/.test(route),'Reader must never write source');if(op.method!=='select'&&op.table===failTable){failTable='';return {data:null,error:{message:'Fixture save failed'}};}return f.request(op);});
 await context.exposeBinding('lexiconRpc',async(_,{name,args})=>{calls.push({rpc:name});if(name===failTable){failTable='';return {data:null,error:{message:'Fixture save failed'}};}return f.rpc(name,args);});
 await context.exposeBinding('lexiconFunction',async(_,{name,body})=>{
   if(name==='lexicon-media'){
     if(body.action==='library')return {data:{images:[{id:'image1',object_id:'a',image_url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="teal"/></svg>'}],nextOffset:null},error:null};
     if(body.action==='resolve')return {data:{media:(await f.db.query('select * from lexicon_media where wiki_id=$1',[body.wikiId])).rows.map(m=>({...m,image_url:'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="80" height="40"><rect width="80" height="40" fill="teal"/></svg>'}))},error:null};
     if(failUpload)return {data:null,error:{message:'Fixture upload failed'}};
     await f.db.exec('reset role');try{await f.db.query('insert into lexicon_media(id,wiki_id,storage_key,name) values($1,$2,$3,$4) on conflict do nothing',[body.id,body.wikiId,'https://example.invalid/image.png','Fixture image']);}finally{await f.db.exec('set role authenticated');}
     return {data:{media:{id:body.id,wiki_id:body.wikiId,image_url:'https://example.invalid/image.png'}},error:null};
   }
   return {data:{images:[]},error:null};
 });
 await context.addInitScript(()=>{
  window.lexiconTestClient={from(table){const op={table,method:'select',filters:[],orders:[]};const q={select(columns='*'){op.columns=columns;return q;},eq(k,v){op.filters.push(['eq',k,v]);return q;},is(k,v){op.filters.push(['eq',k,v]);return q;},in(k,v){op.filters.push(['in',k,v]);return q;},order(k,o={}){op.orders.push([k,o.ascending]);return q;},range(a,b){op.range=[a,b];return q;},limit(n){op.limit=n;return q;},insert(p){op.method='insert';op.payload=p;return q;},upsert(p,o={}){op.method='upsert';op.payload=p;op.conflict=o.onConflict;return q;},update(p){op.method='update';op.payload=p;return q;},delete(){op.method='delete';return q;},single(){op.single=true;return q;},maybeSingle(){op.single='maybe';return q;},then(resolve,reject){return window.lexiconDb({op,route:location.pathname}).then(resolve,reject);}};return q;},rpc:(name,args)=>window.lexiconRpc({name,args}),functions:{invoke(name,{body}){if(body instanceof FormData)body=Object.fromEntries([...body].filter(([k])=>k!=='file'));return window.lexiconFunction({name,body});}}};
 });
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin!==base||u.pathname==='/supabase-config.js')return route.fulfill({status:200,body:''});if(u.pathname==='/script.js'){const response=await route.fetch();return route.fulfill({response,body:(await response.text())+'\nwindow.centralisSupabase=window.lexiconTestClient;window.centralisCurrentAppUser={id:1};window.centralisGetCurrentAppUser=async()=>({id:1});'});}return route.continue();});
 const page=await context.newPage();page.setDefaultTimeout(12000);page.on('pageerror',e=>{errors.push(e.message);console.error(e.stack);});
 const ready=async()=>{await page.locator('[data-wiki-content][aria-busy="false"] > *').first().waitFor();};
 const open=async(wiki,article='',edit=false,extra='')=>{await page.goto(`${base}/lexicon-wiki.html?wiki=${wiki}${article?'&article='+article:''}${edit?'&edit=1':''}${extra}`);await ready();};
 const settings=async()=>{const d=page.locator('.lexicon-settings');if(await d.count()&&await d.getAttribute('open')===null)await d.locator(':scope > summary').click();};
 const property=async(label,value,{field,reset=false}={})=>{await settings();let scope=page;if(field){scope=page.locator(`[data-edit-field="${field}"]`);if(await scope.getAttribute('open')===null)await scope.locator(':scope > summary').click();}const form=scope.getByRole('form',{name:label,exact:true});if(reset)await form.getByRole('button',{name:'Reset to source'}).click();else{const input=form.locator('[name="value"]'),tag=await input.evaluate(e=>e.tagName),type=await input.getAttribute('type');if(type==='checkbox')await input.setChecked(value);else if(tag==='SELECT')await input.selectOption(value);else await input.fill(String(value));await form.getByRole('button',{name:'Save',exact:true}).click();}await page.locator('[data-wiki-status]').getByText('Saved.',{exact:true}).waitFor();};
 return {f,store,browser,context,page,errors,calls,base,open,ready,settings,property,holdReads:table=>{let release;readGates.set(table,new Promise(r=>release=r));return ()=>{readGates.delete(table);release();};},failNext:table=>failTable=table,setFailUpload:v=>failUpload=v,close:async()=>{await browser.close();await f.db.close();}};
}
module.exports={setup};
