import { RebootClientProvider } from "@reboot-dev/reboot-react";

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>
        <RebootClientProvider url="http://localhost:9991">
          {children}
        </RebootClientProvider>
      </body>
    </html>
  );
}
