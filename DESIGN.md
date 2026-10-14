# nepeel SNS design system

## 1. Visual Theme & Atmosphere

A Korean photography community, with the quiet structure of an editorial reader and acid-lime camera accents. The active brief supersedes the old company landing page: web is now the social feed; the native app is the capture surface. Actual member content is private to authenticated members. Public previews must say they are samples.

## 2. Color

Use the CSS variables in `src/styles.css` as the web source of truth: ink `#20221d`, paper `#fafbf8`, lime `#d4ff3f`, muted `#707369`, line `#e7e9e1`, wash `#f0f2eb`, radius 14px. Native StyleSheet values mirror these tokens. Noto Sans KR for Korean, Barlow Condensed for small English labels, Anton for manifesto headlines. Never condense Korean text.

## 3. Typography

Use 16px labelled form controls. Large HI typography is expressive; do not condense Korean. The Hi screen supports Korean/English labels; full-site localization is not yet complete.

## 4. Spacing & Grid

4/8px rhythm; 16/24/32px section gaps; touch controls at least 44px web and 48dp native.

## 5. Layout & Composition

Desktop: navigation, feed and supporting rail form one centered 1180px frame. The fixed 208px navigation is aligned to the frame's left edge, not the viewport edge. The content uses 28px insets, a 28px column gap and a 248px supporting rail, leaving a 640px main column at full frame width. Extra viewport width belongs outside this group on both sides; never create an expanding gap between navigation and main content. At ≤1050px use a centered 860px frame with 184px navigation and hide the right rail; at ≤760px navigation becomes a bottom bar. Primary photos keep a stable aspect ratio. Homepage introduction is shorter on mobile to bring the feed into view. Discover uses a two-column image grid. Profile, saved and Hi screens reuse the frame.

The outside gutters are intentionally empty and can later hold advertising or campaigns. No ads, tracking or placeholder cards are added now. Future ad placements must stay outside the service frame and collapse when the viewport cannot fit them; they must not compress or separate the existing three columns.

Hi contains an introduction, private preferences, one send action, inbox and conversation. Mobile navigation has at most five items; saved photos remain accessible elsewhere. Do not invent conversations for empty states.

## 6. Components

Native `<dialog>` for focus containment, Escape and focus restoration. Lime active navigation and follow buttons; charcoal primary actions; 44px reaction controls; initials for member avatars (no external profile-image uploads). Camera icon + ‘앱 촬영’ only on server-created member posts. Samples use neutral ‘미리보기’ and ‘SAMPLE MOMENT’. No fake likes or users claimed as real members.

Incoming/outgoing Hi requests are distinct from accepted conversations. A request contains exactly one 'hi'; only acceptance unlocks free text. Show self-declared adult eligibility and city-level matching plainly.

## 7. Motion & Interaction

Search submits to discovery. Likes, comments, bookmarks, follow and profile changes use Supabase. Member-only actions open authentication when signed out. An empty backend shows an empty state, never fabricated activity. API errors are visible with retry paths. App camera has permission denied, authentication unavailable, capture, review, expiry and publishing states. Web never requests camera/gallery permission.

Subscribe only while the inbox is open. Clean up on logout/background. Use cursor-based message history. Disable duplicate submissions and preserve drafts on errors. No matching roulette or false countdown.

## 8. Voice & Brand

Use Non-AI as the community intent, not an absolute AI-detection guarantee. The about page explains device/app verification and recapture limits. Mark all preview photos and credit Unsplash. Keyboard focus is visible; icons have accessible names; reactions have pressed state; reduced motion disables transitions. Do not invent App Store download links or launch dates.

## 9. Anti-patterns

No fake members, exact GPS/birthdate disclosure, unsolicited repeat DMs, age/identity verification claims based on self-declaration, unbounded queries, constant polling or paid upgrades without authorization.

## 10. Places, nearby moments and repeat photography

Extend the existing camera and feed without changing the centered desktop frame. A short location card explains the benefit before the app requests foreground location permission. Once enabled, opening the app or camera can suggest nearby photos by followed members. Denied permission, unavailable GPS and empty results never block ordinary camera posting. Do not request background location in the first release.

The review screen has four decisions in order: photo/color preset, caption, suggested place with sharing audience, and publish. Default location audience is followers once the member enables the feature; the member can choose private, followers or members for each photo. Round coordinates to three decimal places before transport/storage (approximately 100 m latitude precision); show “approximate shooting place” and never imply live friend tracking. Reverse-geocoded labels are suggestions and remain editable. Remove location with one action. Keep the original EXIF stripped from the delivered image.

Nearby results contain the followed author's name, photo, place label, approximate distance and capture date. A dismissed result is not repeatedly announced. Selecting “same framing” opens the camera with that authorized photo overlaid at adjustable opacity, a rule-of-thirds grid and a clear way to hide the reference. The camera still captures a new photo; an old image is never uploaded as a new capture. Saved posts are the first version of a “places to try” collection. Map navigation uses an explicit user action to open the installed map app.

Use five restrained, non-generative color presets: original, warm, cool, monochrome and faded film. Share the exact color matrices between the GPU preview and server rendering. Bind the selected preset, approximate location, audience and reference photo to the image's capture proof. Show the selected preset as metadata; do not call filtered pixels unedited. Preserve the same immutable request across network retries, keep a draft when the app backgrounds, and lock its caption/place/filter once publishing begins. A successful retry returns the original post.

Verification gates: permission denial and GPS timeout; no location leakage to non-followers or blocked accounts; nearby distance/radius and international date-line cases; reference deletion and follow changes; filter preview/render pixel agreement; proof tampering; duplicate/uncertain publish responses; real Android camera, GPS and overlay behavior. Local mocks do not prove physical-device behavior.

## 11. Moments in space — phone first, glasses later

The user clarified that photographs should inhabit places: point a phone camera around, discover floating photographs and direction hints, tap to enter that photograph's feed, and later use the same places through glasses. This is spatial discovery, not only an ordinary location list.

The first phone implementation uses a foreground camera preview plus GPS/compass direction cues. `shared/spatial.ts` computes bearing, relative heading and bounded marker cues independently of Expo or a display SDK. `mobile/SpatialScreen.tsx` renders a maximum of three photo markers, a reachable list alternative when heading is unavailable, a selected-photo card and entry into the real single-post feed. Recheck location visibility and the post before entering it. Stop camera/sensor subscriptions on background or exit. No video recording, automatic posting or background location. Nearby points within 120m are labeled as an approximate area instead of implying exact direction from quantized coordinates.

This release is a GPS direction overlay, not six-degree-of-freedom tracking, surface detection, building recognition, occlusion, or centimeter-accurate world anchoring. Precise persistent AR anchors are a later capability with their own privacy/accuracy and hardware tests. Keep photo IDs and location audiences shared across phone and glasses; device adapters own camera permission, head pose, presentation and capture provenance. A glasses camera must have a separately reviewed verification path before it may publish—do not quietly treat a paired camera as a verified phone camera.

Future glasses design uses one glanceable photo cue at a time with an explicit open/capture action, a phone companion for editing/permissions, and supported voice or physical inputs. No always-on capture or unrequested audio permission. Platform SDK integration and actual glasses rendering remain unimplemented until a target device is selected and available.

Official platform references checked 2026-10-14: [Expo Location](https://docs.expo.dev/versions/latest/sdk/location/), [Android XR](https://developer.android.com/develop/xr/jetpack-xr-sdk), [Meta Wearables](https://developers.meta.com/wearables/device-access-toolkit/). SDK support for camera/display/input and provenance must be verified for the selected device rather than assumed from a brand name.
