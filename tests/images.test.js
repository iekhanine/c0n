import test from 'node:test';
import assert from 'node:assert/strict';
import { PGlite } from '@electric-sql/pglite';
import { imageInput, uploadImage, MAX_IMAGE_BYTES } from '../server/images.js';
import { canAccess } from '../server/staff.js';
import { discordPayload } from '../server/content.js';
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=', 'base64');
test('image upload rejects active content, invalid encoding and oversized files', () => {
  assert.equal(imageInput({data:png.toString('base64')}).type, 'image/png');
  for (const data of [undefined, '', '<svg/>', Buffer.from('<svg/>').toString('base64'), Buffer.alloc(MAX_IMAGE_BYTES + 1).toString('base64')]) assert.throws(() => imageInput({data}));
  assert.equal(canAccess({permissions:['updates.view']}, 'images', 'POST'),false);
  assert.equal(canAccess({permissions:['updates.create']}, 'images', 'POST'),true);
  assert.equal(canAccess({permissions:['updates.create']}, 'images', 'GET'),false);
});
test('uploaded image bytes persist and their public address is included in Discord embeds', async () => {
  const db = new PGlite();
  try {
    await db.exec('CREATE SCHEMA con');
    const result = await uploadImage(db, {data:png.toString('base64')}, {user:{id:'test-staff'}});
    const id = new URL(result.image_url).searchParams.get('id');
    const {rows} = await db.query('SELECT * FROM con.post_images WHERE id=$1',[id]);
    assert.deepEqual(Buffer.from(rows[0].data), png);
    assert.equal(rows[0].content_type,'image/png');
    assert.equal(discordPayload({kind:'update',body:'News',author_name:'Ivan',image_url:result.image_url}).embeds[0].image.url,result.image_url);
    const security = await db.query("SELECT relrowsecurity FROM pg_class WHERE oid='con.post_images'::regclass");
    assert.equal(security.rows[0].relrowsecurity,true);
  } finally { await db.close(); }
});
