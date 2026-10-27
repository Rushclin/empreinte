import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Favicon of a site, served by DuckDuckGo (no username is ever sent). */
export function faviconUrl(urlMain: string): string {
  try {
    return `https://icons.duckduckgo.com/ip3/${new URL(urlMain).hostname}.ico`;
  } catch {
    return "";
  }
}
