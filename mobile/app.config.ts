export default {
  expo: {
    name: "nepeel",
    slug: "nepeel",
    scheme: "nepeel",
    version: "1.0.0",
    orientation: "portrait",
    userInterfaceStyle: "light",
    platforms: ["ios", "android"],
    ios: {
      bundleIdentifier: "com.nepeel.app",
      supportsTablet: false,
      entitlements: {
        "com.apple.developer.devicecheck.appattest-environment":
          process.env.APP_ATTEST_ENVIRONMENT === "development"
            ? "development"
            : "production",
      },
      infoPlist: { ITSAppUsesNonExemptEncryption: false },
    },
    android: {
      package: "com.nepeel.app",
      versionCode: 4,
      blockedPermissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW",
        "android.permission.ACCESS_BACKGROUND_LOCATION",
      ],
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission:
            "당신의 순간을 직접 촬영하기 위해 카메라 접근이 필요합니다.",
          recordAudioAndroid: false,
          barcodeScannerEnabled: false,
        },
      ],
      "expo-secure-store",
      [
        "expo-location",
        {
          locationWhenInUsePermission:
            "촬영 장소를 붙이고 근처 친구 사진을 찾기 위해 앱 사용 중 위치를 확인합니다.",
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
          isAndroidForegroundServiceEnabled: false,
        },
      ],
    ],
  },
};
