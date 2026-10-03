import { SidebarTrigger } from "@/components/ui/sidebar";
import { StockAlertBadge } from "./StockAlertBadge";
import { NavLink } from "react-router-dom";
import { CompanyBrand } from "@/components/CompanyBranding";

export function Navbar() {
  return (
    <header className="sticky top-0 z-40 flex h-16 w-full shrink-0 items-center justify-between border-b bg-background/95 px-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:px-6">
      <NavLink
        to="/dashboard"
        className="flex min-w-0 items-center gap-2 transition-opacity hover:opacity-80"
      >
        <CompanyBrand
          className="gap-2"
          imageClassName="h-9 w-9"
        />
      </NavLink>
      <div className="flex shrink-0 items-center gap-2">
        <StockAlertBadge />
        <SidebarTrigger
          aria-label="Toggle navigation"
          title="Toggle navigation"
          className="h-11 w-11 rounded-md border border-border"
        />
      </div>
    </header>
  );
}
