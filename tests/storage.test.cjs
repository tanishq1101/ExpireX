const { test } = require('node:test');
const assert = require('node:assert/strict');
const { saveItem } = require('../lib/save-item.ts');
const { withImagePreviews } = require('../lib/storage.ts');
const { cleanupAccount } = require('../lib/account-cleanup.ts');

function saveDb() {
  const state={uploads:[],removed:[],row:null,error:null,updateIds:[],zero:false};
  const db={
    state,
    storage:{from:()=>({upload:async(path)=>{state.uploads.push(path);return {error:null};},remove:async(paths)=>{state.removed.push(...paths);return {error:null};}})},
    from(){let payload,filterPath;const q={
      upsert(p){payload=p;state.updateIds.push(p.id);return q;},update(p){payload=p;return q;},
      eq(k,v){if(k==='image_url')filterPath=v;return q;},select(){return q;},limit(){return q;},
      async maybeSingle(){if(state.error)return{data:null,error:state.error};if(state.zero)return{data:null,error:null};state.row=payload;return{data:{id:'stable-id'},error:null};},
      then(resolve){return Promise.resolve({data:state.row?.image_url===filterPath?[{id:'stable-id'}]:[],error:null}).then(resolve);},
    };return q;},
  };return db;
}
const options=()=>({id:'stable-id',userId:'alice',mode:'create',payload:{name:'Milk'},file:new File(['image'],'photo.jpg',{type:'image/jpeg'}),staged:{current:null},oldImage:null});

test('a definitive save rejection removes its new upload',async()=>{
  const db=saveDb();db.state.error={code:'23514',message:'Rejected'};
  await assert.rejects(saveItem(db,options()),/Rejected/);
  assert.equal(db.state.uploads.length,1);
  assert.deepEqual(db.state.removed,db.state.uploads);
});
test('an uncertain network save retains and reuses the upload and stable item ID on retry',async()=>{
  const db=saveDb();const opts=options();db.state.error={code:'',message:'Network failed'};
  await assert.rejects(saveItem(db,opts));
  assert.equal(db.state.removed.length,0);assert.ok(opts.staged.current);
  db.state.error=null;
  await saveItem(db,opts);
  assert.equal(db.state.uploads.length,1);
  assert.deepEqual(db.state.updateIds,['stable-id','stable-id']);
});
test('replacement deletes the old private image only after the row points at the new one',async()=>{
  const db=saveDb();const opts={...options(),mode:'edit',oldImage:'alice/old.jpg'};
  await saveItem(db,opts);
  assert.equal(db.state.row.image_url,db.state.uploads[0]);
  assert.deepEqual(db.state.removed,['alice/old.jpg']);
});
test('an update affecting zero rows never returns success',async()=>{
  const db=saveDb();db.state.zero=true;
  await assert.rejects(saveItem(db,{...options(),mode:'edit'}),/no longer available/);
  assert.equal(db.state.removed.length,1);
});
test('signed previews remain separate from the saved private path',async()=>{
  const db={storage:{from:()=>({createSignedUrls:async(paths,ttl)=>{assert.equal(ttl,900);return{data:paths.map(path=>({path,signedUrl:'https://example.test/signed'}))};}})}};
  const rows=await withImagePreviews(db,[{image_url:'alice/private.jpg'},{image_url:'https://public.test/image.jpg'}]);
  assert.equal(rows[0].image_url,'alice/private.jpg');assert.equal(rows[0].image_preview_url,'https://example.test/signed');
  assert.equal(rows[1].image_url,'https://public.test/image.jpg');
});
test('account cleanup blocks access first, retries storage failures and removes all capped pages',async()=>{
  const actions=[];const files=Array.from({length:3},(_,i)=>({id:String(i),name:`${i}.jpg`}));let fail=true;
  const db={
    rpc:async()=>{actions.push('tombstone');return{error:null};},
    from(table){const q={upsert:()=>{actions.push('tombstone');return Promise.resolve({error:null});},delete(){actions.push(table);return q;},update(){return q;},eq:()=>Promise.resolve({error:null})};return q;},
    storage:{from:()=>({list:async()=>({data:files.slice(0,1),error:null}),remove:async paths=>{if(fail){fail=false;return{error:{message:'offline'}};}files.splice(0,paths.length);return{error:null};}})},
  };
  await assert.rejects(cleanupAccount(db,'alice'),/delete account images/);
  assert.equal(actions[0],'tombstone');assert.equal(files.length,3);
  await cleanupAccount(db,'alice');assert.equal(files.length,0);assert.ok(actions.includes('users'));
});
