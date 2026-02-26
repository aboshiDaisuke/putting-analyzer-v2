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
} from "react-native";
import { useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { trpc } from "@/lib/trpc";

type ScanStep = "capture" | "preview" | "analyzing" | "done";

interface CapturedImage {
  uri: string;
  base64: string;
}

export default function ScanCardScreen() {
  const router = useRouter();
  const colors = useColors();
  const [permission, requestPermission] = useCameraPermissions();
  const [step, setStep] = useState<ScanStep>("capture");
  const [capturedImages, setCapturedImages] = useState<CapturedImage[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisResults, setAnalysisResults] = useState<any[]>([]);
  const cameraRef = useRef<CameraView>(null);

  const uploadMutation = trpc.ocr.uploadImage.useMutation();
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
    const results: any[] = [];

    for (let i = 0; i < capturedImages.length; i++) {
      try {
        setAnalysisProgress(((i) / capturedImages.length) * 100);

        // 1. 画像をS3にアップロード
        const uploadResult = await uploadMutation.mutateAsync({
          base64: capturedImages[i].base64,
          mimeType: "image/jpeg",
        });

        setAnalysisProgress(((i + 0.5) / capturedImages.length) * 100);

        // 2. LLMで解析
        const analyzeResult = await analyzeMutation.mutateAsync({
          imageUrl: uploadResult.imageUrl,
        });

        if (analyzeResult.success && analyzeResult.data) {
          results.push(analyzeResult.data);
        } else {
          results.push({ error: true, index: i + 1 });
        }
      } catch (error) {
        console.error(`Image ${i + 1} analysis failed:`, error);
        results.push({ error: true, index: i + 1 });
      }
    }

    setAnalysisProgress(100);
    setAnalysisResults(results);
    setStep("done");

    // 結果画面に遷移
    const validResults = results.filter((r) => !r.error);
    if (validResults.length > 0) {
      // OCR結果をパラメータとして渡す
      router.push({
        pathname: "/ocr-review" as any,
        params: { data: JSON.stringify(validResults) },
      });
    } else {
      Alert.alert(
        "読み取り失敗",
        "スコアカードの読み取りに失敗しました。\n\n以下をお試しください：\n・明るい場所で撮影する\n・カードが平らになるように置く\n・四隅の■マークが写るようにする",
        [
          { text: "もう一度撮影", onPress: () => resetScan() },
          { text: "キャンセル", onPress: () => router.back() },
        ]
      );
    }
  };

  const resetScan = () => {
    setCapturedImages([]);
    setCurrentImageIndex(0);
    setAnalysisProgress(0);
    setAnalysisResults([]);
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
  return (
    <View style={{ flex: 1, backgroundColor: "#000" }}>
      <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back">
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
            <Text
              style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}
            >
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
                  <Text
                    style={{
                      color: "#FFF",
                      fontSize: 13,
                      fontWeight: "700",
                    }}
                  >
                    {capturedImages.length}枚
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* ガイドフレーム */}
          <View
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            {/* 四隅のコーナーマーク */}
            <View
              style={{
                width: "88%",
                aspectRatio: 0.7,
                position: "relative",
              }}
            >
              {/* 左上 */}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: 30,
                  height: 30,
                  borderTopWidth: 3,
                  borderLeftWidth: 3,
                  borderColor: "#FFFFFF",
                }}
              />
              {/* 右上 */}
              <View
                style={{
                  position: "absolute",
                  top: 0,
                  right: 0,
                  width: 30,
                  height: 30,
                  borderTopWidth: 3,
                  borderRightWidth: 3,
                  borderColor: "#FFFFFF",
                }}
              />
              {/* 左下 */}
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  width: 30,
                  height: 30,
                  borderBottomWidth: 3,
                  borderLeftWidth: 3,
                  borderColor: "#FFFFFF",
                }}
              />
              {/* 右下 */}
              <View
                style={{
                  position: "absolute",
                  bottom: 0,
                  right: 0,
                  width: 30,
                  height: 30,
                  borderBottomWidth: 3,
                  borderRightWidth: 3,
                  borderColor: "#FFFFFF",
                }}
              />
            </View>
            <Text
              style={{
                color: "#FFFFFF",
                marginTop: 16,
                textAlign: "center",
                opacity: 0.9,
                fontSize: 15,
                fontWeight: "500",
              }}
            >
              四隅の■マークが枠内に入るように{"\n"}カードを撮影してください
            </Text>
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
