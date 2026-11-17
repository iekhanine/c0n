import pg from "pg";
let pool;
function database() {
  if (!process.env.CON_PROFILE_DATABASE_URL) return null;
  if (!pool) {
    const parsed=new URL(process.env.CON_PROFILE_DATABASE_URL);
    if(!["postgres:","postgresql:"].includes(parsed.protocol))throw Error("Invalid profile database protocol");
    pool=new pg.Pool({
      connectionString:process.env.CON_PROFILE_DATABASE_URL,
      ssl:{rejectUnauthorized:true,...(process.env.CON_PROFILE_DATABASE_CA_CERT?{ca:process.env.CON_PROFILE_DATABASE_CA_CERT.replace(/\\n/g,"\n")}: {})},
      max:2,
      idleTimeoutMillis:5000,
      connectionTimeoutMillis:6000,
      query_timeout:7500,
      application_name:"c0n-discord-profile-reader"
    });
    pool.on("error",e=>console.warn("Read-only profile database pool error",{code:e.code||"unknown"}));
  }
  return pool;
}
export function mapProfileRow(r){
  if(!r)return {not_found:true};
  return {member:{
    id:r.discord_id,display_name:r.display_name,avatar:r.avatar,
    apartment:r.apartment||"The Unhoused",
    membership:r.member_no?{
      verified:true,member_no:String(r.member_no).padStart(6,"0"),
      codename:r.codename||r.display_name,
      joined_at:r.member_joined_at
    }:null
  },stats:{
    xp:r.xp,level:r.level,health:r.health,stamina:r.stamina,
    skill:r.skill,charisma:r.charisma,intellect:r.intellect,luck:r.luck
  },active_job:r.active_job_title?{
    title:r.active_job_title,location:r.active_job_location,
    state:r.active_job_state,due_at:r.active_job_due_at,
    channel_id:r.active_job_channel_id
  }:null};
}
export async function fetchReadOnlyProfile(id){
  if(!/^\d{17,20}$/.test(String(id)))throw Error("Invalid Discord ID");
  const db=database();
  if(!db) return null;
  const {rows}=await db.query(
    "SELECT discord_id,display_name,avatar,apartment,member_no,codename,member_joined_at,xp,level,health,stamina,skill,charisma,intellect,luck,active_job_title,active_job_location,active_job_state,active_job_due_at,active_job_channel_id FROM con.bot_public_profiles WHERE discord_id=$1",
    [String(id)]
  );
  return mapProfileRow(rows[0]);
}


/**
 * The Discord worker keeps SELECT-only access to public profiles. Workshop
 * mutations are possible exclusively through four audited, tightly scoped
 * SECURITY DEFINER functions granted only to con_bot_profile_reader.
 */
export async function workshopDatabaseCall(kind,args){
  const db=database();
  if(!db)throw Error("Workshop database connection unavailable");
  let sql,values;
  const g=args.guild_id;
  if(kind==="claim"){
    sql="select con.bot_workshop_claim($1,$2,$3,$4) as payload";
    values=[g,args.user_id,args.channel_id,args.message_id];
  }else if(kind==="due"){
    sql="select con.bot_workshop_due($1) as payload";
    values=[g];
  }else if(kind==="reminder"){
    sql="select con.bot_workshop_reminder_sent($1,$2::uuid,$3,$4,$5) as payload";
    values=[g,args.job_id,args.user_id,args.channel_id,args.message_id];
  }else if(kind==="answer"){
    sql="select con.bot_workshop_answer($1,$2::uuid,$3,$4) as payload";
    values=[g,args.job_id,args.user_id,args.answer];
  }else throw Error("Unsupported Workshop database action");
  const result=await db.query(sql,values);
  return result.rows[0]?.payload;
}

/** These functions are callable only by the bot's restricted database role. */
export async function fetchResidentWallet(discordId){
 if(!/^\d{17,20}$/.test(String(discordId)))throw Error("Invalid Discord user.");
 const db=database();if(!db)throw Error("Wallet database unavailable.");
 const {rows}=await db.query("SELECT con.bot_workshop_wallet($1) wallet",[String(discordId)]);
 return rows[0]?.wallet||null;
}
export async function fetchCompoundTreasury(){
 const db=database();if(!db)throw Error("Treasury database unavailable.");
 const {rows}=await db.query("SELECT con.bot_workshop_treasury() treasury");
 return rows[0]?.treasury||null;
}

/**
 * The bot's restricted database role can only lease and acknowledge completed
 * construction reminders using two narrow functions. No table write grants.
 */
export async function projectImageDatabaseCall(kind,args={}){
 const db=database();
 if(!db)throw Error("Construction reminder database unavailable");
 if(kind==="claim"){
  const {rows}=await db.query("select con.bot_project_image_claim() as reminder");
  return rows[0]?.reminder||null;
 }
 if(kind==="ack"){
  if(!/^[0-9a-f-]{36}$/i.test(String(args.project_id))||
     !/^[0-9a-f-]{36}$/i.test(String(args.lease_token))||
     !/^\d{17,20}$/.test(String(args.message_id)))throw Error("Invalid image reminder acknowledgment");
  const {rows}=await db.query(
   "select con.bot_project_image_ack($1::uuid,$2::uuid,$3::text) as acknowledged",
   [args.project_id,args.lease_token,args.message_id]
  );
  return rows[0]?.acknowledged===true;
 }
 throw Error("Unsupported image reminder action");
}
