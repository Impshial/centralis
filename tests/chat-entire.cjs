const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { stripTypeScriptTypes } = require('node:module');
function load(name, output) {
  let handler, request;
  const src = fs.readFileSync(`supabase/functions/${name}/index.ts`, 'utf8').replace(/^import[\s\S]*?;\s*/gm, '');
  vm.runInNewContext(stripTypeScriptTypes(src), {
    Deno: { serve(fn) { handler = fn; } }, OpenAI: class {},
    getAuthUser: async () => ({}), getEnv: () => '', handleCors: () => null,
    jsonResponse: (data, status = 200) => ({ data, status }),
    describeError: () => ({ error: 'failed' }), console,
    FICTIONAL_NAMING_PROMPT_SECTION: '',
    generateJsonText: async (_, options) => { request = options; return JSON.stringify(output); },
  });
  return { call: body => handler({ method: 'POST', json: async () => body }), request: () => request };
}
(async () => {
  const source = 'a'.repeat(140000) + 'MIDDLE_MARKER' + 'z'.repeat(90000) + 'END_MARKER';
  for (const type of ['html','json','text']) {
    const entries = Array.from({length: 301}, () => ({side:'user', speaker:'User', text:'x'.repeat(13000)}));
    const api = load('analyze-chat-log-layout', {messageSelector:'.message', textPath:'text', entries, complete:true});
    const full = await api.call({sourceType:type, [type]: source, parseEntireChat:true});
    assert.equal(full.status, 200);
    assert.ok(api.request().prompt.includes(source));
    assert.equal(full.data.truncated, false);
    if(type === 'text') { assert.equal(full.data.entries.length,301); assert.equal(full.data.entries[0].text.length,13000); }
    const partial = await api.call({sourceType:type, [type]:source});
    assert.equal(partial.data.truncated,true);
    assert.ok(!api.request().prompt.includes('MIDDLE_MARKER'));
    if(type === 'text') { assert.equal(partial.data.entries.length,300); assert.equal(partial.data.entries[0].text.length,12000); }
  }
  const incomplete = load('analyze-chat-log-layout', {entries:[{text:'partial'}]});
  assert.equal((await incomplete.call({text:'chat',parseEntireChat:true})).status,422);
  const meta = load('generate-chat-log-metadata', {title:'Title',summary:'Summary'});
  await meta.call({chatText:source,parseEntireChat:true});
  assert.ok(meta.request().prompt.includes(source));
  await meta.call({chatText:source});
  assert.ok(!meta.request().prompt.includes('END_MARKER'));
  const frontend = fs.readFileSync('chat-repository.js','utf8');
  const start = frontend.indexOf('function buildRawChatMetadataText(');
  const end = frontend.indexOf('function createFallbackRawMetadata',start);
  const context = {CHAT_RAW_METADATA_TEXT_MAX_LENGTH:14000,truncateChatPromptText:(text,max)=>text.slice(0,max)};
  vm.createContext(context); vm.runInContext(frontend.slice(start,end),context);
  assert.ok(context.buildRawChatMetadataText({entries:[{speaker:'User',text:source}]},true).includes('END_MARKER'));
  assert.ok(!context.buildRawChatMetadataText({entries:[{speaker:'User',text:source}]}).includes('END_MARKER'));
  console.log('Full-chat input, output caps, incomplete extraction, and default behavior passed.');
})().catch(error => { console.error(error); process.exitCode=1; });
