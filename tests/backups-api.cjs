const assert=require('node:assert/strict');
const handler=require('../api/backups.js');
process.env.SUPABASE_URL='https://example.invalid';
process.env.SUPABASE_PUBLISHABLE_KEY='test-public-key';
const calls=[];
const response=async(req)=>{
 let body;const res={setHeader(){},end(value){body=JSON.parse(value);}};
 await handler(req,res);return {status:res.statusCode,body};
};
(async()=>{
 assert.equal((await response({method:'GET',headers:{}})).status,405);
 assert.equal((await response({method:'POST',headers:{}})).status,401);
 global.fetch=async url=>{calls.push(url);return {ok:false};};
 const request={method:'POST',headers:{authorization:'Bearer test-user'}};
 assert.equal((await response(request)).status,403);assert.equal(calls.length,1);
 global.fetch=async()=>({ok:true,json:async()=>({runs:[{status:'queued'}]})});
 assert.equal((await response(request)).status,503);
 process.env.GITHUB_BACKUP_TOKEN='test-dispatch-token';
 global.fetch=async(url,options)=>{
  calls.push({url,options});
  return {ok:true,json:async()=>({runs:[{status:'queued'}]})};
 };
 assert.equal((await response(request)).status,202);
 const dispatch=calls.at(-1);assert.equal(JSON.parse(dispatch.options.body).ref,'master');
 assert.equal(dispatch.options.headers.Authorization,'Bearer test-dispatch-token');
 assert.ok(dispatch.url.includes('/Impshial/centralis/actions/workflows/centralis-backup.yml/dispatches'));
 global.fetch=async()=>({ok:true,json:async()=>({runs:[]})});
 assert.equal((await response(request)).status,409);
 console.log('Backup API checks passed: authentication, admin authorization, setup errors, queue requirement and fixed workflow dispatch.');
})().catch(e=>{console.error(e);process.exitCode=1});
