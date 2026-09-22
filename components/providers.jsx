"use client";

import { SessionProvider } from "next-auth/react";
import { UploadProvider } from "@/components/upload-manager";

// UploadProvider sits at the very top on purpose: the dashboard switches
// screens with its own state rather than routes, so anything mounted inside
// it is unmounted the moment someone walks back from a dress - which is
// precisely what used to strand an upload in progress.
export default function Providers({ children }) {
  return (
    <SessionProvider>
      <UploadProvider>{children}</UploadProvider>
    </SessionProvider>
  );
}
