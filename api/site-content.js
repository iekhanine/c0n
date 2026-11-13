import { siteContentHandler } from "../server/site-content.js";
import { requireMembership } from "../server/membership.js";
export default async function handler(req,res){
  if (!await requireMembership(req,res)) return;
  return siteContentHandler(req,res);
}
