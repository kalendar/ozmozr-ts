import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="h1">Page not found</h1>
      <p className="mt-2 text-muted">That page does not exist, or it was removed.</p>
      <p className="mt-6"><Link href="/" className="btn btn-primary">Go home</Link></p>
    </div>
  );
}
