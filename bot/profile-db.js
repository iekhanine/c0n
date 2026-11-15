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
export async function fetchReadOnlyProfile(id){
  if(!/^\d{17,20}$/.test(String(id)))throw Error("Invalid Discord ID");
  const db=database();
  if(!db) return null;
  const {rows}=await db.query(
    "SELECT discord_id,display_name,avatar,apartment,member_no,codename,member_joined_at,xp,level,health,stamina,skill,charisma,intellect,luck FROM con.bot_public_profiles WHERE discord_id=$1",
    [String(id)]
  );
  if(!rows.length)return {not_found:true};
  const r=rows[0];
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
  }};
}
