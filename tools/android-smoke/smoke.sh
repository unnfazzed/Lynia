#!/usr/bin/env bash
# Emulator smoke for the sideloadable test APK (.github/workflows/android-emulator-smoke.yml).
#
# Walks everything a signed-out user can reach and records it: a screenshot plus the visible text of
# each screen, cold-start timings and a logcat crash scan. It never presses "Send code": production OTP
# goes out over WhatsApp to a real number, so the field only ever holds a partial one.
#
# Usage: smoke.sh <apk> <out-dir>. Exits non-zero if the app crashed, or died or left where it
# shouldn't have; the screenshots are for a person to read either way.
set -uo pipefail

APK="$1"
OUT="$2"
PKG="zw.co.lynia"
HERE="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$OUT"
: > "$OUT/report.txt"

failures=0
fail() { echo "FAIL: $*" | tee -a "$OUT/report.txt"; failures=$((failures + 1)); }
note() { echo "$*" | tee -a "$OUT/report.txt"; }
ui() { python3 "$HERE/ui.py" "$@"; }
shot() {
  sleep 1
  adb exec-out screencap -p > "$OUT/$1.png"
  ui texts > "$OUT/$1.txt" 2>/dev/null || echo "(no UI dump)" > "$OUT/$1.txt"
}
alive() { adb shell pidof "$PKG" > /dev/null 2>&1; }
focus() { adb shell dumpsys window 2>/dev/null | grep -m1 -E "mCurrentFocus" | tr -d '\r'; }
# Focus reads null for a moment mid-transition, so ask a few times before calling it gone.
in_app() {
  for _ in 1 2 3; do
    focus | grep -q "$PKG" && return 0
    sleep 1
  done
  return 1
}
deeplink() { adb shell am start -W -a android.intent.action.VIEW -d "$1" "$PKG" > /dev/null 2>&1; }
back() { adb shell input keyevent KEYCODE_BACK; sleep 2; }

adb wait-for-device
adb root > /dev/null 2>&1 || true # google_apis images allow it; the API 29 offline step needs it
adb wait-for-device
adb logcat -G 16M > /dev/null 2>&1 || true

SDK="$(adb shell getprop ro.build.version.sdk | tr -d '\r')"
note "Android $(adb shell getprop ro.build.version.release | tr -d '\r') (API $SDK)" \
  "· $(adb shell wm size | tr -d '\r') · $(adb shell wm density | tr -d '\r')"

# -g grants the runtime permissions up front, so no system dialog sits over the walk.
if ! adb install -r -g "$APK" > "$OUT/install.txt" 2>&1; then
  fail "install failed: $(tail -n1 "$OUT/install.txt")"
  exit 1
fi
note "$(adb shell dumpsys package "$PKG" | grep -m3 -o -E '(versionName|versionCode|targetSdk)=[^ ]+' | tr -d '\r' | tr '\n' ' ')"
ACTIVITY="$(adb shell cmd package resolve-activity --brief -c android.intent.category.LAUNCHER "$PKG" | tail -n1 | tr -d '\r')"
case "$ACTIVITY" in */*) ;; *) ACTIVITY="$PKG/.MainActivity" ;; esac
launch() { adb shell am start -W -n "$ACTIVITY" | tr -d '\r' | grep -E "TotalTime|WaitTime" | tr '\n' ' '; }
relaunch_to_phone() {
  adb shell am force-stop "$PKG"
  launch > /dev/null
  ui wait "Welcome to Lynia" 60 > /dev/null 2>&1
}
adb logcat -c

# 1. Fresh install: splash, then the onboarding carousel.
note "cold start, fresh install: $(launch)"
if ui wait "Skip" 120; then shot 01-onboarding-1; else fail "a fresh install never reached onboarding"; shot 01-stuck; fi

# 2. Next until the last slide, then Get started, which lands on phone sign-in.
for slide in 2 3 4; do
  ui has "Get started" && break
  ui tap "Next" 15 || { fail "no Next on onboarding slide $((slide - 1))"; break; }
  shot "02-onboarding-$slide"
done
ui tap "Get started" 15 || fail "no Get started on the last onboarding slide"
if ui wait "Welcome to Lynia" 30; then shot 03-phone; else fail "Get started did not reach phone sign-in"; shot 03-stuck; fi

# 3. The keyboard over the phone field. A partial number keeps "Send code" disabled.
if ui tap --class android.widget.EditText 15; then
  sleep 1
  adb shell input text "0771"
  shot 04-phone-keyboard
  note "keyboard: $(adb shell dumpsys input_method | grep -m1 -o -E 'mInputShown=[a-z]+' | tr -d '\r')"
  back # the first back closes the keyboard
  alive || fail "back with the keyboard up killed the app"
  ui has "Welcome to Lynia" || fail "back with the keyboard up left phone sign-in"
  shot 05-phone-keyboard-closed
else
  fail "no phone field on phone sign-in"
fi

# 4. Every route a link could open while signed out. Each must draw, and back must return inside the
#    app (API 36 is where targeting 36 changes back handling).
for route in help send home food history notifications settings profile wallet rider permissions role; do
  deeplink "lynia://$route"
  sleep 5
  shot "06-link-$route"
  if ! alive; then
    fail "lynia://$route killed the app"
    relaunch_to_phone
    continue
  fi
  back
  if ! alive; then
    fail "back from lynia://$route killed the app"
    relaunch_to_phone
  elif ! in_app; then
    fail "back from lynia://$route left the app ($(focus))"
    relaunch_to_phone
  fi
done

# 5. Relaunch after a force-stop: onboarding is remembered, so it opens on phone sign-in.
adb shell am force-stop "$PKG"
note "cold start after force-stop: $(launch)"
if ui wait "Welcome to Lynia" 60; then shot 07-relaunch; else fail "relaunch did not reach phone sign-in"; shot 07-stuck; fi

# 6. Back on the root screen sends the app to the background, and must not crash it.
back
note "back on the root screen: $(focus)"

# 7. Offline cold start: the app still draws, with the connectivity bar.
if [ "$SDK" -ge 30 ]; then
  adb shell cmd connectivity airplane-mode enable
else
  adb shell svc wifi disable
  adb shell svc data disable
fi
sleep 3
adb shell am force-stop "$PKG"
note "cold start, offline: $(launch)"
if ui wait "Welcome to Lynia" 60; then shot 08-offline; else fail "the offline cold start did not reach phone sign-in"; shot 08-stuck; fi
if [ "$SDK" -ge 30 ]; then
  adb shell cmd connectivity airplane-mode disable
else
  adb shell svc wifi enable
  adb shell svc data enable
fi
sleep 3

# 8. The 320x640dp entry phone (CLAUDE.md): the same 720x1440 panel at density 360.
adb shell wm density 360
relaunch_to_phone
shot 09-small-phone
if ui tap --class android.widget.EditText 15; then
  sleep 1
  adb shell input text "0771"
  shot 10-small-phone-keyboard
  back
fi
deeplink "lynia://help"
sleep 5
shot 11-small-phone-help
adb shell wm density reset

# 9. Crash scan over the whole walk.
adb logcat -d > "$OUT/logcat.txt" 2>&1
grep -n -E "FATAL EXCEPTION|Fatal signal|ANR in $PKG|E AndroidRuntime" "$OUT/logcat.txt" > "$OUT/crashes.txt" || true
grep -n "ReactNativeJS" "$OUT/logcat.txt" | grep -i -E "error|exception|warn" > "$OUT/js-errors.txt" || true
if [ -s "$OUT/crashes.txt" ]; then fail "crash lines in logcat: $(head -n3 "$OUT/crashes.txt" | tr '\n' ' ')"; fi
note "JS error/warning lines: $(wc -l < "$OUT/js-errors.txt")"
note "failures: $failures"

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "### Emulator smoke · API $SDK"
    echo '```'
    cat "$OUT/report.txt"
    echo '```'
  } >> "$GITHUB_STEP_SUMMARY"
fi
[ "$failures" -eq 0 ]
