import { build } from 'esbuild';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';
const root=fileURLToPath(new URL('../../',import.meta.url));
// Escaped strings preserve Markdown hard-break spaces without trailing whitespace.
for(const name of ['reader','editor']) await build({entryPoints:[fileURLToPath(new URL(`${name}.mjs`,import.meta.url))],outfile:`${root}assets/vendor/lexicon-${name}.js`,bundle:true,minify:true,format:'esm',target:'es2022',supported:{'template-literal':false},legalComments:'linked'});
const cache=fileURLToPath(new URL('node_modules/.pnpm/',import.meta.url)),licenses=new Map();
function collect(dir){
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
    if(entry.name.startsWith('.'))continue;
    const path=`${dir}/${entry.name}`;
    if(entry.name.startsWith('@')){collect(path);continue;}
    const manifest=`${path}/package.json`;if(!fs.existsSync(manifest))continue;
    const pkg=JSON.parse(fs.readFileSync(manifest,'utf8')),key=`${pkg.name}@${pkg.version}`;if(licenses.has(key))continue;
    const files=fs.readdirSync(path).filter(name=>/^licen[cs]e(?:\.|$)/i.test(name));
    if(files.length)licenses.set(key,files.map(name=>fs.readFileSync(`${path}/${name}`,'utf8')).join('\n'));
  }
}
for(const entry of fs.readdirSync(cache,{withFileTypes:true}))if(entry.isDirectory()&&fs.existsSync(`${cache}/${entry.name}/node_modules`))collect(`${cache}/${entry.name}/node_modules`);
fs.writeFileSync(`${root}assets/vendor/lexicon.LICENSE.txt`,[...licenses].sort(([a],[b])=>a.localeCompare(b)).map(([name,license])=>`${name}\n${'='.repeat(name.length)}\n${license}`).join('\n\n'));
