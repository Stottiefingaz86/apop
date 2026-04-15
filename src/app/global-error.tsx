"use client";

/**
 * Catches errors in the root layout’s child tree. Layout errors still surface as a generic 500;
 * see root layout hardening (inline fallback CSS, font fallbacks).
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          padding: 24,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          background: "#f7f6f3",
          color: "#1c1917",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 600 }}>APOP hit a client error</h1>
        <p style={{ marginTop: 12, fontSize: 14, opacity: 0.85 }}>
          {error.message || "Something went wrong."}
        </p>
        <p style={{ marginTop: 16, fontSize: 13, opacity: 0.75 }}>
          From the project folder run{" "}
          <code style={{ background: "#e4e4e7", padding: "2px 6px", borderRadius: 4 }}>
            npm run dev:clean
          </code>{" "}
          then start dev again on the same port as your URL (e.g.{" "}
          <code style={{ background: "#e4e4e7", padding: "2px 6px", borderRadius: 4 }}>
            npx next dev -p 3020
          </code>
          ).
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: 20,
            padding: "8px 14px",
            fontSize: 14,
            cursor: "pointer",
            borderRadius: 6,
            border: "1px solid #d4d4d8",
            background: "#fff",
          }}
        >
          Try again
        </button>
      </body>
    </html>
  );
}
