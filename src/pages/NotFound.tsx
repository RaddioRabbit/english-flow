import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";

export default function NotFound() {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="gradient-parchment flex min-h-[calc(100vh-4rem)] items-center justify-center">
      <div className="rounded-2xl border border-border bg-card px-10 py-12 text-center shadow-elegant">
        <h1 className="font-display text-5xl font-bold">404</h1>
        <p className="mt-4 text-lg text-muted-foreground">这个页面不存在，可能已经被新的 PRD 路由替换。</p>
        <ButtonLink to="/" label="返回首页" />
      </div>
    </div>
  );
}

function ButtonLink({ to, label }: { to: string; label: string }) {
  return (
    <Link to={to} className="mt-6 inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">
      {label}
    </Link>
  );
}
