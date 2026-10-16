"use client";

import { useFormStatus } from "react-dom";

export default function SubmitButton({ children, className }: { children: React.ReactNode; className?: string }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={`${className ?? ""} disabled:opacity-50`}>
      {pending ? "…" : children}
    </button>
  );
}
