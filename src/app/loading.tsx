/** Visible fallback while RSC segments load (avoids an empty white flash). */
export default function RootLoading() {
  return (
    <div
      style={{
        padding: 32,
        color: "#1c1917",
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        fontSize: 15,
      }}
    >
      Loading…
    </div>
  );
}
