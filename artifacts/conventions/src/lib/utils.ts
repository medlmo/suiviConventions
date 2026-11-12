import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

const formatteurMontant = new Intl.NumberFormat("de-DE", {
  useGrouping: true,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function formatMontantMAD(value: number | null | undefined): string {
  if (value === null || value === undefined) return "-";
  return `${formatteurMontant.format(value)} MAD`;
}

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
