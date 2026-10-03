import { useEffect, useState } from "react";
import { API_BASE_URL, ApiService } from "@/lib/api";

interface CompanyBrandingState {
  company_logo: string | null;
  company_name: string;
}

type CompanyBrandingUpdate = Partial<CompanyBrandingState>;

export function resolveCompanyLogoUrl(path: string | null | undefined) {
  return path ? new URL(path, API_BASE_URL).toString() : null;
}

export function notifyCompanyBrandingUpdated(branding: CompanyBrandingUpdate) {
  window.dispatchEvent(
    new CustomEvent<CompanyBrandingUpdate>("company-branding-updated", {
      detail: branding,
    }),
  );
}

export function useCompanyBranding() {
  const [branding, setBranding] = useState<CompanyBrandingState>({
    company_logo: null,
    company_name: "",
  });

  useEffect(() => {
    let active = true;
    let updatedDuringLoad = false;

    const handleBrandingUpdate = (event: Event) => {
      updatedDuringLoad = true;
      setBranding((previous) => ({
        ...previous,
        ...(event as CustomEvent<CompanyBrandingUpdate>).detail,
      }));
    };
    window.addEventListener("company-branding-updated", handleBrandingUpdate);

    ApiService.get<Record<string, string>>("/receipt-settings")
      .then((settings) => {
        if (active && !updatedDuringLoad) {
          setBranding({
            company_logo: resolveCompanyLogoUrl(settings.company_logo),
            company_name: settings.company_name || "",
          });
        }
      })
      .catch((error) => {
        console.error("Error loading company branding:", error);
      });

    return () => {
      active = false;
      window.removeEventListener("company-branding-updated", handleBrandingUpdate);
    };
  }, []);

  return branding;
}
