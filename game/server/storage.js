const snowflake=v=>{if(typeof v!=="string"||!/^\d{17,20}$/.test(v))throw Error("Invalid Discord member");return v};
const fail=message=>{throw Error(message)};
const positive=(n,max=10000)=>{if(!Number.isSafeInteger(n)||n<1||n>max)fail("Invalid quantity");return n};
async function tx(pool,fn){const c=await pool.connect();try{await c.query("BEGIN");const r=await fn(c);await c.query("COMMIT");return r}catch(e){await c.query("ROLLBACK");throw e}finally{c.release()}}
async function storage(db,discordId,type){
 if(!["carry","apartment","warehouse"].includes(type))fail("Unknown storage");
 const q=type==="carry"
 ? "select s.id,s.capacity from con.game_storage s join con.game_characters c on c.id=s.owner_character_id where c.discord_id=$1 and s.storage_type='carry'"
 :type==="apartment"
 ? "select s.id,s.capacity from con.game_storage s join con.game_apartments a on a.id=s.apartment_id join con.compound_residency r on r.apartment_id=a.legacy_apartment_id where r.discord_id=$1 and s.storage_type='apartment'"
 : "select s.id,s.capacity from con.game_storage s where s.storage_type='warehouse'";
 const r=await db.query(q,type==="warehouse"?[]:[discordId]);
 if(r.rowCount!==1)fail("Storage not available");return r.rows[0];
}
async function capacity(db,storageId){const q=await db.query("select coalesce(sum(quantity),0)::bigint as n from con.game_inventory where storage_id=$1",[storageId]);return BigInt(q.rows[0].n)}
export async function transferItem(pool,actor,owner,{from,to,item,quantity}){
 snowflake(actor);positive(quantity,1000);
 if(!["carry","apartment","warehouse"].includes(from)||!["carry","apartment","warehouse"].includes(to)||from===to)fail("Invalid transfer");
 if(from==="warehouse"&&!owner)fail("Only Overseer can issue warehouse supplies");
 if(typeof item!=="string"||!/^[a-z_]{2,40}$/.test(item))fail("Invalid item ID");
 return tx(pool,async db=>{
  const fromStore=await storage(db,actor,from),toStore=await storage(db,actor,to);
  // Lock storage records in stable order to avoid transfer deadlocks.
  const locked=await db.query("select id,capacity from con.game_storage where id=any($1::uuid[]) order by id for update",[[fromStore.id,toStore.id]]);
  if(locked.rowCount!==2)fail("Storage unavailable");
  const before=await db.query("select quantity from con.game_inventory where storage_id=$1 and item_id=$2 for update",[fromStore.id,item]);
  if(!before.rowCount||BigInt(before.rows[0].quantity)<BigInt(quantity))fail("Insufficient supplies");
  const used=await capacity(db,toStore.id);
  if(used+BigInt(quantity)>BigInt(toStore.capacity))fail("Destination storage is full");
  await db.query("update con.game_inventory set quantity=quantity-$3 where storage_id=$1 and item_id=$2",[fromStore.id,item,quantity]);
  await db.query("delete from con.game_inventory where storage_id=$1 and item_id=$2 and quantity=0",[fromStore.id,item]);
  await db.query("insert into con.game_inventory(storage_id,item_id,quantity) values($1,$2,$3) on conflict(storage_id,item_id) do update set quantity=con.game_inventory.quantity+excluded.quantity",[toStore.id,item,quantity]);
  const e=await db.query("insert into con.game_storage_events(actor_discord_id,source_storage,destination_storage,item_id,quantity,purpose) values($1,$2,$3,$4,$5,'member transfer') returning *",[actor,fromStore.id,toStore.id,item,quantity]);
  return e.rows[0];
 });
}
export async function startCraft(pool,actor,recipeId){
 snowflake(actor);if(typeof recipeId!=="string"||!/^[0-9a-f-]{36}$/i.test(recipeId))fail("Invalid recipe ID");
 return tx(pool,async db=>{
  const character=await db.query("select * from con.game_characters where discord_id=$1 for update",[actor]);if(!character.rowCount)fail("Create a character first");
  const c=character.rows[0];
  const q=await db.query("select * from con.game_recipes where id=$1 and status='published'",[recipeId]);if(!q.rowCount)fail("Recipe unavailable");
  const recipe=q.rows[0];
  if(recipe.profession_id && recipe.profession_id!==c.profession_id)fail("Wrong profession");
  if(recipe.profession_id){
   const xp=await db.query("select xp from con.game_character_skills where character_id=$1 and profession_id=$2",[c.id,recipe.profession_id]);
   if(BigInt(xp.rows[0]?.xp||0)<BigInt(recipe.skill_xp_required))fail("Profession rank too low");
  }
  const bag=await storage(db,actor,"carry");await db.query("select id from con.game_storage where id=$1 for update",[bag.id]);
  const parts=Object.entries(recipe.ingredients||{});
  if(!parts.length||Object.keys(recipe.products||{}).length===0)fail("Recipe configuration incomplete");
  for(const [item,qty] of parts){
   positive(qty,1000);
   const have=await db.query("select quantity from con.game_inventory where storage_id=$1 and item_id=$2 for update",[bag.id,item]);
   if(!have.rowCount||BigInt(have.rows[0].quantity)<BigInt(qty))fail("Missing ingredient: "+item);
  }
  for(const [item,qty] of parts){
   await db.query("update con.game_inventory set quantity=quantity-$3 where storage_id=$1 and item_id=$2",[bag.id,item,qty]);
   await db.query("delete from con.game_inventory where storage_id=$1 and item_id=$2 and quantity=0",[bag.id,item]);
  }
  const record=await db.query("insert into con.game_crafting_orders(recipe_id,character_id,storage_id,ready_at) values($1,$2,$3,now()+($4 * interval '1 minute')) returning *",[recipe.id,c.id,bag.id,recipe.duration_minutes]);
  return record.rows[0];
 });
}
export async function completeCraft(pool,actor,craftId){
 snowflake(actor);if(typeof craftId!=="string"||!/^[0-9a-f-]{36}$/i.test(craftId))fail("Invalid craft ID");
 return tx(pool,async db=>{
  const q=await db.query("select o.*,r.products,r.xp from con.game_crafting_orders o join con.game_recipes r on r.id=o.recipe_id join con.game_characters c on c.id=o.character_id where o.id=$1 and c.discord_id=$2 for update of o",[craftId,actor]);
  if(!q.rowCount)fail("Craft not found");const o=q.rows[0];
  if(o.state==="completed")return {status:"already_completed"};
  if(o.state!=="in_progress"||new Date(o.ready_at)>new Date())fail("Craft not ready");
  const bag=await db.query("select capacity from con.game_storage where id=$1 for update",[o.storage_id]);
  const products=Object.entries(o.products||{});let count=0;
  for(const [item,qty] of products){if(!/^[a-z_]{2,40}$/.test(item))fail("Invalid product ID");count+=positive(qty,1000)}
  if(await capacity(db,o.storage_id)+BigInt(count)>BigInt(bag.rows[0].capacity))fail("Inventory full");
  for(const [item,qty] of products){
   const known=await db.query("select id from con.game_items where id=$1",[item]);if(!known.rowCount)fail("Unknown product");
   await db.query("insert into con.game_inventory(storage_id,item_id,quantity) values($1,$2,$3) on conflict(storage_id,item_id) do update set quantity=con.game_inventory.quantity+excluded.quantity",[o.storage_id,item,qty]);
  }
  await db.query("update con.game_characters set xp=xp+$2 where id=$1",[o.character_id,o.xp]);
  await db.query("update con.game_crafting_orders set state='completed',finished_at=now() where id=$1",[o.id]);
  await db.query("insert into con.game_audit(actor,action,entity,entity_id,after_state) values($1,'craft.complete','craft_order',$2,$3)",[actor,o.id,JSON.stringify({xp:o.xp,products:o.products})]);
  return {status:"completed",xp:o.xp,products:o.products};
 });
}
