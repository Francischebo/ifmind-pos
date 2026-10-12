import { createContext, useContext } from "react";

export type SidebarContextValue = {
  state: "expanded" | "collapsed";
  open: boolean;
  setOpen: (open: boolean) => void;
  openMobile: boolean;
  setOpenMobile: (open: boolean) => void;
  isMobile: boolean;
  toggleSidebar: () => void;
};

export const SidebarContext = createContext<SidebarContextValue | null>(null);

export function useSidebar() {
  const context = useContext(SidebarContext);

  if (!context) {
    return {
      state: "expanded" as const,
      open: true,
      setOpen: () => undefined,
      openMobile: false,
      setOpenMobile: () => undefined,
      isMobile: false,
      toggleSidebar: () => undefined,
    };
  }

  return context;
}
