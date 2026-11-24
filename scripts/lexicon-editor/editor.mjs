import { Editor, Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Image from '@tiptap/extension-image';
import { TableKit } from '@tiptap/extension-table';
import { markdown } from './reader.mjs';
const ArticleLink=Link.extend({addAttributes(){return {...this.parent?.(),articleId:{default:null,parseHTML:element=>element.getAttribute('data-article-id'),renderHTML:attributes=>attributes.articleId?{'data-article-id':attributes.articleId}:{}}};}});
// Once Markdown has become editor nodes, do not parse escaped literal text again.
const ContentFormat=Extension.create({name:'lexiconContentFormat',addGlobalAttributes(){return [{types:['doc'],attributes:{lexiconFormat:{default:'rich-text',rendered:false}}}];}});
export function createEditor(element,content,onUpdate=()=>{}) {
  const editor=new Editor({element,content,extensions:[StarterKit.configure({link:false}),ArticleLink.configure({autolink:false,linkOnPaste:false,openOnClick:false,HTMLAttributes:{target:null}}),Image,TableKit,ContentFormat],editorProps:{
    attributes:{class:'lexicon-tiptap',role:'textbox','aria-multiline':'true','aria-label':element.dataset.label || 'Article text'},
    handlePaste(_view,event) {
      const text=event.clipboardData?.getData('text/plain');
      if(!text||editor.isActive('codeBlock')||editor.isActive('code'))return false;
      const html=event.clipboardData.getData('text/html');
      if(html) {
        const template=document.createElement('template');template.innerHTML=html;
        if(template.content.querySelector('table,b,strong,i,em,u,s,del,a,code,pre,blockquote,ul,ol,li,h1,h2,h3,h4,h5,h6,img'))return false;
      }
      return editor.commands.insertContent(markdown(text));
    }
  },onUpdate});
  return editor;
}
