import React, { useState, useRef, useCallback } from "react";
import { View, StyleSheet, Pressable, Dimensions, Platform, Linking } from "react-native";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  runOnJS,
  SharedValue,
} from "react-native-reanimated";
import * as Haptics from "expo-haptics";
import { Feather } from "@expo/vector-icons";
import { ThemedView } from "@/components/ThemedView";
import { ThemedText } from "@/components/ThemedText";
import { useSettings } from "@/context/SettingsContext";
import { CropCorners, defaultCropCorners } from "@/lib/storage";
import { Colors, Spacing, BorderRadius } from "@/constants/theme";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");
const HANDLE_SIZE = 44;
const HANDLE_VISUAL_SIZE = 28;

interface CornerHandle {
  id: keyof CropCorners;
  x: SharedValue<number>;
  y: SharedValue<number>;
}

export default function CalibrationScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const insets = useSafeAreaInsets();
  const navigation = useNavigation();
  const { settings, saveCropCorners } = useSettings();
  const cameraRef = useRef<CameraView>(null);

  const initialCorners = settings.cropCorners || defaultCropCorners;

  const topLeftX = useSharedValue(initialCorners.topLeft.x * SCREEN_WIDTH);
  const topLeftY = useSharedValue(initialCorners.topLeft.y * SCREEN_HEIGHT);
  const topRightX = useSharedValue(initialCorners.topRight.x * SCREEN_WIDTH);
  const topRightY = useSharedValue(initialCorners.topRight.y * SCREEN_HEIGHT);
  const bottomLeftX = useSharedValue(initialCorners.bottomLeft.x * SCREEN_WIDTH);
  const bottomLeftY = useSharedValue(initialCorners.bottomLeft.y * SCREEN_HEIGHT);
  const bottomRightX = useSharedValue(initialCorners.bottomRight.x * SCREEN_WIDTH);
  const bottomRightY = useSharedValue(initialCorners.bottomRight.y * SCREEN_HEIGHT);

  const triggerHaptic = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  }, []);

  const handleSave = useCallback(async () => {
    const corners: CropCorners = {
      topLeft: { x: topLeftX.value / SCREEN_WIDTH, y: topLeftY.value / SCREEN_HEIGHT },
      topRight: { x: topRightX.value / SCREEN_WIDTH, y: topRightY.value / SCREEN_HEIGHT },
      bottomLeft: { x: bottomLeftX.value / SCREEN_WIDTH, y: bottomLeftY.value / SCREEN_HEIGHT },
      bottomRight: { x: bottomRightX.value / SCREEN_WIDTH, y: bottomRightY.value / SCREEN_HEIGHT },
    };
    await saveCropCorners(corners);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    navigation.goBack();
  }, [saveCropCorners, navigation]);

  const handleCancel = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  const createCornerGesture = (
    xValue: SharedValue<number>,
    yValue: SharedValue<number>,
    scale: SharedValue<number>
  ) => {
    const startX = useSharedValue(0);
    const startY = useSharedValue(0);
    
    return Gesture.Pan()
      .onStart(() => {
        startX.value = xValue.value;
        startY.value = yValue.value;
        scale.value = withSpring(1.3, { damping: 15, stiffness: 300 });
        runOnJS(triggerHaptic)();
      })
      .onUpdate((event) => {
        // Hassasiyeti azaltmak için translationX/Y'yi 0.5 ile çarp
        const newX = Math.max(HANDLE_SIZE / 2, Math.min(SCREEN_WIDTH - HANDLE_SIZE / 2, startX.value + event.translationX * 0.5));
        const newY = Math.max(insets.top + HANDLE_SIZE / 2, Math.min(SCREEN_HEIGHT - insets.bottom - HANDLE_SIZE / 2, startY.value + event.translationY * 0.5));
        xValue.value = newX;
        yValue.value = newY;
      })
      .onEnd(() => {
        scale.value = withSpring(1, { damping: 15, stiffness: 300 });
        runOnJS(triggerHaptic)();
      });
  };

  const topLeftScale = useSharedValue(1);
  const topRightScale = useSharedValue(1);
  const bottomLeftScale = useSharedValue(1);
  const bottomRightScale = useSharedValue(1);

  const topLeftGesture = createCornerGesture(topLeftX, topLeftY, topLeftScale);
  const topRightGesture = createCornerGesture(topRightX, topRightY, topRightScale);
  const bottomLeftGesture = createCornerGesture(bottomLeftX, bottomLeftY, bottomLeftScale);
  const bottomRightGesture = createCornerGesture(bottomRightX, bottomRightY, bottomRightScale);

  const topLeftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: topLeftX.value - HANDLE_SIZE / 2 },
      { translateY: topLeftY.value - HANDLE_SIZE / 2 },
      { scale: topLeftScale.value },
    ],
  }));

  const topRightStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: topRightX.value - HANDLE_SIZE / 2 },
      { translateY: topRightY.value - HANDLE_SIZE / 2 },
      { scale: topRightScale.value },
    ],
  }));

  const bottomLeftStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: bottomLeftX.value - HANDLE_SIZE / 2 },
      { translateY: bottomLeftY.value - HANDLE_SIZE / 2 },
      { scale: bottomLeftScale.value },
    ],
  }));

  const bottomRightStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: bottomRightX.value - HANDLE_SIZE / 2 },
      { translateY: bottomRightY.value - HANDLE_SIZE / 2 },
      { scale: bottomRightScale.value },
    ],
  }));

  const linePathStyle = useAnimatedStyle(() => {
    return {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
    };
  });

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
        <View style={[styles.permissionContainer, { paddingTop: insets.top + Spacing.xl }]}>
          <View style={styles.permissionIconContainer}>
            <Feather name="camera-off" size={48} color={Colors.dark.accent} />
          </View>
          <ThemedText style={styles.permissionTitle}>Kamera İzni Gerekli</ThemedText>
          <ThemedText style={styles.permissionDescription}>
            TV alanını kalibre etmek için kamera erişimine ihtiyacımız var.
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

  return (
    <ThemedView style={[styles.container, { backgroundColor: Colors.dark.backgroundRoot }]}>
      <CameraView
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        facing={settings.cameraFacing === "front" ? "front" : "back"}
      />

      <View style={StyleSheet.absoluteFill}>
        <Animated.View style={linePathStyle}>
          <CropOverlay
            topLeftX={topLeftX}
            topLeftY={topLeftY}
            topRightX={topRightX}
            topRightY={topRightY}
            bottomLeftX={bottomLeftX}
            bottomLeftY={bottomLeftY}
            bottomRightX={bottomRightX}
            bottomRightY={bottomRightY}
          />
        </Animated.View>

        <GestureDetector gesture={topLeftGesture}>
          <Animated.View style={[styles.handle, topLeftStyle]}>
            <View style={styles.handleInner} />
          </Animated.View>
        </GestureDetector>

        <GestureDetector gesture={topRightGesture}>
          <Animated.View style={[styles.handle, topRightStyle]}>
            <View style={styles.handleInner} />
          </Animated.View>
        </GestureDetector>

        <GestureDetector gesture={bottomLeftGesture}>
          <Animated.View style={[styles.handle, bottomLeftStyle]}>
            <View style={styles.handleInner} />
          </Animated.View>
        </GestureDetector>

        <GestureDetector gesture={bottomRightGesture}>
          <Animated.View style={[styles.handle, bottomRightStyle]}>
            <View style={styles.handleInner} />
          </Animated.View>
        </GestureDetector>
      </View>

      <View style={[styles.header, { paddingTop: insets.top + Spacing.md }]}>
        <Pressable
          style={({ pressed }) => [styles.headerButton, pressed && styles.buttonPressed]}
          onPress={handleCancel}
        >
          <ThemedText style={styles.headerButtonText}>İptal</ThemedText>
        </Pressable>

        <ThemedText style={styles.headerTitle}>TV Alanını Kalibre Et</ThemedText>

        <Pressable
          style={({ pressed }) => [styles.headerButton, styles.saveButton, pressed && styles.buttonPressed]}
          onPress={handleSave}
        >
          <ThemedText style={[styles.headerButtonText, styles.saveButtonText]}>Kaydet</ThemedText>
        </Pressable>
      </View>

      <View style={[styles.instructionContainer, { top: insets.top + Spacing["4xl"] }]}>
        <View style={styles.instructionBadge}>
          <Feather name="move" size={16} color={Colors.dark.text} />
          <ThemedText style={styles.instructionText}>
            Köşeleri TV ekranınıza göre sürükleyin
          </ThemedText>
        </View>
      </View>
    </ThemedView>
  );
}

interface CropOverlayProps {
  topLeftX: SharedValue<number>;
  topLeftY: SharedValue<number>;
  topRightX: SharedValue<number>;
  topRightY: SharedValue<number>;
  bottomLeftX: SharedValue<number>;
  bottomLeftY: SharedValue<number>;
  bottomRightX: SharedValue<number>;
  bottomRightY: SharedValue<number>;
}

function CropOverlay({
  topLeftX,
  topLeftY,
  topRightX,
  topRightY,
  bottomLeftX,
  bottomLeftY,
  bottomRightX,
  bottomRightY,
}: CropOverlayProps) {
  const lineStyle = useAnimatedStyle(() => {
    return {};
  });

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      <AnimatedLine x1={topLeftX} y1={topLeftY} x2={topRightX} y2={topRightY} />
      <AnimatedLine x1={topRightX} y1={topRightY} x2={bottomRightX} y2={bottomRightY} />
      <AnimatedLine x1={bottomRightX} y1={bottomRightY} x2={bottomLeftX} y2={bottomLeftY} />
      <AnimatedLine x1={bottomLeftX} y1={bottomLeftY} x2={topLeftX} y2={topLeftY} />
    </View>
  );
}

interface AnimatedLineProps {
  x1: SharedValue<number>;
  y1: SharedValue<number>;
  x2: SharedValue<number>;
  y2: SharedValue<number>;
}

function AnimatedLine({ x1, y1, x2, y2 }: AnimatedLineProps) {
  const lineStyle = useAnimatedStyle(() => {
    const dx = x2.value - x1.value;
    const dy = y2.value - y1.value;
    const length = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx);

    return {
      position: 'absolute' as const,
      left: x1.value,
      top: y1.value,
      width: length,
      height: 3,
      backgroundColor: Colors.dark.accent,
      transform: [{ rotate: `${angle}rad` }],
      transformOrigin: 'left center',
      borderRadius: 1.5,
    };
  });

  return <Animated.View style={lineStyle} />;
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
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: Spacing.lg,
    paddingBottom: Spacing.md,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  headerButton: {
    paddingVertical: Spacing.sm,
    paddingHorizontal: Spacing.md,
  },
  headerButtonText: {
    fontSize: 16,
    color: Colors.dark.text,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "600",
    color: Colors.dark.text,
  },
  saveButton: {
    backgroundColor: Colors.dark.accent,
    borderRadius: BorderRadius.xs,
  },
  saveButtonText: {
    color: Colors.dark.buttonText,
    fontWeight: "600",
  },
  instructionContainer: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
  },
  instructionBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: Spacing.sm,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: Spacing.lg,
    paddingVertical: Spacing.sm,
    borderRadius: BorderRadius.full,
  },
  instructionText: {
    fontSize: 14,
    color: Colors.dark.text,
  },
  handle: {
    position: "absolute",
    width: HANDLE_SIZE,
    height: HANDLE_SIZE,
    justifyContent: "center",
    alignItems: "center",
  },
  handleInner: {
    width: HANDLE_VISUAL_SIZE,
    height: HANDLE_VISUAL_SIZE,
    borderRadius: HANDLE_VISUAL_SIZE / 2,
    backgroundColor: Colors.dark.accent,
    borderWidth: 3,
    borderColor: Colors.dark.text,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
});