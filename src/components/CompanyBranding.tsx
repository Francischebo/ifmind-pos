import cfiMark from "@/assets/cfi-pos-techiez-mark.png";

interface CompanyBrandProps {
  className?: string;
  showName?: boolean;
  nameClassName?: string;
  imageClassName?: string;
  subtitle?: string;
  subtitleClassName?: string;
}

export function CompanyBrand({
  className = "",
  showName = true,
  nameClassName = "",
  imageClassName = "",
  subtitle,
  subtitleClassName = "",
}: CompanyBrandProps) {
  const brandName = "CFI-POS Techiez";

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      <img
        src={cfiMark}
        alt={`${brandName} logo`}
        className={`h-9 w-9 shrink-0 rounded-md object-contain ${imageClassName}`}
      />
      {(showName || subtitle) && (
        <span className="flex min-w-0 flex-col">
          {showName && (
            <span className={`min-w-0 truncate text-base font-bold tracking-tight sm:text-lg ${nameClassName}`}>
              {brandName}
            </span>
          )}
          {subtitle && (
            <span className={`truncate text-xs ${subtitleClassName}`}>
              {subtitle}
            </span>
          )}
        </span>
      )}
    </div>
  );
}
