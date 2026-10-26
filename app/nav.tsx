"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Suspense } from "react";

/** Icônes en trait (24 px), dessinées ici : pas de dépendance. */
const ICONS = {
  create: <path d="M12 5v14M5 12h14" />,
  videos: (
    <>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="9" rx="1.5" />
      <rect x="3" y="15" width="7" height="6" rx="1.5" />
      <rect x="14" y="15" width="7" height="6" rx="1.5" />
    </>
  ),
  published: <path d="M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z" />,
  templates: (
    <>
      <rect x="6" y="2" width="12" height="20" rx="2" />
      <path d="M9 15h6M9 18h4" />
    </>
  ),
};

const LINKS = [
  { href: "/", label: "Créer", icon: ICONS.create },
  { href: "/videos", label: "Vidéos", icon: ICONS.videos },
  { href: "/publiees", label: "Publiées", icon: ICONS.published },
  { href: "/templates", label: "Templates", icon: ICONS.templates },
] as const;

/** Pages accessibles sans connexion : pas de navigation. */
const PUBLIC_PAGES = ["/login", "/conditions", "/confidentialite"];

function isActive(href: string, pathname: string | null) {
  if (!pathname) return false;
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

/** Barre d'onglets en bas de l'écran, à portée de pouce (au-dessus de la barre d'accueil iPhone). */
function NavBar({ pathname }: { pathname: string | null }) {
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-800 bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <div className="mx-auto flex max-w-md">
        {LINKS.map((l) => {
          const active = isActive(l.href, pathname);
          return (
            <Link
              key={l.href}
              href={l.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${active ? "text-white" : "text-zinc-500"}`}
            >
              <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={active ? 2.2 : 1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                {l.icon}
              </svg>
              {l.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

function ActiveNav() {
  const pathname = usePathname();
  return pathname && PUBLIC_PAGES.includes(pathname) ? null : <NavBar pathname={pathname} />;
}

/** L'onglet actif dépend de l'URL : il est rendu sous Suspense (exigé sur les routes dynamiques). */
export default function Nav() {
  return (
    <Suspense fallback={null}>
      <ActiveNav />
    </Suspense>
  );
}
