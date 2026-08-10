import type { ReactNode } from "react";
import { Sidebar } from "./sidebar";
import { StatusBar } from "./status-bar";
import type { Page } from "@/types";

interface AppLayoutProps {
  currentPage: Page;
  onNavigate: (page: Page) => void;
  projectCount: number;
  children: ReactNode;
}

export function AppLayout({ currentPage, onNavigate, projectCount, children }: AppLayoutProps) {
  return (
    <div className="flex h-screen flex-col bg-background">
      <div className="flex flex-1 overflow-hidden">
        <Sidebar currentPage={currentPage} onNavigate={onNavigate} />
        <main className="flex-1 overflow-hidden">{children}</main>
      </div>
      <StatusBar projectCount={projectCount} />
    </div>
  );
}
