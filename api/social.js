import { socialHandler } from "../server/social.js";
import { requireMembership } from "../server/membership.js";
import { facilityHandler } from "../server/facility.js";
import compoundHandler from "../server/compound.js";
export default async function handler(req,res){
  if (new URL(req.url,"https://cultofnixon.com").searchParams.get("action")?.startsWith("compound_")) return compoundHandler(req,res);
  if (!await requireMembership(req,res)) return;
  if (new URL(req.url,"https://cultofnixon.com").searchParams.get("action")?.startsWith("facility_")) return facilityHandler(req,res);
  return socialHandler(req,res);
}
