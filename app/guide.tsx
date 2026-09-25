/**
 * 分析の見方（アプリ内ガイド）。docs/ANALYTICS.md の利用者向け要約。
 */
import type { ReactNode } from "react";
import { Pressable, ScrollView, Text, View, useWindowDimensions } from "react-native";
import { useRouter } from "expo-router";

import { ScreenContainer } from "@/components/screen-container";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { Chip } from "@/components/analysis/ui";
import { useColors } from "@/hooks/use-colors";
import { useBaseline } from "@/hooks/use-baseline";
import { BASELINES, baselineMakeRate, expectedPutts, type BaselineId } from "@/lib/putting-stats";

const TABLE_METERS = [0.5, 1, 1.5, 2, 3, 5, 8, 12, 18];

export default function GuideScreen() {
  const router = useRouter();
  const colors = useColors();
  const { width } = useWindowDimensions();
  const contentW = Math.min(width, 720) - 32;
  const [baseline, setBaseline] = useBaseline();

  return (
    <ScreenContainer>
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 6 }}>
        <Pressable onPress={() => router.back()} accessibilityLabel="戻る" style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center" }}>
          <IconSymbol name="arrow.left" size={24} color={colors.foreground} />
        </Pressable>
        <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 18, fontWeight: "900" }}>分析の見方</Text>
      </View>
      <ScrollView contentContainerStyle={{ alignItems: "center", paddingBottom: 40 }}>
        <View style={{ width: contentW, gap: 22, paddingTop: 8 }}>
          <Section title="1. 何が分かるのか">
            <P>
              カードに「何のパットか・距離・傾斜・曲がり・短/長・パット数」を書いて撮影すると、
              どの距離・どのラインで何打失っているか、そして何を練習すれば1ラウンドのスコアが一番縮むかが分かります。
            </P>
          </Section>

          <Section title="2. 平均パット数だけでは分からない理由">
            <P>
              パット数はアプローチの寄り方に大きく左右されます。パーオンを多くすると1st パットが遠くなり、パット数は増えがちです。
              そこでこのアプリは、同じ距離から打った「基準のゴルファー」と比べて得をしたか損をしたか（ストロークス・ゲインド）で評価します。
            </P>
          </Section>

          <Section title="3. ストロークス・ゲインド（損得）">
            <P>
              基準のゴルファーが「その距離から平均何打で入れるか」を期待パット数といいます。1打ごとに
              「打つ前の期待パット数 − 1 − 打った後の期待パット数」を足していくと、そのパットで何打得した/損したかになります。
            </P>
            <Example>
              例（ツアー基準）：8m から 2パット。8m の期待値は約1.94打 → 1.94 − 2 = −0.06打（ほぼ平均）。{"\n"}
              その内訳は、1打目（8m → 1m に寄せた）＝ 1.94 − 1 − 1.07 = −0.13打、2打目（1m を入れた）＝ 1.07 − 1 = +0.07打。
            </Example>
            <P>カード v3 は全パットの距離を書くので、「寄せ」と「決め」を1打ずつ分けて評価できます。</P>
          </Section>

          <Section title="4. パット数の内訳">
            <P>
              分析タブの「実際 = 距離の難しさ ± 腕前の差」は、あなたの1ラウンドのパット数を
              「同じ1st パットの距離から基準のゴルファーが打った場合のパット数」と「それとの差（腕前）」に分けたものです。
              距離の難しさが大きい人はアプローチを、腕前の差が大きい人はパッティングを練習するのが近道です。
            </P>
          </Section>

          <Section title="5. 練習の優先順位">
            <P>
              損得を「〜2m（決め切る）」「2〜6m（チャンス）」「6m〜（寄せる）」と、ライン（上り・下り・曲がり）ごとに集計し、
              1ラウンドあたり失っている打数が大きい順に3つまで出します。それぞれに練習メニューを付けています。
            </P>
          </Section>

          <Section title="6. グリーンマップ">
            <P>
              1st パットを「どこから打ったか」を1枚の仮想グリーンに並べたものです。グリーンは手前に向かって下っていると考え、
              上りのパットはカップの手前、下りは奥、左に曲がるラインはカップの右側に置いています（距離は実際の距離）。
              金＝1パット、白＝2パット、赤＝3パット以上。赤が固まっている場所が苦手なシチュエーションです。
            </P>
          </Section>

          <Section title="7. 距離別カップイン率と「95%の幅」">
            <P>
              1st に限らず全パットの成功率です。回数が少ないと偶然の影響が大きいので、「本当の実力はこの範囲にありそう」という幅を縦線で出しています。
              幅が長いうちは、もう少し記録がたまってから判断しましょう。目安は5ラウンド（約90ホール）以上です。
            </P>
          </Section>

          <Section title="8. ロングパットと ショート / オーバー">
            <P>
              6m 以上の 1st パットで、平均の残り距離・1m 以内に寄った割合・3パット率を見ます。
              カードの「短/長」を付けておくと、外れたときにショートとオーバーのどちらが多いかも分かります。
              ショートばかりなら「届かせる」距離感、オーバーが多く返しが長いならタッチの強さを見直すサインです。
            </P>
          </Section>

          <Section title="9. 何のパットだったか">
            <P>
              バーディパットを1パットで決めた割合（バーディ奪取率）、パーパットを1パットで決めた割合（パーセーブ率）、
              パーオンしたホール（何のパット＝バーディ/イーグル）の平均パット数を出します。
            </P>
          </Section>

          <Section title="10. 比べる相手（基準）">
            <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              {(Object.keys(BASELINES) as BaselineId[]).map((b) => (
                <Chip key={b} label={BASELINES[b].label} selected={baseline === b} onPress={() => setBaseline(b)} />
              ))}
            </View>
            <P>{`${BASELINES[baseline].label}：${BASELINES[baseline].note}。`}</P>
            <View style={{ borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: "hidden", marginTop: 8 }}>
              <Row cells={["距離", "期待パット数", "1パット率"]} head />
              {TABLE_METERS.map((m) => (
                <Row key={m} cells={[`${m}m`, expectedPutts(m, baseline).toFixed(2), `${baselineMakeRate(m, baseline).toFixed(0)}%`]} />
              ))}
            </View>
            <P>HC0・HC15 の値はツアー基準から作った概算です。自分の成長を見るときは基準を固定して推移を見てください。</P>
          </Section>

          <Section title="11. カードの書き方">
            <P>
              ・1ホール1行。何のパット？は1打目のパットが入れば何のスコアかに ✓{"\n"}
              ・距離は歩測でOK（1st は整数 m、2nd・3rd は 1.5 のように小数1桁）{"\n"}
              ・傾斜（平/上/下）と曲がり（直/左/右）は分かる範囲で。1st が外れたら 短/長 に ✓{"\n"}
              ・計にそのホールの総パット数。4パット以上も書けます{"\n"}
              ・ラウンド中の記録はゴルフ規則 4.3a で認められています（記録をラウンド中の判断に使うのは不可）
            </P>
          </Section>
        </View>
      </ScrollView>
    </ScreenContainer>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ gap: 8 }}>
      <Text accessibilityRole="header" style={{ color: colors.foreground, fontSize: 19, fontWeight: "900" }}>{title}</Text>
      {children}
    </View>
  );
}

function P({ children }: { children: ReactNode }) {
  const colors = useColors();
  return <Text style={{ color: colors.foreground, fontSize: 16, lineHeight: 26 }}>{children}</Text>;
}

function Example({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <View style={{ padding: 14, borderRadius: 14, backgroundColor: colors.surface, borderLeftWidth: 4, borderLeftColor: colors.accent }}>
      <Text style={{ color: colors.foreground, fontSize: 15, lineHeight: 24 }}>{children}</Text>
    </View>
  );
}

function Row({ cells, head }: { cells: string[]; head?: boolean }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", backgroundColor: head ? colors.background : colors.surface, borderTopWidth: head ? 0 : 1, borderTopColor: colors.border }}>
      {cells.map((c, i) => (
        <Text
          key={i}
          style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, textAlign: i === 0 ? "left" : "right", color: head ? colors.muted : colors.foreground, fontSize: 15, fontWeight: head ? "800" : "600", fontVariant: ["tabular-nums"] }}
        >
          {c}
        </Text>
      ))}
    </View>
  );
}
