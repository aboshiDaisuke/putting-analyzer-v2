import { useState, useRef } from "react";
import {
  Text,
  View,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
  ScrollView,
  Image,
  useWindowDimensions,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";
import * as ImageManipulator from "expo-image-manipulator";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type ScanStep = "capture" | "preview" | "analyzing" | "done";

interface CapturedImage {
  uri: string;
  base64: string;
}

// Vercel Serverless Functions の本文上限は 4.5MB。
// iPhoneのJPEG(quality 0.92)は2〜5MB、base64で+33%になるため超過しやすい。
// → アップロード前に最大1920px幅・quality 0.92 に圧縮して確実に上限内に収める。
// quality 0.92: 手書き数字・塗りつぶし○の細部をJPEGアーティファクトなしで保持（0.85→0.92）
// 圧縮失敗時は元のbase64にフォールバック。
async function compressForUpload(uri: string, fallbackBase64: string): Promise<string> {
  try {
    const result = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 1920 } }],
      {
        compress: 0.92, // OCR精度向上: JPEGアーティファクト削減で手書き数字・塗りつぶし○の細部を保持
        format: ImageManipulator.SaveFormat.JPEG,
        base64: true,
      }
    );
    return result.base64!;
  } catch (e) {
    console.warn("Image compression failed, using original:", e);
    return fallbackBase64;
  }
}

export default function ScanCardScreen() {
  const router = useRouter();
  const { roundId } = useLocalSearchParams<{ roundId?: string }>();
  const colors = useColors();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ScanStep>("capture");
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisResults, setAnalysisResults] = useState<any[]>([]);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  // タップでピント合わせ
  const [focusPoint, setFocusPoint] = useState<{ x: number; y: number } | undefined>(undefined);
  const [focusRing, setFocusRing] = useState<{ x: number; y: number } | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // ライト（トーチ）
  const [torchEnabled, setTorchEnabled] = useState(false);

  const handleTapToFocus = (pageX: number, pageY: number) => {
    const nx = Math.max(0, Math.min(1, pageX / screenWidth));
    const ny = Math.max(0, Math.min(1, pageY / screenHeight));
    setFocusPoint({ x: nx, y: ny });
    setFocusRing({ x: pageX, y: pageY });
    if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
    // 2.5秒後にフォーカスリングを消し、focusPointをリセットして連続AFに戻す
    focusTimerRef.current = setTimeout(() => {
      setFocusRing(null);
      setFocusPoint(undefined);
    }, 2500);
  };

  const analyzeMutation = trpc.ocr.analyzeScorecard.useMutation();

  const handleCapture = async () => {
    if (!cameraRef.current) return;

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.85,
        base64: true,
      });

      if (photo && photo.base64) {
        const newImage: CapturedImage = {
          uri: photo.uri,
          base64: photo.base64,
        };
        setCapturedImages((prev) => [...prev, newImage]);
        setCurrentImageIndex(capturedImages.length);
        setStep("preview");
      }
    } catch (error) {
      Alert.alert("エラー", "写真の撮影に失敗しました");
    }
  };

  const handlePickImage = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.85,
      base64: true,
      allowsMultipleSelection: true,
    });

    if (!result.canceled && result.assets.length > 0) {
      const newImages: CapturedImage[] = [];

      for (const asset of result.assets) {
        let base64 = asset.base64;
        if (!base64) {
          // base64がない場合はファイルから読み込む
          try {
            const fileContent = await FileSystem.readAsStringAsync(asset.uri, {
              encoding: FileSystem.EncodingType.Base64,
            });
            base64 = fileContent;
          } catch {
            continue;
          }
        }
        if (base64) {
          newImages.push({ uri: asset.uri, base64 });
        }
      }

      if (newImages.length > 0) {
        setCapturedImages((prev) => [...prev, ...newImages]);
        setCurrentImageIndex(capturedImages.length);
        setStep("preview");
      }
    }
  };

  const handleRemoveImage = (index: number) => {
    setCapturedImages((prev) => prev.filter((_, i) => i !== index));
    if (currentImageIndex >= capturedImages.length - 1) {
      setCurrentImageIndex(Math.max(0, capturedImages.length - 2));
    }
    if (capturedImages.length <= 1) {
      setStep("capture");
    }
  };

  const handleAddMore = () => {
    setStep("capture");
  };

  const handleAnalyze = async () => {
    if (capturedImages.length === 0) return;

    setStep("analyzing");
    setAnalysisProgress(0);
    setAnalysisError(null);
    const results: any[] = [];

    for (let i = 0; i < capturedImages.length; i++) {
      try {
        setAnalysisProgress((i / capturedImages.length) * 100);

        // 1. 画像を圧縮（Vercel 4.5MB 上限対策: 1920px幅・quality 0.92）
        const compressedBase64 = await compressForUpload(capturedImages[i].uri, capturedImages[i].base64);

        // 2. base64を直接Geminiへ送信（Supabase経由不要 → ラウンドトリップ削減で高速化）
        const analyzeResult = await analyzeMutation.mutateAsync({
          base64: compressedBase64,
          mimeType: "image/jpeg",
        });

        if (analyzeResult.success && analyzeResult.data) {
          results.push(analyzeResult.data);
        } else {
          results.push({ error: true, index: i + 1 });
        }
      } catch (error) {
        const errMsg = error instanceof Error ? error.message : String(error);
        console.error(`Image ${i + 1} analysis failed:`, error);
        results.push({ error: true, index: i + 1, message: errMsg });
      }
    }

    setAnalysisProgress(100);
    setAnalysisResults(results);
    setStep("done");

    // 結果画面に遷移
    const validResults = results.filter((r) => !r.error);
    if (validResults.length > 0) {
      // OCR結果をパラメータとして渡す（roundIdがあれば一緒に渡す）
      router.push({
        pathname: "/ocr-review" as any,
        params: {
          data: JSON.stringify(validResults),
          ...(roundId ? { roundId } : {}),
        },
      });
    } else {
      // Alert.alert はWebで正常動作しないためインライン表示に切り替え
      const errDetails = results
        .filter((r) => r.error && r.message)
        .map((r) => r.message)
        .join("\n");
      setAnalysisError(
        "スコアカードの読み取りに失敗しました。\n" +
        "明るい場所で撮影し、四隅の■マークが写るようにしてください。" +
        (errDetails ? `\n\n[詳細] ${errDetails}` : "")
      );
      setStep("preview");
    }
  };

  const resetScan = () => {
    setCapturedImages([]);
    setCurrentImageIndex(0);
    setAnalysisProgress(0);
    setAnalysisResults([]);
    setAnalysisError(null);
    setStep("capture");
  };

  // 解析中画面
  if (step === "analyzing") {
    return (
      <ScreenContainer edges={["top", "left", "right", "bottom"]}>
        <View className="flex-1 items-center justify-center p-6">
          <View className="bg-surface rounded-3xl p-8 items-center w-full max-w-sm border border-border">
            <ActivityIndicator size="large" color={colors.primary} />
            <Text className="text-foreground text-xl font-bold mt-6">
              読み取り中...
            </Text>
            <Text className="text-muted text-center mt-2">
              AI がスコアカードを解析しています
            </Text>

            {/* プログレスバー */}
            <View className="w-full mt-6">
              <View className="bg-border rounded-full h-3 overflow-hidden">
                <View
                  style={{
                    width: `${Math.round(analysisProgress)}%`,
                    backgroundColor: colors.primary,
                    height: "100%",
                    borderRadius: 999,
                  }}
                />
              </View>
              <Text className="text-muted text-sm text-center mt-2">
                {Math.round(analysisProgress)}% 完了
              </Text>
            </View>

            <Text className="text-muted text-xs text-center mt-4">
              {capturedImages.length}枚のカードを処理中
            </Text>
          </View>
        </View>
      </ScreenContainer>
    );
  }

  // プレビュー画面
  if (step === "preview" && capturedImages.length > 0) {
    return (
      <ScreenContainer edges={["top", "left", "right", "bottom"]}>
        {/* ヘッダー */}
        <View className="flex-row items-center justify-between p-4 border-b border-border">
          <TouchableOpacity onPress={() => resetScan()} className="p-2 -ml-2">
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="text-lg font-bold text-foreground">
            撮影確認
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <ScrollView contentContainerStyle={{ flexGrow: 1, padding: 16 }}>
          <View className="gap-4">
            {/* エラー表示 */}
            {analysisError && (
              <View style={{ backgroundColor: "rgba(220,38,38,0.1)", borderRadius: 16, padding: 16, borderWidth: 1, borderColor: "rgba(220,38,38,0.4)" }}>
                <Text style={{ color: "#dc2626", fontWeight: "600", fontSize: 13, marginBottom: 4 }}>読み取りエラー</Text>
                <Text style={{ color: colors.foreground, fontSize: 13, lineHeight: 20 }}>{analysisError}</Text>
              </View>
            )}

            {/* 撮影枚数表示 */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-foreground font-semibold text-base mb-1">
                撮影済みカード: {capturedImages.length}枚
              </Text>
              <Text className="text-muted text-sm">
                1ホールにつき1枚のカードを撮影してください。{"\n"}
                18ホール分まとめて解析できます。
              </Text>
            </View>

            {/* 画像サムネイル一覧 */}
            <View className="flex-row flex-wrap gap-3">
              {capturedImages.map((img, index) => (
                <View key={index} className="relative">
                  <Image
                    source={{ uri: img.uri }}
                    style={{
                      width: 100,
                      height: 140,
                      borderRadius: 12,
                      borderWidth: 2,
                      borderColor:
                        index === currentImageIndex
                          ? colors.primary
                          : colors.border,
                    }}
                  />
                  <TouchableOpacity
                    onPress={() => handleRemoveImage(index)}
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -8,
                      backgroundColor: colors.error,
                      borderRadius: 12,
                      width: 24,
                      height: 24,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "#FFF", fontSize: 14, fontWeight: "bold" }}>
                      ×
                    </Text>
                  </TouchableOpacity>
                  <View
                    style={{
                      position: "absolute",
                      bottom: 4,
                      left: 4,
                      backgroundColor: "rgba(0,0,0,0.6)",
                      borderRadius: 8,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                    }}
                  >
                    <Text style={{ color: "#FFF", fontSize: 11, fontWeight: "600" }}>
                      #{index + 1}
                    </Text>
                  </View>
                </View>
              ))}

              {/* 追加ボタン */}
              <TouchableOpacity
                onPress={handleAddMore}
                style={{
                  width: 100,
                  height: 140,
                  borderRadius: 12,
                  borderWidth: 2,
                  borderColor: colors.border,
                  borderStyle: "dashed",
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.surface,
                }}
              >
                <IconSymbol name="plus" size={28} color={colors.muted} />
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: 11,
                    marginTop: 4,
                  }}
                >
                  追加撮影
                </Text>
              </TouchableOpacity>
            </View>

            {/* 注意事項 */}
            <View className="bg-warning/10 rounded-2xl p-4 border border-warning/30">
              <Text className="text-foreground font-semibold text-sm mb-2">
                読み取りのコツ
              </Text>
              <Text className="text-muted text-sm leading-relaxed">
                ・四隅の■マークが写るように撮影{"\n"}
                ・明るい場所で影が入らないように{"\n"}
                ・カードが平らになるように置く{"\n"}
                ・数字は枠内に丁寧に記入
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* 解析ボタン */}
        <View className="p-4 border-t border-border">
          <TouchableOpacity
            onPress={handleAnalyze}
            className="bg-primary rounded-2xl py-4 items-center"
            activeOpacity={0.8}
          >
            <Text className="text-white font-bold text-lg">
              {capturedImages.length}枚を読み取る
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // カメラ許可なし
  if (!permission) {
    return (
      <ScreenContainer className="items-center justify-center">
        <ActivityIndicator size="large" color={colors.primary} />
      </ScreenContainer>
    );
  }

  if (!permission.granted) {
    return (
      <ScreenContainer edges={["top", "left", "right", "bottom"]}>
        <View className="flex-row items-center justify-between p-4">
          <TouchableOpacity onPress={() => router.back()} className="p-2 -ml-2">
            <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
          </TouchableOpacity>
          <Text className="text-lg font-semibold text-foreground">
            カード撮影
          </Text>
          <View style={{ width: 24 }} />
        </View>

        <View className="flex-1 items-center justify-center p-6">
          <View className="bg-surface rounded-3xl p-8 items-center border border-border">
            <IconSymbol name="camera.fill" size={64} color={colors.muted} />
            <Text className="text-foreground text-xl font-bold mt-4 text-center">
              カメラへのアクセスが必要です
            </Text>
            <Text className="text-muted text-center mt-2">
              スコアカードを撮影するには{"\n"}カメラへのアクセスを許可してください
            </Text>
            <TouchableOpacity
              className="bg-primary px-8 py-3 rounded-xl mt-6"
              onPress={requestPermission}
              activeOpacity={0.8}
            >
              <Text className="text-white font-semibold">カメラを許可</Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            className="mt-6 bg-surface rounded-2xl px-6 py-4 border border-border flex-row items-center gap-3"
            onPress={handlePickImage}
            activeOpacity={0.7}
          >
            <IconSymbol name="list.bullet" size={24} color={colors.primary} />
            <Text className="text-primary font-medium">
              ライブラリから選択
            </Text>
          </TouchableOpacity>
        </View>
      </ScreenContainer>
    );
  }

  // カメラ撮影画面
  // ガイドフレームサイズ計算（スクリーン幅の88%、縦横比0.7のカード）
  const GUIDE_SCALE = 0.88;
  const CARD_ASPECT = 0.7; // width / height
  const frameWidth = screenWidth * GUIDE_SCALE;
  const frameHeight = frameWidth / CARD_ASPECT;
  const sidePad = (screenWidth - frameWidth) / 2;
  const DARK = "rgba(0,0,0,0.58)";

  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView
        ref={cameraRef}
        style={{ flex: 1 }}
        facing="back"
        autofocus="on"
        focusPoint={focusPoint}
        enableTorch={torchEnabled}
      >
        <View style={{ flex: 1 }}>
          {/* ヘッダー */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              padding: 16,
              paddingTop: Platform.OS === "ios" ? 60 : 40,
              backgroundColor: "rgba(0,0,0,0.4)",
            }}
          >
            <TouchableOpacity
              onPress={() =>
                capturedImages.length > 0 ? setStep("preview") : router.back()
              }
              style={{ padding: 8 }}
            >
              <IconSymbol name="arrow.left" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>
              スコアカード撮影
            </Text>
            <View style={{ width: 40 }}>
              {capturedImages.length > 0 && (
                <View
                  style={{
                    backgroundColor: colors.primary,
                    borderRadius: 12,
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    alignItems: "center",
                  }}
                >
                  <Text style={{ color: "#FFF", fontSize: 13, fontWeight: "700" }}>
                    {capturedImages.length}枚
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ガイドオーバーレイ: フレーム外を暗くして撮影範囲を明確化。タップでピント合わせ */}
          <View
            style={{ flex: 1 }}
            onTouchEnd={(e) =>
              handleTapToFocus(e.nativeEvent.pageX, e.nativeEvent.pageY)
            }
          >
            {/* 上部 暗いエリア */}
            <View style={{ flex: 1, backgroundColor: DARK }} />

            {/* 中段: 左暗い | ガイドフレーム（透明・白枠） | 右暗い */}
            <View style={{ flexDirection: "row", height: frameHeight }}>
              {/* 左暗いエリア */}
              <View style={{ width: sidePad, backgroundColor: DARK }} />

              {/* ガイドフレーム本体（カメラが透けて見える） */}
              <View style={{ flex: 1, borderWidth: 2, borderColor: "rgba(255,255,255,0.85)" }}>
                {/* 左上コーナー */}
                <View style={{ position: "absolute", top: -1, left: -1, width: 32, height: 32, borderTopWidth: 4, borderLeftWidth: 4, borderColor: "#FFF" }} />
                {/* 右上コーナー */}
                <View style={{ position: "absolute", top: -1, right: -1, width: 32, height: 32, borderTopWidth: 4, borderRightWidth: 4, borderColor: "#FFF" }} />
                {/* 左下コーナー */}
                <View style={{ position: "absolute", bottom: -1, left: -1, width: 32, height: 32, borderBottomWidth: 4, borderLeftWidth: 4, borderColor: "#FFF" }} />
                {/* 右下コーナー */}
                <View style={{ position: "absolute", bottom: -1, right: -1, width: 32, height: 32, borderBottomWidth: 4, borderRightWidth: 4, borderColor: "#FFF" }} />
              </View>

              {/* 右暗いエリア */}
              <View style={{ width: sidePad, backgroundColor: DARK }} />
            </View>

            {/* 下部 暗いエリア + 説明テキスト */}
            <View style={{ flex: 1, backgroundColor: DARK, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
              <Text style={{ color: "#FFFFFF", textAlign: "center", fontSize: 14, fontWeight: "500", lineHeight: 22 }}>
                カード全体が枠内に収まるように{"\n"}位置を合わせてシャッターを押してください
              </Text>
              <Text style={{ color: "rgba(255,255,255,0.55)", textAlign: "center", fontSize: 12, marginTop: 6 }}>
                ぼやける場合は画面をタップしてピントを合わせてください
              </Text>
            </View>

            {/* ライト（トーチ）ON/OFFボタン — ガイドフレーム右上に固定 */}
            <TouchableOpacity
              onPress={() => setTorchEnabled((t) => !t)}
              style={{
                position: "absolute",
                top: 12,
                right: 12,
                width: 44,
                height: 44,
                borderRadius: 22,
                backgroundColor: torchEnabled
                  ? "rgba(255,215,0,0.25)"
                  : "rgba(0,0,0,0.45)",
                borderWidth: 1,
                borderColor: torchEnabled
                  ? "#FFD700"
                  : "rgba(255,255,255,0.4)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSymbol
                name={torchEnabled ? "bolt.fill" : "bolt.slash.fill"}
                size={20}
                color={torchEnabled ? "#FFD700" : "#FFFFFF"}
              />
            </TouchableOpacity>

            {/* タップフォーカスリング（タップ位置に2秒表示） */}
            {focusRing && (
              <View
                pointerEvents="none"
                style={{
                  position: "absolute",
                  left: focusRing.x - 32,
                  top: focusRing.y - 32,
                  width: 64,
                  height: 64,
                  borderRadius: 6,
                  borderWidth: 2,
                  borderColor: "#FFD700",
                }}
              />
            )}
          </View>

          {/* コントロール */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-around",
              padding: 24,
              paddingBottom: Platform.OS === "ios" ? 48 : 24,
              backgroundColor: "rgba(0,0,0,0.4)",
            }}
          >
            {/* ライブラリから選択 */}
            <TouchableOpacity
              onPress={handlePickImage}
              style={{
                width: 50,
                height: 50,
                borderRadius: 25,
                backgroundColor: "rgba(255,255,255,0.2)",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <IconSymbol name="list.bullet" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            {/* シャッターボタン */}
            <TouchableOpacity
              onPress={handleCapture}
              style={{
                width: 76,
                height: 76,
                borderRadius: 38,
                backgroundColor: "#FFFFFF",
                alignItems: "center",
                justifyContent: "center",
                borderWidth: 4,
                borderColor: "rgba(255,255,255,0.5)",
              }}
            >
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: colors.primary,
                }}
              />
            </TouchableOpacity>

            {/* プレビューへ（撮影済みがある場合） */}
            {capturedImages.length > 0 ? (
              <TouchableOpacity
                onPress={() => setStep("preview")}
                style={{
                  width: 50,
                  height: 50,
                  borderRadius: 12,
                  overflow: "hidden",
                  borderWidth: 2,
                  borderColor: "#FFFFFF",
                }}
              >
                <Image
                  source={{ uri: capturedImages[capturedImages.length - 1].uri }}
                  style={{ width: "100%", height: "100%" }}
                />
              </TouchableOpacity>
            ) : (
              <View style={{ width: 50, height: 50 }} />
            )}
          </View>
        </View>
      </CameraView>
    </View>
  );
}
