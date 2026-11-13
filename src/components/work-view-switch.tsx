import Link from "next/link";

export function WorkViewSwitch({
  view,
  mineHref,
  boardHref,
  listHref,
}: {
  view: "mine" | "board" | "list";
  mineHref: string;
  boardHref: string;
  listHref: string;
}) {
  return (
    <div className="work-toolbar">
      <Link className={view === "mine" ? "btn is-on" : "btn"} href={mineHref} aria-current={view === "mine" ? "page" : undefined}>
        My tasks
      </Link>
      <Link className={view === "board" ? "btn is-on" : "btn"} href={boardHref} aria-current={view === "board" ? "page" : undefined}>
        Board
      </Link>
      <Link className={view === "list" ? "btn is-on" : "btn"} href={listHref} aria-current={view === "list" ? "page" : undefined}>
        List
      </Link>
    </div>
  );
}
