"use client";

import type { CropRect } from "../../lib/image-compress";
import { SF } from "../../lib/shop-front-copy";
import type { PriceLevel, ShopFrontWords } from "../../lib/shop-front";
import { Icon } from "../icons";

/** One photo slot on the card. `busy` / `failed` draw the scrim with a spinner or an alert over the photo. */
export type CardPhoto =
  | { kind: "empty" }
  | { kind: "photo"; url: string; crop?: CropRect; natural?: { width: number; height: number } }
  | { kind: "busy"; url: string; crop?: CropRect; natural?: { width: number; height: number } }
  | { kind: "failed"; url?: string; crop?: CropRect; natural?: { width: number; height: number } };

/** Places exactly `crop` of the source in the box, in percentages so it holds at any card width. Without a
 *  crop the photo is already the right shape (a shrunk upload, or the saved one). */
function framed(photo: { crop?: CropRect; natural?: { width: number; height: number } }): React.CSSProperties | undefined {
  const { crop, natural } = photo;
  if (!crop || !natural || crop.width <= 0 || crop.height <= 0) return undefined;
  return {
    position: "absolute",
    left: `${(-crop.x / crop.width) * 100}%`,
    top: `${(-crop.y / crop.height) * 100}%`,
    width: `${(natural.width / crop.width) * 100}%`,
    height: `${(natural.height / crop.height) * 100}%`,
    maxWidth: "none",
    objectFit: "fill",
  };
}

function Photo({ photo, spinner }: { photo: Exclude<CardPhoto, { kind: "empty" }>; spinner: number }) {
  return (
    <>
      {photo.url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="m-sf-img" src={photo.url} alt="" draggable={false} style={framed(photo)} />
      )}
      {(photo.kind === "busy" || photo.kind === "failed") && (
        <span className="m-sf-scrim">{photo.kind === "busy" ? <span className="m-spin" style={{ width: spinner, height: spinner }} /> : <Icon name="circle-alert" size={spinner} color="var(--on-accent)" />}</span>
      )}
    </>
  );
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("") || "?";

/**
 * Shop front v1 "WHAT CUSTOMERS SEE" (D-115): the storefront header as customers see it, which on the owner's
 * screen is also where the banner and logo are changed — the whole banner and the whole 64px logo are the
 * targets. Read-only for staff and inside the crop sheet's live preview.
 */
export function ShopFrontCard({
  words,
  name,
  description,
  tags,
  priceLevel,
  banner,
  logo,
  editable = false,
  descFallback = SF.descFallback,
  onBanner,
  onLogo,
}: {
  words: ShopFrontWords;
  name: string;
  description: string;
  tags: readonly string[];
  priceLevel: PriceLevel | null;
  banner: CardPhoto;
  logo: CardPhoto;
  editable?: boolean;
  descFallback?: string;
  onBanner?: () => void;
  onLogo?: () => void;
}) {
  const bannerInner =
    banner.kind === "empty" ? (
      editable ? (
        <span className="m-sf-ban-empty">
          <span className="m-sf-ban-box">
            <Icon name="camera" size={20} />
            <b>{SF.addBanner}</b>
            <span>{SF.addBannerSub[words]}</span>
          </span>
        </span>
      ) : null
    ) : (
      <>
        <Photo photo={banner} spinner={24} />
        {editable && banner.kind === "photo" && (
          <span className="m-sf-change">
            <Icon name="camera" size={16} />
            {SF.change}
          </span>
        )}
      </>
    );

  const logoInner =
    logo.kind === "empty" ? (
      editable ? (
        <span className="m-sf-logo-empty">
          <Icon name="camera" size={16} />
          {SF.logoSlot}
        </span>
      ) : (
        <span className="m-sf-logo-ini">{initials(name)}</span>
      )
    ) : (
      <Photo photo={logo} spinner={20} />
    );

  return (
    <div className="m-sf-card">
      <div className="m-sf-ban" data-empty={banner.kind === "empty" || undefined}>
        {editable ? (
          <button type="button" className="m-sf-ban-hit" aria-label={SF.changeBannerA11y} onClick={onBanner}>
            {bannerInner}
          </button>
        ) : (
          <span className="m-sf-ban-hit">{bannerInner}</span>
        )}
        <span className="m-sf-ring">
          {editable ? (
            <button type="button" className="m-sf-logo" aria-label={SF.changeLogoA11y} onClick={onLogo}>
              {logoInner}
            </button>
          ) : (
            <span className="m-sf-logo">{logoInner}</span>
          )}
          {editable && logo.kind === "photo" && (
            <span className="m-sf-badge" aria-hidden="true">
              <Icon name="camera" size={16} />
            </span>
          )}
        </span>
      </div>
      <div className="m-sf-txt">
        <div className="m-sf-name">
          {name || SF.nameFallback}
          {priceLevel != null && (
            <>
              {" "}
              <span className="m-sf-price">· {SF.price[priceLevel - 1]}</span>
            </>
          )}
        </div>
        <div className="m-sf-desc">{description || descFallback}</div>
        {tags.length > 0 && (
          <div className="m-sf-tags">
            {tags.map((t) => (
              <span key={t}>{t}</span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
