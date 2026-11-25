import {markdown} from './assets/vendor/lexicon-reader.js?v=markdown-render-1';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const safeUrl=v=>/^(https?:|mailto:|[?#/]|lexicon-wiki\.html)/i.test(v||'')?v:'';
const nameIndexes=new WeakMap();
function nameIndex(model) {
  if(nameIndexes.has(model))return nameIndexes.get(model);
  const names=new Map();
  for(const a of model.articles.values())if(!a.hidden)for(const name of new Set([a.title,a.base?.title,...a.aliases].filter(Boolean))) {
    const key=name.trim().toLocaleLowerCase();if(!key)continue;
    if(!names.has(key))names.set(key,new Set());names.get(key).add(a.id);
  }
  nameIndexes.set(model,names);return names;
}
export function html(value) {
  let doc=value;try{if(typeof doc==='string')doc=JSON.parse(doc);}catch{}
  if(doc?.type!=='doc')return markdown(typeof value==='object'?JSON.stringify(value):value);
  const parseMarkdown=doc.attrs?.lexiconFormat!=='rich-text';
  function paragraphs(items) {
    const fragments=[];let prefix='\uE000lexicon';
    while(JSON.stringify(items).includes(prefix))prefix+='x';
    const source=items.map(p=>(p.content||[]).map(n=>{
      if(n.type==='hardBreak')return '\n';
      if(n.type==='text'&&!n.marks?.length)return n.text;
      const token=prefix+fragments.length+'\uE001';
      fragments.push({token,html:node(n),text:n.text||''});return token;
    }).join('')).join('\n\n');
    return markdown(source,fragments);
  }
  function children(n) {
    if(!parseMarkdown||n.type==='codeBlock')return (n.content||[]).map(node).join(n.type==='doc'?'\n':'');
    const rendered=[],pending=[];
    const flush=()=>{if(pending.length){rendered.push(paragraphs(pending));pending.length=0;}};
    for(const child of n.content||[]) {
      if(child.type==='paragraph')pending.push(child);
      else {flush();rendered.push(node(child));}
    }
    flush();return rendered.join(n.type==='doc'?'\n':'');
  }
  function node(n) {
    if(n.type==='text') {
      let s=esc(n.text);
      for(const m of n.marks||[]) {
        const tags={bold:'strong',italic:'em',strike:'s',underline:'u',code:'code'};
        if(tags[m.type])s=`<${tags[m.type]}>${s}</${tags[m.type]}>`;
        if(m.type==='link')s=`<a href="${esc(safeUrl(m.attrs?.href))}"${m.attrs?.articleId?` data-article-id="${esc(m.attrs.articleId)}"`:''}>${s}</a>`;
      }
      return s;
    }
    const inner=children(n);
    const tag={paragraph:'p',bulletList:'ul',orderedList:'ol',listItem:'li',blockquote:'blockquote',codeBlock:'pre',table:'table',tableRow:'tr',tableCell:'td',tableHeader:'th',heading:`h${Math.min(6,Math.max(2,n.attrs?.level||2))}`}[n.type];
    if(tag){let attrs=tag==='ol'?` start="${Math.max(1,Number(n.attrs?.start)||1)}"`:['td','th'].includes(tag)?` colspan="${Math.min(100,Math.max(1,Number(n.attrs?.colspan)||1))}" rowspan="${Math.min(100,Math.max(1,Number(n.attrs?.rowspan)||1))}"`:'';if(['td','th'].includes(tag)&&['left','center','right'].includes(n.attrs?.align))attrs+=` align="${n.attrs.align}"`;return `<${tag}${attrs}>${inner}</${tag}>`;}
    if(n.type==='hardBreak')return '<br>';
    if(n.type==='horizontalRule')return '<hr>';
    // Images belong to separately scoped media placements, never arbitrary stored URLs.
    return inner;
  }
  return node(doc);
}
export function textNodes(root) {
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,{acceptNode:n=>n.parentElement?.closest('figure,[data-point-marker]')?NodeFilter.FILTER_REJECT:NodeFilter.FILTER_ACCEPT});
  const nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);return nodes;
}
export const plain=root=>textNodes(root).map(n=>n.textContent).join('');
export function anchor(root,range) {
  const before=document.createRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);
  const end=document.createRange();end.selectNodeContents(root);end.setEnd(range.endContainer,range.endOffset);
  const start=plain(before.cloneContents()).length,stop=plain(end.cloneContents()).length,s=plain(root);
  return {quote:s.slice(start,stop),prefix:s.slice(Math.max(0,start-48),start),suffix:s.slice(stop,stop+48),start,end:stop};
}
export function locate(text,a) {
  if(!a || typeof a.quote!=='string')return null;
  const candidates=[];
  if(a.quote) {let p=text.indexOf(a.quote);while(p!==-1){candidates.push(p);p=text.indexOf(a.quote,p+1);}}
  else for(let i=0;i<=text.length;i++)if((!a.prefix||text.slice(0,i).endsWith(a.prefix))&&(!a.suffix||text.slice(i).startsWith(a.suffix)))candidates.push(i);
  if(!a.quote&&!candidates.length) {
    const before=[],after=[];
    for(let i=0;i<=text.length;i++){if(a.prefix&&text.slice(0,i).endsWith(a.prefix))before.push(i);if(a.suffix&&text.slice(i).startsWith(a.suffix))after.push(i);}
    if(before.length===1&&!after.length)return {start:before[0],end:before[0]};
    if(after.length===1&&!before.length)return {start:after[0],end:after[0]};
  }
  if(candidates.length===1)return {start:candidates[0],end:candidates[0]+a.quote.length};
  const context=candidates.filter(p=>(!a.prefix||text.slice(0,p).endsWith(a.prefix))&&(!a.suffix||text.slice(p+a.quote.length).startsWith(a.suffix)));
  return context.length===1?{start:context[0],end:context[0]+a.quote.length}:null;
}
export function rangeAt(root,start,end=start) {
  const nodes=textNodes(root),r=document.createRange();let offset=0,found=false;
  for(const n of nodes) {const stop=offset+n.length;if(!found&&start<=stop){r.setStart(n,Math.max(0,start-offset));found=true;}if(found&&end<=stop){r.setEnd(n,Math.max(0,end-offset));return r;}offset=stop;}
  r.selectNodeContents(root);r.collapse(false);return r;
}
function unwrap(a){a.replaceWith(...a.childNodes);}
function wrap(root,pos,attrs,tag='a') {
  let offset=0;const segments=[];
  for(const n of textNodes(root)){const end=offset+n.length;if(end>pos.start&&offset<pos.end&&!n.parentElement.closest('a,code,pre'))segments.push({n,start:Math.max(0,pos.start-offset),end:Math.min(n.length,pos.end-offset)});offset=end;}
  for(const {n,start,end} of segments.reverse()) {const r=document.createRange();r.setStart(n,start);r.setEnd(n,end);const a=document.createElement(tag);for(const [k,v]of Object.entries(attrs))a.setAttribute(k,v);r.surroundContents(a);}
}
export function insertFigure(root,pos,figure) {
  const r=rangeAt(root,pos.start);const block=r.startContainer.parentElement?.closest('p,h2,h3,h4,h5,h6');
  if(block&&root.contains(block)) {const tail=document.createRange();tail.selectNodeContents(block);tail.setStart(r.startContainer,r.startOffset);const after=block.cloneNode(false);after.append(tail.extractContents());block.after(figure,after);}
  else r.insertNode(figure);
}
export function decorate(root,subject,model,article,url,used,media,linked=used) {
  const errors=[],text=plain(root);
  for(const a of root.querySelectorAll('a')) {
    const target=new URL(a.getAttribute('href')||'',location.href);
    const id=a.dataset.articleId || (target.pathname.endsWith('/lexicon-wiki.html')&&target.searchParams.get('wiki')===model.wiki.id?target.searchParams.get('article')||model.wiki.universe_id:null);
    if(id){const dest=model.articles.get(id);if(!dest||dest.hidden){unwrap(a);continue;}a.dataset.articleId=id;a.href=url(id);used.add(id);linked.add(id);}
  }
  const annotations=model.annotations.filter(n=>n.article_id===article.id&&n.subject_type===subject.type&&n.subject_id===subject.id&&n.property===subject.property);
  const blocked=[];
  for(const n of annotations.filter(n=>n.kind==='unlink')) {
    const p=locate(text,n.anchor);if(!p){errors.push(n);continue;}blocked.push(p);
    const r=rangeAt(root,p.start,p.end);for(const a of root.querySelectorAll('a'))if(r.intersectsNode(a))unwrap(a);
  }
  for(const n of annotations.filter(n=>n.kind==='link')) {
    const p=locate(text,n.anchor),dest=model.articles.get(n.target_id);if(!p){errors.push(n);continue;}if(!dest||dest.hidden)continue;
    const r=rangeAt(root,p.start,p.end);for(const a of root.querySelectorAll('a'))if(r.intersectsNode(a))unwrap(a);
    wrap(root,p,{href:url(dest.id),'data-article-id':dest.id,'data-annotation-id':n.id});used.add(dest.id);linked.add(dest.id);
  }
  const names=nameIndex(model);
  const suppressed=new Set(model.annotations.filter(n=>n.article_id===article.id&&n.kind==='auto_suppress').map(n=>n.target_id));
  const candidates=[];
  for(const [name,ids]of names) {
    if(ids.size!==1)continue;const id=[...ids][0];if(id===article.id||used.has(id)||suppressed.has(id))continue;
    let at=text.toLocaleLowerCase().indexOf(name);while(at!==-1){const end=at+name.length;if(!/[\p{L}\p{N}_]/u.test(text[at-1]||' ')&&!/[\p{L}\p{N}_]/u.test(text[end]||' '))candidates.push({start:at,end,id});at=text.toLocaleLowerCase().indexOf(name,at+1);}
  }
  for(const p of candidates.sort((a,b)=>a.start-b.start||b.end-a.end)) {
    if(used.has(p.id)||blocked.some(b=>b.start<p.end&&b.end>p.start))continue;
    const r=rangeAt(root,p.start,p.end);if([...root.querySelectorAll('a,code,pre,[data-article-mention]')].some(a=>r.intersectsNode(a)))continue;
    // Repeated references stay plain text, but remain available to section illustrations.
    if(linked.has(p.id))wrap(root,p,{'data-article-mention':p.id},'span');
    else wrap(root,p,{href:url(p.id),'data-article-id':p.id,'data-auto-link':'true'});
    used.add(p.id);linked.add(p.id);
  }
  errors.push(...decorateImages(root,subject,model,article,media));
  return errors;
}
export function decorateImages(root,subject,model,article,media) {
  const errors=[],text=plain(root);
  const annotations=model.annotations.filter(n=>n.kind==='image'&&n.article_id===article.id&&n.subject_type===subject.type&&n.subject_id===subject.id&&n.property===subject.property);
  for(const n of annotations.sort((a,b)=>b.anchor.start-a.anchor.start)) {
    if([...root.querySelectorAll('figure[data-annotation-id]')].some(el=>el.dataset.annotationId===n.id))continue;
    const p=locate(text,n.anchor);if(!p){errors.push(n);continue;}
    const source=media.get(n.media_id);if(!source?.image_url)continue;
    const figure=document.createElement('figure');figure.dataset.annotationId=n.id;
    const img=document.createElement('img');img.src=source.image_url;img.alt=n.alt||'';figure.append(img);
    if(n.caption){const cap=document.createElement('figcaption');cap.textContent=n.caption;figure.append(cap);}insertFigure(root,p,figure);
  }
  return errors;
}
