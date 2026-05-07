import { useCallback, useState } from "react";
import { ScrollView, Text, View, TouchableOpacity, Dimensions } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";
import { getRounds } from "@/lib/storage";
import {
  calculateAnalyticsSummary,
  filterRoundsByPeriod,
  formatPercentage,
} from "@/lib/analytics";
import { Round, AnalyticsSummary, MetadataAvgPuttsItem, LABELS } from "@/lib/types";

type Period = "week" | "month" | "year" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  week: "週",
  month: "月",
  year: "年",
  all: "全期間",
};

export default function AnalyticsScreen() {
  const colors = useColors();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [period, setPeriod] = useState<Period>("all");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    technique: true,
    environment: false,
    mental: false,
  });

  const toggleGroup = (group: string) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const loadData = useCallback(async () => {
    const allRounds = await getRounds();
    setRounds(allRounds);
    const filtered = filterRoundsByPeriod(allRounds, period);
    setSummary(calculateAnalyticsSummary(filtered));
  }, [period]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  const filteredRounds = filterRoundsByPeriod(rounds, period);

  if (!summary || filteredRounds.length === 0) {
    return (
      <ScreenContainer className="p-4">
        <Text className="text-2xl font-bold text-foreground mb-4">分析</Text>
        <PeriodSelector period={period} onSelect={setPeriod} />
        <View className="flex-1 items-center justify-center">
          <Text className="text-muted text-lg">データがありません</Text>
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

          {/* サマリーカード（常時表示） */}
          <View className="bg-surface rounded-2xl p-4 border border-border">
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

          {/* ── グループA: パット技術 ── */}
          <SectionGroup
            title="パット技術"
            groupKey="technique"
            expanded={expandedGroups.technique}
            onToggle={toggleGroup}
            sectionCount={5}
            colors={colors}
          >
            {/* 距離別成功率 */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-lg font-semibold text-foreground mb-4">
                距離別カップイン率（1stパット）
              </Text>
              {summary.distanceStats
                .filter((s) => s.attempts > 0)
                .map((stat) => (
                  <BarRow
                    key={stat.range}
                    label={stat.range}
                    value={stat.rate}
                    count={stat.attempts}
                    color={colors.primary}
                  />
                ))}
              {summary.distanceStats.every((s) => s.attempts === 0) && (
                <Text className="text-muted text-center py-4">データなし</Text>
              )}
            </View>

            {/* 傾斜別成功率（上下） */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-lg font-semibold text-foreground mb-4">
                傾斜別カップイン率 - 上下（1stパット）
              </Text>
              {summary.slopeStats
                .filter((s) => s.attempts > 0)
                .map((stat) => (
                  <BarRow
                    key={stat.slope}
                    label={LABELS.slopeUpDown[stat.slope]}
                    value={stat.rate}
                    count={stat.attempts}
                    color={colors.accent}
                  />
                ))}
              {summary.slopeStats.every((s) => s.attempts === 0) && (
                <Text className="text-muted text-center py-4">データなし</Text>
              )}
            </View>

            {/* 左右傾斜別成功率 */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-lg font-semibold text-foreground mb-4">
                傾斜別カップイン率 - 左右（1stパット）
              </Text>
              {summary.slopeLeftRightStats
                .filter((s) => s.attempts > 0)
                .map((stat) => (
                  <BarRow
                    key={stat.slope}
                    label={LABELS.slopeLeftRight[stat.slope]}
                    value={stat.rate}
                    count={stat.attempts}
                    color={colors.accent}
                  />
                ))}
              {summary.slopeLeftRightStats.every((s) => s.attempts === 0) && (
                <Text className="text-muted text-center py-4">データなし</Text>
              )}
            </View>

            {/* タッチ強度別カップイン率 */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-lg font-semibold text-foreground mb-4">
                タッチ強度別カップイン率（1stパット）
              </Text>
              {summary.touchStats
                .filter((s) => s.attempts > 0)
                .map((stat) => (
                  <BarRow
                    key={stat.touch}
                    label={LABELS.puttStrength[stat.touch]}
                    value={stat.rate}
                    count={stat.attempts}
                    color={colors.warning}
                  />
                ))}
              {summary.touchStats.every((s) => s.attempts === 0) && (
                <Text className="text-muted text-center py-4">データなし</Text>
              )}
            </View>

            {/* ミス方向別傾向 */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-lg font-semibold text-foreground mb-4">
                ミス方向別傾向（全パット・ミスのみ）
              </Text>
              {summary.missedDirectionStats
                .filter((s) => s.count > 0)
                .map((stat) => (
                  <BarRow
                    key={stat.direction}
                    label={`方向 ${stat.direction}`}
                    value={stat.rate}
                    count={stat.count}
                    color={colors.error}
                  />
                ))}
              {summary.missedDirectionStats.every((s) => s.count === 0) && (
                <Text className="text-muted text-center py-4">データなし</Text>
              )}
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
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-lg font-semibold text-foreground mb-4">
                グリーンスピード別平均パット
              </Text>
              {summary.greenSpeedStats
                .filter((s) => s.rounds > 0)
                .map((stat, _, arr) => {
                  const maxValue = Math.max(...arr.map((s) => s.averagePutts), 0);
                  const barWidth = maxValue > 0 ? (stat.averagePutts / maxValue) * 100 : 0;
                  return (
                    <View
                      key={stat.speedRange}
                      className="py-2 border-b border-border"
                    >
                      <View className="flex-row items-center justify-between mb-1">
                        <Text className="text-foreground">{stat.speedRange}</Text>
                        <View className="flex-row items-baseline">
                          <Text className="text-xl font-bold text-foreground">
                            {stat.averagePutts.toFixed(2)}
                          </Text>
                          <Text className="text-muted text-sm ml-1">/H</Text>
                          <Text className="text-muted text-xs ml-2">
                            ({stat.rounds}R)
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
                })}
              {summary.greenSpeedStats.every((s) => s.rounds === 0) && (
                <Text className="text-muted text-center py-4">データなし</Text>
              )}
            </View>

            <MetadataSection title="芝の種類別平均パット" data={summary.grassTypeStats} />
            <MetadataSection title="天候別平均パット" data={summary.weatherStats} />
            <MetadataSection title="コース別平均パット" data={summary.courseStats} />
          </SectionGroup>

          {/* ── グループC: メンタル・装備 ── */}
          <SectionGroup
            title="メンタル・装備"
            groupKey="mental"
            expanded={expandedGroups.mental}
            onToggle={toggleGroup}
            sectionCount={2}
            colors={colors}
          >
            {/* 心理状態別 */}
            <View className="bg-surface rounded-2xl p-4 border border-border">
              <Text className="text-lg font-semibold text-foreground mb-4">
                心理状態別カップイン率（1stパット）
              </Text>
              {summary.mentalStats
                .filter((s) => s.attempts > 0)
                .map((stat) => (
                  <BarRow
                    key={stat.state}
                    label={LABELS.mentalState[stat.state]}
                    value={stat.rate}
                    count={stat.attempts}
                    color={
                      (stat.state === 'P' || stat.state === 1 || stat.state === 2)
                        ? colors.success
                        : (stat.state === 'N' || stat.state === 4 || stat.state === 5)
                        ? colors.error
                        : colors.warning
                    }
                  />
                ))}
              {summary.mentalStats.every((s) => s.attempts === 0) && (
                <Text className="text-muted text-center py-4">データなし</Text>
              )}
            </View>

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
    <View className="bg-surface rounded-2xl p-4 border border-border">
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
                    ({stat.rounds}R)
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

function BarRow({
  label,
  value,
  count,
  color,
}: {
  label: string;
  value: number;
  count: number;
  color: string;
}) {
  const screenWidth = Dimensions.get("window").width;
  const maxBarWidth = screenWidth - 180;
  const barWidth = Math.max((value / 100) * maxBarWidth, 4);

  return (
    <View className="flex-row items-center py-2 border-b border-border">
      <Text className="text-foreground w-24">{label}</Text>
      <View className="flex-1 flex-row items-center">
        <View
          style={{
            width: barWidth,
            height: 20,
            backgroundColor: color,
            borderRadius: 4,
          }}
        />
        <Text className="text-foreground font-semibold ml-2">
          {formatPercentage(value)}
        </Text>
      </View>
      <Text className="text-muted text-xs w-12 text-right">n={count}</Text>
    </View>
  );
}
