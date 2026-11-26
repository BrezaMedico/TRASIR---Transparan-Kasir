import React from "react";
import Image from "next/image";

interface TrasirLogoProps {
  className?: string;
  alt?: string;
  priority?: boolean;
}

export function TrasirLogo({
  className = "h-7 w-auto",
  alt = "TRASIR",
  priority = false,
}: TrasirLogoProps) {
  return (
    <Image
      src="/images/trasir-logo.png"
      alt={alt}
      width={945}
      height={268}
      priority={priority}
      style={{ width: "auto" }}
      className={`trasir-logo-img select-none object-contain shrink-0 ${className}`.trim()}
    />
  );
}

