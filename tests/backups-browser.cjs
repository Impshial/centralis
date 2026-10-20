const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict'),fs=require('node:fs');
const base=process.env.MOVIE_TEST_BASE_URL || 'http://127.0.0.1:4187';
const mock=`
window.centralisCurrentAppUser={id:1,admin:true};
window.centralisGetCurrentAppUser=async()=>window.centralisCurrentAppUser;
window.centralisGetUserSettings=async()=>({});
window.backupTest={settings:{enabled:true,retention_days:30,last_worker_check:null},runs:[]};
window.centralisSupabase={
 auth:{getSession:async()=>({data:{session:{access_token:'test'}}})},
 rpc:async(name,args)=>{
  if(window.backupFail){window.backupFail=false;return {error:{message:'Could not save; retry.'}};}
  if(args.p_action==='settings')Object.assign(backupTest.settings,args.p_options);
  if(args.p_action==='queue'&&!backupTest.runs.length)backupTest.runs.push({id:'test',status:'queued',source:'manual',requested_at:new Date().toISOString()});
  return {data:JSON.parse(JSON.stringify(backupTest))};
 }
};
window.supabase={createClient:()=>window.centralisSupabase};
`;
(async()=>{
 const browser=await chromium.launch({headless:true,channel:'chrome'});
 try {
  for(const width of [390,1440]){
   const page=await browser.newPage({viewport:{width,height:950}});
   const errors=[];page.on('pageerror',e=>errors.push(e.message));
   await page.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.origin!==base)return route.fulfill({body:''});
    if(url.pathname==='/script.js')return route.fulfill({body:mock,contentType:'application/javascript'});
    if(url.pathname==='/api/backups')return route.fulfill({json:{message:'Backup queued. The worker is starting.'},status:202});
    return route.continue();
   });
   await page.goto(base+'/settings.html');
   await page.locator('[data-settings-tab=backups]').click();
   const panel=page.locator('[data-settings-panel=backups]');
   await assert.equal(await panel.isVisible(),true);
   await page.waitForFunction(()=>document.querySelector('[data-backup-health]').textContent.includes('Setup needed'));
   assert.equal(await page.locator('[data-backup-now]').isDisabled(),true);
   await page.evaluate(()=>backupTest.settings.last_worker_check=new Date().toISOString());
   await page.locator('[data-backup-refresh]').click();
   await page.waitForFunction(()=>!document.querySelector('[data-backup-now]').disabled);
   await panel.locator('[name=enabled]').uncheck();
   await panel.locator('[name=retention_days]').selectOption('60');
   await page.evaluate(()=>window.backupFail=true);
   await panel.locator('[type=submit]').click();
   await page.waitForFunction(()=>document.querySelector('[data-backup-status]').textContent.includes('retry'));
   assert.equal(await panel.locator('[name=retention_days]').inputValue(),'60');
   await panel.locator('[type=submit]').click();
   await page.waitForFunction(()=>document.querySelector('[data-backup-status]').textContent.includes('saved'));
   await page.locator('[data-backup-now]').click();
   await page.waitForFunction(()=>document.querySelector('[data-backup-status]').textContent.includes('starting'));
   assert.equal(await page.locator('[data-backup-now]').isDisabled(),true);
   await page.evaluate(()=>{backupTest.runs[0]={...backupTest.runs[0],status:'failed',error:'<script>alert(1)</script>',backup_prefix:'centralis/v1/2026-10-20/test/'};});
   await page.locator('[data-backup-refresh]').click();
   await page.waitForFunction(()=>document.querySelector('[data-backup-history]').textContent.includes('alert(1)'));
   assert.equal(await panel.locator('script').count(),0);
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);
   fs.mkdirSync('node_modules/.cache/backup-screenshots',{recursive:true});
   await page.screenshot({path:`node_modules/.cache/backup-screenshots/settings-${width}.png`,fullPage:true});
   assert.deepEqual(errors,[]);
   await page.close();
   console.log('Backup settings UI passed at '+width+'px: setup gating, save retry, manual queue, escaped errors and responsive layout.');
  }
 } finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
