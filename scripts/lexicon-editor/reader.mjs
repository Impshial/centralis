import { marked } from 'marked';
import DOMPurify from 'dompurify';
export function markdown(value) {
  return DOMPurify.sanitize(marked.parse(String(value ?? ''),{gfm:true,breaks:true}),{
    ALLOWED_TAGS:['p','br','strong','b','em','i','u','s','del','code','pre','blockquote','ul','ol','li','h1','h2','h3','h4','h5','h6','hr','a','table','thead','tbody','tr','th','td'],
    ALLOWED_ATTR:['href','title','start'],ALLOW_DATA_ATTR:false
  });
}
