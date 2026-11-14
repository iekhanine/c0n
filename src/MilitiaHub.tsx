import {useState} from "react";
import CommunityFeed from "./CommunityFeed";
import {MemberDirectory} from "./Social";
import "./MilitiaHub.css";
type Tab="submissions"|"members"|"projects";
export default function MilitiaHub(){
 const initial=new URLSearchParams(location.search).get("view");
 const [view,setView]=useState<Tab>(initial==="members"||initial==="projects"?initial:"submissions");
 function select(next:Tab){setView(next);const u=new URL(location.href);if(next==="submissions")u.searchParams.delete("view");else u.searchParams.set("view",next);history.replaceState(null,"",u.pathname+u.search);}
 return <section className="con-militia-hub">
 <nav className="con-militia-tabs" aria-label="Militia sections">
  <button aria-current={view==="submissions"?"page":undefined} onClick={()=>select("submissions")}>Submissions</button>
  <button aria-current={view==="members"?"page":undefined} onClick={()=>select("members")}>Personnel</button>
  <button aria-current={view==="projects"?"page":undefined} onClick={()=>select("projects")}>Projects</button>
 </nav>
 {view==="submissions"?<CommunityFeed page="explore"/>:view==="members"?<MemberDirectory/>:<CommunityFeed page="projects"/>}
 </section>;
}
