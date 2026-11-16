import { socialHandler } from "../server/social.js";
import { requireMembership } from "../server/membership.js";
import { facilityHandler } from "../server/facility.js";
import compoundHandler from "../server/compound.js";
import {reclamationHandler} from "../server/reclamation.js";
export default async function handler(req,res){
  const action=new URL(req.url,"https://cultofnixon.com").searchParams.get("action")||"";
  if(action.startsWith("compound_"))return compoundHandler(req,res);
  // Browser CORS preflights have no session cookie. The target handler validates
  // the exact allowed origin and returns the correct preflight status.
  if(req.method==="OPTIONS"&&action.startsWith("game_"))return reclamationHandler(req,res);
  if(req.method==="OPTIONS"&&action.startsWith("facility_"))return facilityHandler(req,res);
  if(!await requireMembership(req,res))return;
  if(action.startsWith("game_"))return reclamationHandler(req,res);
  if(action.startsWith("facility_"))return facilityHandler(req,res);
  return socialHandler(req,res);
}
