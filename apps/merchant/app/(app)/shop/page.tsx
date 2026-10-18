"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import type { MerchantProfileResponse } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { Icon } from "../../components/icons";
import { AppBar } from "../../components/m/AppBar";
import { useToast } from "../../components/m/Toast";
import { PhotoCropSheet } from "../../components/menu/PhotoCropSheet";
import { useBackGuard, useKeyboardOpen } from "../../components/shop/hooks";
import { ShopFrontCard, type CardPhoto } from "../../components/shop/ShopFrontCard";
import { useShopPhoto, type ShopPhotoKind, type ShopPhotoState } from "../../components/shop/useShopPhoto";
import { redirectIfSessionExpired, serverMessage } from "../../lib/api-client";
import { refreshBranches } from "../../lib/branches";
import { primeBusiness } from "../../lib/business";
import { getMerchantProfile, updateProfile } from "../../lib/menu-api";
import {
  addTag,
  canSave,
  isAddKey,
  isDirty,
  isShopNotLive,
  splitAtComma,
  tagsFull,
  tagSuggestions,
  valuesFrom,
  wordsFor,
  type PhotoChange,
  type PriceLevel,
  type ShopFrontValues,
} from "../../lib/shop-front";
import { SF } from "../../lib/shop-front-copy";

/**
 * C4 → Shop front ("Banner, logo and tags"), redrawn for the phone: Shop front v1
 * (packages/design/handoff/shop-front-v1, ledger D-115; its README wins over the drawings). What customers
 * see is the top of the screen and is also where the banner and logo are changed; the fields below update it
 * as they are typed. One pinned Save, enabled only while the form differs from the last loaded or saved
 * profile. Strings are the handoff's copy (lib/shop-front-copy.ts).
 */

type LoadState = { status: "loading" } | { status: "ready"; profile: MerchantProfileResponse } | { status: "error"; message: string };

const NAME_COUNTER_FROM = 100;
const DESC_COUNTER_FROM = 450;
const DUP_FLASH_MS = 2000;

export default function ShopPage() {
  const { actionsDisabled, signOut } = useKitchenConnection();
  const router = useRouter();
  const toast = useToast();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const refresh = useCallback(() => {
    setState({ status: "loading" });
    getMerchantProfile()
      .then((profile) => setState({ status: "ready", profile }))
      .catch((err: unknown) => {
        if (redirectIfSessionExpired(err, signOut)) return;
        setState({ status: "error", message: serverMessage(err) ?? SF.loadFailT });
      });
  }, [signOut]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return (
    <Kitchen active="shop" tabs={false}>
      {state.status === "ready" ? (
        state.profile.myRole === "staff" ? (
          <StaffView profile={state.profile} />
        ) : (
          <Editor
            key={state.profile.id}
            initial={state.profile}
            actionsDisabled={actionsDisabled}
            signOut={signOut}
            onLeave={() => router.replace("/account")}
            toast={toast}
          />
        )
      ) : (
        <>
          <AppBar back="/account" title={SF.appBar} />
          {state.status === "loading" ? <Loading /> : <LoadFailed message={state.message} onRetry={refresh} />}
        </>
      )}
    </Kitchen>
  );
}

function Editor({
  initial,
  actionsDisabled,
  signOut,
  onLeave,
  toast,
}: {
  initial: MerchantProfileResponse;
  actionsDisabled: boolean;
  signOut: () => void;
  onLeave: () => void;
  toast: ReturnType<typeof useToast>;
}) {
  const [profile, setProfile] = useState(initial);
  const saved = valuesFrom(profile);
  const [form, setForm] = useState<ShopFrontValues>(saved);
  const [banner, setBanner] = useState<PhotoChange>(undefined);
  const [logo, setLogo] = useState<PhotoChange>(undefined);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [nameTouched, setNameTouched] = useState(false);
  const [leaveAsked, setLeaveAsked] = useState(false);
  const [photoSheet, setPhotoSheet] = useState<ShopPhotoKind | null>(null);
  const [draft, setDraft] = useState("");
  const [flash, setFlash] = useState<string | null>(null);
  const [dupNote, setDupNote] = useState<string | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagInput = useRef<HTMLInputElement | null>(null);
  const cameraInput = useRef<HTMLInputElement | null>(null);
  const galleryInput = useRef<HTMLInputElement | null>(null);
  const pickingFor = useRef<ShopPhotoKind>("banner");
  const keyboardOpen = useKeyboardOpen();

  const words = wordsFor(profile);
  const notLive = isShopNotLive(profile);
  const bannerPhoto = useShopPhoto("banner", (key, previewUrl) => setBanner({ kind: "new", key, previewUrl }));
  const logoPhoto = useShopPhoto("logo", (key, previewUrl) => setLogo({ kind: "new", key, previewUrl }));
  const photoBusy = bannerPhoto.busy || logoPhoto.busy;
  const dirty = isDirty(form, saved, banner, logo);
  const nameEmpty = form.name.trim().length === 0;
  const enabled = canSave(form, dirty, saving, photoBusy) && !actionsDisabled;
  const { release } = useBackGuard(dirty && !saving, () => setLeaveAsked(true));

  useEffect(
    () => () => {
      if (flashTimer.current) clearTimeout(flashTimer.current);
    },
    [],
  );

  const set = <K extends keyof ShopFrontValues>(key: K, value: ShopFrontValues[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setSaveError(null);
  };

  function tryAdd(text: string) {
    const r = addTag(form.tags, text);
    setDraft("");
    if (r.kind === "added") {
      set("tags", r.tags);
      setDupNote(null);
      if (tagsFull(r.tags)) tagInput.current?.blur();
    } else if (r.kind === "duplicate") {
      setDupNote(r.existing);
      setFlash(r.existing);
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setFlash(null), DUP_FLASH_MS);
    }
  }

  async function onSave() {
    if (!enabled) return;
    setSaving(true);
    setSaveError(null);
    try {
      const next = await updateProfile({
        name: form.name.trim(),
        description: form.description.trim(),
        cuisineTags: form.tags,
        priceLevel: form.priceLevel,
        ...(banner?.kind === "new" ? { coverPhotoUrl: banner.key } : banner?.kind === "removed" ? { coverPhotoUrl: null } : {}),
        ...(logo?.kind === "new" ? { logoUrl: logo.key } : logo?.kind === "removed" ? { logoUrl: null } : {}),
      });
      // MJ-RL19: Account, the team's invite message and the branch list read the business from these shared
      // copies; a rename has to reach them, not just this page.
      const renamed = profile.name !== next.name;
      primeBusiness(next);
      if (renamed) void refreshBranches();
      setProfile(next);
      setForm(valuesFrom(next));
      setBanner(undefined);
      setLogo(undefined);
      toast(isShopNotLive(next) ? SF.savedNotLive : SF.saved, { tone: "saved" });
    } catch (err) {
      if (redirectIfSessionExpired(err, signOut)) return;
      setSaveError(serverMessage(err) ?? SF.saveFail);
    } finally {
      setSaving(false);
    }
  }

  function back() {
    if (saving) return;
    if (dirty) setLeaveAsked(true);
    else onLeave();
  }

  function leave() {
    release();
    setLeaveAsked(false);
    onLeave();
  }

  function openPicker(kind: ShopPhotoKind, source: "camera" | "gallery") {
    pickingFor.current = kind;
    setPhotoSheet(null);
    (source === "camera" ? cameraInput : galleryInput).current?.click();
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    (pickingFor.current === "banner" ? bannerPhoto : logoPhoto).choose(file);
  }

  const savedBanner = profile.coverPhotoUrl;
  const savedLogo = profile.logoUrl;
  const cardPhoto = (slot: ShopPhotoState, change: PhotoChange, savedUrl: string | null): CardPhoto => {
    if (slot.kind === "shrinking" || slot.kind === "uploading") return { kind: "busy", ...slot.preview };
    if (slot.kind === "failed") return { kind: "failed", ...slot.preview };
    if (change?.kind === "new") return { kind: "photo", url: change.previewUrl };
    if (change?.kind === "removed" || !savedUrl) return { kind: "empty" };
    return { kind: "photo", url: savedUrl };
  };
  const bannerCard = cardPhoto(bannerPhoto.state, banner, savedBanner);
  const logoCard = cardPhoto(logoPhoto.state, logo, savedLogo);
  const hasPhoto = (kind: ShopPhotoKind) => (kind === "banner" ? bannerCard : logoCard).kind === "photo";
  const disabled = saving || actionsDisabled;
  const cropping = bannerPhoto.state.kind === "cropping" ? bannerPhoto : logoPhoto.state.kind === "cropping" ? logoPhoto : null;
  const croppingKind: ShopPhotoKind = cropping === bannerPhoto ? "banner" : "logo";
  const suggestions = tagsFull(form.tags) ? [] : tagSuggestions(profile, form.tags, draft);

  return (
    <>
      <div className={saving ? "m-sf-saving" : undefined} style={{ display: "contents" }}>
        <AppBar onBack={back} title={SF.appBar} />
      </div>
      <div className="m-sf-page" data-saving={saving || undefined} aria-busy={saving || undefined}>
        {notLive ? (
          <div className="m-sf-strip">
            <span className="m-sf-strip-ic">
              <Icon name="store" size={16} />
            </span>
            <span className="m-sf-strip-body">{SF.introNotLive}</span>
          </div>
        ) : (
          <p className="m-sf-intro">{SF.intro}</p>
        )}

        <div className="m-sf-grp">
          <div className="m-sf-sl">{SF.previewLabel}</div>
          <ShopFrontCard
            words={words}
            name={form.name}
            description={form.description}
            tags={form.tags}
            priceLevel={form.priceLevel}
            banner={bannerCard}
            logo={logoCard}
            editable={!disabled}
            onBanner={() => setPhotoSheet("banner")}
            onLogo={() => setPhotoSheet("logo")}
          />
          <PhotoStrip
            kind="banner"
            slot={bannerPhoto.state}
            removed={banner?.kind === "removed"}
            onRetry={bannerPhoto.retry}
            onUndo={() => setBanner(undefined)}
          />
          <PhotoStrip kind="logo" slot={logoPhoto.state} removed={logo?.kind === "removed"} onRetry={logoPhoto.retry} onUndo={() => setLogo(undefined)} />
          {/* The tip stays until a banner is added; a banner just removed shows its Undo strip instead. */}
          {bannerCard.kind === "empty" && banner?.kind !== "removed" && <p className="m-sf-tip">{SF.tip[words]}</p>}
        </div>

        <div className="m-sf-grp">
          <div className="m-sf-lblrow">
            <label className="m-sf-lbl" htmlFor="sf-name">
              {SF.nameLabel}
            </label>
            {form.name.length >= NAME_COUNTER_FROM && <span className="m-sf-count">{SF.counter(form.name.length, SF.nameMax)}</span>}
          </div>
          <input
            id="sf-name"
            className="m-sf-in"
            value={form.name}
            maxLength={SF.nameMax}
            enterKeyHint="done"
            autoComplete="organization"
            disabled={disabled}
            aria-invalid={(nameTouched || form.name !== saved.name) && nameEmpty ? true : undefined}
            aria-describedby={nameEmpty ? "sf-name-err" : undefined}
            onChange={(e) => {
              setNameTouched(true);
              set("name", e.target.value);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
            }}
          />
          {(nameTouched || form.name !== saved.name) && nameEmpty && (
            <p className="m-sf-help" data-err id="sf-name-err">
              <Icon name="circle-alert" size={16} />
              {SF.nameErr}
            </p>
          )}
        </div>

        <div className="m-sf-grp">
          <div className="m-sf-lblrow">
            <label className="m-sf-lbl" htmlFor="sf-desc">
              {SF.descLabel}
            </label>
            {form.description.length >= DESC_COUNTER_FROM && <span className="m-sf-count">{SF.counter(form.description.length, SF.descMax)}</span>}
          </div>
          <GrowingTextarea
            id="sf-desc"
            value={form.description}
            maxLength={SF.descMax}
            disabled={disabled}
            onChange={(value) => set("description", value)}
          />
          <p className="m-sf-help">{SF.descHelp}</p>
        </div>

        <div className="m-sf-grp">
          <div className="m-sf-lblrow">
            <span className="m-sf-lbl" id="sf-tags">
              {SF.tagsLabel[words]}
            </span>
            <span className="m-sf-count">{SF.tagsCount(form.tags.length)}</span>
          </div>
          {form.tags.length > 0 && (
            <div className="m-sf-chips" aria-labelledby="sf-tags">
              {form.tags.map((t) => (
                <div key={t} className="m-sf-chip" data-flash={flash === t || undefined}>
                  <span>{t}</span>
                  <button
                    type="button"
                    aria-label={SF.tagRemoveA11y(t)}
                    disabled={disabled}
                    onClick={() => {
                      set(
                        "tags",
                        form.tags.filter((x) => x !== t),
                      );
                      setDupNote(null);
                    }}
                  >
                    <Icon name="x" size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
          {tagsFull(form.tags) ? (
            <p className="m-sf-help">{SF.tagFull}</p>
          ) : (
            <>
              <div className="m-sf-tagrow">
                <input
                  ref={tagInput}
                  className="m-sf-in"
                  value={draft}
                  maxLength={SF.tagMax}
                  placeholder={SF.tagPh}
                  enterKeyHint="enter"
                  autoCapitalize="words"
                  aria-labelledby="sf-tags"
                  disabled={disabled}
                  onChange={(e) => {
                    const split = splitAtComma(e.target.value);
                    if (split) {
                      tryAdd(split.add);
                      setDraft(split.rest);
                    } else {
                      setDraft(e.target.value);
                      if (dupNote) setDupNote(null);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (isAddKey(e)) {
                      e.preventDefault();
                      tryAdd(draft);
                    }
                  }}
                  onBeforeInput={(e) => {
                    // Gboard often sends the action key as keyCode 229 with no `key`, but as a line break here.
                    if ((e.nativeEvent as InputEvent).inputType === "insertLineBreak") {
                      e.preventDefault();
                      tryAdd(draft);
                    }
                  }}
                  onBlur={() => {
                    if (draft.trim()) tryAdd(draft);
                  }}
                />
                <button
                  type="button"
                  className="m-sf-add"
                  data-on={draft.trim() ? true : undefined}
                  disabled={disabled}
                  // Keep the field focused: the next tag can be typed straight away.
                  onPointerDown={(e) => e.preventDefault()}
                  onClick={() => {
                    tryAdd(draft);
                    tagInput.current?.focus();
                  }}
                >
                  {SF.tagAdd}
                </button>
              </div>
              {dupNote && <p className="m-sf-help">{SF.tagDup(dupNote)}</p>}
              {suggestions.length > 0 && (
                <div className="m-sf-sug">
                  <p className="m-sf-help">{SF.tagSuggest}</p>
                  <div className="m-sf-sug-row">
                    {suggestions.map((s) => (
                      <button key={s} type="button" className="m-sf-sugchip" disabled={disabled} onPointerDown={(e) => e.preventDefault()} onClick={() => tryAdd(s)}>
                        <Icon name="plus" size={16} />
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <div className="m-sf-grp">
          <div className="m-sf-lbl" id="sf-price">
            {SF.priceLabel} <i>· {SF.optional}</i>
          </div>
          <div className="m-sf-prices" role="group" aria-labelledby="sf-price">
            {([1, 2, 3] as PriceLevel[]).map((level) => (
              <button
                key={level}
                type="button"
                className="m-sf-pchip"
                aria-pressed={form.priceLevel === level}
                disabled={disabled}
                onClick={() => set("priceLevel", form.priceLevel === level ? null : level)}
              >
                {SF.price[level - 1]}
              </button>
            ))}
          </div>
          {form.priceLevel != null && <p className="m-sf-help">{SF.priceHelp}</p>}
        </div>
      </div>

      {!keyboardOpen && (
        <div className="m-cta m-cta-pin">
          {saveError && (
            <div className="m-sf-strip" data-tone="bad" role="alert">
              <span className="m-sf-strip-ic">
                <Icon name="circle-alert" size={16} />
              </span>
              <span className="m-sf-strip-body m-sf-strip-msg">{saveError}</span>
            </div>
          )}
          <button type="button" className="m-btn m-sf-save" disabled={!enabled} aria-busy={saving || undefined} onClick={() => void onSave()}>
            {saving ? (
              <>
                <span className="m-spin" />
                {SF.saving}
              </>
            ) : (
              SF.save
            )}
          </button>
        </div>
      )}

      <input ref={cameraInput} type="file" accept="image/*" capture="environment" hidden onChange={onFile} />
      <input ref={galleryInput} type="file" accept="image/*" hidden onChange={onFile} />

      {photoSheet && (
        <Sheet onDismiss={() => setPhotoSheet(null)} labelledBy="sf-photo-t">
          <div className="m-sf-sheet-t" id="sf-photo-t">
            {SF.photoTitle[photoSheet]}
          </div>
          <p className="m-sf-sheet-s">{photoSheet === "banner" ? SF.tip[words] : SF.logoSub}</p>
          <div className="m-sf-list">
            <button type="button" onClick={() => openPicker(photoSheet, "camera")}>
              <Icon name="camera" size={20} />
              {SF.takePhoto}
            </button>
            <button type="button" onClick={() => openPicker(photoSheet, "gallery")}>
              <Icon name="image" size={20} />
              {SF.choosePhoto}
            </button>
            {hasPhoto(photoSheet) && (
              <button
                type="button"
                data-danger
                onClick={() => {
                  const kind = photoSheet;
                  setPhotoSheet(null);
                  // A photo uploaded but not saved yet is just dropped; a saved one is cleared on Save.
                  const remove = (kind === "banner" ? savedBanner : savedLogo) ? ({ kind: "removed" } as const) : undefined;
                  (kind === "banner" ? setBanner : setLogo)(remove);
                }}
              >
                <Icon name="trash-2" size={20} />
                {SF.remove[photoSheet]}
              </button>
            )}
          </div>
          <button type="button" className="m-btn2" onClick={() => setPhotoSheet(null)}>
            {SF.cancel}
          </button>
        </Sheet>
      )}

      {cropping && cropping.state.kind === "cropping" && (
        <PhotoCropSheet
          kind={croppingKind}
          aspect={croppingKind === "banner" ? 3 : 1}
          file={cropping.state.file}
          shopName={form.name}
          bannerPreview={(photo) => (
            <ShopFrontCard
              words={words}
              name={form.name}
              description={form.description}
              descFallback={SF.crop.bannerDescFallback}
              tags={[]}
              priceLevel={form.priceLevel}
              banner={{ kind: "photo", ...photo }}
              logo={logoCard.kind === "photo" ? logoCard : { kind: "empty" }}
            />
          )}
          onCancel={cropping.cancelCrop}
          onConfirm={(crop, natural) => cropping.confirmCrop(crop, natural)}
        />
      )}

      {leaveAsked && (
        <Sheet onDismiss={() => setLeaveAsked(false)} labelledBy="sf-leave-t">
          <div className="m-sf-sheet-t" id="sf-leave-t">
            {SF.leaveT}
          </div>
          <p className="m-sf-sheet-s">{SF.leaveB}</p>
          <button type="button" className="m-btn" onClick={() => setLeaveAsked(false)}>
            {SF.leaveKeep}
          </button>
          <button type="button" className="m-btn2 m-sf-leave" onClick={leave}>
            {SF.leaveGo}
          </button>
        </Sheet>
      )}
    </>
  );
}

/** The strip under the card for one photo slot: Shrinking… / Uploading… (with progress), failed with Retry,
 *  or removed with Undo. Nothing when the slot is settled. */
function PhotoStrip({ kind, slot, removed, onRetry, onUndo }: { kind: ShopPhotoKind; slot: ShopPhotoState; removed: boolean; onRetry: () => void; onUndo: () => void }) {
  if (slot.kind === "shrinking" || slot.kind === "uploading") {
    const progress = slot.kind === "uploading" ? slot.progress : null;
    return (
      <div className="m-sf-busy" role="status">
        <div className="m-sf-busy-row">
          <span className="m-sf-spin" />
          <b>{slot.kind === "shrinking" ? SF.shrinking : SF.uploading}</b>
          {progress != null && <span>{progress}%</span>}
        </div>
        {progress != null && (
          <div className="m-sf-prog">
            <i style={{ width: `${progress}%` }} />
          </div>
        )}
        <small>{SF.waitSave}</small>
      </div>
    );
  }
  if (slot.kind === "failed") {
    return (
      <div className="m-sf-strip" data-tone="bad" data-below role="alert">
        <span className="m-sf-strip-ic">
          <Icon name="circle-alert" size={16} />
        </span>
        <div className="m-sf-strip-body">
          <div>
            <b>{slot.reason === "prepare" ? SF.prepFail : SF.uploadFail}</b>
            <small>{slot.reason === "prepare" ? SF.prepSub : SF.failSub}</small>
          </div>
          <button type="button" className="m-sf-pill" data-bad onClick={onRetry}>
            <Icon name="rotate-cw" size={16} />
            {SF.retryShort}
          </button>
        </div>
      </div>
    );
  }
  if (removed) {
    return (
      <div className="m-sf-strip" data-act>
        <span className="m-sf-strip-ic">
          <Icon name="trash-2" size={16} />
        </span>
        <span className="m-sf-strip-body">{SF.removed[kind]}</span>
        <button type="button" className="m-sf-pill" onClick={onUndo}>
          {SF.undo}
        </button>
      </div>
    );
  }
  return null;
}

/** "One line customers read": a field that grows with its text from 52px. */
function GrowingTextarea({ id, value, maxLength, disabled, onChange }: { id: string; value: string; maxLength: number; disabled: boolean; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + (el.offsetHeight - el.clientHeight)}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      id={id}
      className="m-sf-in"
      rows={1}
      value={value}
      maxLength={maxLength}
      enterKeyHint="done"
      disabled={disabled}
      onChange={(e) => onChange(e.target.value.replace(/\n/g, " "))}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** A bottom sheet over the screen (merchant-v2's sheet: scrim, handle, 20px top corners). */
function Sheet({ children, onDismiss, labelledBy }: { children: React.ReactNode; onDismiss: () => void; labelledBy: string }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onDismiss]);
  return (
    <div className="m-overlay" style={{ zIndex: 70 }}>
      <div className="m-overlay-frame">
        <button type="button" className="m-scrim" aria-label={SF.cancel} onClick={onDismiss} />
        <div className="m-sheet m-sf-sheet" role="dialog" aria-modal="true" aria-labelledby={labelledBy}>
          <div className="m-grab" />
          {children}
        </div>
      </div>
    </div>
  );
}

/** The staff view: the shop front exactly as customers see it, with the lock strip saying why it can't change. */
function StaffView({ profile }: { profile: MerchantProfileResponse }) {
  const v = valuesFrom(profile);
  return (
    <>
      <AppBar back="/account" title={SF.appBar} />
      <div className="m-sf-page">
        <div className="m-sf-strip">
          <span className="m-sf-strip-ic">
            <Icon name="lock" size={16} />
          </span>
          <span className="m-sf-strip-body">{SF.staff}</span>
        </div>
        <div className="m-sf-grp">
          <div className="m-sf-sl">{SF.previewLabel}</div>
          <ShopFrontCard
            words={wordsFor(profile)}
            name={v.name}
            description={v.description}
            tags={v.tags}
            priceLevel={v.priceLevel}
            banner={profile.coverPhotoUrl ? { kind: "photo", url: profile.coverPhotoUrl } : { kind: "empty" }}
            logo={profile.logoUrl ? { kind: "photo", url: profile.logoUrl } : { kind: "empty" }}
          />
        </div>
      </div>
    </>
  );
}

/** A skeleton in the real layout, so nothing jumps when it fills in. No Save bar until the profile loads. */
function Loading() {
  return (
    <div className="m-sf-page" aria-busy="true">
      <p className="m-sf-intro">{SF.loading}</p>
      <div className="m-sf-grp">
        <div className="m-sf-sk" style={{ width: "42%", height: 12, borderRadius: 6 }} />
        <div className="m-sf-card">
          <div className="m-sf-ban">
            <span className="m-sf-ring">
              <span className="m-sf-logo" />
            </span>
          </div>
          <div className="m-sf-txt" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="m-sf-sk" style={{ width: "55%", height: 18 }} />
            <div className="m-sf-sk" style={{ width: "85%", height: 14 }} />
          </div>
        </div>
      </div>
      {["30%", "50%"].map((w) => (
        <div key={w} className="m-sf-grp">
          <div className="m-sf-sk" style={{ width: w, height: 14, borderRadius: 6 }} />
          <div className="m-sf-sk" style={{ width: "100%", height: 52, borderRadius: 12 }} />
        </div>
      ))}
    </div>
  );
}

/** T14b, centred like T4: the disc, what didn't load, one line, and a 48px outline "Try again". */
function LoadFailed({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="m-sf-fail">
      <span className="m-sf-fail-ic">
        <Icon name="wifi-off" size={20} />
      </span>
      <b>{message}</b>
      <p>{SF.loadFailB}</p>
      <button type="button" className="m-btn2" onClick={onRetry}>
        <Icon name="rotate-cw" size={16} />
        {SF.retry}
      </button>
    </div>
  );
}
