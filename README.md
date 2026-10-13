# nepeel — LESS FAKE. MORE LIFE.

**Non-AI를 지향하는 앱 촬영 전용 사진 SNS.** React 웹과 Expo iOS/Android 앱이 하나의 Supabase 계정·피드·저장소를 사용합니다. 웹은 회원 피드, 검색, 좋아요, 댓글, 팔로우, 저장, 프로필 수정, 신고, 본인 게시물 삭제를 제공합니다. 앱은 회원가입·로그인, 피드·좋아요·댓글·팔로우·저장·프로필과 전용 카메라를 제공합니다. 새 소스에는 양쪽 플랫폼의 **Hi 연결, 수락 후 DM, 차단·신고, 한국어/영어 Hi 화면**이 추가되었습니다.

‘앱 촬영’은 공식 앱의 기기 인증과 요청의 사진 데이터 일치를 서버가 확인했다는 뜻입니다. AI 탐지 결과가 아니며, 화면 재촬영이나 모든 기기 변조까지 막아 **AI 이미지가 절대 없다고 보장하지 않습니다.**

## 현재 연결 상태

- Supabase 프로젝트 `bvigbszjuviqjklrrqyb`: 제공받은 공개 키로 연결했습니다.
- 이 프로젝트에 `202610140001`부터 `202610140004`까지 SQL을 실제 적용했습니다. **같은 프로젝트에 다시 실행하지 마세요.**
- SNS 테이블 9개와 Hi/DM 테이블 5개, RLS 권한 정책, 비공개 `captures` 버킷이 생성되었습니다.
- Zoho 사용자 직접 입력 후 Custom SMTP 활성 상태가 새로고침에도 유지됨을 확인했습니다. 실제 가입 메일 수신은 아직 확인하지 않았습니다.
- Hi 서버 스키마는 운영 DB에 반영됐으며, 웹/앱 새 소스는 검증 완료 후 무료 호스팅 연결을 기다립니다. 기존 Vercel 사이트에는 아직 Hi 화면이 반영되지 않았습니다.
- 이메일 인증을 요구하는 회원가입 설정을 유지합니다. 실제 회원 데이터는 로그인 후에만 표시됩니다.
- 로그인 전에는 출처를 표시한 Unsplash 예시 사진을 보여줍니다. 예시 사진에 인증 표시나 가짜 활동 수치를 붙이지 않습니다.
- 로컬 `.env.local`, `mobile/.env`에는 공개 URL·키만 들어 있습니다. Git 업로드에서 제외됩니다.
- 운영 도메인은 `https://nepeel.com`입니다. Supabase Site URL과 이메일 복귀 허용 주소를 설정했습니다. Expo의 로컬 설정과 EAS production 프로필도 같은 API 주소를 사용합니다.
- Vercel `nepeel-com/homepage`의 Production 환경에 웹 공개 URL·키, 서버 URL, `APP_ATTEST_ENVIRONMENT=production`, 코드의 iOS/Android 앱 ID를 저장했습니다. 앱 ID의 Apple/Google 등록은 별도로 필요합니다.
- Supabase 서버 전용 키는 Vercel Production의 **Secret** 환경변수에 저장했습니다. **Apple/Google 앱 인증은 아직 설정되지 않았습니다.** 인증 설정이 없으면 사진 게시는 거부됩니다.
- **Vercel 운영 배포 완료:** `https://nepeel.com`에서 새 SNS 웹을 제공합니다. 서버 키를 반영한 배포 ID는 `GHkUkCoLTbmLJCAztC2BJ4G2o9pZ`, 소스 커밋은 로컬 `57ea3f6`입니다.
- GitHub `nepeel-com/homepage`의 `main`에 웹·앱·서버·DB·테스트 소스를 업로드했습니다. 원격을 fetch하여 검증한 로컬 소스와 파일 내용을 비교했습니다. 스토어 제출·실기기 촬영 검증과 Netlify 배포는 남아 있습니다.

## 로컬 실행

무료 글로벌 출시 구조와 현재 제한은 [docs/GLOBAL-LAUNCH.md](docs/GLOBAL-LAUNCH.md)를 참고하세요. Vercel Hobby는 비상업용입니다. `netlify.toml`과 Node 함수 어댑터를 추가하여 Netlify Free로 이전할 수 있도록 준비했지만 아직 Netlify에 배포하지 않았습니다.

Netlify 이전 중 GitHub 커밋이 Hobby에 자동 배포되지 않도록 `vercel.json`의 `git.deploymentEnabled`를 `false`로 설정했습니다. 기존 도메인 배포는 그대로 유지됩니다. 향후 적합한 Vercel 플랜을 사용할 경우 자동 배포를 다시 활성화할 수 있습니다.

Node.js **24.x**를 사용합니다. 루트에서 실행하세요. 이 작업 환경에서는 모든 명령에 `rtk`를 붙입니다.

```sh
rtk proxy npm ci
rtk proxy npm run dev
```

처음 받은 소스라면 `.env.example`을 참고해 `.env.local`에 다음 공개 변수를 설정합니다.

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Supabase의 기존 `anon` 키도 사용할 수 있습니다. `service_role` / `sb_secret_` 키를 `VITE_` 또는 `EXPO_PUBLIC_` 변수에 넣으면 안 됩니다.

```sh
rtk proxy npm run build
rtk proxy npm test
rtk proxy npm run typecheck:mobile
```

Vite 개발 서버는 웹만 실행합니다. `/api/capture`까지 로컬 실행하려면 Vercel CLI의 `vercel dev`와 서버 환경 변수가 필요합니다. 실기기 앱에는 도달 가능한 **HTTPS** API 주소를 사용하세요.

## GitHub → Vercel

저장소 최상단에 `package.json`, `src`, `public`, `shared`, `api`, `server`, `mobile`, `supabase` 폴더를 모두 올리세요. `node_modules`, `.env*`(예시 파일 제외), `.qa`, `dist`는 올리지 않습니다. ZIP은 압축을 풀어 **내용물**을 업로드합니다.

이전 `TS18003: No inputs were found` 오류는 GitHub에 `src`가 없어서 발생했습니다. 폴더를 포함한 새 커밋인지 확인하세요. `package-lock.json`도 함께 커밋합니다.

Vercel 설정:

| 항목 | 값 |
| --- | --- |
| Root Directory | 저장소 루트 `./` |
| Framework | Vite |
| Install Command | `npm ci` |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Node.js | 24.x |

Vercel → Project → Settings → Environment Variables에 설정하고 **다시 배포**합니다. Vite 공개 변수는 빌드할 때 포함됩니다.

| 변수 | 용도 |
| --- | --- |
| `VITE_SUPABASE_URL` | 웹 공개 프로젝트 URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | 웹 공개 키 |
| `SUPABASE_URL` | 서버의 같은 프로젝트 URL |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 service_role 또는 secret 키 |
| `IOS_BUNDLE_ID` | Apple에 등록한 Bundle ID, 코드 기본값 `com.nepeel.app` |
| `APPLE_TEAM_ID` | Apple Developer Team ID |
| `APP_ATTEST_ENVIRONMENT` | 운영은 `production` |
| `ANDROID_PACKAGE_NAME` | Play Console 앱 ID, 코드 기본값 `com.nepeel.app` |
| `ANDROID_CERTIFICATE_SHA256` | Play 앱 서명 인증서의 SHA-256, **base64url** 형식. 여러 개는 쉼표 구분 |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Play Integrity 사용 권한이 있는 서비스 계정 JSON 전체. 서버에서만 사용 |

인증서 SHA-256을 콜론으로 구분한 hex 그대로 넣지 마세요. 인증서 digest를 base64url로 변환한 값을 사용합니다.

Supabase → Authentication → URL Configuration에 **Site URL `https://nepeel.com`**을 저장했습니다. Redirect URLs에는 `https://nepeel.com`, `https://nepeel.com/`, `http://127.0.0.1:5173`을 등록했습니다. 웹 가입 인증과 비밀번호 재설정의 복귀 주소입니다. 운영 메일 발송에는 Supabase의 SMTP 설정도 확인하세요.

## Expo 앱 실행·배포

`mobile/.env.example`을 참고해 `mobile/.env`를 설정합니다. `EXPO_PUBLIC_API_URL=https://nepeel.com`이며 EAS production 프로필에도 저장되어 있습니다. URL 마지막에 `/api/capture`를 붙이지 않습니다.

```sh
rtk proxy npm run mobile
```

이 앱은 자체 앱 인증을 사용하므로 **Expo Go만으로 정식 게시 검증을 완료할 수 없습니다.** 실제 앱 ID로 빌드한 앱과 실기기를 사용합니다.

EAS CLI를 사용할 경우 `mobile` 디렉터리에서 본인 Expo 계정으로 프로젝트를 연결하고 빌드하세요. 명령 실행 전 `app.config.ts`의 앱 ID가 소유한 Apple/Google 등록 정보와 맞는지 확인합니다.

```sh
rtk proxy npx eas-cli build:configure
rtk proxy npx eas-cli build --platform ios --profile production
rtk proxy npx eas-cli build --platform android --profile production
```

- iOS: Apple Developer App ID에 App Attest capability를 켜고 실제 iPhone/TestFlight에서 검증합니다. 시뮬레이터는 게시 인증을 지원하지 않습니다.
- Android: Play Console에 앱을 등록하고 Play Integrity에 Cloud 프로젝트를 연결합니다. `EXPO_PUBLIC_GOOGLE_CLOUD_PROJECT_NUMBER`를 앱 빌드 환경에도 넣습니다. **Play 내부 테스트 트랙**으로 설치한 빌드에서 검증하세요. 사이드로드한 개발 APK는 운영의 `PLAY_RECOGNIZED` / `LICENSED` 검사를 통과하지 않을 수 있습니다.
- 개발 프로필의 App Attest는 개발 환경을 사용합니다. **별도의 staging Supabase와 API**에서만 `APP_ATTEST_ENVIRONMENT=development`를 허용하세요. 운영 서버는 개발 키 게시를 거부합니다.
- 앱 공개 환경 변수는 EAS 빌드 환경에 별도로 등록해야 합니다. `.env`는 Git과 EAS 업로드에서 제외됩니다.
- 카메라만 사용하며 이미지 선택기, 갤러리 권한, 녹음 권한은 요청하지 않습니다.
- 촬영 후 3분 이내에 게시합니다. 만료되거나 한 번 처리된 요청은 새로 촬영해야 합니다. 2MB를 넘는 촬영물은 거부합니다.

패키지 번들만 확인하려면 `mobile`에서 다음을 실행합니다. 네이티브 서명·실기기 인증 테스트를 대신하지 않습니다.

```sh
rtk proxy npx expo export --platform all --output-dir ../.qa/mobile-export
```

## 저장·검증 경로

```text
Expo 카메라 → 로그인 JWT + 서버 1회용 challenge
           → 사진 SHA-256 + 설명 + 계정 + challenge에 앱 인증 결합
           → Vercel /api/capture
           → Apple App Attest / Google Play Integrity 검증
           → challenge 소진 + iOS counter 원자적 갱신
           → EXIF 제거 → 비공개 Supabase Storage → posts 생성
웹/앱 로그인 → RLS로 피드 조회 → 5분 유효 signed URL로 사진 표시
```

인증되지 않은 클라이언트의 사진 업로드와 게시글 직접 생성은 DB/Storage 권한으로 차단합니다. 좋아요·댓글·팔로우는 본인 계정으로만 작성할 수 있고, 저장한 사진 목록은 본인만 볼 수 있습니다. 웹과 앱은 동일한 데이터를 읽습니다. 다른 기기의 새 게시물은 피드를 새로고침하면 반영됩니다.

## 운영 전 남은 작업

1. 남은 서버 비밀 키와 Apple/Google 인증 설정, GitHub/Vercel 새 소스 배포 상태 확인.
2. 실기기에서 iOS/Android 각각 가입 → 촬영 → 게시 → 웹 조회 → 반응 동기화 확인.
3. 새 Supabase 계정의 기본 메일 전송 제한/SMTP, 봇 가입 방지, 신고 검토 담당과 대응 절차 설정.
4. 서비스 이용약관·개인정보 처리방침 작성 및 신고 대응 담당 확정. 웹·앱에서 게시물 신고, 본인 게시물 삭제, 비밀번호 재확인을 거치는 회원 탈퇴를 제공합니다. 현재 신고는 `reports`에 저장되며 관리자 알림 전송은 없습니다.
5. 생성 화면을 다시 찍는 악용, 탈옥/루팅/런타임 변조에 대한 별도 위협 검토. 앱 인증은 장면 자체의 진위를 보증하지 않습니다.
6. 스토리지 정리: 게시물·계정 삭제 시 트리거가 `media_cleanup_jobs`에 파일 삭제 작업을 기록합니다. API가 즉시 정리하며 실패한 작업은 Netlify의 `cleanup-media` 예약 함수가 매일 03:00 UTC에 최대 500개 재시도합니다. 예약 함수의 실제 배포·실행은 아직 확인하지 않았습니다. 배포 전에는 운영자가 대기열을 점검해야 합니다. 파일 삭제 전 이미 발급된 signed URL은 최대 5분 유효할 수 있습니다.

## 새 Supabase 프로젝트에 설치하는 경우에만

`supabase/migrations`의 SQL 두 파일을 파일명 순서대로 SQL Editor에서 한 번 실행합니다. Supabase CLI로 설치할 수도 있습니다. 이미 이 프로젝트에 SQL Editor로 적용한 마이그레이션을 CLI로 관리하려면 원격 스키마와 파일을 먼저 확인한 후 migration history를 `applied`로 맞추세요. 초기화 SQL을 다시 실행하면 중복 객체 오류가 발생합니다.

## 검증과 범위

`tests/security.test.ts`는 임시 PostgreSQL(PGlite)에서 실제 SQL을 실행합니다. 사용자 권한, 저장소 직접 업로드 거부, 소유권, 피드 집계, nonce 재사용·만료, counter 갱신, 요청 제한, 파일 검증, 잘못된 앱 인증 거부를 확인합니다. Supabase Auth/Storage 서버 전체나 Apple/Google의 실제 서명 응답을 대신하는 테스트는 아닙니다.

의존성 검사에서 남는 Expo/Metro 및 Vercel 빌드 도구의 전이 의존성 경고는 `docs/VERIFICATION.md`에 기록했습니다. `npm audit fix --force`가 제안하는 구버전 Expo로의 강제 변경은 하지 않았습니다.

공식 문서: [React Native의 Expo 권장](https://reactnative.dev/docs/environment-setup), [Expo AppIntegrity](https://docs.expo.dev/versions/latest/sdk/app-integrity/), [Supabase React Native Auth](https://supabase.com/docs/guides/auth/quickstarts/react-native), [Play Integrity](https://developer.android.com/google/play/integrity/standard).
