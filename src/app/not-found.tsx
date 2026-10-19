import Link from "next/link";

export default function NotFound() {
  return (
    <main className="login-wrap">
      <div className="login-card">
        <h1>Not found</h1>
        <p className="modal-lead">That page is not on the board.</p>
        <Link href="/" className="btn btn-primary">
          Back to the board
        </Link>
      </div>
    </main>
  );
}
