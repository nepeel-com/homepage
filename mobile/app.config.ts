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
      blockedPermissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.READ_MEDIA_IMAGES",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
        "android.permission.SYSTEM_ALERT_WINDOW",
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
    ],
  },
};
