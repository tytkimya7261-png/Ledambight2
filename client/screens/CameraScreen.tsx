import React, { useState, useEffect, useRef, useCallback } from "react";
import { View, StyleSheet, Platform, Linking, Pressable, useWindowDimensions, Dimensions } from "react-native";
import { CameraView, useCameraPermissions, CameraType } from "expo-camera";
import { useBottomTabBarHeight } from "@react-navigation/bottom-tabs";
import { useHeaderHeight } from "@react-navigation/elements";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { ThemedText } from "@/components/ThemedText";
import { ThemedView } from "@/components/ThemedView";
import { ColorBar } from "@/components/ColorBar";
import { StatusChip } from "@/components/StatusChip";
import { FloatingActionButton } from "@/components/FloatingActionButton";
import { useWiFi } from "@/context/WiFiContext";
import { useSettings } from "@/context/SettingsContext";
import { RegionColors, analyzeRegions } from "@/lib/colorAnalyzer";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";
import { Feather } from "@expo/vector-icons";
import { RootStackParamList } from "@/navigation/RootStackNavigator";
import Svg, { Polygon } from 'react-native-svg';


type CameraNavigationProp = NativeStackNavigationProp<RootStackParamList>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const FRAME_PROCESSOR_FPS = 5;

interface CropOverlayPreviewProps {
  corners: {
    topLeft: { x: number; y: number };
    topRight: { x: number; y: number };
    bottomRight: { x: number; y: number };
    bottomLeft: { x: number; y: number };
  };
}

function CropOverlayPreview({ corners }: CropOverlayPreviewProps) {
  const points = `${corners.topLeft.x * SCREEN_WIDTH},${corners.topLeft.y * SCREEN_HEIGHT} ${corners.topRight.x * SCREEN_WIDTH},${corners.topRight.y * SCREEN_HEIGHT} ${corners.bottomRight.x * SCREEN_WIDTH},${corners.bottomRight.y * SCREEN_HEIGHT} ${corners.bottomLeft.x * SCREEN_WIDTH},${corners.bottomLeft.y * SCREEN_HEIGHT}`;

  return (
    <View style={styles.cropOverlayContainer} pointerEvents="none">
      <Svg width={SCREEN_WIDTH} height={SCREEN_HEIGHT} style={StyleSheet.absoluteFill}>
        <Polygon
          points={points}
          fill="transparent"
          stroke={Colors.dark.accent}
          strokeWidth="2"
          strokeDasharray="5,5"
        />
      </Svg>
    </View>
  );
}


export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [isActive, setIsActive] = useState(false);
  const [colors, setColors] = useState<RegionColors>({
    top: "#2A3340",
    right: "#2A3340",
    bottom: "#2A3340",
    left: "#2A3340",
    dominant: "#2A3340",
  });

  const headerHeight = useHeaderHeight();
  const tabBarHeight = useBottomTabBarHeight();
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const navigation = useNavigation<CameraNavigationProp>();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();

  const { connectedDevice, sendRegionColors } = useWiFi();
  const { settings } = useSettings();

  const startColorAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    const interval = 1000 / settings.updateRate;
    intervalRef.current = setInterval(async () => {
      if (!cameraRef.current) return;

      try {
        const photo = await cameraRef.current.takePictureAsync({
          quality: 0.1,
          base64: false,
          skipProcessing: true,
        });

        if (!photo) return;

        // Create an Image to load the photo
        const img = new Image();
        img.crossOrigin = "anonymous";

        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;

          const ctx = canvas.getContext("2d");
          if (!ctx) return;

          ctx.drawImage(img, 0, 0);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

          const newColors = analyzeRegions(
            imageData.data,
            canvas.width,
            canvas.height,
            settings.cropCorners
          );

          setColors(newColors);

          if (connectedDevice) {
            sendRegionColors({
              top: newColors.top,
              right: newColors.right,
              bottom: newColors.bottom,
              left: newColors.left,
            });
          }
        };

        img.src = photo.uri;
      } catch (error) {
        console.error("Error capturing frame:", error);
      }
    }, interval);
  }, [settings.updateRate, settings.cropCorners, connectedDevice, sendRegionColors]);

  const stopColorAnalysis = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setColors({
      top: "#2A3340",
      right: "#2A3340",
      bottom: "#2A3340",
      left: "#2A3340",
      dominant: "#2A3340",
    });
  }, []);

  useEffect(() => {
    if (isActive) {
      startColorAnalysis();
    } else {
      stopColorAnalysis();
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isActive, startColorAnalysis, stopColorAnalysis]);

  const handleToggle = () => {
    setIsActive((prev) => !prev);
  };

  const openSettings = async () => {
    if (Platform.OS !== "web") {
      try {
        await Linking.openSettings();
      } catch (error) {
        console.log("Cannot open settings");
      }
    }
  };

  if (!permission) {
    return (
      <ThemedView style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <View style={styles.loadingContainer}>
          <ThemedText style={styles.loadingText}>Yükleniyor...</ThemedText>
        </View>
      </ThemedView>
    );
  }

  if (!permission.granted) {
    const canAskAgain = permission.canAskAgain;

    return (
      <ThemedView style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
        <View style={[styles.permissionContainer, { paddingTop: headerHeight + Spacing.xl }]}>
          <View style={styles.permissionIconContainer}>
            <Feather name="camera-off" size={48} color={Colors.dark.accent} />
          </View>
          <ThemedText style={styles.permissionTitle}>Kamera İzni Gerekli</ThemedText>
          <ThemedText style={styles.permissionDescription}>
            Ekrandaki renkleri algılayabilmek için kamera erişimine ihtiyacımız var.
          </ThemedText>

          {canAskAgain ? (
            <Pressable
              style={({ pressed }) => [styles.permissionButton, pressed && styles.buttonPressed]}
              onPress={requestPermission}
            >
              <Feather name="camera" size={20} color={Colors.dark.buttonText} />
              <ThemedText style={styles.permissionButtonText}>İzin Ver</ThemedText>
            </Pressable>
          ) : (
            Platform.OS !== "web" && (
              <Pressable
                style={({ pressed }) => [styles.permissionButton, pressed && styles.buttonPressed]}
                onPress={openSettings}
              >
                <Feather name="settings" size={20} color={Colors.dark.buttonText} />
                <ThemedText style={styles.permissionButtonText}>Ayarları Aç</ThemedText>
              </Pressable>
            )
          )}
        </View>
      </ThemedView>
    );
  }

  const cameraType: CameraType = settings.cameraFacing === "front" ? "front" : "back";

  return (
    <ThemedView style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <View style={[styles.cameraContainer, { marginTop: headerHeight }]}>
        <CameraView
          ref={cameraRef}
          style={styles.camera}
          facing={cameraType}
        >
          <View style={styles.overlay}>
            <View style={styles.statusContainer}>
              <StatusChip
                isConnected={!!connectedDevice}
                deviceName={connectedDevice?.name}
              />
            </View>

            <View style={styles.colorBarContainer}>
              <ColorBar colors={colors} isActive={isActive} />
            </View>

            {isActive && (
              <View style={styles.dominantColorContainer}>
                <View
                  style={[
                    styles.dominantColor,
                    { backgroundColor: colors.dominant },
                  ]}
                />
                <ThemedText style={styles.dominantColorLabel}>
                  Baskın Renk
                </ThemedText>
              </View>
            )}

            {settings.isCalibrated && settings.cropCorners && (
              <CropOverlayPreview corners={settings.cropCorners} />
            )}
          </View>
        </CameraView>
      </View>

      <View style={[styles.fabContainer, { bottom: tabBarHeight + Spacing.xl }]}>
        <View style={styles.fabRow}>
          <Pressable
            style={({ pressed }) => [styles.calibrationButton, pressed && styles.buttonPressed]}
            onPress={() => navigation.navigate("Calibration")}
          >
            <Feather name="crop" size={20} color={Colors.dark.text} />
          </Pressable>
          <FloatingActionButton
            isActive={isActive}
            onPress={handleToggle}
            disabled={!connectedDevice}
          />
        </View>
        {!connectedDevice && (
          <ThemedText style={styles.fabHint}>
            Başlatmak için bir cihaz bağlayın
          </ThemedText>
        )}
      </View>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: Colors.dark.textSecondary,
  },
  permissionContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: Spacing["3xl"],
  },
  permissionIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: Spacing.xl,
  },
  permissionTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: Colors.dark.text,
    marginBottom: Spacing.sm,
    textAlign: "center",
  },
  permissionDescription: {
    fontSize: 14,
    color: Colors.dark.textSecondary,
    textAlign: "center",
    marginBottom: Spacing.xl,
    maxWidth: 280,
  },
  permissionButton: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: Colors.dark.accent,
    paddingHorizontal: Spacing.xl,
    paddingVertical: Spacing.md,
    borderRadius: BorderRadius.md,
  },
  buttonPressed: {
    opacity: 0.8,
  },
  permissionButtonText: {
    fontSize: 16,
    fontWeight: "600",
    color: Colors.dark.buttonText,
  },
  cameraContainer: {
    flex: 1,
    overflow: "hidden",
  },
  camera: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: Spacing.xl,
  },
  statusContainer: {
    alignItems: "center",
  },
  colorBarContainer: {
    position: "absolute",
    top: "50%",
    left: 0,
    right: 0,
    transform: [{ translateY: -4 }],
  },
  dominantColorContainer: {
    alignItems: "center",
    marginBottom: Spacing["4xl"],
  },
  dominantColor: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 3,
    borderColor: "rgba(255,255,255,0.3)",
    marginBottom: Spacing.sm,
  },
  dominantColorLabel: {
    fontSize: 12,
    color: "rgba(255,255,255,0.8)",
    fontWeight: "500",
  },
  fabContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  fabRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.lg,
  },
  calibrationButton: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: Colors.dark.backgroundSecondary,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: Colors.dark.accent,
  },
  fabHint: {
    fontSize: 12,
    color: Colors.dark.textSecondary,
    marginTop: Spacing.sm,
    textAlign: "center",
  },
  cropOverlayContainer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  cropOverlay: {
    position: "absolute",
    borderWidth: 2,
    borderColor: Colors.dark.accent,
    borderStyle: "dashed",
    backgroundColor: "transparent",
  },
});