import { EmbedBuilder } from "discord.js";
import { projectImageDatabaseCall } from "./profile-db.js";

const safe=(s,n=650)=>String(s??"").replace(/[\r\n\t]+/g," ").trim().slice(0,n);
const titleCase=s=>safe(s,80).replaceAll("_"," ");
export const PROJECT_IMAGE_STYLE="Realistic documentary-style post-apocalyptic photography of a functioning improvised industrial settlement. Welded salvage steel, rust and weathered paint, patched machinery, practical fittings, a lived-in workshop or underground bunker. Plausible human-scale engineering, believable lighting, tangible materials. Not cartoonish, not sci-fi neon, not pristine concept art.";
export function imagePromptForBuild(payload){
 const p=payload&&typeof payload==="object"?payload:{};
 const name=safe(p.title,190)||"Unnamed restoration milestone";
 const source=p.delivered_materials||p.required_materials||{};
 const materials=Object.entries(source).filter(([k,v])=>Number(v)>0)
  .map(([k,v])=>safe(k,75).replaceAll("_"," ")+" ("+Math.floor(Number(v))+")").slice(0,30);
 const next=safe(p.next_project,180)||"new recovery operations";
 const location=safe(p.location,160)||"the Compound";
 const note=safe(p.style_notes,600)||PROJECT_IMAGE_STYLE;
 return [
  "Generate a single high-quality, photorealistic image for The Compound's completed construction archive.",
  "COMPLETED BUILD: "+name+". Location: "+location+".",
  "The settlement has finished this milestone. Show the finished, usable result of the work, not an unbuilt blueprint or unrelated equipment.",
  materials.length?"Recovered/consumed construction resources: "+materials.join(", ")+".":"",
  "This work opens access to "+next+". Show only physical elements justified by the completed build; do not invent completed future sectors.",
  "Art direction: "+note,
  "Emphasize practical scavenged engineering, structural detail, natural grime, tactile materials, and coherent functional assembly.",
  "Keep a consistent visual identity with the Overseer's supplied reference photos of improvised vehicles, rusted bunker doors, and inhabited underground industrial rooms.",
  "No titles, UI, watermarks or superimposed text. Landscape 16:9 composition."
 ].filter(Boolean).join("\n");
}
export function buildCompletionDM(payload){
 const p=payload&&typeof payload==="object"?payload:{};
 const project=safe(p.title,240)||"Completed restoration milestone";
 const location=safe(p.location,150)||"The Compound";
 const unlock=safe(p.next_project,180)||"New restoration work";
 const resources=Object.entries(p.delivered_materials||p.required_materials||{}).filter(([,v])=>Number(v)>0)
  .map(([name,value])=>titleCase(name)+" ×"+Number(value).toLocaleString("en-US")).slice(0,18).join(", ")||"Recorded in the construction ledger";
 const prompt=imagePromptForBuild(p);
 const embed=new EmbedBuilder().setColor(0x8db67b)
  .setAuthor({name:"CULT OF NIX0N / THE COMPOUND",iconURL:"https://cultofnixon.com/con-logo.png"})
  .setTitle("🏗️ CONSTRUCTION COMPLETE · IMAGE NEEDED")
  .setDescription("Overseer: the settlement completed a construction milestone. Open ChatGPT, paste the prompt below, generate the image, then upload it to the Compound archive.")
  .addFields(
   {name:"COMPLETED BUILD",value:project},
   {name:"LOCATION",value:location,inline:true},
   {name:"UNLOCK / NEXT OPERATION",value:unlock,inline:true},
   {name:"RECORDED MATERIALS",value:safe(resources,950)},
   {name:"COPY INTO CHATGPT",value:prompt.slice(0,1000)}
  )
  .setFooter({text:"Owner-only build visualization reminder · One DM per completed project"});
 return {embeds:[embed],content:prompt.length>1000?
  "**Full image prompt (copy into ChatGPT):**\n"+prompt.slice(0,1850):undefined,
  allowedMentions:{parse:[]}};
}
export async function pollBuildImageReminders(client,logger=console){
 const record=await projectImageDatabaseCall("claim");
 if(!record)return false;
 const owner=String(record.overseer_discord_id||"");
 if(!/^\d{17,20}$/.test(owner)||!record.lease_token||!record.project_id)throw Error("Invalid image reminder");
 const user=await client.users.fetch(owner);
 const dm=await user.send(buildCompletionDM(record.payload));
 const saved=await projectImageDatabaseCall("ack",{project_id:record.project_id,lease_token:record.lease_token,message_id:dm.id});
 if(!saved)throw Error("Image reminder acknowledgment failed");
 logger.info("Construction image prompt delivered to Overseer",{project:record.project_id});
 return true;
}
