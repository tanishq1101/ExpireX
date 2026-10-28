const { test }=require('node:test');const assert=require('node:assert/strict');const Module=require('node:module');const {createHmac}=require('node:crypto');const {createClient}=require('@supabase/supabase-js');
const id='00000000-0000-4000-8000-000000000001';
const state={userId:'alice',row:{id,barcode:'123456',name:'Warranty',category:'warranty',effective_expiry:'2027-01-01',updated_at:'2026-10-28T10:00:00Z',expiry_revision:1},fail:false,limited:false,calls:[],rpc:[],cleaned:[],cleanupFail:false};
const db=createClient('https://example.supabase.co','anon',{accessToken:async()=> 'session',global:{fetch:async(input,init)=>{
  state.calls.push({url:new URL(String(input)),method:init.method,body:init.body?JSON.parse(init.body):null,headers:new Headers(init.headers)});
  return new Response(JSON.stringify(state.fail?{message:'private database error'}:state.row?[state.row]:[]),{status:state.fail?500:200,headers:{'Content-Type':'application/json'}});
}}});
const deps={
  '@/services/supabase/server':{createClient:async()=>db},
  '@/services/supabase/admin':{createAdminClient:()=>({rpc:async(name,args)=>{state.rpc.push({name,args});return{error:null};}})},
  '@/lib/rate-limit':{rateLimit:async()=>!state.limited},
  '@clerk/nextjs/server':{auth:async()=>({userId:state.userId}),clerkClient:async()=>({})},
  '@/lib/account-cleanup':{cleanupAccount:async(_db,user)=>{if(state.cleanupFail)throw Error('offline');state.cleaned.push(user);}},
};
const load=Module._load;Module._load=function(name,...args){return Object.hasOwn(deps,name)?deps[name]:load.call(this,name,...args);};
let calendar,catalog,push,webhook;
try{calendar=require('../app/api/items/[id]/calendar/route.ts');catalog=require('../app/api/catalog/confirm/route.ts');push=require('../app/api/push/subscribe/route.ts');webhook=require('../app/api/webhooks/clerk/route.ts');}finally{Module._load=load;}
const request=(body,method='POST')=>new Request('https://example.test/api',{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});

test('calendar route authorizes access, reports query failures and returns private downloads',async()=>{
  state.userId=null;assert.equal((await calendar.GET(new Request('https://example.test'),{params:Promise.resolve({id})})).status,401);
  state.userId='alice';state.fail=true;assert.equal((await calendar.GET(new Request('https://example.test'),{params:Promise.resolve({id})})).status,503);
  state.fail=false;const row=state.row;state.row=null;assert.equal((await calendar.GET(new Request('https://example.test'),{params:Promise.resolve({id})})).status,404);
  state.row=row;const response=await calendar.GET(new Request('https://example.test'),{params:Promise.resolve({id})});assert.equal(response.status,200);assert.equal(response.headers.get('Cache-Control'),'private, no-store');assert.match(await response.text(),/UID:00000000/);
  const call=state.calls.at(-1);assert.equal(call.url.searchParams.get('user_id'),'eq.alice');assert.equal(call.headers.get('authorization'),'Bearer session');
});
test('catalog confirmation rejects arbitrary metadata and requires a visible saved item',async()=>{
  state.rpc=[];
  assert.equal((await catalog.POST(request({barcode:'123456',name:'Personal name'}))).status,400);
  const row=state.row;state.row=null;assert.equal((await catalog.POST(request({item_id:id}))).status,404);assert.equal(state.rpc.length,0);
  state.row=row;assert.equal((await catalog.POST(request({item_id:id}))).status,200);
  assert.deepEqual(state.rpc,[{name:'confirm_catalog_item',args:{p_barcode:'123456',p_user_id:'alice'}}]);
});
test('push persistence validates destinations and exposes refresh/delete failures',async()=>{
  const subscription={endpoint:'https://fcm.googleapis.com/send/test',p256dh:'A'.repeat(87),auth:'B'.repeat(22)};
  assert.equal((await push.POST(request({...subscription,endpoint:'https://127.0.0.1/send'}))).status,400);
  state.fail=true;assert.equal((await push.POST(request(subscription))).status,503);assert.equal((await push.DELETE(request({endpoint:subscription.endpoint},'DELETE'))).status,503);
  state.fail=false;assert.equal((await push.POST(request(subscription))).status,200);
  assert.equal(state.calls.at(-1).body.user_id,'alice');
});
test('Clerk deletion handler verifies real signatures and returns retryable cleanup failures',async()=>{
  const secret=Buffer.from('test-webhook-signing-secret').toString('base64');process.env.CLERK_WEBHOOK_SIGNING_SECRET=`whsec_${secret}`;
  const body=JSON.stringify({type:'user.deleted',object:'event',data:{id:'alice',deleted:true}});const messageId='msg_test';const timestamp=String(Math.floor(Date.now()/1000));
  const signature=createHmac('sha256',Buffer.from(secret,'base64')).update(`${messageId}.${timestamp}.${body}`).digest('base64');
  const signed=(sig)=>new Request('https://example.test/api/webhooks/clerk',{method:'POST',headers:{'Content-Type':'application/json','svix-id':messageId,'svix-timestamp':timestamp,'svix-signature':sig},body});
  state.cleaned=[];assert.equal((await webhook.POST(signed('v1,invalid'))).status,400);assert.equal(state.cleaned.length,0);
  state.cleanupFail=true;assert.equal((await webhook.POST(signed(`v1,${signature}`))).status,503);
  state.cleanupFail=false;assert.equal((await webhook.POST(signed(`v1,${signature}`))).status,200);assert.deepEqual(state.cleaned,['alice']);
  delete process.env.CLERK_WEBHOOK_SIGNING_SECRET;
});
