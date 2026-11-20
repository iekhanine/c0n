import { heistDatabaseCall } from "./profile-db.js";

export async function registerHeist(guild) {
  await guild.commands.create({
    name: "heist",
    description: "Attempt to steal Compound Dollars from another resident",
    options: [{ name: "target", description: "Resident to rob", type: 6, required: true }],
  });
}
export async function handleHeist(interaction) {
  await interaction.deferReply();
  const target=interaction.options.getUser("target",true);
  if(target.bot || target.id===interaction.user.id) {
    return interaction.editReply({content:"Pick another human resident. You cannot rob yourself or a bot.",allowedMentions:{parse:[]}});
  }
  try {
    // Unique interaction ID makes retries idempotent. Attacker ID is never input by user.
    const outcome=await heistDatabaseCall(interaction.user.id,target.id,"heist:"+interaction.id);
    const money=n=>"$"+BigInt(String(n)).toLocaleString("en-US");
    const message=outcome.succeeded
      ? "💰 **THE HEIST SUCCEEDED**\n<@"+interaction.user.id+"> stole **"+money(outcome.amount)+"** from <@"+target.id+">."
      : "🚨 **THE HEIST FAILED**\n<@"+interaction.user.id+"> got caught trying to rob <@"+target.id+">. Restitution paid: **"+money(outcome.penalty)+"**.";
    await interaction.editReply({content:message+"\nCooldown: "+outcome.attacker_cooldown_minutes+" min · Victim protection: "+outcome.victim_protection_minutes+" min.",allowedMentions:{users:[interaction.user.id,target.id]}});
  } catch(e) {
    const known=/cooldown|protection|too little cash|need Compound wallets|Invalid heist/i.test(e.message||"");
    await interaction.editReply({content:known?e.message:"The heist couldn't be processed. No money was moved.",allowedMentions:{parse:[]}});
  }
}
