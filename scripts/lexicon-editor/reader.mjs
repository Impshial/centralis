import { Marked } from 'marked';
import DOMPurify from 'dompurify';
const standard = new Marked({gfm:true,breaks:true});
const parser = new Marked({gfm:true,breaks:true});
// Clipboard paragraphs can insert empty lines between otherwise valid table rows.
// A block tokenizer leaves fenced/indented code and unrelated pipe text alone.
parser.use({extensions:[{
  name:'spacedTable',level:'block',
  start(source) {return source.search(/^ {0,3}\S[^\n]*\|[^\n]*\n(?:[ \t]*\n)* {0,3}\|?[ \t]*:?-+/m);},
  tokenizer(source) {
    const lines=source.split('\n'),row=line=>/^ {0,3}\S/.test(line)&&/(?<!\\)\|/.test(line);
    if(!row(lines[0]))return;
    let separator=1;
    while(separator<lines.length&&!lines[separator].trim())separator++;
    if(separator>=lines.length||!/^ {0,3}[| :\t-]+$/.test(lines[separator]))return;
    const compact=[lines[0],lines[separator]],indices=[0,separator];
    if(standard.lexer(compact.join('\n')+'\n')[0]?.type!=='table')return;
    let hasGap=separator>1;
    for(let i=separator+1;i<lines.length;) {
      let next=i;while(next<lines.length&&!lines[next].trim())next++;
      if(next>=lines.length||!row(lines[next]))break;
      compact.push(lines[next]);indices.push(next);hasGap ||= next>i;i=next+1;
    }
    if(!hasGap)return;
    const table=standard.lexer(compact.join('\n')+'\n')[0];
    const consumed=table.raw.replace(/\n$/,'').split('\n').length;
    table.raw=lines.slice(0,indices[consumed-1]+1).join('\n');
    if(source[table.raw.length]==='\n')table.raw+='\n';
    return table;
  }
}],renderer:{checkbox({checked}) {return checked?'☑ ':'☐ ';}}});

export function markdown(value,fragments=[]) {
  const rendered=DOMPurify.sanitize(parser.parse(String(value ?? '')),{
    ALLOWED_TAGS:['p','br','strong','b','em','i','u','s','del','code','pre','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','a','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR:['href','title','start','align'],ALLOW_DATA_ATTR:false
  });
  if(!fragments.length)return rendered;
  // Rich text marks are already safely rendered by Lexicon. Preserve them while
  // parsing Markdown around them, including explicit article-link identities.
  const template=document.createElement('template');template.innerHTML=rendered;
  const walker=document.createTreeWalker(template.content,NodeFilter.SHOW_TEXT),nodes=[];
  while(walker.nextNode())nodes.push(walker.currentNode);
  for(const node of nodes) {
    const matches=fragments.filter(f=>node.data.includes(f.token));if(!matches.length)continue;
    const pattern=new RegExp(matches.map(f=>f.token).join('|'),'g'),parts=node.data.split(pattern),tokens=node.data.match(pattern),replacement=document.createDocumentFragment();
    parts.forEach((part,index)=>{
      replacement.append(document.createTextNode(part));if(!tokens[index])return;
      const fragment=matches.find(f=>f.token===tokens[index]);
      if(node.parentElement?.closest('code,pre'))replacement.append(document.createTextNode(fragment.text));
      else {const inline=document.createElement('template');inline.innerHTML=fragment.html;replacement.append(inline.content);}
    });
    node.replaceWith(replacement);
  }
  return template.innerHTML;
}
