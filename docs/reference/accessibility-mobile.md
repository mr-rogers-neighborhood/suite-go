# Accessibility on mobile — the WCAG 2.2 delta

The desktop map is [suite-dev's WCAG 2.2 criterion map](https://github.com/mr-rogers-neighborhood/suite-dev/blob/main/docs/accessibility/wcag-22-map.md).
This file does not fork it. It records only where **a phone changes the answer**, using the same status
vocabulary: **Gated**, **Manual**, **N/A**, **Gap**. Target is Level AA, as on the desktop.

Rows not listed here carry the desktop row unchanged.

## Why a delta, and not a copy

Four criteria change meaning on a phone, one becomes easier, and one is a different mechanism entirely.
Copying the desktop table would quietly claim desktop answers for a device that does not have a
keyboard, a pointer, a window title or a hover state.

## The rows that change

| SC     | Level | Criterion                 | Desktop                         | Mobile status | Mobile                                                                                           |
| ------ | ----- | ------------------------- | ------------------------------- | ------------- | ------------------------------------------------------------------------------------------------ |
| 1.3.4  | AA    | Orientation               | N/A — windows resize in the OS  | **Gated**     | The activity must not lock orientation. `android:screenOrientation` stays unset                  |
| 1.4.4  | AA    | Resize Text               | Manual — zoom to 200%           | **Gated**     | System font scale. Verified at 1.0, 1.3, 1.5 and 2.0 with no horizontal overflow and no clipping |
| 1.4.10 | AA    | Reflow                    | Manual — 320px, 400%            | **Manual**    | A phone is always narrow; the case that matters is 200% font scale at 320 CSS px                 |
| 1.4.13 | AA    | Content on Hover or Focus | Manual — dismissable, hoverable | **N/A**       | There is no hover. Anything that only appeared on hover has no way in, so it must not exist      |
| 2.1.1  | A     | Keyboard                  | Manual — sweep step 1           | **Manual**    | A paired keyboard, and TalkBack's own focus order. Both, not either                              |
| 2.5.1  | A     | Pointer Gestures          | Manual — none required          | **Manual**    | Pinch-zoom needs a single-pointer path once Canvas lands. Not yet applicable                     |
| 2.5.5  | AAA   | Target Size (Enhanced)    | Gap — 24px                      | **Gated**     | 44px, enforced by the `.touch` utility on every control in the shell                             |
| 2.5.7  | AA    | Dragging Movements        | Gap — Canvas drag               | **Gap**       | Worse on touch: no keyboard equivalent exists yet for a drag                                     |
| 2.5.8  | AA    | Target Size (Minimum)     | Manual — 24×24                  | **Gated**     | Same utility, same floor                                                                         |
| 4.1.3  | AA    | Status Messages           | Manual — verify with Orca       | **Manual**    | Verify with TalkBack. Recents updating after leaving a module is the case to listen for          |

## How the tree is verified, and how it is not

`uiautomator dump` is the obvious tool and it is the wrong one. It flattens a WebView into
`AccessibilityNodeInfo`, and the flattening loses the accessible name of a text field: a named `<input>`
arrived as an `EditText` with `text=""`, `content-desc=""` and the label only in `hint`. Read naively,
that says the field is unnamed. It is not.

The tree Chromium hands to Android is what actually matters, and it is reachable:

```sh
pnpm android:ax            # roles and names, for reading
pnpm android:ax --assert    # fails on an unnamed interactive node
```

The gate was verified in both directions: injecting an empty `<button>` fails it with
`unnamed button` and exit 1, and removing the button returns it to green. On the current home screen it
reports **7 interactive nodes, 2 headings, all named**.

### The tree only exists when a service is bound

Chromium builds an accessibility tree lazily, for the service that asks. With nothing enabled, every
WebView reports `NAF="true"` with no children — which is **not** a defect in the page, and was nearly
misread as one. `pnpm android:ax` therefore checks for an enabled service first and says so instead of
passing an empty tree.

To enable one for a session:

```sh
adb shell settings put secure enabled_accessibility_services \
  com.google.android.marvin.talkback/com.google.android.marvin.talkback.TalkBackService
adb shell settings put secure accessibility_enabled 1
```

Turn it back off afterwards; a phone left in TalkBack mode is a phone whose owner cannot read the screen
the way they expected.

## Font scale: a correction

An earlier reading of Capacitor's source concluded that it "does not apply the system font scale",
because no `textZoom` or `fontScale` handling appears there. That conclusion was wrong, and the
measurement is what settled it:

| `font_scale` | Root font size in the WebView |
| ------------ | ----------------------------- |
| 1.0          | 16px                          |
| 1.3          | 20.8px                        |
| 1.5          | 24px                          |
| 2.0          | 32px                          |

Android's WebView applies the system font scale on its own. Capacitor does not _set_ `textZoom`, and it
does not need to. What this leaves us:

- No native workaround is required for 1.4.4, and none should be added.
- `textZoom` remains available if we ever want to _combine_ an in-app zoom with the system one.
- The layout has to hold at 2.0, and it does. That is the thing to keep gated.

## Open items

| Item                   | Why it is open                                                                                                  |
| ---------------------- | --------------------------------------------------------------------------------------------------------------- |
| 2.5.7 dragging         | Canvas's drag has no keyboard or single-pointer equivalent, on either platform                                  |
| Heading navigation     | `<h1>`/`<h2>` reach Chromium as `heading`, which is what TalkBack navigates by. Not yet heard through a headset |
| TalkBack announcements | Recents and toasts need a listening pass, not a tree assertion                                                  |
