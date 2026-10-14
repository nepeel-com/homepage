# Android 촬영 인증

## 구현과 현재 검증 범위

서명된 직접 설치 APK용 하드웨어 인증 경로를 구현했습니다. 앱은 Android Keystore에서 촬영마다 새 키를 만들고 인증서 체인을 서버로 보냅니다. Google Play Integrity 경로도 유지하며, 두 경로는 명시적으로 선택합니다. 한 경로의 검증 실패를 다른 경로로 자동 우회하지 않습니다.

현재 로컬 JVM 보안 테스트 9개, Node를 포함한 프로젝트 테스트 53개, 웹/서버 빌드와 앱 타입 검사가 통과했습니다. 실제 서버 호출 함수가 테스트 인증서를 HTTP 403 오류로 거부함을 확인했습니다. Linux x64에서도 같은 거부 결과를 확인했습니다. **운영 배포·서버 활성화와 실제 Android 촬영 성공은 아직 확인하지 않았습니다.** 기존 운영의 사진 게시 제한은 유지됩니다.

## 검증 경계

- Supabase가 확인한 계정과 서버 발급 3분 유효 challenge를 사용합니다. 인증 시도 횟수와 게시 전 원자적 challenge 소진은 기존 DB에서 처리합니다.
- 사진 원본 SHA-256, 정리된 설명, 계정, challenge ID와 nonce로 공통 `capturePayload`를 만듭니다. 그 SHA-256 앞에 `nepeel.capture.android.v1:`을 붙인 UTF-8 문자열이 하드웨어 인증 challenge입니다. 서버가 직접 다시 계산합니다.
- Google 공식 [keyattestation](https://github.com/android/keyattestation/tree/621149c4ebaeeea844d6f43098687c73c4d370a3) 검증기를 고정된 커밋으로 빌드합니다. 2026년 ECC 루트를 포함한 해당 소스의 Google 신뢰 루트만 사용합니다. 요청으로 루트나 시각을 바꿀 수 없습니다.
- 체인 서명, 하드웨어 TEE/StrongBox, `GENERATED` 키, 잠긴 기기와 `VERIFIED` 부팅, 정확히 하나의 `com.nepeel.app` 패키지, 최소 앱 버전, 모든 앱 서명 인증서의 SHA-256을 검사합니다. 알 수 없는 패키지, 소프트웨어 인증 및 추가 패키지는 거부합니다.
- Google 공식 인증서 상태 목록을 최대 1시간 캐시하되 HTTP 원본의 남은 유효시간보다 길게 보관하지 않습니다. 목록의 REVOKED·SUSPENDED·알 수 없는 상태를 모두 거부하며 루트 인증서도 검사합니다. 갱신 실패 시 만료된 목록을 재사용하지 않습니다.
- 서버 자식 프로세스에는 Supabase 키나 사용자 토큰을 전달하지 않습니다. 입력 크기, 실행 시간, JVM 메모리와 출력 크기를 제한합니다. 인증서·기기 식별자를 로그 또는 DB에 저장하지 않습니다.
- 사진 게시 권한을 일반 클라이언트에 부여하지 않습니다. 검증 후 서버에서 JPEG를 재인코딩해 EXIF/GPS를 제거하고 비공개 저장소에 저장합니다.

기기 인증은 사진에 담긴 장면의 진위를 판정하지 않습니다. 다른 화면을 다시 촬영하는 행위까지 막는다는 보장은 하지 않습니다. 일부 기기의 Google 인증 체인 부재, 루트 잠금 해제, 오래된/폐기된 키는 게시 거절로 이어질 수 있습니다. [Android 공식 검증 지침](https://developer.android.com/privacy-and-security/security-key-attestation)을 기준으로 합니다.

## 재현 가능한 서버 빌드

```sh
rtk proxy npm run build:attestation
rtk proxy npm run build
rtk proxy npm test
rtk proxy npm run typecheck:mobile
```

Linux x64 빌드는 고정된 Temurin JDK/JRE 21과 Google 소스 아카이브를 다운로드하고 SHA-256 및 크기를 검사합니다. Gradle 배포 ZIP도 SHA-256을 검사합니다. 핀은 `server/android-attestation/dependencies.json`에 있습니다. 로컬 Windows는 `JAVA_HOME`의 JDK 21을 사용합니다.

Gradle 테스트 이후 실제 실행 JAR에 잘 구성된 테스트용 인증서 체인과 잘못된 JSON을 보내 둘 다 거부되는지 검사합니다. 테스트 신뢰 루트는 배포용 실행 프로그램에 추가하지 않습니다. 생성물 `.attestation-runtime/`, Gradle 빌드 폴더와 다운로드 캐시는 Git/소스 ZIP에서 제외됩니다. Netlify는 빌드 시 Linux 런타임을 생성하고 `capture` 함수에만 포함합니다. 다른 함수나 정적 웹에는 포함하지 않습니다. 기본 함수 메모리를 유지하며 유료 옵션을 설정하지 않습니다.

로컬 Linux 실행 패키지는 185,147,819바이트였습니다. Windows 마운트 경로에서의 첫 실행은 WSL 시작·파일 접근을 포함해 약 13초였고, Linux 로컬 파일시스템으로 복사한 동일 프로그램은 0.48초, 최대 RSS 58,672 KiB였습니다. 이 수치는 Netlify의 실제 응답 시간 측정이 아닙니다. 운영 번들의 크기·실행 권한·콜드 스타트는 배포 후 별도 검증해야 합니다.

## 운영 활성화 조건

Production 서버에 다음 값을 설정합니다. 실제 APK 서명 확인과 서버 배포를 마친 후 활성화합니다.

| 변수 | 값 |
| --- | --- |
| `ANDROID_PACKAGE_NAME` | `com.nepeel.app` |
| `ANDROID_HARDWARE_ATTESTATION_ENABLED` | `true` |
| `ANDROID_HARDWARE_MIN_VERSION` | `2` |
| `ANDROID_HARDWARE_CERT_SHA256` | 승인된 APK **서명 인증서** SHA-256 hex; 여러 개는 쉼표로 구분 |

공개키 자체나 APK 파일의 SHA-256이 아닙니다. Play Integrity 경로의 `ANDROID_CERTIFICATE_SHA256`은 base64url 형식이며 서로 다른 설정입니다. 어떤 설정도 앱이 보내는 값으로 대체하지 않습니다.

앱 빌드에는 `EXPO_PUBLIC_ANDROID_ATTESTATION=hardware`를 명시합니다. 서버가 허용한 인증서로 서명된 versionCode 2 이상 APK여야 합니다. 갤러리 입력을 추가하지 않으며, 카메라가 만든 파일에만 인증을 결합합니다. 앱의 Keystore 존재 확인은 사전 점검일 뿐, 게시 허용 여부는 서버가 결정합니다.

이 방식은 Google Play 등록/라이선스 판정과 별개입니다. 개발자 등록·공개 배포·스토어 심사 조건을 충족했다는 뜻이 아니며 유료 계정을 만들지 않았습니다. 실제 기기에서 가입 → 이메일 확인 → 앱 로그인 → 촬영 → 게시 → 웹 조회를 통과해야 촬영 기능을 검증 완료로 표시할 수 있습니다.
