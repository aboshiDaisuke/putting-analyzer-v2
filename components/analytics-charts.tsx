import React, { useState } from "react";
import { View, Text, LayoutChangeEvent } from "react-native";
import Svg, { Line, Rect, Path, Circle, Text as SvgText } from "react-native-svg";
import { useColors } from "@/hooks/use-colors";

// 共通: グリッド本数（線は GRID_STEPS + 1 本）
const GRID_STEPS = 4;

type Colors = ReturnType<typeof useColors>;

// onLayout で測った幅を保持する共通フック。同じ幅での無駄な再描画は避ける。
function useChartWidth() {
  const [width, setWidth] = useState(0);
  const onLayout = (e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    setWidth((prev) => (prev === w ? prev : w));
  };
  return { width, onLayout };
}

// 共通: 水平グリッド線 + 左側のY軸ラベル。valueAt(t) で各目盛りの値を決める。
function GridLines({
  width,
  padTop,
  padLeft,
  padRight,
  plotH,
  decimals,
  valueAt,
  colors,
}: {
  width: number;
  padTop: number;
  padLeft: number;
  padRight: number;
  plotH: number;
  decimals: number;
  valueAt: (t: number) => number;
  colors: Colors;
}) {
  return (
    <>
      {Array.from({ length: GRID_STEPS + 1 }).map((_, i) => {
        const t = i / GRID_STEPS;
        const y = padTop + plotH * (1 - t);
        return (
          <React.Fragment key={`g${i}`}>
            <Line
              x1={padLeft}
              y1={y}
              x2={width - padRight}
              y2={y}
              stroke={colors.border}
              strokeWidth={1}
            />
            <SvgText
              x={padLeft - 4}
              y={y + 3}
              fill={colors.muted}
              fontSize={9}
              textAnchor="end"
            >
              {valueAt(t).toFixed(decimals)}
            </SvgText>
          </React.Fragment>
        );
      })}
    </>
  );
}

export interface BarDatum {
  label: string;
  value: number;
  count?: number; // 試行数（n=）。未指定なら非表示。0件は描画から除外される。
}

/**
 * 縦棒グラフ（自作・react-native-svg）。
 * カップイン率（0-100%）や平均パット（/H）などに使う。
 * maxValue 未指定時はデータ最大値に自動スケール。
 */
function BarChartImpl({
  data,
  color,
  maxValue,
  unit = "",
  decimals = 0,
  height = 200,
  referenceThreshold,
}: {
  data: BarDatum[];
  color: string;
  maxValue?: number;
  unit?: string;
  decimals?: number;
  height?: number;
  referenceThreshold?: number;
}) {
  const colors = useColors();
  const { width, onLayout } = useChartWidth();

  // count が定義されている場合は 0 件を除外（未定義なら常に表示）
  const items = data.filter((d) => d.count === undefined || d.count > 0);
  const max = maxValue ?? Math.max(...items.map((d) => d.value), 1);

  if (items.length === 0) {
    return <Text className="text-muted text-center py-4">データなし</Text>;
  }

  const padTop = 18;
  const padBottom = 36;
  const padLeft = 34;
  const padRight = 8;
  const plotW = Math.max(width - padLeft - padRight, 0);
  const plotH = height - padTop - padBottom;
  const slot = plotW / items.length;
  const barW = Math.min(slot * 0.56, 44);

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <GridLines
            width={width}
            padTop={padTop}
            padLeft={padLeft}
            padRight={padRight}
            plotH={plotH}
            decimals={decimals}
            valueAt={(t) => max * t}
            colors={colors}
          />

          {/* 棒 + 値ラベル + X軸ラベル */}
          {items.map((d, i) => {
            const cx = padLeft + slot * i + slot / 2;
            const h = plotH * Math.min(d.value / max, 1);
            const y = padTop + plotH - h;
            return (
              <React.Fragment key={d.label}>
                <Rect
                  x={cx - barW / 2}
                  y={y}
                  width={barW}
                  height={Math.max(h, 1)}
                  rx={3}
                  fill={color}
                />
                <SvgText
                  x={cx}
                  y={y - 4}
                  fill={colors.foreground}
                  fontSize={10}
                  fontWeight="bold"
                  textAnchor="middle"
                >
                  {`${d.value.toFixed(decimals)}${unit}`}
                </SvgText>
                <SvgText
                  x={cx}
                  y={height - padBottom + 14}
                  fill={colors.muted}
                  fontSize={9}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
                {d.count !== undefined && (
                  <SvgText
                    x={cx}
                    y={height - padBottom + 25}
                    fill={colors.muted}
                    fontSize={8}
                    textAnchor="middle"
                  >
                    {`n=${d.count}${
                      referenceThreshold !== undefined && d.count < referenceThreshold
                        ? "・参考"
                        : ""
                    }`}
                  </SvgText>
                )}
              </React.Fragment>
            );
          })}
        </Svg>
      )}
    </View>
  );
}

export const BarChart = React.memo(BarChartImpl);

export interface LinePoint {
  label: string;
  value: number;
}

/**
 * 折れ線グラフ（自作・react-native-svg）。ラウンドごとの推移などに使う。
 * yMin/yMax 未指定時はデータ範囲に余白を付けて自動スケール。
 */
function LineChartImpl({
  data,
  color,
  unit = "",
  decimals = 2,
  yMin,
  yMax,
  height = 200,
}: {
  data: LinePoint[];
  color: string;
  unit?: string;
  decimals?: number;
  yMin?: number;
  yMax?: number;
  height?: number;
}) {
  const colors = useColors();
  const { width, onLayout } = useChartWidth();

  if (data.length < 2) {
    return (
      <Text className="text-muted text-center py-4">
        データが2件以上で表示されます
      </Text>
    );
  }

  const values = data.map((d) => d.value);
  let lo = yMin ?? Math.min(...values);
  let hi = yMax ?? Math.max(...values);
  if (lo === hi) {
    lo -= 1;
    hi += 1;
  } else if (yMin === undefined && yMax === undefined) {
    const pad = (hi - lo) * 0.15;
    lo -= pad;
    hi += pad;
  }

  const padTop = 16;
  const padBottom = 28;
  const padLeft = 36;
  const padRight = 12;
  const plotW = Math.max(width - padLeft - padRight, 0);
  const plotH = height - padTop - padBottom;

  const xFor = (i: number) => padLeft + (plotW * i) / (data.length - 1);
  const yFor = (v: number) => padTop + plotH * (1 - (v - lo) / (hi - lo));

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"} ${xFor(i)} ${yFor(d.value)}`)
    .join(" ");

  // X軸ラベルは先頭・中央・末尾のみ（重なり防止）
  const labelIdx = new Set([0, Math.floor((data.length - 1) / 2), data.length - 1]);

  return (
    <View onLayout={onLayout}>
      {width > 0 && (
        <Svg width={width} height={height}>
          <GridLines
            width={width}
            padTop={padTop}
            padLeft={padLeft}
            padRight={padRight}
            plotH={plotH}
            decimals={decimals}
            valueAt={(t) => lo + (hi - lo) * t}
            colors={colors}
          />

          {/* 折れ線 */}
          <Path d={linePath} stroke={color} strokeWidth={2.5} fill="none" />

          {/* データ点 + X軸ラベル */}
          {data.map((d, i) => (
            <React.Fragment key={`p${i}`}>
              <Circle cx={xFor(i)} cy={yFor(d.value)} r={3} fill={color} />
              {labelIdx.has(i) && (
                <SvgText
                  x={xFor(i)}
                  y={height - padBottom + 16}
                  fill={colors.muted}
                  fontSize={9}
                  textAnchor="middle"
                >
                  {d.label}
                </SvgText>
              )}
            </React.Fragment>
          ))}

          {/* 末尾の値を強調表示 */}
          <SvgText
            x={xFor(data.length - 1)}
            y={yFor(data[data.length - 1].value) - 8}
            fill={colors.foreground}
            fontSize={11}
            fontWeight="bold"
            textAnchor="end"
          >
            {`${data[data.length - 1].value.toFixed(decimals)}${unit}`}
          </SvgText>
        </Svg>
      )}
    </View>
  );
}

export const LineChart = React.memo(LineChartImpl);
