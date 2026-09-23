import { InstagramBrandIcon, TikTokBrandIcon } from "@/components/social-brand-icons";

interface FoodSocialLinksProps {
  instagramUrl?: string;
  placeName: string;
  tiktokUrl?: string;
}

export function FoodSocialLinks({ instagramUrl, placeName, tiktokUrl }: FoodSocialLinksProps) {
  if (!instagramUrl && !tiktokUrl) return null;
  return (
    <div className="flex items-center gap-2.5">
      {instagramUrl && (
        <a
          href={instagramUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`Instagram ${placeName}`}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <InstagramBrandIcon className="size-4" />
        </a>
      )}
      {tiktokUrl && (
        <a
          href={tiktokUrl}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={`TikTok ${placeName}`}
          className="text-muted-foreground transition-colors hover:text-foreground"
        >
          <TikTokBrandIcon className="size-4" />
        </a>
      )}
    </div>
  );
}
