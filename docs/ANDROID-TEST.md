# Android 로컬 테스트

유료 빌드 서비스를 사용하지 않고 설치된 Android Studio·SDK로 빌드합니다. 실제 빌드와 설치·촬영 검증은 서로 다른 단계입니다. 최종 산출물의 상태와 해시는 [검증 기록](VERIFICATION.md)에 기록합니다.

## 빌드 환경과 재현

- Windows, Android Studio JBR 21.0.10, Android SDK 36, Build Tools 36.0.0, NDK 27.1.12297006.
- Expo SDK 57, React Native 0.86.3, Gradle 9.3.1. `package-lock.json`을 사용합니다.
- 앱 식별자 `com.nepeel.app`, 버전 `1.0.0` / versionCode `2`, 최소 Android API 24, 대상 API 36.
- 현재 테스트 대상 ABI는 `arm64-v8a`입니다. 다른 CPU 기기나 Android 에뮬레이터용 범용 APK가 아닙니다.

먼저 루트의 의존성을 설치하고 `mobile/.env.example`을 기준으로 공개 연결 설정을 준비합니다. 서버 Secret은 앱 환경에 넣지 않습니다. `mobile` 폴더에서:

```powershell
rtk proxy npx expo prebuild --platform android --no-install --skip-dependency-update "react-native,react"
```

생성되는 `mobile/android`는 Git에서 제외됩니다. 네이티브 변경은 `app.config.ts` 또는 config plugin으로 관리하세요. Expo prebuild가 생성 폴더를 다시 만들 수 있으므로 그 안에 수작업 변경이나 배포용 키를 보관하지 않습니다.

`mobile/android`에서, `JAVA_HOME`이 JDK 21을 가리키는 상태로:

```powershell
rtk proxy powershell -NoProfile -Command '$env:ANDROID_HOME="$env:LOCALAPPDATA\Android\Sdk"; $env:NODE_ENV="production"; $env:EXPO_PUBLIC_ANDROID_ATTESTATION="hardware"; & .\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a" "-Dorg.gradle.jvmargs=-Xmx2048m -XX:MaxMetaspaceSize=1024m" --no-daemon --no-parallel --max-workers=1 --console=plain'
```

첫 빌드의 기본 512 MB Metaspace로는 Expo 모듈 정적 검사 중 메모리가 부족했습니다. 위 명령은 Metaspace 1 GB, 동시 작업 1개를 사용합니다. 검사나 촬영 인증을 끄는 옵션은 사용하지 않습니다.

## 서명과 권한

Expo 기본 템플릿의 release APK도 개발용 기본 키로 서명될 수 있습니다. 생성된 `app-release.apk`를 그대로 공개 배포하지 않습니다. 로컬 테스트 전달본은 별도 생성한 개인 테스트 키로 다시 서명하고 Android SDK의 `apksigner verify`와 `zipalign -c -P 16 4`로 검사합니다. 키와 비밀번호는 Git·소스 ZIP·웹 배포에서 제외된 로컬 폴더에 보관합니다. 정식 Play 배포 서명과는 별도입니다.

앱 설정에서 마이크, 갤러리 읽기, 외부 저장소 읽기·쓰기, 다른 앱 위에 표시 권한을 차단합니다. APK의 최종 병합된 권한과 디버깅 비활성 상태도 확인해야 합니다. 카메라 촬영은 앱 내부 저장소를 사용합니다.

## 기기 확인 순서

1. 사용자의 Android 기기 모델·버전·CPU 호환성을 확인합니다. 설치를 마치면 개발 서버 없이 앱이 열리는지 확인합니다.
2. 본인 이메일 가입→인증메일 링크→앱 로그인, 웹과 같은 계정의 프로필·피드 표시를 확인합니다. 비밀번호를 채팅으로 보내지 않습니다.
3. 카메라 권한 거절·허용, 화면 전환·백그라운드 복귀를 확인합니다. 갤러리 가져오기나 마이크 요청이 없어야 합니다.
4. versionCode 2 APK에는 직접 설치용 하드웨어 촬영 인증이 포함됐습니다. 서버 구현과 로컬 검증은 [ANDROID-ATTESTATION.md](ANDROID-ATTESTATION.md)에 기록했습니다. 운영 서버의 해당 버전 배포와 활성화가 아직 완료되지 않았으므로 현재 APK로 운영에 사진이 등록된다고 안내하지 않습니다.
5. 정식 기기 인증을 구성한 후에만 실제 촬영→게시→웹 조회와 두 실제 회원의 Hi→수락→DM을 별도로 검증합니다.

## 무료 테스트와 공개 배포의 차이

Android 공식 문서는 무료 limited distribution을 최대 20대 기기의 제한 배포로 설명합니다. 전체 공개 배포 등록은 별도 조건과 비용이 있으므로 사용자의 유료 제외 지시에 따라 가입하지 않았습니다. [개발자 계정 유형](https://support.google.com/android-developer-console/answer/16640817?hl=en), [제한 배포 안내](https://developer.android.com/developer-verification/guides/limited-distribution)를 참고하세요.

일반 사이드로드와 Play Integrity의 `PLAY_RECOGNIZED`·`LICENSED`는 같은 조건이 아닙니다. 새 직접 설치 경로는 Google 하드웨어 인증과 별도 승인한 앱 서명으로 검증합니다. 테스트 APK 생성만으로 실제 촬영 검증이나 글로벌 출시가 완료되지는 않습니다. [Expo 로컬 개발 안내](https://docs.expo.dev/guides/local-app-development/)와 [Play Integrity 설정](https://developer.android.com/google/play/integrity/setup)을 참고하세요.
