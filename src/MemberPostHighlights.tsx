import { useEffect, useState } from "react";
import { Avatar } from "./Social";
import "./MemberPostHighlights.css";

type Highlight = {
  id: string;
  author_id: string;
  author_name: string;
  username?: string;
  avatar_url?: string;
  body: string;
  likes: number;
};
export function MemberPostHighlights() {
  const [posts, setPosts] = useState<Highlight[]>([]);
  const [error, setError] = useState(false);
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const response = await fetch("/api/social?action=top_member_posts", { cache: "no-store" });
        if (!response.ok) throw Error("Unavailable");
        const data = await response.json();
        if (mounted) { setPosts(data.posts || []); setError(false); }
      } catch {
        if (mounted) setError(true);
      }
    };
    void load();
    const timer = setInterval(() => void load(), 60000);
    return () => { mounted = false; clearInterval(timer); };
  }, []);
  if (error) return <p className="discord-activity-empty">Member posts are temporarily unavailable.</p>;
  if (!posts.length) return <p className="discord-activity-empty">Member posts will appear here once people start sharing.</p>;
  return <div className="con-member-highlights">
    {posts.map(post => <a className="con-member-highlight" href={`/posts/${post.id}`} key={post.id}>
      <Avatar name={post.author_name} url={post.avatar_url}/>
      <span className="con-member-highlight-content">
        <strong>@{post.username || post.author_name}</strong>
        <span className="con-member-highlight-preview">{post.body}</span>
      </span>
    </a>)}
  </div>;
}
