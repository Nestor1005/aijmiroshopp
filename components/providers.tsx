'use client';

import type { ReactNode } from "react";
import { AuthProvider } from "@/lib/auth-context";
import { NotificationsProvider } from "@/components/notifications/provider";
import { ConfirmProvider } from "@/components/confirm/provider";

export const Providers = ({ children }: { children: ReactNode }) => {
  return (
    <AuthProvider>
      <NotificationsProvider>
        <ConfirmProvider>{children}</ConfirmProvider>
      </NotificationsProvider>
    </AuthProvider>
  );
};
