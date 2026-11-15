// Signed Discord worker only. Durable daily job rotation and atomic rewards.
// This module must never be routed to unauthenticated browser requests.
const snowflake=x=>typeof x==="string"&&/^\d{17,20}$/.test(x);
const uuid=x=>typeof x==="string"&&/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const fault=(status,message)=>{throw Object.assign(new Error(message),{status})};
const inProgress=async client=>{
 const pending=(await client.query(`select p.*,r.label,r.last_message_id previous_message_id,r.launch_at,r.stagger_minutes
 from con.workshop_job_posts p join con.workshop_job_rotations r on r.channel_id=p.channel_id
 where p.state='posting' and r.active order by p.created_at limit 1`)).rows[0];
 if(pending)return pending;
 const rotation=(await client.query(`select * from con.workshop_job_rotations
 where active and next_at<=now() order by next_at,stagger_minutes limit 1 for update skip locked`)).rows[0];
 if(!rotation)return null;
 const objective=rotation.objectives[rotation.cycle%rotation.objectives.length];
 const title=rotation.label+" / Objective "+(rotation.cycle+1);
 const row=(await client.query(`insert into con.workshop_job_posts
 (channel_id,cycle,title,objective,xp_reward,attribute,attribute_reward,min_minutes)
 values($1,$2,$3,$4,$5,$6,$7,$8) on conflict(channel_id,cycle) do update set title=excluded.title returning *`,
 [rotation.channel_id,rotation.cycle,title,objective,rotation.xp_reward,rotation.attribute,rotation.attribute_reward,rotation.min_minutes])).rows[0];
 return {...row,label:rotation.label,previous_message_id:rotation.last_message_id};
};
export async function workshopPoll(client){
 const job=await inProgress(client);
 if(!job)return {job:null};
 return {job:{
  id:job.id,channel_id:job.channel_id,title:job.title,objective:job.objective,
  xp_reward:job.xp_reward,attribute:job.attribute,attribute_reward:job.attribute_reward,
  min_minutes:job.min_minutes,previous_message_id:job.previous_message_id
 }};
}
export async function workshopPosted(client,body){
 if(!uuid(body.job_id)||!snowflake(body.channel_id)||!snowflake(body.message_id))
  fault(400,"Invalid Workshop job post receipt.");
 const post=(await client.query("select * from con.workshop_job_posts where id=$1 for update",[body.job_id])).rows[0];
 if(!post||post.channel_id!==body.channel_id)fault(404,"Workshop posting not found.");
 if(post.state==="posted"){
  if(post.message_id!==body.message_id)fault(409,"Job already posted with another message.");
  return {ok:true,already_posted:true};
 }
 if(post.state!=="posting")fault(409,"Job posting not pending.");
 const rot=(await client.query("select * from con.workshop_job_rotations where channel_id=$1 for update",[post.channel_id])).rows[0];
 if(!rot||rot.cycle!==post.cycle)fault(409,"Workshop rotation changed.");
 await client.query("update con.workshop_job_posts set state='expired' where channel_id=$1 and state='posted'",[post.channel_id]);
 await client.query("update con.workshop_job_posts set state='posted',message_id=$2,posted_at=now() where id=$1",[post.id,body.message_id]);
 // The first 8 objectives launch together; tomorrow each rotates on its own
 // minute offset, and each individual channel runs every 24 hours thereafter.
 const next=rot.cycle===0
  ?new Date(new Date(rot.launch_at).getTime()+86400000+rot.stagger_minutes*60000)
  :new Date(new Date(rot.next_at).getTime()+86400000);
 // If the bot has been offline for days, never flood missing daily editions.
 const future=new Date(Math.max(next.getTime(),Date.now()+60000));
 await client.query("update con.workshop_job_rotations set cycle=cycle+1,next_at=$2,last_post_id=$3,last_message_id=$4,updated_at=now() where channel_id=$1",
 [post.channel_id,future,post.id,body.message_id]);
 return {ok:true,next_at:future.toISOString()};
}
export async function workshopStart(client,body){
 if(!uuid(body.job_id)||!snowflake(body.user_id))fault(400,"Invalid member or job.");
 const member=(await client.query(`select name from con.discord_members where discord_id=$1 and active and not is_bot
 and guild_id=(select guild_id from con.discord_settings where id=true)`,[body.user_id])).rows[0];
 if(!member)fault(403,"You must be an active Compound server member.");
 const post=(await client.query("select * from con.workshop_job_posts where id=$1 and state='posted'",[body.job_id])).rows[0];
 if(!post)fault(409,"This objective has rotated out. Use the latest pinned job.");
 const inserted=await client.query(`insert into con.workshop_job_claims(post_id,discord_id) values($1,$2)
 on conflict(post_id,discord_id) do nothing returning started_at`,[post.id,body.user_id]);
 const claim=(await client.query("select started_at,completed_at from con.workshop_job_claims where post_id=$1 and discord_id=$2",[post.id,body.user_id])).rows[0];
 return {ok:true,already_started:!inserted.rowCount,completed:!!claim.completed_at,
 started_at:claim.started_at,min_minutes:post.min_minutes,channel_id:post.channel_id};
}
export async function workshopComplete(client,body){
 if(!uuid(body.job_id)||!snowflake(body.user_id))fault(400,"Invalid member or job.");
 const evidence=typeof body.evidence==="string"?body.evidence.trim():"";
 if(evidence.length<15||evidence.length>500)fault(400,"Write a 15–500 character work report.");
 const member=(await client.query(`select name from con.discord_members where discord_id=$1 and active and not is_bot
 and guild_id=(select guild_id from con.discord_settings where id=true)`,[body.user_id])).rows[0];
 if(!member)fault(403,"Only active server members may claim rewards.");
 const post=(await client.query("select * from con.workshop_job_posts where id=$1 for update",[body.job_id])).rows[0];
 if(!post||post.state!=="posted")fault(409,"That objective has expired.");
 const claim=(await client.query("select * from con.workshop_job_claims where post_id=$1 and discord_id=$2 for update",[post.id,body.user_id])).rows[0];
 if(!claim)fault(409,"Start this job before submitting it.");
 if(claim.completed_at)return {ok:true,already_completed:true,xp:post.xp_reward,stat:post.attribute};
 const completedAfter=new Date(claim.started_at).getTime()+post.min_minutes*60000;
 if(Date.now()<completedAfter)fault(409,"Keep working. You can submit after "+new Date(completedAfter).toLocaleString("en-US",{timeZone:"UTC"})+" UTC.");
 // Require evidence of actual participation in the selected Workshop channel
 // after the job was accepted, not merely a button click.
 const participated=await client.query(`select 1 from con.discord_participation_events
 where user_id=$1 and channel_id=$2 and event_type='message' and occurred_at>=$3
 and occurred_at<=now() limit 1`,[body.user_id,post.channel_id,claim.started_at]);
 if(!participated.rowCount)fault(409,"Post a work update in this Workshop channel before submitting your report.");
 await client.query("insert into con.compound_profiles(discord_id,display_name) values($1,$2) on conflict(discord_id) do nothing",[body.user_id,member.name.slice(0,80)]);
 const changed=(await client.query(`update con.compound_profiles set xp=least(1000000,xp+$2),
 manual_xp=manual_xp+$2,
 ${post.attribute}=least(100,${post.attribute}+$3),updated_at=now()
 where discord_id=$1 returning xp,${post.attribute} as stat_value`,
 [body.user_id,post.xp_reward,post.attribute_reward])).rows[0];
 await client.query("update con.workshop_job_claims set completed_at=now(),evidence=$3 where post_id=$1 and discord_id=$2",
 [post.id,body.user_id,evidence]);
 await client.query(`insert into con.compound_progress_events(source_key,discord_id,source,description,xp_delta,charisma_delta,intellect_delta,details)
 values($1,$2,'workshop',$3,$4,$5,$6,$7::jsonb) on conflict(source_key) do nothing`,[
 "workshop:"+post.id+":"+body.user_id,body.user_id,post.title,post.xp_reward,
 post.attribute==="charisma"?post.attribute_reward:0,post.attribute==="intellect"?post.attribute_reward:0,
 JSON.stringify({job_id:post.id,channel_id:post.channel_id,attribute:post.attribute,attribute_reward:post.attribute_reward,evidence})
 ]);
 return {ok:true,already_completed:false,xp:post.xp_reward,attribute:post.attribute,attribute_reward:post.attribute_reward,
 total_xp:changed.xp,stat_value:changed.stat_value};
}
