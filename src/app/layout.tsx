import type { Metadata } from "next";
import "@/styles/mockup.css";

export const metadata: Metadata = {
  title: "Social Approvals",
  description: "Build social post mockups and collect approvals.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
