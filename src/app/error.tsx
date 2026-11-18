"use client";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h1 className="h1">Something went wrong</h1>
      <p className="mt-2 text-muted">The page could not be loaded. Your data is safe.</p>
      <p className="mt-6">
        <button type="button" onClick={reset} className="btn btn-primary">Try again</button>
      </p>
    </div>
  );
}
