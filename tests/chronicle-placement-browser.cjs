const assert=require('node:assert/strict');
const {setup}=require('./lexicon-browser-harness.cjs');
(async()=>{
 const h=await setup(),{f,page,base}=h;
 try{
  await f.db.exec("update element_template_sections set name='History' where id='s1';insert into element_type_templates(id,element_type_id,name,is_default) values('template2','type1','Alternative',false);insert into element_template_sections(id,template_id,name,sort_order) values('history','template1','History',2);");
  const other=JSON.stringify((await f.db.query("select * from element_template_field_values where element_id='b'")).rows);
  await page.goto(base+'/chronicle-editor.html#universe/u1/element/a');await page.getByRole('button',{name:'Save Element',exact:true}).waitFor();
  await page.locator('[name="workspace-name"]').fill('Draft city');await page.locator('[name="workspace-field:f1"]').fill('432');
  await page.getByRole('button',{name:'Add field',exact:true}).click();let d=page.getByRole('dialog');await d.getByLabel('Name',{exact:true}).fill('Canceled');await d.getByRole('button',{name:'Cancel',exact:true}).click();
  assert.equal(await page.locator('[name="workspace-name"]').inputValue(),'Draft city');assert.equal(await page.locator('[name="workspace-field:f1"]').inputValue(),'432');
  await page.getByRole('button',{name:'Add field',exact:true}).click();d=page.getByRole('dialog');await d.getByLabel('Name',{exact:true}).fill('Local chronicle');await d.getByLabel('Value',{exact:true}).fill('An event unique to this city.');await d.getByLabel('Location',{exact:true}).selectOption('m1');await d.getByRole('button',{name:'Apply',exact:true}).click();
  const row=page.locator('[data-custom-field-row]').filter({has:page.locator('input[value="Local chronicle"]')});const id=await row.getAttribute('data-custom-field-id');assert.ok(id);
  h.failNext('element_custom_fields');await page.getByRole('button',{name:'Save Element',exact:true}).click();await page.getByText(/Fixture save failed/).waitFor();
  assert.equal(await page.locator('[name="workspace-name"]').inputValue(),'Draft city');await page.getByRole('button',{name:'Save Element',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-chronicle-workspace-save]').disabled);
  let saved=(await f.db.query('select * from element_custom_fields where id=$1',[id])).rows[0];assert.equal(saved.chronicle_module_id,'m1');assert.equal((await f.db.query("select sort_order from chronicle_modules where id='m1'")).rows[0].sort_order,0);assert.equal(saved.value,'An event unique to this city.');
  assert.equal((await f.db.query("select count(*)::int n from element_custom_fields where name='Local chronicle'")).rows[0].n,1);
  await row.getByRole('button',{name:'Move or rename',exact:true}).click();d=page.getByRole('dialog');await d.getByLabel('Location',{exact:true}).selectOption('');await d.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Save Element',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-chronicle-workspace-save]').disabled);assert.equal((await f.db.query('select chronicle_module_id from element_custom_fields where id=$1',[id])).rows[0].chronicle_module_id,null);
  await row.getByRole('button',{name:'Move or rename',exact:true}).click();d=page.getByRole('dialog');await d.getByLabel('Location',{exact:true}).selectOption('m1');await d.getByRole('button',{name:'Apply',exact:true}).click();
  await page.locator('[data-remove-module="s1"]').last().click();await page.getByRole('button',{name:'Save Element',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-chronicle-workspace-save]').disabled);saved=(await f.db.query('select * from element_custom_fields where id=$1',[id])).rows[0];assert.equal(saved.chronicle_module_id,null);assert.equal(saved.value,'An event unique to this city.');
  await page.locator('[data-add-module="s1"]').click();await row.getByRole('button',{name:'Move or rename',exact:true}).click();d=page.getByRole('dialog');const newModule=await d.getByLabel('Location',{exact:true}).locator('option').nth(1).getAttribute('value');await d.getByLabel('Location',{exact:true}).selectOption(newModule);await d.getByRole('button',{name:'Apply',exact:true}).click();
  await page.getByRole('button',{name:'Save Element',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-chronicle-workspace-save]').disabled);
  await page.locator('[name="workspace-template"]').selectOption('template2');await page.getByRole('button',{name:'Save Element',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('[data-chronicle-workspace-save]').disabled);
  saved=(await f.db.query('select * from element_custom_fields where id=$1',[id])).rows[0];assert.equal(saved.chronicle_module_id,null);assert.equal(saved.value,'An event unique to this city.');
  assert.equal(JSON.stringify((await f.db.query("select * from element_template_field_values where element_id='b'")).rows),other);
  assert.deepEqual(h.errors,[]);console.log('Chronicle UI: draft cancel, section placement, move, removal, template switch and failed-save retry preserve field ID/value and other city data.');
 }catch(e){console.error((await page.locator('body').innerText()).slice(-5000));console.error(await page.locator('dialog').evaluateAll(els=>els.map(e=>e.outerHTML)));throw e;}finally{await h.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
