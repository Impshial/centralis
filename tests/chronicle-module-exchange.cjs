const assert=require('node:assert/strict');
const E=require('../chronicle-module-exchange.js');
const w={element:{id:'oculus',name:'The Oculus'},templateId:'city',modules:[
 {sectionId:'overview',assignmentId:'a1',label:'Overview',fields:[
  {kind:'template',id:'population',label:'Population',type:'number',hint:'Residents',value:'120'},
  {kind:'template',id:'active',label:'Active',type:'checkbox',value:''},
  {kind:'template',id:'distance',label:'Distance',type:'number',value:''},
  {kind:'custom',id:'notes',label:'Notes',type:'textarea',value:'  **Draft**\n\nUnicode: 星'}]},
 {sectionId:'culture',assignmentId:'a2',label:'Culture',fields:[
  {kind:'template',id:'arts',label:'Arts',type:'multi_select',choices:['Music','Art'],value:'Music'},
  {kind:'template',id:'government',label:'Government',type:'select',choices:['Council','Guild'],value:''},
  {kind:'template',id:'date',label:'Date',type:'date',value:''},
  {kind:'template',id:'url',label:'URL',type:'url',value:''}]}]};
const before=structuredClone(w),blank=E.exportModules(w,['overview','culture']);
assert.ok(blank.modules.every(m=>m.fields.every(f=>f.value===null)));
assert.equal(E.plan(w,E.review(blank,w)).changes.length,0);
const current=E.exportModules(w,['overview'],true);
assert.equal(current.modules.length,1);assert.equal(current.modules[0].fields[0].value,120);
assert.equal(current.modules[0].fields[3].value,'  **Draft**\n\nUnicode: 星');
assert.match(E.instructions(blank),/Keep the identifiers as supplied\. Return JSON for the fields you can fill from the material I provide\. You may omit any other field or module\./);
assert.equal(E.filename('The Oculus'),'The-Oculus-chronicle-modules.json');
assert.deepEqual(E.parse('```json\n'+JSON.stringify(blank)+'\n```'),blank);
assert.throws(()=>E.parse('JSON below:\n{}'),/Invalid JSON/);
const incoming=structuredClone(blank);incoming.modules[0].label='Renamed externally';incoming.modules[0].fields.reverse();
const field=(id)=>incoming.modules.flatMap(m=>m.fields).find(f=>f.id===id);
field('population').value=200;field('population').type='text';field('population').label='Changed label';
field('active').value=false;field('distance').value=0;field('notes').value='\n  # New\n\nUnicode: café 星\n';
field('arts').value=['Art','Music'];field('government').value='King';field('date').value='2026-02-30';field('url').value='bad URL';
let review=E.review(incoming,w),rows=review.groups.flatMap(g=>g.rows),row=id=>rows.find(r=>r.field?.id===id);
assert.equal(row('population').label,'Population');assert.equal(row('population').selected,false);
assert.equal(row('active').selected,true);assert.equal(row('distance').selected,true);assert.equal(row('notes').selected,false);
assert.equal(row('government').status,'invalid');assert.equal(row('date').status,'invalid');assert.equal(row('url').status,'invalid');
assert.deepEqual(E.plan(w,review).changes.map(c=>[c.id,c.value]),[['distance','0'],['active','false']]);
row('notes').selected=true;assert.equal(E.plan(w,review).changes[0].value,'\n  # New\n\nUnicode: café 星\n');
assert.deepEqual(w,before,'Review and planning never mutate the workspace');
const after=structuredClone(w);for(const p of E.plan(w,review).changes)after.modules.find(m=>m.sectionId===p.sectionId).fields.find(f=>f.id===p.id&&f.kind===p.kind).value=p.value;
const repeat=E.review(E.exportModules(after,['overview','culture'],true),after);assert.equal(E.plan(after,repeat).changes.length,0);
assert.throws(()=>E.plan(after,review),/draft or modules changed/);
const moved=structuredClone(w);moved.modules[0].assignmentId='replacement';assert.throws(()=>E.plan(moved,review),/changed/);
for(const [property,value,message] of [['version',2,/version/],['element',{id:'another-city'},/Target mismatch/],['templateId','another-template',/Template mismatch/]])assert.throws(()=>E.review({...blank,[property]:value},w),message);
const dup=structuredClone(incoming);dup.modules[0].fields.push({...dup.modules[0].fields[0]});
assert.ok(E.review(dup,w).groups[0].rows.filter(r=>r.input.id===dup.modules[0].fields[0].id).every(r=>r.status==='invalid'&&/Duplicate/.test(r.message)));
const sections=structuredClone(blank);sections.modules.push(sections.modules[0]);assert.ok(E.review(sections,w).groups[0].rows.every(r=>r.status==='invalid'));
const invalid=structuredClone(blank);invalid.modules[0].fields.push(invalid.modules[1].fields[0],{kind:'custom',id:'wiki-fact:private',value:'No'});invalid.modules.push({sectionId:'removed',label:'Old',fields:[{kind:'template',id:'old',value:1}]});
let invalidRows=E.review(invalid,w).groups.flatMap(g=>g.rows);assert.ok(invalidRows.some(r=>/excluded/.test(r.message)));assert.ok(invalidRows.some(r=>/unassigned/.test(r.message)));
const wrongSection=structuredClone(blank);wrongSection.modules[0].fields.push(wrongSection.modules.pop().fields[0]);assert.ok(E.review(wrongSection,w).groups[0].rows.some(r=>/another module/.test(r.message)));
assert.ok(E.validate('0',{type:'number'}).error);assert.ok(E.validate('false',{type:'checkbox'}).error);assert.ok(E.validate(['Bad'],{type:'multi_select',choices:['Good']}).error);
assert.equal(E.validate(false,{type:'checkbox'}).value,false);assert.equal(E.validate(0,{type:'number'}).value,0);
assert.equal(E.validate('2024-02-29',{type:'date'}).value,'2024-02-29');
console.log('Module exchange: typed conversion, blank/current export, partial plans, conflicts, ID routing, duplicate/moved/unknown rows, choices/dates/URLs, zero/false/Markdown, unchanged reimport, and stale draft/assignment protection passed.');
