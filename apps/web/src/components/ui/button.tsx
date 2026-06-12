import * as React from "react";

import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
}

const variants: Record<ButtonVariant, string> = {
  primary: "bg-orange text-ink shadow-[0_0_24px_rgba(255,106,61,0.24)] hover:scale-[1.03] active:scale-[0.98]",
  secondary: "border border-white/10 bg-white/5 text-ivory hover:border-orange/50 hover:bg-white/10 active:scale-[0.98]",
  ghost: "text-muted hover:bg-white/5 hover:text-ivory"
};

export function buttonClassName(variant: ButtonVariant = "primary", className?: string) {
  return cn(
    "inline-flex h-11 items-center justify-center rounded-full px-5 text-[15px] font-medium transition duration-200 ease-lyf9 focus:outline-none focus:ring-2 focus:ring-orange/70 focus:ring-offset-2 focus:ring-offset-ink disabled:pointer-events-none disabled:opacity-50",
    variants[variant],
    className
  );
}

export function Button({
  className,
  variant = "primary",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      className={buttonClassName(variant, className)}
      type={type}
      {...props}
    />
  );
}
