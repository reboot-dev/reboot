"use client";

import { RebootClientProvider } from "@reboot-dev/reboot-react";
import { ReactNode } from "react";

export default function RebootContext({ children }: { children: ReactNode }) {
  const url = process.env.NEXT_PUBLIC_ENDPOINT
    ? `https://${process.env.NEXT_PUBLIC_ENDPOINT}`
    : "http://localhost:9991";

  return (
    <RebootClientProvider url={url}>
      <>{children}</>
    </RebootClientProvider>
  );
}
