import {createAdminClient,createSignedImageUrl,getAuthUser,handleCors,jsonResponse,uploadImageBytes,createCentralisStorageMetadata} from '../_shared/image-storage.ts';

Deno.serve(async req=>{
  const cors=handleCors(req);if(cors)return cors;
  let user;
  try {user=await getAuthUser(req);}catch{return jsonResponse({error:'Sign in to manage wiki images.'},401);}
  try {
    const multipart=req.headers.get('content-type')?.includes('multipart/form-data');
    const form=multipart?await req.formData():null;
    const input=form?Object.fromEntries(form):await req.json();
    const db=createAdminClient();
    const {data:profile}=await db.from('users').select('id').eq('clerk_user_id',user.id).single();
    if(!profile)return jsonResponse({error:'Account unavailable.'},403);
    const {data:wiki}=await db.from('lexicon_wikis').select('id,universe_id,name').eq('id',input.wikiId).eq('user_id',profile.id).single();
    if(!wiki)return jsonResponse({error:'Wiki unavailable.'},404);
    async function readableImage(id) {
      const {data:row,error}=await db.from('image_table').select('id,object_id,user_id,image_url').eq('id',id).eq('deleted',false).single();
      if(error || !row)return null;
      if(row.user_id===user.id)return row;
      const [{data:universe},{data:element}]=await Promise.all([
        db.from('universes').select('id').eq('id',row.object_id).eq('user_id',profile.id).eq('deleted',false).maybeSingle(),
        db.from('elements').select('id').eq('id',row.object_id).eq('user_id',profile.id).eq('deleted',false).maybeSingle()
      ]);
      return universe || element ? row : null;
    }
    async function signed(row) {
      const original=row.source_image_id?await readableImage(row.source_image_id):null;
      if(row.source_image_id && !original)return {...row,image_url:null};
      return {...row,image_url:await createSignedImageUrl(original?.image_url || row.storage_key)};
    }
    if(input.action==='resolve') {
      const ids=Array.isArray(input.ids)?input.ids.slice(0,200):[];
      if(!ids.length)return jsonResponse({media:[]});
      const {data,error}=await db.from('lexicon_media').select('*').eq('wiki_id',wiki.id).in('id',ids);
      if(error)throw error;
      return jsonResponse({media:await Promise.all((data || []).map(signed))});
    }
    if(input.action==='library') {
      const offset=Math.max(0,Number(input.offset)||0);
      const {data,error}=await db.from('image_table').select('id,object_id,image_url').eq('user_id',user.id).eq('deleted',false).order('id').range(offset,offset+49);
      if(error)throw error;
      // Legacy assets may have no uploader. Enumerate only records owned by this account.
      const objectIds=[];
      for(const table of ['universes','elements'])for(let start=0;;start+=200){
        const owned=await db.from(table).select('id').eq('user_id',profile.id).eq('deleted',false).order('id').range(start,start+199);
        if(owned.error)throw owned.error;objectIds.push(...(owned.data||[]).map(row=>row.id));if(owned.data?.length!==200)break;
      }
      const galleries=[];
      for(let i=0;i<objectIds.length;i+=60){
        const result=await db.from('image_table').select('id,object_id,image_url').in('object_id',objectIds.slice(i,i+60)).eq('deleted',false).order('id').range(offset,offset+49);
        if(result.error)throw result.error;galleries.push(...(result.data||[]));
      }
      const rows=[...new Map([...(data || []),...galleries].map(row=>[row.id,row])).values()];
      const images=[];
      for(const row of rows)if(await readableImage(row.id))images.push({...row,image_url:await createSignedImageUrl(row.image_url)});
      return jsonResponse({images,nextOffset:(data?.length===50 || galleries.length>=50)?offset+50:null});
    }
    const id=String(input.id || '');
    if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))return jsonResponse({error:'Invalid image ID.'},400);
    const {data:existing}=await db.from('lexicon_media').select('*').eq('wiki_id',wiki.id).eq('id',id).maybeSingle();
    if(existing)return jsonResponse({media:await signed(existing)});
    let row;
    if(form) {
      const file=form.get('file');
      const extensions:Record<string,string>={'image/png':'png','image/jpeg':'jpg','image/webp':'webp','image/gif':'gif','image/avif':'avif'};
      if(!(file instanceof File) || !extensions[file.type] || file.size>15*1024*1024)return jsonResponse({error:'Choose a PNG, JPEG, WebP, GIF or AVIF image under 15 MB.'},400);
      const key=`images/lexicon/${wiki.id}/${id}.${extensions[file.type]}`;
      const storageUrl=await uploadImageBytes({bytes:new Uint8Array(await file.arrayBuffer()),key,contentType:file.type,metadata:createCentralisStorageMetadata({module:'Lexicon',context:wiki.name,note:'Wiki illustration'})});
      row={id,wiki_id:wiki.id,storage_key:storageUrl,name:file.name};
    } else if(input.action==='register') {
      const source=await readableImage(input.sourceImageId);
      if(!source)return jsonResponse({error:'Image unavailable.'},404);
      row={id,wiki_id:wiki.id,source_image_id:source.id,name:'Existing image'};
    } else return jsonResponse({error:'Unsupported image action.'},400);
    let {data,error}=await db.from('lexicon_media').insert(row).select().single();
    if(error?.code==='23505') {
      const retry=await db.from('lexicon_media').select('*').eq('wiki_id',wiki.id).eq('id',id).maybeSingle();
      if(retry.data){data=retry.data;error=null;}
    }
    if(error)throw error;
    return jsonResponse({media:await signed(data)});
  }catch(error){console.error(error);return jsonResponse({error:'Could not save or load the wiki image.'},500);}
});
