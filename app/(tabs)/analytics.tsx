import { useCallback, useMemo, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  View,
  TouchableOpacity,
  LayoutAnimation,
  Platform,
  UIManager,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { BarChart, LineChart } from "@/components/analytics-charts";
import { useColors } from "@/hooks/use-colors";
import { cardShadow } from "@/lib/card-shadow";
import { hapticLight } from "@/lib/haptics";
import { getRoundsWithHoles } from "@/lib/storage";

// Android（旧アーキテクチャ）でLayoutAnimationを有効化
if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}
import {
  calculateAnalyticsSummary,
  generatePracticeInsights,
  getPeriodCutoffDate,
  getPlayedHoles,
  MIN_RELIABLE_PUTT_SAMPLE,
  MIN_RELIABLE_ROUND_SAMPLE,
} from "@/lib/analytics";
import { Round, MetadataAvgPuttsItem, LABELS } from "@/lib/types";

type Period = "week" | "month" | "year" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  week: "週",
  month: "月",
  year: "年",
  all: "全期間",
};

function toApiDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export default function AnalyticsScreen() {
  const colors = useColors();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [period, setPeriod] = useState<Period>("all");
  const [isLoading, setIsLoading] = useState(true);
  const requestIdRef = useRef(0);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    technique: true,
    environment: false,
    equipment: false,
  });

  const toggleGroup = (group: string) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    hapticLight();
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const loadData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    const cutoff = getPeriodCutoffDate(period);

    try {
      const loadedRounds = await getRoundsWithHoles(cutoff ? toApiDate(cutoff) : undefined);
      if (requestId !== requestIdRef.current) return;
      setRounds(loadedRounds);
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      console.error("[analytics] Failed to load rounds:", error);
      setRounds([]);
    } finally {
      if (requestId === requestIdRef.current) setIsLoading(false);
    }
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      return () => {
        requestIdRef.current++;
      };
    }, [loadData])
  );

  const summary = useMemo(() => calculateAnalyticsSummary(rounds), [rounds]);
  const practiceInsights = useMemo(() => generatePracticeInsights(rounds), [rounds]);
  const playedHoleCount = useMemo(
    () => rounds.reduce((sum, round) => sum + getPlayedHoles(round).length, 0),
    [rounds],
  );

  // チャート用データ配列を summary 単位で1回だけ生成（毎レンダーの再 map と
  // 新規参照によるチャートの再描画を防ぐ）。
  const chartData = useMemo(() => {
    return {
      trendAvg: summary.trend.map((t) => ({ label: t.label, value: t.avgPutts })),
      trendOnePutt: summary.trend.map((t) => ({ label: t.label, value: t.onePuttRate })),
      distance: summary.distanceStats.map((s) => ({
        label: s.range,
        value: s.rate,
        count: s.attempts,
      })),
      slopeUpDown: summary.slopeStats.map((s) => ({
        label: LABELS.slopeUpDownShort[s.slope],
        value: s.rate,
        count: s.attempts,
      })),
      slopeLeftRight: summary.slopeLeftRightStats.map((s) => ({
        label: LABELS.slopeLeftRightShort[s.slope],
        value: s.rate,
        count: s.attempts,
      })),
      greenSpeed: summary.greenSpeedStats.map((s) => ({
        label: s.speedRange,
        value: s.averagePutts,
        count: s.rounds,
      })),
    };
  }, [summary]);

  if (isLoading) {
    return (
      <ScreenContainer className="p-4">
        <Text className="text-2xl font-bold text-foreground mb-4">分析</Text>
        <PeriodSelector period={period} onSelect={setPeriod} />
        <Text className="text-muted text-center py-12">読み込み中...</Text>
      </ScreenContainer>
    );
  }

  if (rounds.length === 0) {
    return (
      <ScreenContainer className="p-4">
        <Text className="text-2xl font-bold text-foreground mb-4">分析</Text>
        <PeriodSelector period={period} onSelect={setPeriod} />
        <View className="flex-1 items-center justify-center">
          <IconSymbol name="chart.bar.fill" size={64} color={colors.muted} />
          <Text className="text-foreground font-semibold text-lg mt-4">
            データがありません
          </Text>
          <Text className="text-muted text-sm mt-2 text-center">
            ラウンドデータを記録すると{"\n"}分析結果が表示されます
          </Text>
        </View>
      </ScreenContainer>
    );
  }

  return (
    <ScreenContainer>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View className="p-4 gap-4">
          <Text className="text-2xl font-bold text-foreground">分析</Text>

          <PeriodSelector period={period} onSelect={setPeriod} />

          {playedHoleCount < MIN_RELIABLE_PUTT_SAMPLE && (
            <View
              className="rounded-xl p-3 border"
              style={{
                backgroundColor: colors.warning + "14",
                borderColor: colors.warning + "55",
              }}
            >
              <Text style={{ color: colors.warning, fontWeight: "600" }}>
                参考値：現在のサンプルは{playedHoleCount}ホールです
              </Text>
              <Text className="text-muted text-xs mt-1">
                {MIN_RELIABLE_PUTT_SAMPLE}ホール以上で傾向の信頼性が高まります
              </Text>
            </View>
          )}

          {/* サマリーカード（常時表示） */}
          <View className="bg-surface rounded-2xl p-4 border border-border" style={cardShadow}>
            <Text className="text-lg font-semibold text-foreground mb-4">
              パフォーマンスサマリー
            </Text>
            <View className="flex-row flex-wrap gap-y-4">
              <SummaryItem
                label="ラウンド数"
                value={summary.totalRounds.toString()}
                unit="回"
              />
              <SummaryItem
                label="平均パット"
                value={summary.averagePutts.toFixed(2)}
                unit="/H"
              />
              <SummaryItem
                label="1パット率"
                value={summary.onePuttRate.toFixed(1)}
                unit="%"
                highlight
              />
              <SummaryItem
                label="3パット率"
                value={summary.threePuttRate.toFixed(1)}
                unit="%"
                warning={summary.threePuttRate > 10}
              />
            </View>
          </View>

          {/* データから導く次のアクション */}
          {practiceInsights.length > 0 && (
            <View className="bg-surface rounded-2xl p-4 border border-border" style={cardShadow}>
              <Text className="text-lg font-semibold text-foreground">今回の課題トップ3</Text>
              <Text className="text-muted text-sm mt-1 mb-3">
                記録データから改善余地の大きい順に提案します
              </Text>
              {practiceInsights.map((insight, index) => (
                <View
                  key={insight.id}
                  className="py-3 border-t border-border"
                  style={{ flexDirection: "row", gap: 12 }}
                >
                  <View
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 14,
                      backgroundColor: colors.primary,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Text style={{ color: "white", fontWeight: "700" }}>{index + 1}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text className="text-foreground font-semibold">{insight.title}</Text>
                    <Text className="text-muted text-xs mt-1">{insight.summary}</Text>
                    {insight.sampleSize < MIN_RELIABLE_PUTT_SAMPLE && (
                      <Text style={{ color: colors.warning, fontSize: 11, marginTop: 3 }}>
                        サンプル少数・参考値
                      </Text>
                    )}
                    <Text className="text-foreground text-sm mt-2">練習：{insight.practice}</Text>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* スコア推移（時系列・常時表示） */}
          <View className="bg-surface rounded-2xl p-4 border border-border" style={cardShadow}>
            <Text className="text-lg font-semibold text-foreground mb-1">
              平均パット推移（/H）
            </Text>
            <LineChart
              data={chartData.trendAvg}
              color={colors.primary}
              unit="/H"
              decimals={2}
            />
            <Text className="text-lg font-semibold text-foreground mb-1 mt-4">
              1パット率推移（%）
            </Text>
            <LineChart
              data={chartData.trendOnePutt}
              color={colors.success}
              unit="%"
              decimals={0}
              yMin={0}
              yMax={100}
            />
          </View>

          {/* ── グループA: パット技術 ── */}
          <SectionGroup
            title="パット技術"
            groupKey="technique"
            expanded={expandedGroups.technique}
            onToggle={toggleGroup}
            sectionCount={3}
            colors={colors}
          >
            {/* 距離別成功率 */}
            <View className="bg-surface rounded-2xl p-4 border border-border" style={cardShadow}>
              <Text className="text-lg font-semibold text-foreground mb-4">
                距離別カップイン率（1stパット）
              </Text>
              <BarChart
                data={chartData.distance}
                color={colors.primary}
                maxValue={100}
                unit="%"
                referenceThreshold={MIN_RELIABLE_PUTT_SAMPLE}
              />
            </View>

            {/* 傾斜別成功率（上下） */}
            <View className="bg-surface rounded-2xl p-4 border border-border" style={cardShadow}>
              <Text className="text-lg font-semibold text-foreground mb-4">
                傾斜別カップイン率 - 上下（1stパット）
              </Text>
              <BarChart
                data={chartData.slopeUpDown}
                color={colors.accent}
                maxValue={100}
                unit="%"
                referenceThreshold={MIN_RELIABLE_PUTT_SAMPLE}
              />
            </View>

            {/* 左右傾斜別成功率 */}
            <View className="bg-surface rounded-2xl p-4 border border-border" style={cardShadow}>
              <Text className="text-lg font-semibold text-foreground mb-4">
                傾斜別カップイン率 - 左右（1stパット）
              </Text>
              <BarChart
                data={chartData.slopeLeftRight}
                color={colors.accent}
                maxValue={100}
                unit="%"
                referenceThreshold={MIN_RELIABLE_PUTT_SAMPLE}
              />
            </View>
          </SectionGroup>

          {/* ── グループB: 環境要因 ── */}
          <SectionGroup
            title="環境要因"
            groupKey="environment"
            expanded={expandedGroups.environment}
            onToggle={toggleGroup}
            sectionCount={4}
            colors={colors}
          >
            {/* グリーンスピード別 */}
            <View className="bg-surface rounded-2xl p-4 border border-border" style={cardShadow}>
              <Text className="text-lg font-semibold text-foreground mb-4">
                グリーンスピード別平均パット
              </Text>
              <BarChart
                data={chartData.greenSpeed}
                color={colors.primary}
                unit="/H"
                decimals={2}
                referenceThreshold={MIN_RELIABLE_ROUND_SAMPLE}
              />
            </View>

            <MetadataSection title="芝の種類別平均パット" data={summary.grassTypeStats} />
            <MetadataSection title="天候別平均パット" data={summary.weatherStats} />
            <MetadataSection title="コース別平均パット" data={summary.courseStats} />
          </SectionGroup>

          {/* ── グループC: 装備 ── */}
          <SectionGroup
            title="装備"
            groupKey="equipment"
            expanded={expandedGroups.equipment}
            onToggle={toggleGroup}
            sectionCount={1}
            colors={colors}
          >
            <MetadataSection title="パター別平均パット" data={summary.putterStats} />
          </SectionGroup>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function PeriodSelector({
  period,
  onSelect,
}: {
  period: Period;
  onSelect: (p: Period) => void;
}) {
  const periods: Period[] = ["week", "month", "year", "all"];

  return (
    <View className="flex-row bg-surface rounded-xl p-1 border border-border">
      {periods.map((p) => (
        <TouchableOpacity
          key={p}
          className={`flex-1 py-2 rounded-lg ${
            period === p ? "bg-primary" : ""
          }`}
          onPress={() => onSelect(p)}
          activeOpacity={0.8}
        >
          <Text
            className={`text-center font-medium ${
              period === p ? "text-white" : "text-muted"
            }`}
          >
            {PERIOD_LABELS[p]}
          </Text>
        </TouchableOpacity>
      ))}
    </View>
  );
}

function SummaryItem({
  label,
  value,
  unit,
  highlight,
  warning,
}: {
  label: string;
  value: string;
  unit: string;
  highlight?: boolean;
  warning?: boolean;
}) {
  return (
    <View className="w-1/2 items-center">
      <Text
        className={`text-3xl font-bold ${
          highlight ? "text-success" : warning ? "text-error" : "text-foreground"
        }`}
      >
        {value}
        <Text className="text-lg">{unit}</Text>
      </Text>
      <Text className="text-muted text-sm mt-1">{label}</Text>
    </View>
  );
}

function SectionGroup({
  title,
  groupKey,
  expanded,
  onToggle,
  children,
  sectionCount,
  colors,
}: {
  title: string;
  groupKey: string;
  expanded: boolean;
  onToggle: (key: string) => void;
  children: React.ReactNode;
  sectionCount: number;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View>
      <TouchableOpacity
        className="flex-row items-center justify-between bg-surface rounded-xl px-4 py-3 border border-border"
        onPress={() => onToggle(groupKey)}
        activeOpacity={0.7}
      >
        <View className="flex-row items-center" style={{ gap: 8 }}>
          <IconSymbol
            name="chevron.right"
            size={16}
            color={colors.muted}
            style={{ transform: [{ rotate: expanded ? "90deg" : "0deg" }] }}
          />
          <Text className="text-lg font-semibold text-foreground">{title}</Text>
        </View>
        <Text className="text-muted text-sm">{sectionCount}項目</Text>
      </TouchableOpacity>
      {expanded && (
        <View style={{ gap: 16, marginTop: 16 }}>
          {children}
        </View>
      )}
    </View>
  );
}

function MetadataSection({
  title,
  data,
}: {
  title: string;
  data: MetadataAvgPuttsItem[];
}) {
  const maxValue = Math.max(...data.map((d) => d.averagePutts), 0);
  return (
    <View className="bg-surface rounded-2xl p-4 border border-border" style={cardShadow}>
      <Text className="text-lg font-semibold text-foreground mb-4">
        {title}
      </Text>
      {data.length > 0 ? (
        data.map((stat) => {
          const barWidth = maxValue > 0 ? (stat.averagePutts / maxValue) * 100 : 0;
          return (
            <View
              key={stat.label}
              className="py-2 border-b border-border"
            >
              <View className="flex-row items-center justify-between mb-1">
                <Text className="text-foreground flex-1" numberOfLines={1}>
                  {stat.label}
                </Text>
                <View className="flex-row items-baseline">
                  <Text className="text-xl font-bold text-foreground">
                    {stat.averagePutts.toFixed(2)}
                  </Text>
                  <Text className="text-muted text-sm ml-1">/H</Text>
                  <Text className="text-muted text-xs ml-2">
                    ({stat.rounds}R{stat.rounds < MIN_RELIABLE_ROUND_SAMPLE ? "・参考" : ""})
                  </Text>
                </View>
              </View>
              <View className="w-full h-1.5 bg-border rounded-full overflow-hidden">
                <View
                  className="h-full bg-primary rounded-full"
                  style={{ width: `${barWidth}%` }}
                />
              </View>
            </View>
          );
        })
      ) : (
        <Text className="text-muted text-center py-4">データなし</Text>
      )}
    </View>
  );
}
