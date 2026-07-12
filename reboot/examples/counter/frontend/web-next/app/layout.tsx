import type { Metadata } from "next";
import RebootContext from "./RebootContext";

export const metadata: Metadata = {
  title: "Reboot Counter",
  description: "Example using Reboot + Next.js",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <RebootContext>{children}</RebootContext>
      </body>
    </html>
  );
}
