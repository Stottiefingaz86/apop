import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";
import { cn } from "@/lib/utils/cn";

export const metadata: Metadata = {
  title: "AI Product Operations Portal",
  description: "Ideas → features → agent execution → artifacts",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={cn("min-h-screen antialiased")}>
        <header className="border-b border-border bg-card">
          <div className="mx-auto flex max-w-[1600px] items-center gap-6 px-4 py-3">
            <Link href="/pipeline" className="font-semibold text-foreground">
              APOP
            </Link>
            <nav className="flex gap-4 text-sm text-muted-foreground">
              <Link href="/pipeline" className="hover:text-foreground">
                Pipeline
              </Link>
              <Link href="/features/new" className="hover:text-foreground">
                New feature
              </Link>
            </nav>
          </div>
        </header>
        <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
