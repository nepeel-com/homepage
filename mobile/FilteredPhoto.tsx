import { useState } from "react";
import { Image as NativeImage, View, StyleSheet } from "react-native";
import {
  Canvas,
  Image,
  ColorMatrix,
  useImage,
} from "@shopify/react-native-skia";
import { PHOTO_FILTERS, type PhotoFilter } from "../shared/capture-context";

export default function FilteredPhoto({
  uri,
  filter,
}: {
  uri: string;
  filter: PhotoFilter;
}) {
  const image = useImage(uri);
  const [size, setSize] = useState({ width: 0, height: 0 });
  return (
    <View
      style={styles.container}
      onLayout={(event) => setSize(event.nativeEvent.layout)}
    >
      {image && size.width > 0 ? (
        <Canvas style={StyleSheet.absoluteFill}>
          <Image
            image={image}
            x={0}
            y={0}
            width={size.width}
            height={size.height}
            fit="contain"
          >
            <ColorMatrix matrix={[...PHOTO_FILTERS[filter].matrix]} />
          </Image>
        </Canvas>
      ) : (
        <NativeImage
          source={{ uri }}
          style={StyleSheet.absoluteFill}
          resizeMode="contain"
        />
      )}
    </View>
  );
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: "#20221d" },
});
