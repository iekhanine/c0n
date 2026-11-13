import { useEffect, useState } from "react";
import { projectApi } from "../../ProjectPages";
type Category={name:string;active:boolean;created_by:string|null};
export default function ProjectCategories() {
  const [categories,setCategories]=useState<Category[]>([]);
  const [newName,setNewName]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  async function load() {
    try {const data=await projectApi("categories");setCategories(data.categories);setError("");}
    catch(e){setError(e instanceof Error?e.message:"Could not load categories.");}
  }
  useEffect(()=>{void load();},[]);
  async function add(){
    setBusy(true);setError("");setNotice("");
    try {await projectApi("categories","POST",{name:newName.trim()});setNewName("");setNotice("Category added for everyone.");await load();}
    catch(e){setError(e instanceof Error?e.message:"Could not add category.");}
    finally{setBusy(false);}
  }
  async function toggle(c:Category){
    setBusy(true);setError("");
    try{await projectApi("categories","PUT",{name:c.name,active:!c.active});await load();}
    catch(e){setError(e instanceof Error?e.message:"Could not update category.");}
    finally{setBusy(false);}
  }
  return <section className="con-category-admin con-surface">
    <header><h2>Creator categories</h2><p>Shared across project forms and discovery filters. Members can suggest a category when creating their work; new names become available everywhere. Hide irrelevant categories here without deleting existing work.</p></header>
    {error&&<p role="alert">{error}</p>}
    {notice&&<p role="status">{notice}</p>}
    <form onSubmit={e=>{e.preventDefault();void add();}} className="con-category-add">
      <label>New category<input maxLength={39} value={newName} onChange={e=>setNewName(e.target.value)} placeholder="Photography, Sculptures, Podcasts…"/></label>
      <button disabled={busy||newName.trim().length<2}>Add category</button>
    </form>
    <div className="con-category-admin-list">
      {categories.map(c=><div key={c.name}>
        <span>{c.name}{!c.active&&<small> Hidden from selection</small>}</span>
        <button type="button" disabled={busy} onClick={()=>void toggle(c)}>{c.active?"Hide":"Enable"}</button>
      </div>)}
    </div>
  </section>;
}
