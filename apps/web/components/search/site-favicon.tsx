import { faviconUrl } from "@/lib/utils";

export function SiteFavicon({ urlMain }: { urlMain: string }) {
  return (
    <img
      src={faviconUrl(urlMain)}
      alt=""
      width={16}
      height={16}
      loading="lazy"
      referrerPolicy="no-referrer"
      className="size-4 shrink-0 rounded-sm"
    />
  );
}
