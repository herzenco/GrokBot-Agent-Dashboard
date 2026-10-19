"use client";

import Link from "next/link";
import { createContext, useContext, useEffect, useState } from "react";
import { ActivityIcon, LogoMark, PlusIcon, ThemeToggle } from "@/components/icons";
import { NewTaskModal } from "@/components/new-task-modal";

export type ShellAgent = { id: string; name: string; slug: string };

type FeedValue = { open: boolean; toggle: () => void; close: () => void };

const FeedContext = createContext<FeedValue>({
  open: true,
  toggle: () => {},
  close: () => {},
});

export function useFeed() {
  return useContext(FeedContext);
}

export function Split({ main, side }: { main: React.ReactNode; side: React.ReactNode }) {
  const { open } = useFeed();
  return (
    <div className={open ? "split" : "split split-closed"}>
      <div className="split-main">{main}</div>
      {open ? <div className="split-side">{side}</div> : null}
    </div>
  );
}

export function Shell({
  active,
  agents,
  children,
}: {
  active: "board" | "reports" | "documents";
  agents: ShellAgent[];
  children: React.ReactNode;
}) {
  const [feed, setFeed] = useState(true);
  const [modal, setModal] = useState(false);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setModal(false);
        return;
      }
      if (event.key !== "n" && event.key !== "N") return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) return;
      event.preventDefault();
      setModal(true);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const feedValue: FeedValue = {
    open: feed,
    toggle: () => setFeed((value) => !value),
    close: () => setFeed(false),
  };

  return (
    <FeedContext.Provider value={feedValue}>
      <div className="app">
        <header className="header">
          <div className="header-inner">
            <Link href="/" className="brand">
              <LogoMark />
              <span className="brand-name">Agent HQ</span>
            </Link>
            <nav className="nav" aria-label="Main">
              <Link href="/" className={active === "board" ? "nav-link active" : "nav-link"} aria-current={active === "board" ? "page" : undefined}>
                Board
              </Link>
              <Link href="/reports" className={active === "reports" ? "nav-link active" : "nav-link"} aria-current={active === "reports" ? "page" : undefined}>
                Reports
              </Link>
              <Link href="/documents" className={active === "documents" ? "nav-link active" : "nav-link"} aria-current={active === "documents" ? "page" : undefined}>
                Documents
              </Link>
            </nav>
            <div className="header-actions">
              <button type="button" className={feed ? "btn is-on" : "btn"} aria-pressed={feed} onClick={feedValue.toggle}>
                <ActivityIcon />
                Activity
              </button>
              <ThemeToggle />
              <button type="button" className="btn btn-primary" onClick={() => setModal(true)}>
                <PlusIcon />
                New task
                <kbd className="kbd">N</kbd>
              </button>
              <form action="/api/logout" method="post">
                <button type="submit" className="text-btn">
                  Log out
                </button>
              </form>
            </div>
          </div>
        </header>
        <main className="main">{children}</main>
        {modal ? <NewTaskModal agents={agents} onClose={() => setModal(false)} /> : null}
      </div>
    </FeedContext.Provider>
  );
}
