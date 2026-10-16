"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

const LINKS = [
  { href: "/", label: "Créer" },
  { href: "/videos", label: "Vidéos" },
  { href: "/publiees", label: "Publiées" },
  { href: "/templates", label: "Templates" },
] as const;

function isActive(href: string, pathname: string | null) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav className="sticky top-0 z-10 border-b border-zinc-800 bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex-1 py-4 text-center text-sm font-semibold ${isActive(l.href, pathname) ? "text-white" : "text-zinc-500"}`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}

function ActiveNav() {
  return <NavBar pathname={usePathname()} />;
}

/** L'onglet actif dépend de l'URL : il est rendu sous Suspense (exigé sur les routes dynamiques). */
export default function Nav() {
  return (
    <Suspense fallback={<NavBar pathname={null} />}>
      <ActiveNav />
    </Suspense>
  );
}
