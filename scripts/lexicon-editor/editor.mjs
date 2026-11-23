import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
const ArticleLink=Link.extend({addAttributes(){return {...this.parent?.(),articleId:{default:null,parseHTML:element=>element.getAttribute('data-article-id'),renderHTML:attributes=>attributes.articleId?{'data-article-id':attributes.articleId}:{}}};}});
export function createEditor(element,content,onUpdate=()=>{}) {
  return new Editor({element,content,extensions:[StarterKit.configure({link:false}),ArticleLink.configure({autolink:false,linkOnPaste:false,openOnClick:false,HTMLAttributes:{target:null}}),Image,TableKit],editorProps:{attributes:{class:'lexicon-tiptap',role:'textbox','aria-multiline':'true','aria-label':element.dataset.label || 'Article text'}},onUpdate});
}
