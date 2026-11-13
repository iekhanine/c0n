import { socialHandler } from "../server/social.js";
import { requireMembership } from "../server/membership.js";
export default async function handler(req,res){
  if (!await requireMembership(req,res)) return;
  return socialHandler(req,res);
}
