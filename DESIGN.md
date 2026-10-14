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
