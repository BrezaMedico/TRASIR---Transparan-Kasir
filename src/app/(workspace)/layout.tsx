import React from "react";
import { redirect } from "next/navigation";
import { getServerSessionSnapshot } from "@/lib/server-session";
import { WorkspaceChrome, type SessionState } from "@/components/layout/AppShell";

export const dynamic = "force-dynamic";

export default async function WorkspaceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const snapshot = await getServerSessionSnapshot();

  if (!snapshot.authenticated || !snapshot.user) {
    redirect("/login");
  }

  if (!snapshot.user.isAssigned || !snapshot.user.roomId) {
    redirect("/menunggu-undangan");
  }

  const initialSession: SessionState = {
    user: {
      id: snapshot.user.id,
      username: snapshot.user.username,
      email: snapshot.user.email,
      name: snapshot.user.name,
      role: snapshot.user.role,
      isAssigned: snapshot.user.isAssigned,
      roomId: snapshot.user.roomId,
    },
    permissions: snapshot.permissions!,
    unreadNotifications: snapshot.unreadNotifications,
    storeName: snapshot.storeName,
    toleranceThresholdRp: snapshot.toleranceThresholdRp,
  };

  return <WorkspaceChrome initialSession={initialSession}>{children}</WorkspaceChrome>;
}
