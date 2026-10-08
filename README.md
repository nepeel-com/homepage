# nepeel

**LESS FAKE. MORE LIFE.**

앱에서 직접 촬영한 사진만 공유하는 SNS, nepeel의 한국어 회사·서비스 소개 웹사이트입니다. 큰 타이포그래피, 라임색, 실제 사진 콜라주를 중심으로 구성했습니다.

현재 공개 상태는 **앱 출시 준비 중(Coming soon)**입니다. 첫 화면과 주요 버튼은 출시 안내로 연결되고, 하단의 서비스 미리보기에서 샘플 데모를 이용할 수 있습니다. 확정되지 않은 출시일이나 다운로드 링크는 표시하지 않습니다.

## 실행

Node.js 24를 사용합니다. `package.json`과 `.nvmrc`에 메이저 버전을 고정했습니다.

```sh
npm ci
npm run dev
```

터미널에 표시된 로컬 주소로 접속하세요.

```sh
npm run build
npm run preview
```

`npm run build`는 TypeScript 검사 후 배포용 `dist/`를 생성합니다.

## GitHub → Vercel 배포

1. GitHub에서 새 빈 저장소를 생성합니다. 이미 저장소가 있다면 해당 주소를 사용하세요.
2. 프로젝트 폴더에서 변경 사항을 커밋하고 저장소에 연결합니다. 아래의 `YOUR_ACCOUNT`와 `YOUR_REPOSITORY`를 실제 값으로 바꾸세요.

   ```sh
   git add .
   git commit -m "Build nepeel brand website"
   git remote add origin https://github.com/YOUR_ACCOUNT/YOUR_REPOSITORY.git
   git push -u origin main
   ```

3. Vercel에서 **Add New → Project**를 선택하고 해당 GitHub 저장소를 가져옵니다.
4. Framework Preset은 **Vite**, Build Command는 **npm run build**, Output Directory는 **dist**입니다. 프로젝트의 `vercel.json`에도 설정되어 있습니다. Node.js 버전은 **24.x**로 설정하세요. 환경 변수는 필요하지 않습니다.
5. **Deploy** 후 발급된 주소에서 확인합니다. 이후 `main` 브랜치에 푸시하면 Git 연동 설정에 따라 새 배포가 생성됩니다.
6. 개인 도메인은 프로젝트 **Settings → Domains**에서 추가하고 Vercel이 보여주는 DNS 레코드를 도메인 업체에 적용합니다. 실제 도메인에 맞춰 안내값을 사용하세요.

공식 참고: [Vercel의 Vite 배포](https://vercel.com/docs/frameworks/frontend/vite), [사용자 도메인 연결](https://vercel.com/docs/domains/working-with-domains/add-a-domain).

이 작업에서는 원격 GitHub 저장소 생성, 푸시, Vercel 배포, DNS 변경을 실행하지 않았습니다.

### 빌드 경고 확인

- `engines.node`를 `24.x`로 고정해 새 Node 메이저 버전으로 자동 변경되는 경고를 방지합니다.
- `allowScripts`는 현재 잠금 파일에 있는 `esbuild@0.28.2`의 설치 스크립트만 허용합니다. esbuild 버전을 올릴 때는 설치 스크립트를 확인하고 이 설정도 함께 갱신하세요.
- 로그가 `tsc -b && vite build`에서 끝났다면 빌드 명령이 시작되었다는 의미입니다. 성공이나 실패는 그 아래의 로그와 최종 배포 상태를 확인해야 합니다.

### `TS18003: No inputs were found`가 나올 때

GitHub 저장소에 `src` 폴더와 그 안의 파일이 올라갔는지 먼저 확인하세요. 설정 파일만 업로드하면 이 오류가 납니다. 사진과 아이콘을 표시하려면 `public` 폴더도 필요합니다.

```text
homepage/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   └── styles.css
├── public/
│   ├── images/          # WebP 사진 4개
│   ├── favicon.svg
│   └── photo-credits.txt
├── index.html
├── package.json
├── package-lock.json
├── tsconfig.json
├── vite.config.ts
└── vercel.json
```

GitHub 웹에서 **Add file → Upload files**를 사용한다면 파일뿐 아니라 `src`, `public`, `scripts` 폴더도 통째로 끌어 놓으세요. `src/App.tsx`처럼 폴더 경로가 보이는지 확인한 뒤 커밋합니다. ZIP은 먼저 풀어야 하며, ZIP 파일 자체를 올리면 배포 소스로 사용할 수 없습니다. 바깥 폴더를 한 겹 더 만들지 말고 `package.json`과 `src`가 저장소 최상단에 나란히 있도록 올리세요.

Vercel의 Root Directory는 저장소 최상단(`./`, 기본값)을 사용합니다. 새 커밋이 올라간 뒤 시작된 배포인지 확인하세요. 이전 커밋을 그대로 Redeploy하면 누락된 소스가 복구되지 않습니다.

## 포함된 기능

- 데스크톱·태블릿·모바일 반응형 레이아웃 및 모바일 메뉴
- 서비스 철학과 카메라 기반 운영 원칙
- 버튼과 키보드로 조작하는 3단계 앱 미리보기
- 샘플 장면 선택 → 촬영 → 다시 찍기 → 공유 → 좋아요 체험
- 일상·여행·함께 카테고리 필터와 사진 확대·이전·다음 보기
- FAQ, 이미지 출처, 키보드 포커스, 모션 감소 설정 대응
- 한글 SEO 메타데이터, 파비콘, Vercel 설정

## 범위

회사 소개 웹사이트와 브라우저 내 데모입니다. 실제 SNS 계정, 사진 저장·업로드, AI 이미지 검사, 촬영 출처 검증, 출시 알림 신청은 구현하지 않았습니다. 데모는 샘플 이미지를 사용하며 데이터를 외부로 보내거나 저장하지 않습니다.

카메라 전용 업로드 정책의 실제 적용에는 별도의 모바일 앱, 신뢰 가능한 촬영 경로, 서버 검증과 재촬영·변조 대응 설계가 필요합니다. 웹 UI만으로 원천 차단을 보장하지 않습니다.

## 수정 위치

- `src/App.tsx`: 문구, 사진 목록, 섹션, 데모 동작
- `src/styles.css`: 색상 토큰, 타이포그래피, 반응형 스타일
- `public/images/`: 로컬 WebP 샘플 사진
- `public/photo-credits.txt`: 이미지 원본 출처
- `index.html`: 제목, SEO, 폰트
- `DESIGN.md`: 9개 항목으로 정리된 디자인 규칙
- `design-contract.md`: 디자인 결정의 근거와 범위
- `implementation-handoff.md`: 구현·유지보수 기준

사진은 Unsplash 샘플이며 실제 nepeel 사용자 게시물이 아닙니다. `scripts/fetch-assets.mjs`로 동일한 원본을 다시 받을 수 있습니다. 본문 폰트는 Google Fonts를 사용하므로 첫 방문에는 네트워크 연결이 필요하며, 실패하면 시스템 폰트로 표시됩니다.
