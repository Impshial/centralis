const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {setup} = require('./lexicon-browser-harness.cjs');

(async () => {
  const h = await setup(), {f, page, context, base} = h;
  try {
    // Match the live foreign keys: deleting a template is one atomic operation.
    await f.db.exec(`reset role;
      alter table universes add canvas_position_x real default 0, add canvas_position_y real default 0,
        add fmt_stroke_color text, add fmt_stroke_width real, add fmt_stroke_style text, add fmt_path_type text,
        add fmt_node_bg_opacity real, add fmt_node_border_width real, add fmt_node_image_placement text,
        add fmt_node_layout_gap real, add opened_at timestamptz;
      alter table elements add group_position_x real, add group_position_y real,
        add foreign key (rich_template_id) references element_type_templates(id) on delete set null;
      alter table element_groups add created_at timestamptz default now();
      alter table element_links add stroke_color text, add stroke_width real, add stroke_style text, add path_type text;
      create table canvas_notes(id text, universe_id text, created_at timestamptz, deleted boolean default false);
      create table universe_layers(id text, universe_id text, name text, sort_order integer, deleted boolean default false);
      grant select on canvas_notes, universe_layers to authenticated;
      alter table element_types alter id set default gen_random_uuid()::text;
      alter table element_type_templates alter id set default gen_random_uuid()::text,
        add description text, add source_default_template_id text;
      alter table element_template_sections alter id set default gen_random_uuid()::text,
        add description text, add is_default boolean not null default false, add source_default_section_id text,
        add foreign key (template_id) references element_type_templates(id) on delete cascade;
      alter table element_type_template_fields alter id set default gen_random_uuid()::text,
        add description text, add placeholder text, add default_value text, add updated_at timestamptz, add source_default_field_id text,
        add is_default boolean not null default false,
        add foreign key (template_id) references element_type_templates(id) on delete cascade,
        add foreign key (section_id) references element_template_sections(id) on delete set null;
      alter table element_template_field_values add foreign key (template_field_id) references element_type_template_fields(id) on delete cascade;
      insert into element_type_templates(id, element_type_id, name, is_default, deleted) values
        ('archived', 'type1', 'Deleted template', false, true), ('custom', 'type1', 'Custom template', false, false);
      insert into element_template_sections(id, template_id, name, deleted) values
        ('archived-section', 'template1', 'Deleted section', true), ('old-section', 'archived', 'Archived template section', false);
      insert into element_type_template_fields(id, template_id, section_id, label, field_key, field_type, deleted) values
        ('archived-field', 'template1', 's1', 'Deleted field', 'removed', 'text', true);
      insert into chronicle_modules(id, element_id, module_type, data) values
        ('old-module', 'a', 'template_section', '{"section_id":"old-section","template_id":"archived"}');
      set role authenticated;`);

    await context.route(/cdn\.jsdelivr\.net\/npm\/(react@|react-dom@|reactflow@|elkjs@)/, route => {
      const url = route.request().url();
      const file = url.endsWith('.css') ? 'reactflow.css' : url.includes('react-dom@') ? 'react-dom.js'
        : url.includes('reactflow@') ? 'reactflow.js' : url.includes('elkjs@') ? 'elk.js' : 'react.js';
      return route.fulfill({path: 'node_modules/.cache/lexicon/canvas-vendor/' + file,
        contentType: url.endsWith('.css') ? 'text/css' : 'text/javascript'});
    });
    page.on('dialog', dialog => dialog.accept());
    const status = page.locator('[data-template-editor-status]');
    const openTypes = async () => {
      await page.getByRole('button', {name: 'Options', exact: true}).click();
      await page.locator('[data-open-types-modal]').click();
      await page.locator('[data-open-type-templates="type1"]').waitFor();
    };
    const openBuilder = async () => {
      await page.goto(base + '/universe-canvas.html?universe_id=u1');
      await page.locator('.react-flow__node').first().waitFor();
      await openTypes();
    };
    const selectTemplate = async id => page.locator(`[data-select-template="${id}"]`).click();
    const deleteTemplate = async id => {
      await selectTemplate(id);
      await page.locator(`[data-delete-template="${id}"]`).click();
      await status.getByText('Template deleted.', {exact: true}).waitFor();
      assert.equal(await page.locator(`[data-select-template="${id}"]`).count(), 0);
      assert.equal((await f.db.query('select count(*)::int n from element_type_templates where id=$1', [id])).rows[0].n, 0);
    };

    await openBuilder();
    await page.locator('[data-open-type-templates="type1"]').click();
    assert.equal(await page.locator('[data-select-template="archived"]').count(), 0);
    await selectTemplate('template1');
    assert.equal(await page.locator('[data-delete-template="template1"]').count(), 0, 'System defaults remain read-only');
    assert.equal(await page.locator('[data-section-id="archived-section"]').count(), 0);
    assert.equal(await page.locator('[data-field-id="archived-field"]').count(), 0);
    await page.locator('[data-close-template-editor]').click();

    // Create a type through the UI, then delete its generated starter template.
    await page.locator('[data-add-type]').click();
    await page.locator('[name="type-name"]').fill('Empire');
    await page.locator('[data-type-editor-host] [type="submit"]').click();
    await page.locator('[data-element-types-status]').getByText('Type added.', {exact: true}).waitFor();
    const type = (await f.db.query("select * from element_types where name='Empire'")).rows[0];
    const starter = (await f.db.query('select * from element_type_templates where element_type_id=$1', [type.id])).rows[0];
    assert.equal(starter.is_default, false);
    const section = (await f.db.query('select * from element_template_sections where template_id=$1', [starter.id])).rows[0];
    await f.db.query('update elements set rich_template_id=$1 where id=\'a\'', [starter.id]);
    await f.db.query("insert into element_type_template_fields(id, template_id, section_id, label, field_key, field_type) values('starter-field',$1,$2,'Capital','capital','text')", [starter.id, section.id]);
    await f.db.exec("insert into element_template_field_values(element_id,template_field_id,value) values('a','starter-field','City')");
    await page.locator(`[data-open-type-templates="${type.id}"]`).click();

    h.failNext('element_type_templates');
    await page.locator(`[data-delete-template="${starter.id}"]`).click();
    await status.getByText(/Could not delete template: Fixture save failed/).waitFor();
    assert.equal((await f.db.query("select rich_template_id from elements where id='a'")).rows[0].rich_template_id, starter.id, 'Failure does not detach elements');

    // A successful HTTP response with zero affected rows must not report deletion.
    await f.db.exec(`reset role;
      create function block_template_delete() returns trigger language plpgsql as $$begin return null; end$$;
      create trigger block_template_delete before delete on element_type_templates for each row execute function block_template_delete();
      set role authenticated;`);
    await page.locator(`[data-delete-template="${starter.id}"]`).click();
    await status.getByText(/Could not delete template:/).waitFor();
    assert.equal(await page.locator(`[data-select-template="${starter.id}"]`).count(), 1);
    assert.equal((await f.db.query("select rich_template_id from elements where id='a'")).rows[0].rich_template_id, starter.id);
    await f.db.exec('reset role; drop trigger block_template_delete on element_type_templates; set role authenticated;');
    await deleteTemplate(starter.id);
    assert.equal((await f.db.query("select rich_template_id from elements where id='a'")).rows[0].rich_template_id, null);
    assert.equal((await f.db.query('select count(*)::int n from element_template_sections where template_id=$1', [starter.id])).rows[0].n, 0);
    assert.equal((await f.db.query("select count(*)::int n from element_type_template_fields where id='starter-field'")).rows[0].n, 0);
    assert.equal((await f.db.query("select count(*)::int n from element_template_field_values where template_field_id='starter-field'")).rows[0].n, 0);
    await page.locator('[data-wide-template-list]').getByText('No templates yet.', {exact: true}).waitFor();
    await openBuilder();
    await page.locator(`[data-open-type-templates="${type.id}"]`).click();
    await page.locator('[data-wide-template-list]').getByText('No templates yet.', {exact: true}).waitFor();
    assert.equal((await f.db.query('select count(*)::int n from element_types where id=$1', [type.id])).rows[0].n, 1);

    await page.locator('[data-wide-add-template]').click();
    await page.locator('[name="template-name"]').fill('Manual template');
    await page.locator('[data-template-editor] [type="submit"]').click();
    await status.getByText('Template changes saved.', {exact: true}).waitFor();
    const manual = (await f.db.query("select id from element_type_templates where name='Manual template'")).rows[0].id;
    await deleteTemplate(manual);

    const imported = {format:'centralis.element-template.v1', version:1, template:{name:'Imported template'},
      sections:[{key:'overview',name:'Overview'}], fields:[{field_key:'capital',label:'Capital',field_type:'text',section:'overview'}]};
    await page.locator('[data-template-import-file]').setInputFiles({name:'template.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(imported))});
    await page.locator('[data-template-import-editor] [type="submit"]').click();
    await status.getByText('Template imported.', {exact: true}).waitFor();
    const importedId = (await f.db.query("select id from element_type_templates where name='Imported template'")).rows[0].id;
    const importedSection = (await f.db.query('select id from element_template_sections where template_id=$1', [importedId])).rows[0].id;
    const importedField = (await f.db.query('select id from element_type_template_fields where template_id=$1', [importedId])).rows[0].id;
    await f.db.query("insert into element_template_field_values(element_id,template_field_id,value) values('a',$1,'City')", [importedField]);
    await page.locator(`[data-delete-section="${importedSection}"]`).click();
    await status.getByText('Section deleted.', {exact:true}).waitFor();
    assert.equal((await f.db.query('select section_id from element_type_template_fields where id=$1', [importedField])).rows[0].section_id, null);
    assert.equal(await page.locator(`[data-field-id="${importedField}"]`).count(), 1, 'Section deletion preserves its unsectioned fields');
    await page.locator(`[data-delete-field="${importedField}"]`).click();
    await status.getByText('Field deleted.', {exact:true}).waitFor();
    assert.equal((await f.db.query('select count(*)::int n from element_template_field_values where template_field_id=$1', [importedField])).rows[0].n, 0);
    await deleteTemplate(importedId);

    // Read a legacy soft-deleted template through Chronicle and import lookup code.
    await f.db.exec("update elements set rich_template_id='template1' where id='a'");
    await page.goto(base + '/chronicle-editor.html#universe/u1/element/a');
    await page.getByRole('button', {name:'Save Element',exact:true}).waitFor();
    assert.equal(await page.locator('[name="workspace-template"] option[value="archived"]').count(), 0);
    assert.equal(await page.locator('[data-add-module="archived-section"]').count(), 0);
    assert.equal(await page.locator('[name="workspace-field:archived-field"]').count(), 0);
    assert.equal(await page.locator('[name="workspace-field:f1"]').count(), 1);
    const source = fs.readFileSync('flow-canvas.js','utf8');
    const start = source.indexOf('    async function fetchTemplateLibraryForImport()');
    const end = source.indexOf('    function normalizeTransferOptions',start);
    const sandbox = vm.createContext({window:{centralisSupabase:f.client()},elementTypes:[{id:'type1',name:'Place'}],
      normalizeLookupKey:s=>s.toLowerCase(),getTemplateFieldKey:field=>field.field_key});
    vm.runInContext(source.slice(start,end) + '\nglobalThis.fetchLibrary=fetchTemplateLibraryForImport;',sandbox);
    const library = await sandbox.fetchLibrary();
    assert.equal(library.templatesByTypeAndName.has('type1::deleted template'), false);
    assert.equal(library.fieldsByTemplateAndKey.has('template1::removed'), false);
    assert.equal(library.fieldsByTemplateAndKey.has('template1::population'), true);
    assert.deepEqual(h.errors, []);
    console.log('Template deletion passed: starter/manual/imported templates, foreign-key cleanup, empty types after reload, default protection, failed/zero-row deletes, section/field cleanup, and legacy filters in Builder/Chronicle/import lookup.');
  } catch (error) {
    console.error((await page.locator('body').innerText()).slice(-5000));
    throw error;
  } finally {
    await h.close();
  }
})().catch(error => {console.error(error);process.exitCode=1;});
