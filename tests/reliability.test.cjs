const { test } = require('node:test');
const assert = require('node:assert/strict');
const { pages, reminderStage, escapeHtml } = require('../supabase/functions/_shared/delivery.ts');
const { runReminders, runDigest } = require('../supabase/functions/_shared/reminder-jobs.ts');
const { edgeHandler } = require('../supabase/functions/_shared/edge-handler.ts');
const { itemCalendar } = require('../lib/calendar.ts');
const { anotherBatch } = require('../lib/batch.ts');
const { parseReceiptExtraction } = require('../lib/receipt-extraction.ts');
const { readJson } = require('../lib/request-body.ts');
const { subscriptionSchema } = require('../lib/push-subscription.ts');

function memoryDb(tables, cap=1) {
  const jobs = new Map();
  return {
    jobs,
    rpc: async (_name, p) => {
      if (_name === 'due_reminder_items') return { data: (tables.items ?? []).filter(r => !p.p_after || r.id > p.p_after).slice(0,cap), error: null };
      if (_name === 'due_digest_users') return { data: (tables.users ?? []).filter(r => r.email_reminders_enabled && (!p.p_after || r.id > p.p_after)).slice(0,cap), error: null };
      const old = jobs.get(p.p_key);
      if (old && ['sending','sent','uncertain'].includes(old.status)) return { data: null, error: null };
      const job = old ?? { key: p.p_key, user_id: p.p_user_id, item_id: p.p_item_id, channel: p.p_channel, payload: p.p_payload, lease_token: 'token' };
      job.status='sending'; jobs.set(job.key,job);
      return { data: {...job}, error: null };
    },
    from(table) {
      let filters=[], max=Infinity, order='id', patch=null, single=false;
      const q = {
        select(){return q;},
        eq(k,v){filters.push(r=>r[k]===v);return q;},
        gt(k,v){filters.push(r=>r[k]>v);return q;},
        gte(k,v){filters.push(r=>r[k]>=v);return q;},
        lte(k,v){filters.push(r=>r[k]<=v);return q;},
        order(k){order=k;return q;}, limit(n){max=n;return q;},
        maybeSingle(){single=true;return q;},
        update(values){patch=values;return q;},
        then(resolve,reject) {
          try {
            let rows = table==='notification_deliveries' ? [...jobs.values()] : tables[table]??[];
            rows=rows.filter(r=>filters.every(f=>f(r))).sort((a,b)=>String(a[order]).localeCompare(String(b[order])));
            if(patch) rows.forEach(r=>Object.assign(r,patch));
            else rows=rows.slice(0,Math.min(max,cap));
            return Promise.resolve({data:single?rows[0]??null:rows,error:null}).then(resolve,reject);
          } catch(e){return Promise.reject(e).then(resolve,reject);}
        },
      };return q;
    },
  };
}
const today='2026-10-28';
const users=[{id:'alice',email:'alice@example.test',email_reminders_enabled:true},{id:'bob',email:'bob@example.test',email_reminders_enabled:false}];
const items=[{id:'a',user_id:'alice',name:'<a href="https://evil.test">Milk</a>',effective_expiry:'2026-11-01',expiry_source:'estimated',expiry_revision:2},{id:'b',user_id:'bob',name:'No email',effective_expiry:'2026-11-01',expiry_revision:1},{id:'c',user_id:'alice',name:'Bread',effective_expiry:'2026-10-28',expiry_revision:1}];

test('pagination continues through short server-capped pages and fails on query errors', async()=>{
  const seen=[];
  for await(const batch of pages(after=>Promise.resolve({data:!after?[{id:'a'}]:after==='a'?[{id:'b'}]:[],error:null}))) seen.push(...batch.map(r=>r.id));
  assert.deepEqual(seen,['a','b']);
  await assert.rejects(async()=>{for await(const _ of pages(()=>Promise.resolve({error:{message:'offline'}}))) {}},/offline/);
});
test('reminder stages catch up missed offsets, include expiry day, and bound overdue sends',()=>{
  assert.equal(reminderStage(today,'2026-11-26'),'d30');
  assert.equal(reminderStage(today,'2026-11-03'),'d7');
  assert.equal(reminderStage(today,today),'d0');
  assert.equal(reminderStage(today,'2026-10-27'),'overdue');
  assert.equal(reminderStage(today,'2026-10-20'),null);
});
test('real reminder handler honors consent, escapes text, retries identical payloads, and deduplicates',async(t)=>{
  const db=memoryDb({users,items,notification_log:[]});
  const calls=[];
  const original=global.fetch;
  let fail=true;
  global.fetch=async(_url,init)=>{calls.push({headers:init.headers,body:JSON.parse(init.body)});if(fail){fail=false;return new Response('',{status:503});}return new Response('{}');};
  t.after(()=>global.fetch=original);
  const first=await runReminders(db,today,'test-key','Expire X <test@example.test>');
  assert.equal(first.sent,1);assert.equal(first.errors.length,1);
  const retry=await runReminders(db,today,'test-key','Changed sender <changed@example.test>');
  assert.equal(retry.sent,1);assert.equal(calls.length,3);
  assert.deepEqual(calls[0].body,calls[2].body);
  assert.equal(calls[0].headers['Idempotency-Key'],calls[2].headers['Idempotency-Key']);
  assert.ok(calls.every(c=>c.body.to==='alice@example.test'));
  assert.match(calls[0].body.html,/&lt;a href=&quot;/);
  assert.doesNotMatch(calls[0].body.html,/<a href="https:\/\/evil/);
  assert.match(calls[0].body.html,/Estimated date/);
  assert.equal((await runReminders(db,today,'test-key','from')).sent,0);
});
test('weekly digest paginates users/items, honors opt-out and sends once for the ISO week',async(t)=>{
  const db=memoryDb({users,items});const bodies=[];const original=global.fetch;
  global.fetch=async(_url,init)=>{bodies.push(JSON.parse(init.body));return new Response('{}');};t.after(()=>global.fetch=original);
  assert.equal((await runDigest(db,today,'key','from')).sent,1);
  assert.equal((await runDigest(db,'2026-10-29','key','from')).sent,0);
  assert.match(bodies[0].html,/2 tracked/);
  assert.equal(bodies[0].to,'alice@example.test');
  assert.ok(bodies[0].html.includes('https://expire-x.tanishqsinha.in/dashboard'));
  assert.match(bodies[0].html,/&lt;a/);
});
test('edge entry rejects unauthorized and unconfigured sends without invoking a worker',async()=>{
  let calls=0;const run=async()=>{calls++;};
  const handler=edgeHandler(memoryDb({app_config:[]}),key=>key==='CRON_SECRET'?'secret':undefined,run);
  assert.equal((await handler(new Request('https://example.test',{method:'POST'}))).status,403);
  assert.equal((await handler(new Request('https://example.test',{method:'POST',headers:{'x-cron-secret':'secret'}}))).status,503);
  assert.equal(calls,0);
});
test('calendar exports escape injected fields, fold UTF-8 correctly and keep stable identity',()=>{
  const item={id:'test-id',name:'Renew 😀'.repeat(20)+'\r\nBEGIN:VALARM',effective_expiry:'2026-12-31',updated_at:'2026-10-28T10:00:00Z',expiry_revision:3};
  const output=itemCalendar(item);
  assert.match(output,/UID:test-id@expire-x.tanishqsinha.in/);
  assert.match(output,/DTEND;VALUE=DATE:20270101/);
  assert.match(output,/SEQUENCE:3/);
  assert.equal(output.split('\r\n').filter(l=>l==='BEGIN:VALARM').length,1);
  assert.ok(output.split('\r\n').every(l=>Buffer.byteLength(l)<=75));
  assert.ok(itemCalendar({...item,effective_expiry:'2027-01-01'}).includes('UID:test-id@expire-x.tanishqsinha.in'));
});
test('new batches omit old dates, IDs, private photos and opened windows',()=>{
  const batch=anotherBatch({id:'old',name:'Milk',category:'food',expiry_date:'2026-11-01',opened_date:today,open_within_days:3,manufacture_date:'2026-10-01',image_url:'alice/private.jpg',location:'Fridge'});
  assert.equal(batch.name,'Milk');assert.equal(batch.location,'Fridge');assert.equal(batch.expiry_source,'manual');
  for(const key of ['id','expiry_date','opened_date','manufacture_date','open_within_days']) assert.equal(batch[key],undefined);
  assert.equal(batch.image_url,null);
});
test('receipt extraction reports dropped/excess rows and retains invalid dates for manual completion',()=>{
  const row={name:'Milk',category:'food',expiry_date:'2026-02-30',quantity:1};
  const result=parseReceiptExtraction(JSON.stringify({items:[null,{},...Array(51).fill(row)]}));
  assert.equal(result.items.length,50);assert.equal(result.omitted_count,3);assert.equal(result.detected_count,53);
  assert.equal(result.items[0].expiry_date,null);assert.equal(result.warnings.length,1);
  assert.throws(()=>parseReceiptExtraction('x'.repeat(100001)),/too large/);
});
test('chunked JSON without Content-Length cannot bypass the request limit',async()=>{
  await assert.rejects(readJson(new Request('http://localhost',{method:'POST',body:JSON.stringify({name:'x'.repeat(100)})}),20),/too large/);
});
test('push subscriptions reject local/arbitrary destinations and malformed keys',()=>{
  const keys={p256dh:'A'.repeat(87),auth:'B'.repeat(22)};
  for(const endpoint of ['http://fcm.googleapis.com/x','https://127.0.0.1/x','https://evil.test/x','https://fcm.googleapis.com.evil.test/x','https://user@fcm.googleapis.com/x']) assert.equal(subscriptionSchema.safeParse({...keys,endpoint}).success,false);
  assert.equal(subscriptionSchema.safeParse({...keys,endpoint:'https://fcm.googleapis.com/fcm/send/test'}).success,true);
  assert.equal(subscriptionSchema.safeParse({...keys,p256dh:'bad',endpoint:'https://fcm.googleapis.com/x'}).success,false);
  assert.equal(escapeHtml('<>&"\''),'&lt;&gt;&amp;&quot;&#39;');
});
