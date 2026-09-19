import type { BusinessRecord } from "@/lib/repo/businesses";
import { templateLabel } from "@/lib/templates/registry";
import { addressLine, directionsHref, osmHref, telHref, whatsappHref } from "@/lib/ui/contact";

const SOCIAL_LABELS: Record<string, string> = {
  facebook: "Facebook",
  instagram: "Instagram",
  whatsapp: "WhatsApp",
  twitter: "X",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  telegram: "Telegram",
  linktree: "Linktree",
};

export function BusinessCard({ business, showZone }: { business: BusinessRecord; showZone: boolean }) {
  const address = addressLine(business);
  const whatsapp = whatsappHref(business.phone, business.socials);
  const socialNetworks = Object.keys(business.socials);

  return (
    <li className="rounded-xl border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-2">
        <h3 className="text-base leading-snug font-semibold">
          {business.name ?? <span className="text-ink-muted italic">Unnamed {business.nicheLabel}</span>}
        </h3>
        {!business.hasWebsite && (
          <span
            className="shrink-0 rounded-full bg-flag px-2 py-0.5 text-xs font-medium text-flag-ink"
            title="No website tag in OpenStreetMap. They may still have one."
          >
            No site found
          </span>
        )}
      </div>

      <p className="mt-1 flex flex-wrap gap-x-2 gap-y-1 text-xs text-ink-muted">
        <span>{business.nicheLabel}</span>
        {showZone && business.zoneName && <span>· {business.zoneName}</span>}
        <span>· {templateLabel(business.templateKey)} template</span>
      </p>

      {(address || business.openingHours) && (
        <p className="mt-2 text-sm text-ink-muted">
          {address}
          {address && business.openingHours && " · "}
          {business.openingHours}
        </p>
      )}

      {socialNetworks.length > 0 && (
        <p className="mt-2 flex flex-wrap gap-1.5">
          {socialNetworks.map((network) => (
            <a
              key={network}
              href={business.socials[network]}
              target="_blank"
              rel="noreferrer noopener"
              className="rounded-full border border-line px-2 py-0.5 text-xs"
            >
              {SOCIAL_LABELS[network] ?? network}
            </a>
          ))}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {business.phone && (
          <a href={telHref(business.phone)} className="tap-target rounded-lg bg-accent px-3 text-sm font-medium text-accent-ink">
            Call {business.phone}
          </a>
        )}
        {whatsapp && (
          <a
            href={whatsapp}
            target="_blank"
            rel="noreferrer noopener"
            className="tap-target rounded-lg border border-line px-3 text-sm"
          >
            WhatsApp
          </a>
        )}
        {business.lat !== null && business.lon !== null && (
          <a
            href={directionsHref(business.lat, business.lon)}
            target="_blank"
            rel="noreferrer noopener"
            className="tap-target rounded-lg border border-line px-3 text-sm"
          >
            Directions
          </a>
        )}
        {business.website && (
          <a
            href={business.website}
            target="_blank"
            rel="noreferrer noopener"
            className="tap-target rounded-lg border border-line px-3 text-sm"
          >
            Website
          </a>
        )}
        <a
          href={osmHref(business.osmType, business.osmId)}
          target="_blank"
          rel="noreferrer noopener"
          className="tap-target rounded-lg border border-line px-3 text-sm text-ink-muted"
        >
          OSM
        </a>
      </div>
    </li>
  );
}
