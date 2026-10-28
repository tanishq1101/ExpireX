const { test } = require('node:test');
const assert = require('node:assert/strict');
const { database } = require('./db-fixture.cjs');

test('migration policies, idempotency claims, revision tracking and shared quotas in PostgreSQL', async (t) => {
  const db = await database();
  t.after(() => db.close());
  await db.exec(`insert into users(id,email,clerk_updated_at) values('alice','alice@example.test',1),('bob','bob@example.test',1); insert into items(id,user_id,name,category,expiry_date) values('00000000-0000-4000-8000-000000000001','alice','Milk','food','2026-11-01');`);
  await t.test('simultaneous claims grant one lease; sent messages cannot be reclaimed', async () => {
    const claim = () => db.query(`select claim_delivery('job','alice','00000000-0000-4000-8000-000000000001','email','{"to":"alice@example.test"}') as job`);
    const claims = await Promise.all([claim(),claim()]);
    assert.equal(claims.filter((r) => r.rows[0].job).length,1);
    await db.exec(`update notification_deliveries set status='sent' where key='job'`);
    assert.equal((await claim()).rows[0].job,null);
  });
  await t.test('email retry payload stays frozen; ambiguous retries stop before provider expiry', async () => {
    await db.query(`select claim_delivery('retry','alice',null,'email','{"subject":"first","to":"alice@example.test"}')`);
    await db.exec(`update notification_deliveries set status='failed' where key='retry'`);
    const { rows } = await db.query(`select claim_delivery('retry','alice',null,'email','{"subject":"changed","to":"alice@example.test"}') as job`);
    assert.equal(rows[0].job.payload.subject,'first');
    assert.equal(rows[0].job.attempts,2);
    await db.exec(`update notification_deliveries set status='failed',first_attempt_at=now()-interval '24 hours' where key='retry'`);
    assert.equal((await db.query(`select claim_delivery('retry','alice',null,'email','{}') as job`)).rows[0].job,null);
    assert.equal((await db.query(`select status from notification_deliveries where key='retry'`)).rows[0].status,'uncertain');
  });
  await t.test('stale push claims are never replayed without provider deduplication', async () => {
    await db.query(`select claim_delivery('push','alice',null,'push','{}')`);
    await db.exec(`update notification_deliveries set lease_until=now()-interval '1 second' where key='push'`);
    assert.equal((await db.query(`select claim_delivery('push','alice',null,'push','{}') as job`)).rows[0].job,null);
  });
  await t.test('dates increment the revision but ordinary edits cannot change it', async () => {
    await db.exec(`update items set name='New milk',expiry_revision=100`);
    assert.equal((await db.query('select expiry_revision from items')).rows[0].expiry_revision,1);
    await db.exec(`update items set expiry_date='2026-12-01'`);
    assert.equal((await db.query('select expiry_revision from items')).rows[0].expiry_revision,2);
    await db.exec(`update items set opened_date='2026-10-28',open_within_days=3`);
    const row = (await db.query('select expiry_revision,effective_expiry::text from items')).rows[0];
    assert.equal(row.expiry_revision,3);
    assert.equal(row.effective_expiry,'2026-10-31');
  });
  await t.test('suggestions are unique across inserts; manual entries may repeat', async () => {
    await db.exec(`insert into shopping_list(user_id,name,item_id) values('alice','Milk','00000000-0000-4000-8000-000000000001')`);
    await assert.rejects(db.exec(`insert into shopping_list(user_id,name,item_id) values('alice','Milk','00000000-0000-4000-8000-000000000001')`),/duplicate key/);
    await db.exec(`insert into shopping_list(user_id,name) values('alice','Bread'),('alice','Bread')`);
  });
  await t.test('two accounts cannot read each other or reassign push subscriptions', async () => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"alice"}',false); insert into push_subscriptions(user_id,endpoint,p256dh,auth) values('alice','https://fcm.googleapis.com/test','key','auth'); update push_subscriptions set p256dh='refreshed' where user_id='alice';`);
    assert.equal((await db.query('select p256dh from push_subscriptions')).rows[0].p256dh,'refreshed');
    await assert.rejects(db.exec(`update push_subscriptions set user_id='bob'`),/row-level security/);
    await db.exec(`select set_config('request.jwt.claims','{"sub":"bob"}',false);`);
    assert.equal((await db.query('select * from items')).rows.length,0);
    assert.equal((await db.query('select * from push_subscriptions')).rows.length,0);
    await db.exec('reset role');
  });
  await t.test('private delivery payloads and privileged functions are inaccessible to users', async () => {
    await db.exec('set role authenticated');
    await assert.rejects(db.query('select * from notification_deliveries'),/permission denied/);
    await assert.rejects(db.query(`select claim_delivery('evil','alice',null,'email','{}')`),/permission denied/);
    await assert.rejects(db.query(`select confirm_barcode_scan('123456','poison',null,null,null,null)`),/permission denied/);
    await db.exec('reset role');
  });
  await t.test('vetted catalog confirmations are once per account and require a saved item', async () => {
    await db.exec(`insert into barcode_catalog(barcode,name,source) values('123456','Public milk','api'); update items set barcode='123456'; set role service_role; select confirm_catalog_item('123456','bob'); select confirm_catalog_item('123456','alice'); select confirm_catalog_item('123456','alice'); reset role;`);
    assert.equal((await db.query(`select confirmed_count from barcode_catalog`)).rows[0].confirmed_count,1);
  });
  await t.test('quota is atomic across concurrent calls', async () => {
    const results = await Promise.all(Array.from({length:5},()=>db.query(`select take_quota('alice:scan',2,60000) as allowed`)));
    assert.equal(results.filter((r)=>r.rows[0].allowed).length,2);
  });
  await t.test('database worker candidates omit completed stages and preserve later unsent items', async () => {
    await db.exec(`insert into items(id,user_id,name,category,expiry_date) values('00000000-0000-4000-8000-000000000002','alice','Bread','food','2026-11-01');`);
    let rows = (await db.query(`select id from due_reminder_items('2026-10-28','email',null,1)`)).rows;
    assert.equal(rows[0].id,'00000000-0000-4000-8000-000000000001');
    await db.exec(`insert into notification_deliveries(key,user_id,item_id,channel,payload,status) values('reminder/00000000-0000-4000-8000-000000000001/3/2026-10-31/d3','alice','00000000-0000-4000-8000-000000000001','email','{}','sent');`);
    rows = (await db.query(`select id from due_reminder_items('2026-10-28','email',null,1)`)).rows;
    assert.equal(rows[0].id,'00000000-0000-4000-8000-000000000002');
  });
  await t.test('verified sync owns recipient changes and stale Clerk events cannot restore an old email', async () => {
    await db.exec(`set role authenticated; select set_config('request.jwt.claims','{"sub":"alice"}',false); update users set email_reminders_enabled=false where id='alice';`);
    await assert.rejects(db.exec(`update users set email='victim@example.test' where id='alice'`),/permission denied/);
    await db.exec(`reset role; set role service_role; select sync_account('alice','new@example.test',10); select sync_account('alice','old@example.test',5); reset role;`);
    const user=(await db.query(`select email,email_reminders_enabled from users where id='alice'`)).rows[0];
    assert.equal(user.email,'new@example.test');assert.equal(user.email_reminders_enabled,false);
  });
  await t.test('a deletion tombstone blocks stale tokens from recreating user data', async () => {
    await db.exec(`insert into deleted_accounts(user_id) values('alice'); set role authenticated; select set_config('request.jwt.claims','{"sub":"alice"}',false);`);
    assert.equal((await db.query('select * from items')).rows.length,0);
    await assert.rejects(db.exec(`insert into items(user_id,name,category,expiry_date) values('alice','New','food','2027-01-01')`),/row-level security/);
    await db.exec('reset role');
  });
});

test('upgrading keeps duplicate shopping data while detaching redundant references',async(t)=>{
  const db=await database({preUpgrade:async(db)=>db.exec(`
    insert into users(id,email) values('legacy','legacy@example.test');
    insert into items(id,user_id,name,category,expiry_date) values('00000000-0000-4000-8000-000000000001','legacy','Milk','food','2026-11-01');
    insert into shopping_list(user_id,name,item_id,quantity,checked,created_at,note) values
      ('legacy','Old milk','00000000-0000-4000-8000-000000000001',1,false,'2026-01-01','old note'),
      ('legacy','New milk','00000000-0000-4000-8000-000000000001',2,true,'2026-01-02','new note');
  `)});t.after(()=>db.close());
  const rows=(await db.query('select * from shopping_list order by created_at')).rows;
  assert.equal(rows.length,2);assert.ok(rows[0].item_id);assert.equal(rows[1].item_id,null);
  assert.equal(rows[1].checked,true);assert.equal(Number(rows[1].quantity),2);assert.match(rows[1].note,/new note/);
  assert.equal((await db.query(`select status from notification_deliveries where key='welcome/legacy'`)).rows[0].status,'cancelled');
});
