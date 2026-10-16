"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Créer" },
  { href: "/videos", label: "Mes vidéos" },
] as const;

export default function Nav() {
  const pathname = usePathname();
  return (
    <nav className="sticky top-0 z-10 border-b border-zinc-800 bg-background/95 backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {LINKS.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            className={`flex-1 py-4 text-center font-semibold ${pathname === l.href ? "text-white" : "text-zinc-500"}`}
          >
            {l.label}
          </Link>
        ))}
      </div>
    </nav>
  );
}
