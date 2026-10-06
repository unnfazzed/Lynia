// First Run v2 shared parts (packages/design/handoff/first-run-v2/, ledger D-80). Re-exported from the
// src/ui barrel; the copy (`PC`, `RP`, `UP`, `PD`, `BD`, `KY`, `SP`) is imported from ./copy directly.
export { FR, FR_TONES, HERO_H, DISC, COMPACT_MAX_WIDTH, LARGE_FONT_SCALE, firstRunMetrics, useFirstRunMetrics, type FrTone, type FrTonePalette, type FirstRunMetrics } from "./metrics";
export { HeroPanel, HeroDisc, SplitTitle, Body, useHeroTone, type HeroPanelProps, type HeroDiscProps, type SplitTitleProps } from "./hero";
export { PrimaryButton, TextLinkButton, PinnedFooter, ExitButton, FrSoftPill, Toggle, BackHeader, LargeTitle, type FrAction, type PrimaryButtonProps, type PinnedFooterProps, type FrSoftPillTone } from "./actions";
export { ListCard, ListRow, IconDot, BulletList, type ListRowProps, type IconDotTone } from "./lists";
export { Spinner, StepMarker, StepList, SystemSettingsSteps, KycChecklist, type StepState, type StepItem } from "./steps";
export { TipChips, TriesMeter, InfoBox, FrBadge, SampleNotification, type InfoBoxTone, type FrBadgeTone } from "./bits";
export { FirstRunToast, type FirstRunToastTone } from "./toast";
export { FrField, VerifiedRow, type FrFieldProps } from "./form";
export { FrSheet, SHEET_DIM } from "./sheet";
export { FirstRunScreen } from "./screen";
