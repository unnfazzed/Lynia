import React from "react";
import Svg, { Circle, Ellipse, G, Path, Rect } from "react-native-svg";

/**
 * The customer home's flat sticker artwork (home 8c) — the shipped SVGs from the design system's
 * `assets/service-icons/`, transcribed node-for-node into `react-native-svg`.
 *
 * Why a transcription and not the file: Metro in this app runs with no SVG transformer (see
 * `metro.config.js` — the resolver is hand-tuned for posthog/zod/sentry and adding
 * `react-native-svg-transformer` would change resolution for the whole tree), so an `.svg` import is
 * not a component here the way `<img src>` is in the mock. Every path, rect, circle, transform and
 * fill below is copied VERBATIM from the design files — same viewBox, same order, same colours — so
 * this is the same artwork, not a redraw. If the design ships new stickers, re-transcribe; never
 * hand-tune the geometry, and never tint them (the handoff is explicit: use as-is, no tinting).
 *
 * Sizing follows the mock's `<img style="width:N">` on a 100×88 viewBox: the caller passes the drawn
 * WIDTH and the height derives from the ratio, which is what makes the three stickers sit on their
 * 44px stage exactly as drawn (Send 50→44, Restaurants 56→49.3, Pharmacy 53→46.6).
 */

/** Both service stickers share the handoff's 100×88 artboard. */
const ART_W = 100;
const ART_H = 88;
const ratio = (width: number): number => (width * ART_H) / ART_W;

function Sticker({ width, children }: { width: number; children: React.ReactNode }): React.ReactElement {
  return (
    <Svg width={width} height={ratio(width)} viewBox={`0 0 ${ART_W} ${ART_H}`}>
      {children}
    </Svg>
  );
}

/** `assets/service-icons/send.svg` — the rider, the parcel and the paper dove. */
export function SendSticker({ width = 50 }: { width?: number }): React.ReactElement {
  return (
    <Sticker width={width}>
      <Rect x={0} y={22} width={8} height={3.5} rx={1.75} fill="#b9e8cc" />
      <Rect x={2} y={30} width={6} height={3.5} rx={1.75} fill="#b9e8cc" />
      <Rect x={0} y={56} width={9} height={3.5} rx={1.75} fill="#b9e8cc" />
      <Rect x={10} y={18} width={22} height={24} rx={3} fill="#ffd76b" />
      <Rect x={10} y={18} width={22} height={6.5} rx={3} fill="#f2b705" />
      <Rect x={18.5} y={18} width={5} height={10} fill="#00913c" />
      <Circle cx={21} cy={70} r={11} fill="#2b3440" />
      <Circle cx={21} cy={70} r={4.5} fill="#e9edf2" />
      <Circle cx={74} cy={70} r={11} fill="#2b3440" />
      <Circle cx={74} cy={70} r={4.5} fill="#e9edf2" />
      <Path d="M8 66V52q0-8 10-8h20l8 22q1 3-2 3H11q-3 0-3-3Z" fill="#00b14f" />
      <Path d="M8 61h36l2.5 7q.5 1-1 1H11q-3 0-3-3Z" fill="#00913c" />
      <Rect x={28} y={39} width={15} height={6} rx={3} fill="#2b3440" />
      <Path d="M61 65q0-3 3-8t10-5q7 0 10 5t3 8q0 3-3 3H64q-3 0-3-3Z" fill="#00b14f" />
      <Path d="M66 30h7l5 28h-9Z" fill="#00b14f" />
      <Path d="M73 30l5 28h-4l-5-28Z" fill="#00913c" />
      <Rect x={63} y={19} width={19} height={13} rx={5.5} fill="#00b14f" />
      <Circle cx={82} cy={25.5} r={5} fill="#f2b705" />
      <Rect x={63} y={19} width={14} height={13} rx={5.5} fill="#00913c" />
      <Path d="M58 26.5h8" stroke="#2b3440" strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M33 44l16 5v13" fill="none" stroke="#2b3440" strokeWidth={7} strokeLinecap="round" strokeLinejoin="round" />
      <Rect x={45} y={61} width={11} height={4.5} rx={2.25} fill="#f2b705" />
      <Path d="M29 44l7-24q2-6 8-4.5L48 17l-5 27Z" fill="#f7c948" />
      <Path d="M43 20l14 6" stroke="#f7c948" strokeWidth={5.5} strokeLinecap="round" />
      <Circle cx={57.5} cy={26.5} r={2.6} fill="#f6e3d2" />
      <Circle cx={46} cy={13} r={9} fill="#00813a" />
      <Circle cx={51} cy={15.5} r={3.8} fill="#f6e3d2" />
      <Ellipse cx={42.5} cy={9.5} rx={3} ry={2} fill="#fff" opacity={0.45} />
    </Sticker>
  );
}

/** `assets/service-icons/food.svg` — the covered dish. */
export function FoodSticker({ width = 56 }: { width?: number }): React.ReactElement {
  return (
    <Sticker width={width}>
      <Path d="M36 22c-3-3 3-6 0-10M48 24c-3-3 3-6 0-10" fill="none" stroke="#ffc078" strokeWidth={3.5} strokeLinecap="round" />
      <Path d="M64 30 90 6M70 33 94 14" stroke="#d99e00" strokeWidth={4} strokeLinecap="round" />
      <Path d="M26 38c4-7 13-10 24-10s20 3 24 10Z" fill="#fff4e6" />
      <Path d="M32 35q6-4 18-4t18 4" fill="none" stroke="#e8590c" strokeWidth={2.5} />
      <Circle cx={38} cy={33} r={3} fill="#2f9e44" />
      <Circle cx={60} cy={32} r={3} fill="#2f9e44" />
      <Path d="M20 42a30 27 0 0 0 60 0Z" fill="#e8590c" />
      <Path d="M27 56a30 20 0 0 0 46 0q-8 6-23 6t-23-6Z" fill="#c74708" />
      <Rect x={17} y={38} width={66} height={8} rx={4} fill="#ff922b" />
    </Sticker>
  );
}

/** `assets/service-icons/pharmacy.svg` — the cross and two capsules. */
export function PharmacySticker({ width = 53 }: { width?: number }): React.ReactElement {
  return (
    <Sticker width={width}>
      <Rect x={26} y={20} width={14} height={40} rx={4} fill="#0ca789" />
      <Rect x={13} y={33} width={40} height={14} rx={4} fill="#0ca789" />
      <Rect x={26} y={33} width={14} height={14} fill="#0a9377" />
      <G transform="rotate(32 70 30)">
        <Rect x={56} y={23} width={28} height={14} rx={7} fill="#f2b705" />
        <Path d="M56 30a7 7 0 0 1 7-7h5v14h-5a7 7 0 0 1-7-7Z" fill="#fff" />
      </G>
      <G transform="rotate(-24 70 58)">
        <Rect x={56} y={51} width={28} height={14} rx={7} fill="#0ca789" />
        <Path d="M56 58a7 7 0 0 1 7-7h5v14h-5a7 7 0 0 1-7-7Z" fill="#fff" />
      </G>
      <Circle cx={20} cy={62} r={4} fill="#b9e8cc" />
      <Circle cx={30} cy={68} r={3} fill="#b9e8cc" />
    </Sticker>
  );
}

/**
 * The header's 46px time-of-day sticker: the flat gold sun, and the moon it swaps to after 18:00.
 * Drawn on the handoff's own 64×64 artboard (`home-8c.html`), so the two are interchangeable in
 * place without any layout shift.
 */
export function SunSticker({ size = 46 }: { size?: number }): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Circle cx={32} cy={32} r={13} fill="#f2b705" />
      <Circle cx={27} cy={27} r={4.5} fill="#ffd76b" />
      <G stroke="#f2b705" strokeWidth={4.5} strokeLinecap="round">
        <Path d="M32 9v6M32 49v6M9 32h6M49 32h6M16 16l4.5 4.5M43.5 43.5 48 48M48 16l-4.5 4.5M20.5 43.5 16 48" />
      </G>
    </Svg>
  );
}

export function MoonSticker({ size = 46 }: { size?: number }): React.ReactElement {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64">
      <Path d="M40 12a22 22 0 1 0 14 40A24 24 0 0 1 40 12Z" fill="#f2b705" />
      <Circle cx={46} cy={24} r={3.5} fill="#ffd76b" />
    </Svg>
  );
}
