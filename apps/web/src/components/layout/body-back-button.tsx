"use client";

import React from "react";
import { useRouter } from "next/navigation";

type BodyBackButtonProps = {
  className?: string;
};

export function BodyBackButton({ className = "" }: BodyBackButtonProps) {
  const router = useRouter();
  const [pathname, setPathname] = React.useState("");

  React.useEffect(() => {
    setPathname(window.location.pathname);
  }, []);

  if (pathname === "" || pathname === "/home") {
    return null;
  }

  return (
    <button
      type="button"
      onClick={() => {
        if (window.history.length > 1) {
          router.back();
          return;
        }
        router.push("/home");
      }}
      className={`rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ${className}`}
      aria-label="Go back"
    >
      Back
    </button>
  );
}

