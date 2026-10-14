import * as Location from "expo-location";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  roundCoordinate,
  type PhotoPlace,
  type PlaceAudience,
} from "../../shared/capture-context";

const preferenceKey = (userId: string) => `nepeel.places.enabled.${userId}`;
export async function placesEnabled(userId: string) {
  return (await AsyncStorage.getItem(preferenceKey(userId))) === "true";
}
export async function setPlacesEnabled(userId: string, enabled: boolean) {
  await AsyncStorage.setItem(preferenceKey(userId), String(enabled));
}
async function timeout<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                "위치를 찾는 데 시간이 걸려요. 잠시 후 다시 시도해 주세요.",
              ),
            ),
          ms,
        );
      }),
    ]);
  } finally {
    clearTimeout(timer!);
  }
}
export async function currentPlace(
  audience: PlaceAudience = "followers",
  askPermission = false,
): Promise<PhotoPlace> {
  let permission = await Location.getForegroundPermissionsAsync();
  if (!permission.granted && askPermission)
    permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "촬영 장소를 사용하려면 위치 권한을 허용해 주세요. 위치 없이도 사진을 올릴 수 있어요.",
    );
  if (!(await Location.hasServicesEnabledAsync()))
    throw new Error("휴대폰의 위치 서비스를 켜 주세요.");
  let position = await Location.getLastKnownPositionAsync({
    maxAge: 60_000,
    requiredAccuracy: 200,
  });
  if (!position)
    position = await timeout(
      Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      }),
      20_000,
    );
  if (
    position.mocked ||
    (position.coords.accuracy ?? Infinity) > 300 ||
    Date.now() - position.timestamp > 120_000
  )
    throw new Error(
      "정확한 촬영 장소를 확인하지 못했어요. 위치 없이 게시하거나 다시 시도해 주세요.",
    );
  const latitude = roundCoordinate(position.coords.latitude),
    longitude = roundCoordinate(position.coords.longitude);
  let label = "촬영한 장소";
  try {
    const addresses = await timeout(
      Location.reverseGeocodeAsync({ latitude, longitude }),
      5000,
    );
    const address = addresses[0];
    if (address)
      label =
        [
          ...new Set(
            [address.city, address.district ?? address.subregion].filter(
              Boolean,
            ),
          ),
        ].join(" · ") ||
        address.region ||
        label;
  } catch {
    /* Coordinates are usable even when the native geocoder is unavailable. */
  }
  return { latitude, longitude, label: label.slice(0, 80), audience };
}
