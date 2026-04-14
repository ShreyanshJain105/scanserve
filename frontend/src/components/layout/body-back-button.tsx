"use client";

import React from "react";

type BodyBackButtonProps = {
  className?: string;
};

export function BodyBackButton({ className = "" }: BodyBackButtonProps) {
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
      onClick={() => window.history.back()}
      className={`rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 ${className}`}
      aria-label="Go back"
    >
      Back
    </button>
  );
}
