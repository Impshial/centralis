const { PGlite } = require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
const fs = require('node:fs');
const crypto = require('node:crypto');
const sourceTables = ['universes','elements','element_links','element_groups','element_types','element_type_templates','element_template_sections','element_type_template_fields','element_template_field_values','element_custom_fields','universe_custom_fields','chronicle_modules'];
async function fixture() {
 const db = new PGlite();
 await db.exec(`create role authenticated; create role anon; create role service_role; create schema auth;
 create function auth.uid() returns text language sql stable as $$select current_setting('request.jwt.claim.sub',true)$$;
 grant usage on schema auth to authenticated;
 create table users(id integer primary key, clerk_user_id text); insert into users values(1,'owner'),(2,'other');
 create table universes(id varchar primary key,user_id integer,name text,description text,deleted boolean default false,updated_at timestamptz default now());
 create table elements(id varchar primary key,user_id integer,universe_id varchar,name text,description text,element_type_id varchar,rich_template_id varchar,group_id varchar,updated_at timestamptz default now(),created_at timestamptz default now(),deleted boolean default false);
 create table element_groups(id varchar primary key,universe_id varchar,name text,parent_group_id varchar,deleted boolean default false);
 create table element_links(id varchar primary key,universe_id varchar,source_element_id varchar,target_element_id varchar,label text,created_at timestamptz default now(),deleted boolean default false);
 create table element_types(id varchar primary key,user_id integer,name text,icon text,color text,deleted boolean default false);
 create table element_type_templates(id varchar primary key,element_type_id varchar,name text,is_default boolean default true,deleted boolean default false);
 create table element_template_sections(id varchar primary key,template_id varchar,name text,sort_order integer,is_hidden boolean default false,deleted boolean default false);
 create table element_type_template_fields(id varchar primary key,template_id varchar,section_id varchar,label text,field_key text,field_type text,sort_order integer,options jsonb,is_hidden boolean default false,is_required boolean default false,deleted boolean default false);
 create table element_template_field_values(id varchar primary key default gen_random_uuid()::text,element_id varchar,template_field_id varchar,value text,updated_at timestamptz default now(),deleted boolean default false, unique(element_id,template_field_id));
 create table element_custom_fields(id varchar primary key default gen_random_uuid()::text,element_id varchar,name text,value text,sort_order integer,deleted boolean default false);
 create table universe_custom_fields(id varchar primary key,universe_id varchar,name text,value text,sort_order integer,deleted boolean default false);
 create table chronicle_modules(id varchar primary key default gen_random_uuid()::text,element_id varchar,user_id integer,module_type text,data jsonb,sort_order integer,title text,source text,updated_at timestamptz default now(),deleted boolean default false);
 insert into universes(id,user_id,name,description,deleted) values('u1',1,'Aesterra','A world reference.',false),('u2',2,'Private','Other account',false);
 insert into element_types(id,user_id,name) values('type1',1,'Place');
 insert into element_type_templates(id,element_type_id,name) values('template1','type1','Place template');
 insert into element_groups(id,universe_id,name,parent_group_id) values('g1','u1','Regions',null),('g2','u1','Coast','g1');
 insert into elements(id,user_id,universe_id,name,description,element_type_id,rich_template_id,group_id) values
 ('a',1,'u1','Stormhaven','A coastal city. Population is ordinary prose.','type1','template1','g2'),
 ('b',1,'u1','Harbor','A port.','type1','template1','g1'),('c',1,'u1','Island','An unconnected island.','type1','template1',null),
 ('private',2,'u2','Private place','Hidden','type1','template1',null);
 insert into element_links(id,universe_id,source_element_id,target_element_id,label) values
 ('root','u1','u1','a','Contains'),('l1','u1','a','b','Trades with'),('l2','u1','a','b','Governs'),('l3','u1','b','a','Returns to');
 insert into element_template_sections values('s1','template1','Geography',0,false,false),('s2','template1','Hidden section',1,true,false);
 insert into element_type_template_fields(id,template_id,section_id,label,field_key,field_type,sort_order,is_hidden) values
 ('f1','template1','s1','Population count','population','number',0,false),('f2','template1','s1','Coastal','coastal','checkbox',1,false),
 ('f3','template1','s1','Empty field','empty','text',2,false),('f4','template1','s1','Hidden field','hidden','text',3,true);
 insert into element_template_field_values(element_id,template_field_id,value) values ('a','f1','100'),('b','f1','200'),('a','f2','false'),('a','f4','Secret');
 insert into chronicle_modules(id,element_id,user_id,module_type,data,sort_order,title,source) values
 ('m1','a',1,'template_section','{"section_id":"s1","template_id":"template1"}',0,'Geography','manual'),
 ('m2','b',1,'template_section','{"section_id":"s1","template_id":"template1"}',0,'Geography','manual');
 insert into element_custom_fields values('custom1','a','Founded','0',0,false);
 insert into universe_custom_fields values('uc1','u1','Era','Third Age',0,false);
 grant select,insert,update,delete on all tables in schema public to authenticated;
 `);
 await db.exec(fs.readFileSync('supabase/migrations/20261123001138_add_lexicon_wikis.sql','utf8'));
 await db.exec(`create table image_table(id varchar primary key,object_id varchar,image_url text,is_primary boolean default false,sort_order integer default 0,user_id varchar,created_at timestamptz default now(),deleted boolean default false);alter table elements add column body text;grant select,insert,update,delete on image_table to authenticated;`);
 await db.exec(fs.readFileSync('supabase/migrations/20261123041951_complete_lexicon_chronicle.sql','utf8'));
 await db.exec("set request.jwt.claim.sub='owner';set role authenticated");
 const writes = [];
 const safe = name => { if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Invalid SQL identifier'); return '"'+name+'"'; };
 async function request(op) {
  const args=[]; const bind=v => {args.push(v);return '$'+args.length;};
  try {
   const table=safe(op.table);
   let conditions=(op.filters || []).map(([kind,name,val]) => kind==='in' ? `${safe(name)} = any(${bind(val)})` : val === null ? `${safe(name)} is null` : `${safe(name)} = ${bind(val)}`);
   let sql;
   if (['insert','upsert'].includes(op.method)) {
    const rows=Array.isArray(op.payload)?op.payload:[op.payload]; const cols=Object.keys(rows[0]);
    sql=`insert into ${table} (${cols.map(safe)}) values ${rows.map(row=>'('+cols.map(c=>bind(row[c] !== null && typeof row[c]==='object' ? JSON.stringify(row[c]) : row[c])).join(',')+')').join(',')}`;
    if(op.method==='upsert') {const keys=(op.conflict||'id').split(','); const updates=cols.filter(c=>!keys.includes(c));sql+=` on conflict (${keys.map(safe)}) do ${updates.length?'update set '+updates.map(c=>`${safe(c)}=excluded.${safe(c)}`).join(','):'nothing'}`;}
    sql+=' returning *';
   } else if(op.method==='update') {sql=`update ${table} set ${Object.keys(op.payload).map(c=>`${safe(c)}=${bind(op.payload[c] !== null && typeof op.payload[c]==='object' ? JSON.stringify(op.payload[c]) : op.payload[c])}`).join(',')}${conditions.length?' where '+conditions.join(' and '):''} returning *`;}
   else if(op.method==='delete') sql=`delete from ${table}${conditions.length?' where '+conditions.join(' and '):''} returning *`;
   else {
    const cols=op.columns && op.columns!=='*' ? op.columns.split(',').map(safe).join(','):'*';
    sql=`select ${cols} from ${table}${conditions.length?' where '+conditions.join(' and '):''}`;
    if(op.orders?.length) sql+=' order by '+op.orders.map(([name,asc])=>safe(name)+(asc===false?' desc':' asc')).join(',');
    if(op.range) sql+=` limit ${Number(op.range[1])-Number(op.range[0])+1} offset ${Number(op.range[0])}`;
    if(op.limit) sql+=` limit ${Number(op.limit)}`;
   }
   if(op.method!=='select') writes.push(op);
   // JSONB primitive values must be encoded, too.
   if(['lexicon_overrides','lexicon_fields','lexicon_facts'].includes(op.table) && op.payload && !Array.isArray(op.payload)) {
    const value=op.payload.value;
    if(value !== undefined && (typeof value !== 'object' || value === null)) {
     const index=op.method==='update' ? Object.keys(op.payload).indexOf('value') + (op.filters?.filter(f=>f[2]!==null).length || 0) : Object.keys(op.payload).indexOf('value');
     args[index]=JSON.stringify(value);
    }
   }
   const result=await db.query(sql,args); const rows=result.rows;
   if(op.single && rows.length!==1 && !(op.single==='maybe' && rows.length===0)) throw new Error('Expected one row');
   return {data:op.single ? rows[0]||null:rows,error:null};
  } catch(error) {return {data:null,error:{message:error.message,code:error.code}};}
 }
 function client() {
  return { from(table) {
   const op={table,method:'select',filters:[],orders:[]};
   const q={select(columns='*'){op.columns=columns;return q;},eq(k,v){op.filters.push(['eq',k,v]);return q;},in(k,v){op.filters.push(['in',k,v]);return q;},is(k,v){op.filters.push(['eq',k,v]);return q;},order(k,o={}){op.orders.push([k,o.ascending]);return q;},range(a,b){op.range=[a,b];return q;},limit(n){op.limit=n;return q;},insert(p){op.method='insert';op.payload=p;return q;},upsert(p,o={}){op.method='upsert';op.payload=p;op.conflict=o.onConflict;return q;},update(p){op.method='update';op.payload=p;return q;},delete(){op.method='delete';return q;},single(){op.single=true;return q;},maybeSingle(){op.single='maybe';return q;},then(resolve,reject){return request(op).then(resolve,reject);}};return q;
  },functions:{invoke:async()=>({data:{images:[]},error:null})}};
 }
 async function snapshot() {const result={};for(const t of sourceTables)result[t]=(await db.query(`select * from ${t} order by id`)).rows;return result;}
 return {db,request,client,writes,snapshot,uuid:crypto.randomUUID};
}
module.exports={fixture,sourceTables};
