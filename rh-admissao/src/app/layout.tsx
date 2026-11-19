import type { ReactNode } from "react";

export const metadata = { title: "Admissões", robots: { index: false, follow: false } };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#f6f7f8", color: "#171a20" }}>{children}</body>
    </html>
  );
}
