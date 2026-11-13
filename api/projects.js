import { projectsHandler } from "../server/projects.js";
import { requireMembership } from "../server/membership.js";
export default async function handler(req,res){
  if (!await requireMembership(req,res)) return;
  return projectsHandler(req,res);
}
