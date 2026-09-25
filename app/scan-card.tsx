/**
 * パッティングカード v3 の撮影。表（OUT 1〜9番）と裏（IN 10〜18番）の2枚。
 *
 * - 撮影/選択した直後に前処理（Web: 四隅■検出・向き補正・台形補正・面の判定）をして状態を表示
 * - 面を取り違えて撮っても、判定できた面に自動で入れ替える
 * - 読み取りはサーバー（Gemini + 画素判定）。結果は確認画面へ
 */
import { useRef, useState } from "react";
import { ActivityIndicator, Image, Platform, Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as ImagePicker from "expo-image-picker";
import * as FileSystem from "expo-file-system/legacy";

import { ScreenContainer } from "@/components/screen-container";
import { ErrorBanner } from "@/components/ui/error-banner";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { shadowPrimary, shadowSm } from "@/lib/card-shadow";
import { hapticLight } from "@/lib/haptics";
import { prepareScorecardImage, type PreparedImage } from "@/lib/ocr-image";
import { setOcrSession, type SideResult } from "@/lib/ocr-session";
import { useIsDemo } from "@/lib/session-context";
import type { CardSide } from "@/lib/scorecard/layout";
import { trpc } from "@/lib/trpc";

type Shot = { uri: string; base64: string; prepared?: PreparedImage };

const SIDE_INFO: Record<CardSide, { title: string; sub: string }> = {
  out: { title: "表 OUT", sub: "1〜9番" },
  in: { title: "裏 IN", sub: "10〜18番" },
};

const CARD_ASPECT = 175 / 105;

export default function ScanCardScreen() {
  const router = useRouter();
  const { roundId } = useLocalSearchParams<{ roundId?: string }>();
  const colors = useColors();
  const isDemo = useIsDemo();
  const { width: screenW } = useWindowDimensions();
  const contentW = Math.min(screenW, 720) - 32;

  const [permission, requestPermission] = useCameraPermissions();
  const [shots, setShots] = useState<Record<CardSide, Shot | null>>({ out: null, in: null });
  const [cameraFor, setCameraFor] = useState<CardSide | null>(null);
  const [torch, setTorch] = useState(false);
  const [analyzing, setAnalyzing] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const cameraRef = useRef<CameraView>(null);
  // 読み取り済みの結果（写真ごと）。片面だけ撮り直したとき、もう片面を読み直さない
  const doneRef = useRef(new Map<string, SideResult>());
  const analyze = trpc.ocr.analyzeCard.useMutation();

  /** 画像を面に入れ、前処理して、判定した面が違えば入れ替える */
  const addShot = (side: CardSide, shot: Shot) => {
    setShots((prev) => ({ ...prev, [side]: shot }));
    setError(null);
    void prepareScorecardImage(shot.uri, shot.base64).then((prepared) => {
      setShots((prev) => {
        const current = prev[side];
        if (!current || current.uri !== shot.uri) return prev;
        const updated = { ...current, prepared };
        const detected = prepared.side;
        if (detected && detected !== side) {
          setNotice(`${SIDE_INFO[detected].title} の面だったので入れ替えました`);
          return { ...prev, [side]: prev[detected], [detected]: updated };
        }
        return { ...prev, [side]: updated };
      });
    });
  };

  const capture = async () => {
    if (!cameraRef.current || !cameraFor) return;
    try {
      const photo = await cameraRef.current.takePictureAsync({ quality: 0.95, base64: true });
      if (photo?.base64) {
        hapticLight();
        addShot(cameraFor, { uri: photo.uri, base64: photo.base64 });
        // 表を撮ったら続けて裏へ
        if (cameraFor === "out" && !shots.in) setCameraFor("in");
        else setCameraFor(null);
      }
    } catch {
      setError("撮影に失敗しました。もう一度お試しください。");
    }
  };

  const pick = async (side: CardSide) => {
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ["images"], quality: 1, base64: true, allowsMultipleSelection: false });
    if (result.canceled || result.assets.length === 0) return;
    const asset = result.assets[0];
    let base64 = asset.base64 ?? null;
    if (!base64 && Platform.OS !== "web") {
      try {
        base64 = await FileSystem.readAsStringAsync(asset.uri, { encoding: FileSystem.EncodingType.Base64 });
      } catch {
        base64 = null;
      }
    }
    if (!base64 && asset.uri.startsWith("data:")) base64 = asset.uri.split(",")[1] ?? null;
    if (!base64) {
      setError("画像を読み込めませんでした");
      return;
    }
    addShot(side, { uri: asset.uri, base64 });
  };

  const start = async () => {
    const entries = (Object.entries(shots) as [CardSide, Shot | null][]).filter((e): e is [CardSide, Shot] => e[1] !== null);
    if (entries.length === 0) return;
    setError(null);
    setAnalyzing({ done: 0, total: entries.length });
    const results: SideResult[] = [];
    const failures: string[] = [];
    await Promise.all(
      entries.map(async ([side, shot]) => {
        const cached = doneRef.current.get(shot.uri);
        if (cached) {
          results.push(cached);
          setAnalyzing((a) => (a ? { ...a, done: a.done + 1 } : a));
          return;
        }
        try {
          const prepared = shot.prepared ?? (await prepareScorecardImage(shot.uri, shot.base64));
          const res = await analyze.mutateAsync({ base64: prepared.base64, mimeType: prepared.mimeType, sideHint: side });
          if (res.success && res.card) {
            const r: SideResult = {
              side: res.side ?? side,
              card: res.card,
              conflicts: res.conflicts,
              warnings: res.warnings,
              preview: res.preview ?? prepared.base64,
              rectified: res.meta.rectified,
              blurry: res.meta.blurry,
            };
            doneRef.current.set(shot.uri, r);
            results.push(r);
          } else if (res.reason === "markers_not_found") {
            failures.push(`${SIDE_INFO[side].title}: 四隅の■が4つとも写っていません。カード全体が入るように撮り直してください`);
          } else {
            failures.push(`${SIDE_INFO[side].title}: 読み取れませんでした。明るい場所で撮り直してください`);
          }
        } catch (e) {
          failures.push(`${SIDE_INFO[side].title}: ${e instanceof Error ? e.message : String(e)}`);
        } finally {
          setAnalyzing((a) => (a ? { ...a, done: a.done + 1 } : a));
        }
      }),
    );
    setAnalyzing(null);
    if (failures.length > 0) {
      // 片面でも読めなかったら、読めた面だけで先へ進めずに撮り直してもらう（半端な保存を防ぐ）
      setError(failures.join("\n"));
      return;
    }
    // 同じ面が2つになったら撮影した枠の面を信じる
    if (results.length === 2 && results[0].side === results[1].side) {
      results[0].side = entries[0][0];
      results[1].side = entries[1][0];
    }
    results.sort((a, b) => (a.side === "out" ? -1 : 1) - (b.side === "out" ? -1 : 1));
    setOcrSession({ roundId, results });
    router.push("/ocr-review" as never);
  };

  // ─── 解析中 ───
  if (analyzing) {
    return (
      <ScreenContainer className="items-center justify-center p-6">
        <View style={[{ backgroundColor: colors.surface, borderRadius: 24, padding: 28, alignItems: "center", width: "100%", maxWidth: 380 }, shadowSm]}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "900", marginTop: 18 }}>読み取り中…</Text>
          <Text style={{ color: colors.muted, fontSize: 15, textAlign: "center", marginTop: 8, lineHeight: 22 }}>
            向きと傾きを補正し、チェック欄は画像から直接判定、数字は AI が2回読んで照合しています
          </Text>
          <Text style={{ color: colors.foreground, fontSize: 16, fontWeight: "800", marginTop: 16 }}>{`${analyzing.done} / ${analyzing.total} 面`}</Text>
        </View>
      </ScreenContainer>
    );
  }

  // ─── カメラ ───
  if (cameraFor) {
    if (!permission?.granted) {
      return (
        <ScreenContainer className="p-6 items-center justify-center">
          <IconSymbol name="camera.fill" size={48} color={colors.muted} />
          <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "900", marginTop: 12 }}>カメラの許可が必要です</Text>
          <Pressable onPress={requestPermission} style={{ marginTop: 16, backgroundColor: colors.primary, borderRadius: 14, minHeight: 48, paddingHorizontal: 20, justifyContent: "center" }}>
            <Text style={{ color: colors.onPrimary, fontSize: 16, fontWeight: "800" }}>カメラを許可</Text>
          </Pressable>
          <Pressable onPress={() => setCameraFor(null)} style={{ marginTop: 10, minHeight: 44, justifyContent: "center" }}>
            <Text style={{ color: colors.primary, fontSize: 16, fontWeight: "700" }}>戻る</Text>
          </Pressable>
        </ScreenContainer>
      );
    }
    const frameW = screenW * 0.92;
    const frameH = frameW / CARD_ASPECT;
    const DARK = "rgba(0,0,0,0.55)";
    return (
      <View style={{ flex: 1, backgroundColor: "#000" }}>
        <CameraView ref={cameraRef} style={{ flex: 1 }} facing="back" autofocus="on" enableTorch={torch}>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", padding: 12, paddingTop: Platform.OS === "ios" ? 56 : 24, backgroundColor: DARK }}>
              <Pressable onPress={() => setCameraFor(null)} accessibilityLabel="戻る" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <IconSymbol name="arrow.left" size={24} color="#FFFFFF" />
              </Pressable>
              <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "900" }}>{`${SIDE_INFO[cameraFor].title}（${SIDE_INFO[cameraFor].sub}）`}</Text>
              <Pressable onPress={() => setTorch((t) => !t)} accessibilityLabel="ライト" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
                <IconSymbol name={torch ? "bolt.fill" : "bolt.slash.fill"} size={22} color={torch ? "#FFD54F" : "#FFFFFF"} />
              </Pressable>
            </View>
            <View style={{ flex: 1, backgroundColor: DARK }} />
            <View style={{ flexDirection: "row", height: frameH }}>
              <View style={{ flex: 1, backgroundColor: DARK }} />
              <View style={{ width: frameW, borderWidth: 2, borderColor: "rgba(255,255,255,0.9)", borderRadius: 6 }}>
                {[
                  { top: "4%", left: "2.5%" },
                  { top: "4%", right: "2.5%" },
                  { bottom: "4%", left: "2.5%" },
                  { bottom: "4%", right: "2.5%" },
                ].map((pos, i) => (
                  <View key={i} pointerEvents="none" style={{ position: "absolute", width: 16, height: 16, borderWidth: 2, borderColor: "#FFD54F", ...(pos as object) }} />
                ))}
              </View>
              <View style={{ flex: 1, backgroundColor: DARK }} />
            </View>
            <View style={{ flex: 1, backgroundColor: DARK, alignItems: "center", justifyContent: "center", padding: 20 }}>
              <Text style={{ color: "#FFFFFF", fontSize: 16, fontWeight: "700", textAlign: "center", lineHeight: 24 }}>
                カードを横向きに置き、四隅の■を黄色い枠に合わせて{"\n"}真上から撮影してください
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-around", padding: 20, paddingBottom: Platform.OS === "ios" ? 44 : 24, backgroundColor: DARK }}>
              <Pressable onPress={() => void pick(cameraFor).then(() => setCameraFor(null))} accessibilityLabel="写真から選ぶ" style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: "rgba(255,255,255,0.18)", alignItems: "center", justifyContent: "center" }}>
                <IconSymbol name="photo.on.rectangle" size={24} color="#FFFFFF" />
              </Pressable>
              <Pressable onPress={() => void capture()} accessibilityLabel="撮影" style={{ width: 78, height: 78, borderRadius: 39, backgroundColor: "#FFFFFF", alignItems: "center", justifyContent: "center" }}>
                <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: colors.primary }} />
              </Pressable>
              <View style={{ width: 52 }} />
            </View>
          </View>
        </CameraView>
      </View>
    );
  }

  // ─── 概要（2面の枠） ───
  const count = (shots.out ? 1 : 0) + (shots.in ? 1 : 0);
  return (
    <ScreenContainer edges={["top", "left", "right", "bottom"]}>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 6 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="戻る" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontWeight: "900" }}>カードを読み取る</Text>
      </View>
      <ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: 24 }}>
        <View style={{ width: contentW, gap: 14, paddingTop: 8 }}>
          {isDemo && (
            <ErrorBanner title="デモモードでは読み取りを使えません" message="カードの読み取り（AI）はログインが必要です。デモでは手入力と分析をお試しください。" />
          )}
          {error && <ErrorBanner title="読み取りエラー" message={error} />}
          {notice && (
            <View style={{ padding: 12, borderRadius: 12, backgroundColor: `${colors.primary}14` }}>
              <Text style={{ color: colors.foreground, fontSize: 14 }}>{notice}</Text>
            </View>
          )}
          {(["out", "in"] as CardSide[]).map((side) => (
            <SlotCard
              key={side}
              side={side}
              shot={shots[side]}
              width={contentW}
              onCamera={() => setCameraFor(side)}
              onPick={() => void pick(side)}
              onRemove={() => setShots((p) => ({ ...p, [side]: null }))}
            />
          ))}
          <View style={{ padding: 14, borderRadius: 16, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, gap: 6 }}>
            <Text style={{ color: colors.foreground, fontSize: 15, fontWeight: "900" }}>きれいに読むコツ</Text>
            <Text style={{ color: colors.muted, fontSize: 14, lineHeight: 21 }}>
              ・四隅の■が4つとも写ればOK（逆さ・縦向きでも自動で直します）{"\n"}
              ・影が入らない明るい場所で、カードを平らに{"\n"}
              ・「■未検出」と出たら撮り直すと精度が上がります
            </Text>
          </View>
        </View>
      </ScrollView>
      <View style={{ padding: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.surface }}>
        <Pressable
          disabled={count === 0 || isDemo}
          onPress={() => void start()}
          accessibilityRole="button"
          style={[{ minHeight: 54, borderRadius: 16, alignItems: "center", justifyContent: "center", backgroundColor: colors.primary, opacity: count === 0 || isDemo ? 0.4 : 1 }, shadowPrimary]}
        >
          <Text style={{ color: colors.onPrimary, fontSize: 17, fontWeight: "900" }}>{count === 0 ? "カードを撮影してください" : `${count}面を読み取る`}</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

function SlotCard({ side, shot, width, onCamera, onPick, onRemove }: { side: CardSide; shot: Shot | null; width: number; onCamera: () => void; onPick: () => void; onRemove: () => void }) {
  const colors = useColors();
  const info = SIDE_INFO[side];
  const thumbW = Math.min(width - 32, 420);
  const p = shot?.prepared;
  const badge = !shot ? null : !p ? { text: "確認中…", color: colors.muted } : p.rectified ? { text: p.blur?.isBlurry ? "補正OK・ブレ?" : "補正OK", color: p.blur?.isBlurry ? colors.warning : colors.success } : Platform.OS === "web" ? { text: "■未検出", color: colors.warning } : { text: "撮影済み", color: colors.success };
  return (
    <View style={[{ backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border, gap: 12 }, shadowSm]}>
      <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8 }}>
        <Text style={{ color: colors.foreground, fontSize: 20, fontWeight: "900" }}>{info.title}</Text>
        <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "700" }}>{info.sub}</Text>
        {badge && (
          <View style={{ marginLeft: "auto", paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: `${badge.color}22` }}>
            <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "800" }}>{badge.text}</Text>
          </View>
        )}
      </View>
      {shot ? (
        <Image
          source={{ uri: p?.rectified ? `data:image/jpeg;base64,${p.base64}` : shot.uri }}
          style={{ width: thumbW, height: thumbW / CARD_ASPECT, borderRadius: 10, alignSelf: "center", backgroundColor: colors.background }}
          resizeMode="contain"
          accessibilityLabel={`${info.title}の写真`}
        />
      ) : (
        <Pressable onPress={onCamera} style={{ height: 120, borderRadius: 14, borderWidth: 2, borderStyle: "dashed", borderColor: colors.border, alignItems: "center", justifyContent: "center", gap: 6 }}>
          <IconSymbol name="camera.fill" size={28} color={colors.muted} />
          <Text style={{ color: colors.muted, fontSize: 15, fontWeight: "700" }}>タップして撮影</Text>
        </Pressable>
      )}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <SlotButton label={shot ? "撮り直す" : "撮影する"} icon="camera.fill" onPress={onCamera} />
        <SlotButton label={shot ? "写真" : "写真から選ぶ"} icon="photo.on.rectangle" onPress={onPick} />
        {shot && <SlotButton label="外す" icon="trash.fill" onPress={onRemove} />}
      </View>
    </View>
  );
}

function SlotButton({ label, icon, onPress }: { label: string; icon: "camera.fill" | "photo.on.rectangle" | "trash.fill"; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={{ flex: 1, flexDirection: "row", gap: 6, minHeight: 44, borderRadius: 12, borderWidth: 1, borderColor: colors.border, alignItems: "center", justifyContent: "center" }}>
      <IconSymbol name={icon} size={18} color={colors.primary} />
      <Text style={{ color: colors.foreground, fontSize: 14, fontWeight: "800" }}>{label}</Text>
    </Pressable>
  );
}
