"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ViewTransition, useEffect, type ReactNode } from "react";
import { api } from "@/lib/api-client";
import { EMPTY_FILTERS, galleryCacheKey } from "@/lib/gallery-filters";
import { readSessionCache, writeSessionCache } from "@/lib/session-cache";
import type { GalleryPhoto, Member, PhotoScope } from "@/lib/types";

const links = [
  { href: "/ordner", label: "Ordner" },
  { href: "/gruppe", label: "Gruppe" },
  { href: "/feedback", label: "Feedback" },
];

export function AppShell({ member, children }: { member: Member; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    for (const href of ["/ordner", "/gruppe", "/feedback", "/profil"]) router.prefetch(href);
    for (const scope of ["group", "mine"] as const) prefetchGallery(scope);
  }, [router]);

  async function signOut() {
    await fetch("/auth/signout", { method: "POST" });
    router.replace("/");
    router.refresh();
  }

  return (
    <div className="min-h-dvh">
      <header className="sticky top-0 z-20 border-b border-line/80 bg-background/90 backdrop-blur">
        <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <div>
            <p className="font-display text-2xl leading-none">Sicpic</p>
            <p className="text-xs text-muted">{member.displayName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link
              href="/profil"
              transitionTypes={["tab"]}
              className={`rounded-full px-3 py-2 text-sm font-medium ${pathname.startsWith("/profil") ? "bg-accent text-accent-ink" : "text-accent"}`}
            >
              Profil
            </Link>
            {member.role === "admin" ? (
              <Link href="/verwaltung/rueckmeldungen" transitionTypes={["tab"]} className="rounded-full px-3 py-2 text-sm font-medium text-accent">
                Verwaltung
              </Link>
            ) : null}
            <button type="button" onClick={signOut} className="rounded-full px-3 py-2 text-sm text-muted">
              Abmelden
            </button>
          </div>
        </div>
      </header>
      <ViewTransition name="tab-panel" default={{ default: "none", tab: "tab-fade" }}>
        <div key={pathname} className="tab-panel mx-auto w-full max-w-3xl px-4 pt-5 pb-[calc(6.5rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </ViewTransition>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-card/95 backdrop-blur">
        <ul className="mx-auto flex max-w-3xl justify-around px-2 pt-2 pb-[calc(0.6rem+env(safe-area-inset-bottom))]">
          {links.map((link) => {
            const active = pathname === link.href || pathname.startsWith(`${link.href}/`);
            return (
              <li key={link.href}>
                <Link
                  href={link.href}
                  transitionTypes={["tab"]}
                  className={`block rounded-full px-4 py-2 text-sm font-semibold ${active ? "bg-accent text-accent-ink" : "text-muted"}`}
                >
                  {link.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}

function prefetchGallery(scope: PhotoScope) {
  const key = galleryCacheKey(scope, EMPTY_FILTERS);
  const cached = readSessionCache(key);
  if (cached && !cached.stale) return;
  void api<{ photos: GalleryPhoto[]; nextCursor: string | null }>(`/api/photos?scope=${scope}`)
    .then((page) => {
      if (Array.isArray(page.photos)) writeSessionCache(key, page);
    })
    .catch(() => undefined);
}

export function ShellFallback() {
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center px-6">
      <p className="font-display text-4xl">Sicpic</p>
      <p className="mt-2 text-muted">Wird geladen…</p>
    </div>
  );
}
