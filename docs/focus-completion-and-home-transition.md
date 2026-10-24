# Native Focus completion and home transition

Main now includes the tested `codex/focus-usage-access` branch and combined DB optimizations. No Accessibility service is registered. The Usage Access branch remains separately available. Main's merge was local; no push was requested for this work.

## Settings-only activity return

At the user's latest request, confirmed Settings packages automatically return to SSC Buddy during restricted focus. This is throttled to one attempt per two seconds while Settings stays foreground. All other unauthorized apps use the existing overlay without launching SSC Buddy. Breaks, expiry and ringing disable the automatic Settings return. Settings package matching and the delayed-event reducer fixes remain. Actual Android/OEM activity-launch restrictions and Usage Event delivery still need device testing.

## Completion

The native local lifecycle journal observes an active lock before it can celebrate expiry. Cold-loading an old expired session does not celebrate. It keeps completed segment durations keyed by phase start, closes running segments on pause/end, and excludes break time. Repeated ticks and duplicate lifecycle packets do not add the same time again. It does not modify Firestore focus credits or rewards. If a device first joins a session after earlier focus segments occurred elsewhere, the native journal only knows the segments it observed; it cannot reconstruct absent historical segments without additional session data.

On expiry, normal restriction predicates become false immediately. A separate visual completion screen shows Session complete, locally recorded focus duration, the existing animated firework asset tinted to the app accent, subtle finite confetti, and Continue. Continue acknowledges the pending local completion and stops the service/overlay. It does not extend the deadline or settle additional focus time. Pending acknowledgment survives service recreation. Starting a new active lock replaces an already visible celebration. Incoming ringing temporarily hides the completion; it can return when ringing ends. Reduced-motion system animation settings stop decorative native animation. No repeat cloud polling, credits or writes were added.

## Home transition mitigation

Usage Events are asynchronous and OEM delivery may lag. When an already-visible blocking overlay sees an empty foreground during the PAUSED→RESUMED gap, it now retains its window until a confirmed app arrives, unless screen lock, a call, break or expiry requires release. This never summons a new overlay solely because an allowed app paused. Confirmed allowed-app launches still hide the block.

Native scans now wait 150ms when the foreground is unknown or an overlay is visible, and 250ms otherwise (previously 400ms). These are local Android UsageStats queries, not Firestore reads. This reduces polling latency but increases native polling frequency; battery/runtime testing remains necessary. A blocked launch from a previously allowed app still depends on Android delivering Usage Events: zero-frame home exposure is not guaranteed without stronger platform authority.

## Checks

Native policy regressions cover completion once, cold expired state, stable ticks, one/multiple breaks, segment duplication, clearing/replacing sessions, whole-minute/hour formatting, retained transition windows, allowed-app release, calls/expiry/screen-off exceptions and scan timing. Native service/policies compile against Android API classes; Focus cloud/schedule regressions remain passing. A signed APK and affected Vivo device test are still required; API-class compilation is not a Gradle build or physical-device verification.
