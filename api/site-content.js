import { siteContentHandler } from "../server/site-content.js";
import { requireMembership } from "../server/membership.js";
import { archiveHandler } from "../server/archive.js";
export default async function handler(req,res){
  if (!await requireMembership(req,res)) return;
  if (new URL(req.url,"https://cultofnixon.com").searchParams.get("action")?.startsWith("archive_")) return archiveHandler(req,res);
  return siteContentHandler(req,res);
}
