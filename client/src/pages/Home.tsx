/*
 * 东航危险品运价对比工具 - 主页面
 * 设计：清晰工具型界面
 * - 暖白底色 + 石墨灰文字
 * - 三色年份区分：靛蓝(2024)、翠绿(2025)、琥珀(2026)
 * - 顶部筛选 → 代理报价表 → 中部折线图 → 底部数据表格+偏差
 */

import { useState, useMemo, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  Plane,
  TrendingUp,
  TrendingDown,
  Minus,
  ArrowUpRight,
  ArrowDownRight,
  Info,
  Calculator,
  CalendarDays,
  ArrowRight,
  Camera,
  FileText,
  FileDown,
  Plus,
  Trash2,
  ClipboardList,
} from "lucide-react";
import { domToPng } from "modern-screenshot";
import { useRef } from "react";
import {
  getAvailableRoutes,
  getAvailableYears,
  routeNames,
  regionGroups,
  yearColors,
  monthNames,
  prepareChartData,
  calculateDeviation,
  calculateDateChanges,
  priceData,
  calculateFreight,
  type PriceField,
  type ChartPoint,
} from "@/lib/priceData";

/* ────────────────────────────────────────────
   代理报价行类型
   ──────────────────────────────────────────── */
interface AgentQuoteRow {
  id: string;
  agentName: string;
  unitPrice: string;
  operationFee: string;
  totalPrice: string;
  remark: string;
}

function createEmptyRow(): AgentQuoteRow {
  return {
    id: Math.random().toString(36).slice(2, 10),
    agentName: "",
    unitPrice: "",
    operationFee: "",
    totalPrice: "",
    remark: "",
  };
}

/* ────────────────────────────────────────────
   合并图表数据：多年数据按月-日对齐到同一X轴
   ──────────────────────────────────────────── */
function mergeChartData(
  chartData: Record<number, ChartPoint[]>,
  years: number[]
) {
  const allMonthDays = new Set<string>();
  for (const year of years) {
    (chartData[year] || []).forEach((p) => allMonthDays.add(p.monthDay));
  }
  const sortedMDs = Array.from(allMonthDays).sort();

  return sortedMDs.map((md) => {
    const entry: Record<string, unknown> = { monthDay: md };
    for (const year of years) {
      const match = (chartData[year] || []).find((p) => p.monthDay === md);
      if (match) {
        entry[`y${year}`] = match.value;
        entry[`detail_${year}`] = match;
      }
    }
    return entry;
  });
}

/* ────────────────────────────────────────────
   自定义 Tooltip
   ──────────────────────────────────────────── */
function CustomChartTooltip({
  active,
  payload,
  years,
  field,
  weight,
}: {
  active?: boolean;
  payload?: Array<{
    value: number;
    dataKey: string;
    payload: Record<string, unknown>;
  }>;
  label?: string;
  years: number[];
  field: PriceField;
  weight: number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const data = payload[0]?.payload;
  if (!data) return null;

  const fieldLabel =
    field === "N" ? "N (基础运价)" : field === "M" ? "M (最低收费)" : "超重价";

  return (
    <div className="bg-white border border-border rounded-lg shadow-xl p-3.5 min-w-[220px]">
      <p className="text-xs text-muted-foreground mb-2 font-medium">
        日期: {data.monthDay as string}
      </p>
      {years.map((year) => {
        const detail = data[`detail_${year}`] as ChartPoint | undefined;
        const value = data[`y${year}`] as number | undefined;
        if (value === undefined) return null;
        return (
          <div key={year} className="flex items-center gap-2 mb-1.5">
            <div
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ backgroundColor: yearColors[year] }}
            />
            <span
              className="text-sm font-semibold"
              style={{ color: yearColors[year] }}
            >
              {year}
            </span>
            <span className="text-sm font-mono font-bold ml-auto">
              ¥{value}
            </span>
            {detail && (
              <span className="text-[10px] text-muted-foreground">
                {detail.aircraft_type}
              </span>
            )}
          </div>
        );
      })}
      {weight > 0 && (
        <>
          <Separator className="my-2" />
          <p className="text-[10px] text-muted-foreground mb-1">
            按 {weight}kg 估算运费:
          </p>
          {years.map((year) => {
            const detail = data[`detail_${year}`] as ChartPoint | undefined;
            if (!detail) return null;
            const freight = calculateFreight(
              {
                date: detail.date,
                year: detail.year,
                month: detail.month,
                day: 0,
                route: "",
                aircraft_type: detail.aircraft_type,
                M: detail.M,
                N: detail.N,
                overweight_price: detail.overweight_price,
                overweight_type: detail.overweight_type,
              },
              weight
            );
            return (
              <div key={year} className="flex items-center gap-2 text-xs">
                <span style={{ color: yearColors[year] }}>{year}</span>
                <span className="font-mono font-bold ml-auto">
                  ¥{freight.toFixed(0)}
                </span>
              </div>
            );
          })}
        </>
      )}
      <Separator className="my-2" />
      <p className="text-[10px] text-muted-foreground">
        {fieldLabel} · 元/公斤
      </p>
    </div>
  );
}

/* ────────────────────────────────────────────
   偏差标签组件
   ──────────────────────────────────────────── */
function DeviationBadge({
  absolute,
  percentage,
}: {
  absolute: number;
  percentage: number;
}) {
  const isUp = absolute > 0;
  const isDown = absolute < 0;

  return (
    <span
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium ${
        isUp
          ? "bg-red-50 text-red-700 border border-red-100"
          : isDown
          ? "bg-green-50 text-green-700 border border-green-100"
          : "bg-gray-50 text-gray-500 border border-gray-100"
      }`}
    >
      {isUp ? (
        <TrendingUp className="w-3 h-3" />
      ) : isDown ? (
        <TrendingDown className="w-3 h-3" />
      ) : (
        <Minus className="w-3 h-3" />
      )}
      <span className="font-mono font-semibold">
        {isUp ? "+" : ""}
        {absolute}
      </span>
      <span className="opacity-40 mx-0.5">|</span>
      <span className="font-mono font-semibold">
        {isUp ? "+" : ""}
        {percentage}%
      </span>
    </span>
  );
}

/* ────────────────────────────────────────────
   主页面
   ──────────────────────────────────────────── */
export default function Home() {
  const routes = useMemo(() => getAvailableRoutes(), []);
  const years = useMemo(() => getAvailableYears(), []);

  const [selectedRoute, setSelectedRoute] = useState("LAX");
  const [selectedYears, setSelectedYears] = useState<number[]>(years);
  const [selectedMonths, setSelectedMonths] = useState<number[]>([]);
  const [priceField, setPriceField] = useState<PriceField>("overweight_price");
  const [weight, setWeight] = useState(0);
  const [businessNumber, setBusinessNumber] = useState("");
  const [isCapturing, setIsCapturing] = useState(false);
  const captureRef = useRef<HTMLDivElement>(null);

  // 代理报价表格状态
  const [agentQuotes, setAgentQuotes] = useState<AgentQuoteRow[]>([
    createEmptyRow(),
    createEmptyRow(),
    createEmptyRow(),
  ]);
  const [overallRemark, setOverallRemark] = useState("");

  // 更新代理报价行
  const updateQuoteRow = useCallback(
    (id: string, field: keyof AgentQuoteRow, value: string) => {
      setAgentQuotes((prev) =>
        prev.map((row) => (row.id === id ? { ...row, [field]: value } : row))
      );
    },
    []
  );

  // 添加代理报价行
  const addQuoteRow = useCallback(() => {
    setAgentQuotes((prev) => [...prev, createEmptyRow()]);
  }, []);

  // 删除代理报价行
  const removeQuoteRow = useCallback((id: string) => {
    setAgentQuotes((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((row) => row.id !== id);
    });
  }, []);

  // 全页面截图下载功能
  const handleScreenshot = useCallback(async () => {
    if (!captureRef.current) return;
    try {
      setIsCapturing(true);
      // 等待DOM更新
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await domToPng(captureRef.current, {
        backgroundColor: "#fafaf9",
        scale: 2,
      });
      setIsCapturing(false);
      const link = document.createElement("a");
      const timestamp = new Date().toISOString().slice(0, 10);
      const routeName = routeNames[selectedRoute] || selectedRoute;
      const fieldName = priceField === "N" ? "基础运价" : priceField === "M" ? "最低收费" : "超重价";
      link.download = `运价对比_${selectedRoute}_${routeName}_${fieldName}_${timestamp}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      setIsCapturing(false);
      console.error("截图失败:", err);
    }
  }, [selectedRoute, priceField]);

  // PDF导出功能
  const handleExportPDF = useCallback(async () => {
    if (!captureRef.current) return;
    try {
      setIsCapturing(true);
      await new Promise(r => setTimeout(r, 100));
      const dataUrl = await domToPng(captureRef.current, {
        backgroundColor: "#ffffff",
        scale: 2,
      });
      setIsCapturing(false);

      // 动态导入jspdf
      const { jsPDF } = await import("jspdf");

      // 创建一个临时Image来获取尺寸
      const img = new Image();
      img.src = dataUrl;
      await new Promise((resolve) => { img.onload = resolve; });

      const imgWidth = img.width;
      const imgHeight = img.height;

      // A4纸宽度 210mm，留边距
      const pdfWidth = 200;
      const pdfHeight = (imgHeight * pdfWidth) / imgWidth;

      const pdf = new jsPDF({
        orientation: pdfHeight > pdfWidth * 1.5 ? "portrait" : "portrait",
        unit: "mm",
        format: [pdfWidth + 10, pdfHeight + 10],
      });

      pdf.addImage(dataUrl, "PNG", 5, 5, pdfWidth, pdfHeight);

      const timestamp = new Date().toISOString().slice(0, 10);
      const routeName = routeNames[selectedRoute] || selectedRoute;
      const fieldName = priceField === "N" ? "基础运价" : priceField === "M" ? "最低收费" : "超重价";
      pdf.save(`运价对比_${selectedRoute}_${routeName}_${fieldName}_${timestamp}.pdf`);
    } catch (err) {
      setIsCapturing(false);
      console.error("PDF导出失败:", err);
    }
  }, [selectedRoute, priceField]);

  // 准备图表数据
  const chartData = useMemo(
    () =>
      prepareChartData(selectedRoute, selectedYears, selectedMonths, priceField),
    [selectedRoute, selectedYears, selectedMonths, priceField]
  );

  const mergedData = useMemo(
    () => mergeChartData(chartData, selectedYears),
    [chartData, selectedYears]
  );

  // 计算偏差
  const deviations = useMemo(
    () =>
      calculateDeviation(
        selectedRoute,
        selectedYears,
        selectedMonths,
        priceField
      ),
    [selectedRoute, selectedYears, selectedMonths, priceField]
  );

  // 日期间价格变化数据
  const dateChanges = useMemo(
    () => {
      const result: Record<number, ReturnType<typeof calculateDateChanges>> = {};
      for (const year of selectedYears) {
        result[year] = calculateDateChanges(selectedRoute, year, selectedMonths, priceField);
      }
      return result;
    },
    [selectedRoute, selectedYears, selectedMonths, priceField]
  );

  // 当前航线所属区域
  const currentRegion = useMemo(() => {
    for (const [region, codes] of Object.entries(regionGroups)) {
      if (codes.includes(selectedRoute)) return region;
    }
    return "";
  }, [selectedRoute]);

  // 总体趋势摘要
  const trendSummary = useMemo(() => {
    if (deviations.length === 0) return null;
    const withDevs = deviations.filter((d) => d.deviations.length > 0);
    if (withDevs.length === 0) return null;
    let totalPct = 0;
    let count = 0;
    withDevs.forEach((d) => {
      const last = d.deviations[d.deviations.length - 1];
      totalPct += last.percentage;
      count++;
    });
    return { avgPct: Math.round((totalPct / count) * 100) / 100 };
  }, [deviations]);

  // 当前航线的机型信息
  const aircraftInfo = useMemo(() => {
    const rec = priceData.find((r) => r.route === selectedRoute);
    return rec
      ? `${rec.aircraft_type} · ${rec.overweight_type}`
      : "";
  }, [selectedRoute]);

  const toggleYear = useCallback(
    (year: number) => {
      setSelectedYears((prev) => {
        if (prev.includes(year)) {
          if (prev.length === 1) return prev;
          return prev.filter((y) => y !== year);
        }
        return [...prev, year].sort();
      });
    },
    []
  );

  const toggleMonth = useCallback((month: number) => {
    setSelectedMonths((prev) =>
      prev.includes(month)
        ? prev.filter((m) => m !== month)
        : [...prev, month].sort((a, b) => a - b)
    );
  }, []);

  return (
    <div className="min-h-screen bg-background">
      {/* ─── 全页面截图区域开始 ─── */}
      <div ref={captureRef}>
      {/* ─── Header ─── */}
      <header className="border-b border-border bg-white/90 backdrop-blur-md sticky top-0 z-50">
        <div className="container py-3">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-600 to-indigo-800 flex items-center justify-center shadow-sm">
              <Plane className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <h1 className="text-base font-bold tracking-tight sm:text-lg">
                东航危险品运价对比工具
              </h1>
              <p className="text-[11px] text-muted-foreground truncate">
                PVG(上海浦东)出发 · 2024-2026年公布运价趋势分析
              </p>
            </div>
            {trendSummary && (
              <div className="ml-auto hidden sm:block">
                <Badge
                  variant="outline"
                  className={`font-mono text-xs px-2.5 py-1 ${
                    trendSummary.avgPct > 0
                      ? "border-red-200 bg-red-50 text-red-700"
                      : trendSummary.avgPct < 0
                      ? "border-green-200 bg-green-50 text-green-700"
                      : "border-gray-200 bg-gray-50 text-gray-600"
                  }`}
                >
                  {trendSummary.avgPct > 0 ? (
                    <ArrowUpRight className="w-3 h-3 mr-1" />
                  ) : trendSummary.avgPct < 0 ? (
                    <ArrowDownRight className="w-3 h-3 mr-1" />
                  ) : (
                    <Minus className="w-3 h-3 mr-1" />
                  )}
                  年度均偏差{" "}
                  {trendSummary.avgPct > 0 ? "+" : ""}
                  {trendSummary.avgPct}%
                </Badge>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container py-5 space-y-5">
        {/* ─── 筛选器 ─── */}
        <Card className="shadow-sm">
          <CardContent className="pt-5 pb-4">
            <div className="space-y-5">
              {/* Row 1: 航线 + 重量 + 业务编号 */}
              <div className="flex flex-col sm:flex-row gap-4">
                <div className="space-y-1.5 sm:w-[260px]">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    目的地航线
                  </label>
                  <Select
                    value={selectedRoute}
                    onValueChange={setSelectedRoute}
                  >
                    <SelectTrigger className="w-full h-10">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent className="max-h-[360px]">
                      {Object.entries(regionGroups).map(([region, codes]) => {
                        const available = codes.filter((c) =>
                          routes.includes(c)
                        );
                        if (available.length === 0) return null;
                        return (
                          <SelectGroup key={region}>
                            <SelectLabel className="text-xs font-bold text-muted-foreground px-2">
                              {region}
                            </SelectLabel>
                            {available.map((code) => (
                              <SelectItem key={code} value={code}>
                                <span className="font-mono font-bold mr-2">
                                  {code}
                                </span>
                                <span className="text-muted-foreground text-xs">
                                  {routeNames[code]}
                                </span>
                              </SelectItem>
                            ))}
                          </SelectGroup>
                        );
                      })}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    {currentRegion} · {routeNames[selectedRoute]} · {aircraftInfo}
                  </p>
                </div>

                <div className="space-y-1.5 sm:w-[180px]">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1">
                    <Calculator className="w-3 h-3" />
                    计费重量 (kg)
                  </label>
                  <Input
                    type="number"
                    min={0}
                    placeholder="可选，用于估算运费"
                    value={weight || ""}
                    onChange={(e) =>
                      setWeight(Math.max(0, Number(e.target.value)))
                    }
                    className="h-10 font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    输入后图表tooltip显示估算运费
                  </p>
                </div>

                <div className="space-y-1.5 sm:w-[200px]">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide flex items-center gap-1">
                    <ClipboardList className="w-3 h-3" />
                    内部业务编号
                  </label>
                  <Input
                    type="text"
                    placeholder="可选，委托号/内部编号"
                    value={businessNumber}
                    onChange={(e) => setBusinessNumber(e.target.value)}
                    className="h-10 font-mono"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    填写后将显示在截图中
                  </p>
                </div>

                <div className="space-y-1.5 flex-1">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    价格指标
                  </label>
                  <div className="flex gap-1.5 flex-wrap">
                    {(
                      [
                        { key: "M", label: "M 最低收费" },
                        { key: "N", label: "N 基础运价" },
                        { key: "overweight_price", label: "超重价" },
                      ] as const
                    ).map((item) => (
                      <button
                        key={item.key}
                        onClick={() => setPriceField(item.key)}
                        className={`px-3 py-2 rounded-md text-xs font-medium transition-all ${
                          priceField === item.key
                            ? "bg-foreground text-background shadow-sm"
                            : "bg-muted text-muted-foreground hover:bg-muted/80"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <Separator />

              {/* Row 2: 年份 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                  对比年份
                </label>
                <div className="flex gap-2">
                  {years.map((y) => {
                    const active = selectedYears.includes(y);
                    return (
                      <button
                        key={y}
                        onClick={() => toggleYear(y)}
                        className="relative px-5 py-2 rounded-md text-sm font-bold font-mono transition-all"
                        style={{
                          backgroundColor: active ? yearColors[y] : "#f5f5f4",
                          color: active ? "#fff" : yearColors[y],
                          border: `2px solid ${yearColors[y]}`,
                          opacity: active ? 1 : 0.5,
                        }}
                      >
                        {y}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 3: 月份 */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <label className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    月份筛选
                  </label>
                  <Tooltip>
                    <TooltipTrigger>
                      <Info className="w-3 h-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent side="right">
                      <p className="text-xs">不选择任何月份则显示全年数据</p>
                    </TooltipContent>
                  </Tooltip>
                  {selectedMonths.length > 0 && (
                    <button
                      onClick={() => setSelectedMonths([])}
                      className="text-[11px] text-muted-foreground hover:text-foreground underline ml-1"
                    >
                      清除全部
                    </button>
                  )}
                </div>
                <div className="flex gap-1.5 flex-wrap">
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
                    const active = selectedMonths.includes(m);
                    return (
                      <button
                        key={m}
                        onClick={() => toggleMonth(m)}
                        className={`w-12 py-1.5 rounded-md text-xs font-medium transition-all ${
                          active
                            ? "bg-foreground text-background shadow-sm"
                            : "bg-muted/60 text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {m}月
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* ─── 代理报价比价表格 ─── */}
        <Card className="shadow-sm border-amber-200/50">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <ClipboardList className="w-4 h-4 text-amber-600" />
              代理报价比价记录
              <span className="text-muted-foreground font-normal text-xs ml-2">
                填写各代理报价信息，结合市场趋势进行比价分析
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-3 sm:px-5">
            <div className={isCapturing ? "" : "overflow-x-auto"}>
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b-2 border-amber-200">
                    <th className="text-left py-3 px-2 font-bold text-xs uppercase tracking-wide text-muted-foreground w-8">
                      #
                    </th>
                    <th className="text-left py-3 px-2 font-bold text-xs uppercase tracking-wide text-amber-700 min-w-[120px]">
                      代理名称
                    </th>
                    <th className="text-left py-3 px-2 font-bold text-xs uppercase tracking-wide text-amber-700 min-w-[100px]">
                      单价 (元/kg)
                    </th>
                    <th className="text-left py-3 px-2 font-bold text-xs uppercase tracking-wide text-amber-700 min-w-[100px]">
                      操作费 (元)
                    </th>
                    <th className="text-left py-3 px-2 font-bold text-xs uppercase tracking-wide text-amber-700 min-w-[100px]">
                      总价 (元)
                    </th>
                    <th className="text-left py-3 px-2 font-bold text-xs uppercase tracking-wide text-amber-700 min-w-[180px]">
                      备注/评价
                    </th>
                    <th className="text-center py-3 px-2 font-bold text-xs uppercase tracking-wide text-muted-foreground w-10">
                      操作
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {agentQuotes.map((row, idx) => (
                    <tr
                      key={row.id}
                      className={`border-b border-border/40 transition-colors hover:bg-amber-50/30 ${
                        idx % 2 === 0 ? "" : "bg-muted/5"
                      }`}
                    >
                      <td className="py-2 px-2 text-xs text-muted-foreground font-mono">
                        {idx + 1}
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          placeholder="代理公司名称"
                          value={row.agentName}
                          onChange={(e) =>
                            updateQuoteRow(row.id, "agentName", e.target.value)
                          }
                          className="w-full px-2 py-1.5 text-sm border border-border/60 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          placeholder="0.00"
                          value={row.unitPrice}
                          onChange={(e) =>
                            updateQuoteRow(row.id, "unitPrice", e.target.value)
                          }
                          className="w-full px-2 py-1.5 text-sm font-mono border border-border/60 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          placeholder="0.00"
                          value={row.operationFee}
                          onChange={(e) =>
                            updateQuoteRow(row.id, "operationFee", e.target.value)
                          }
                          className="w-full px-2 py-1.5 text-sm font-mono border border-border/60 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          placeholder="0.00"
                          value={row.totalPrice}
                          onChange={(e) =>
                            updateQuoteRow(row.id, "totalPrice", e.target.value)
                          }
                          className="w-full px-2 py-1.5 text-sm font-mono border border-border/60 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                        />
                      </td>
                      <td className="py-2 px-2">
                        <input
                          type="text"
                          placeholder="价格评价、偏高/偏低、后续处理..."
                          value={row.remark}
                          onChange={(e) =>
                            updateQuoteRow(row.id, "remark", e.target.value)
                          }
                          className="w-full px-2 py-1.5 text-sm border border-border/60 rounded-md bg-white focus:outline-none focus:ring-1 focus:ring-amber-400 focus:border-amber-400"
                        />
                      </td>
                      <td className="py-2 px-2 text-center">
                        <button
                          onClick={() => removeQuoteRow(row.id)}
                          className="p-1 rounded hover:bg-red-50 text-muted-foreground hover:text-red-500 transition-colors"
                          title="删除此行"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* 添加行按钮 */}
            <div className="mt-3 flex items-center gap-3">
              <button
                onClick={addQuoteRow}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200 hover:bg-amber-100 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                添加代理行
              </button>
              <span className="text-[11px] text-muted-foreground">
                点击添加更多代理报价记录
              </span>
            </div>

            {/* 总体备注/综合评价 */}
            <div className="mt-4 space-y-2">
              <label className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1">
                <FileText className="w-3 h-3" />
                综合评价 / 总体备注
              </label>
              <textarea
                placeholder="在此填写综合评价：各代理报价对比结论、结合市场趋势的分析、最终选择建议、后续处理方案等..."
                value={overallRemark}
                onChange={(e) => setOverallRemark(e.target.value)}
                rows={4}
                className="w-full px-3 py-2.5 text-sm border border-amber-200 rounded-lg bg-amber-50/30 focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400 resize-y placeholder:text-muted-foreground/50"
              />
            </div>
          </CardContent>
        </Card>

        {/* 业务编号标记栏 */}
        {businessNumber && (
          <div className="px-4 py-2.5 bg-blue-50 border border-blue-200 rounded-lg flex items-center gap-4 flex-wrap">
            <FileText className="w-4 h-4 text-blue-600 shrink-0" />
            <span className="text-sm">
              <span className="font-medium text-blue-800">内部业务编号：</span>
              <span className="font-mono font-bold text-blue-900">{businessNumber}</span>
            </span>
          </div>
        )}

        {/* ─── 折线图 ─── */}
        <Card className="shadow-sm">
          <CardHeader className="pb-1 pt-4 px-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <CardTitle className="text-base font-bold flex items-center gap-2">
                <span
                  className="font-mono text-xl"
                  style={{ letterSpacing: "0.05em" }}
                >
                  {selectedRoute}
                </span>
                <span className="text-muted-foreground font-normal text-sm">
                  {routeNames[selectedRoute]} ·{" "}
                  {priceField === "N"
                    ? "基础运价(N)"
                    : priceField === "M"
                    ? "最低收费(M)"
                    : "超重价"}
                </span>
              </CardTitle>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleScreenshot}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 transition-colors"
                >
                  <Camera className="w-3.5 h-3.5" />
                  全页截图
                </button>
                <button
                  onClick={handleExportPDF}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 transition-colors"
                >
                  <FileDown className="w-3.5 h-3.5" />
                  导出PDF
                </button>
                <span className="text-[11px] text-muted-foreground font-mono">
                  单位: 元/公斤 · 数据来源: 东航公布运价PDF
                </span>
              </div>
            </div>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            {mergedData.length > 0 ? (
              <ResponsiveContainer width="100%" height={440}>
                <LineChart
                  data={mergedData}
                  margin={{ top: 16, right: 24, left: 8, bottom: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="#e7e5e4"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="monthDay"
                    tick={{ fontSize: 11, fill: "#78716c", fontFamily: "JetBrains Mono, monospace" }}
                    tickLine={false}
                    axisLine={{ stroke: "#d6d3d1" }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    tick={{ fontSize: 11, fill: "#78716c", fontFamily: "JetBrains Mono, monospace" }}
                    tickLine={false}
                    axisLine={false}
                    width={48}
                    domain={["dataMin - 2", "dataMax + 2"]}
                    tickFormatter={(v: number) => `¥${v}`}
                  />
                  <RechartsTooltip
                    content={
                      <CustomChartTooltip
                        years={selectedYears}
                        field={priceField}
                        weight={weight}
                      />
                    }
                  />
                  <Legend
                    verticalAlign="top"
                    height={36}
                    formatter={(value: string) => {
                      const year = value.replace("y", "");
                      return (
                        <span
                          style={{
                            color: yearColors[Number(year)],
                            fontWeight: 700,
                            fontSize: 13,
                            fontFamily: "JetBrains Mono, monospace",
                          }}
                        >
                          {year}年
                        </span>
                      );
                    }}
                  />
                  {selectedYears.map((year) => (
                    <Line
                      key={year}
                      type="monotone"
                      dataKey={`y${year}`}
                      stroke={yearColors[year]}
                      strokeWidth={2.5}
                      dot={{ r: 3, fill: yearColors[year], strokeWidth: 0 }}
                      activeDot={{
                        r: 6,
                        strokeWidth: 3,
                        stroke: "#fff",
                        fill: yearColors[year],
                      }}
                      connectNulls
                      name={`y${year}`}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-[440px] flex items-center justify-center text-muted-foreground">
                暂无数据，请调整筛选条件
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── 偏差分析表格 ─── */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base font-bold">
              同期偏差分析
              <span className="text-muted-foreground font-normal text-xs ml-2">
                各月份平均{priceField === "N" ? "基础运价" : priceField === "M" ? "最低收费" : "超重价"}的年度对比 · 绿色=下降(有利) 红色=上涨(不利)
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            {deviations.length > 0 ? (
              <div className={isCapturing ? "" : "overflow-x-auto"}>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b-2 border-border">
                      <th className="text-left py-3 px-3 font-bold text-xs uppercase tracking-wide text-muted-foreground">
                        月份
                      </th>
                      {selectedYears.map((y) => (
                        <th
                          key={y}
                          className="text-right py-3 px-3 font-bold text-xs uppercase tracking-wide"
                          style={{ color: yearColors[y] }}
                        >
                          {y}年均价
                        </th>
                      ))}
                      {selectedYears.length >= 2 &&
                        selectedYears.slice(1).map((y, i) => (
                          <th
                            key={`dev-${y}`}
                            className="text-right py-3 px-3 font-bold text-xs uppercase tracking-wide text-muted-foreground"
                          >
                            {selectedYears[i]}→{y}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {deviations.map((dev, idx) => (
                      <tr
                        key={dev.month}
                        className={`border-b border-border/40 transition-colors hover:bg-muted/20 ${
                          idx % 2 === 0 ? "" : "bg-muted/5"
                        }`}
                      >
                        <td className="py-2.5 px-3 font-semibold text-sm">
                          {monthNames[dev.month]}
                        </td>
                        {selectedYears.map((y) => {
                          const yd = dev.years.find((d) => d.year === y);
                          return (
                            <td
                              key={y}
                              className="text-right py-2.5 px-3 font-mono"
                            >
                              {yd ? (
                                <span>
                                  <span className="font-bold text-sm">
                                    ¥{yd.avgPrice}
                                  </span>
                                  <span className="text-[10px] text-muted-foreground ml-1">
                                    ({yd.dataPoints})
                                  </span>
                                </span>
                              ) : (
                                <span className="text-muted-foreground/40">
                                  —
                                </span>
                              )}
                            </td>
                          );
                        })}
                        {dev.deviations.map((d) => (
                          <td
                            key={`${d.fromYear}-${d.toYear}`}
                            className="text-right py-2.5 px-3"
                          >
                            <DeviationBadge
                              absolute={d.absolute}
                              percentage={d.percentage}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="py-16 text-center text-muted-foreground text-sm">
                需要选择至少两个年份才能计算偏差
              </div>
            )}
          </CardContent>
        </Card>

        {/* ─── 日期间价格变化 ─── */}
        <Card className="shadow-sm">
          <CardHeader className="pb-2 pt-4 px-5">
            <CardTitle className="text-base font-bold flex items-center gap-2">
              <CalendarDays className="w-4 h-4" />
              日期间价格变化
              <span className="text-muted-foreground font-normal text-xs ml-1">
                同一年内相邻通告日期的{priceField === "N" ? "基础运价" : priceField === "M" ? "最低收费" : "超重价"}涨跌 · 绿色=降价 红色=涨价
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-5">
            {isCapturing ? (
              /* 截图/PDF模式：所有年份全部展开显示 */
              <div className="space-y-6">
                {selectedYears.map((y) => {
                  const changes = dateChanges[y] || [];
                  return (
                    <div key={y}>
                      <h4 className="font-mono font-bold text-sm mb-2" style={{ color: yearColors[y] }}>{y}年</h4>
                      {changes.length > 0 ? (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b-2 border-border">
                              <th className="text-left py-2.5 px-3 font-bold text-xs uppercase tracking-wide text-muted-foreground">日期</th>
                              <th className="text-right py-2.5 px-3 font-bold text-xs uppercase tracking-wide" style={{ color: yearColors[y] }}>
                                {priceField === "N" ? "N (元/kg)" : priceField === "M" ? "M (元)" : "超重价 (元/kg)"}
                              </th>
                              <th className="text-center py-2.5 px-3 font-bold text-xs uppercase tracking-wide text-muted-foreground">对比上期</th>
                              <th className="text-right py-2.5 px-3 font-bold text-xs uppercase tracking-wide text-muted-foreground">变化</th>
                            </tr>
                          </thead>
                          <tbody>
                            {changes.map((rec, idx) => (
                              <tr key={rec.date} className={`border-b border-border/40 ${idx % 2 === 0 ? "" : "bg-muted/5"}`}>
                                <td className="py-2 px-3 font-mono text-sm font-medium">{rec.date}</td>
                                <td className="text-right py-2 px-3 font-mono font-bold text-sm">¥{rec.value}</td>
                                <td className="text-center py-2 px-3">
                                  {rec.prevDate ? (
                                    <span className="text-[11px] text-muted-foreground font-mono inline-flex items-center gap-1">
                                      {rec.prevDate}
                                      <ArrowRight className="w-3 h-3" />
                                      {rec.date}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground/40 text-xs">首条记录</span>
                                  )}
                                </td>
                                <td className="text-right py-2 px-3">
                                  {rec.change !== null ? (
                                    <DeviationBadge absolute={rec.change} percentage={rec.changePct ?? 0} />
                                  ) : (
                                    <span className="text-muted-foreground/40 text-xs">—</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      ) : (
                        <div className="py-4 text-center text-muted-foreground text-sm">
                          {y}年暂无该航线的数据
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              /* 正常模式：使用Tabs切换 */
              <Tabs defaultValue={String(selectedYears[selectedYears.length - 1])} className="w-full">
                <TabsList className="mb-3">
                  {selectedYears.map((y) => (
                    <TabsTrigger key={y} value={String(y)} className="font-mono font-bold text-xs" style={{ color: yearColors[y] }}>
                      {y}年
                    </TabsTrigger>
                  ))}
                </TabsList>
                {selectedYears.map((y) => {
                  const changes = dateChanges[y] || [];
                  return (
                    <TabsContent key={y} value={String(y)}>
                      {changes.length > 0 ? (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b-2 border-border">
                                <th className="text-left py-2.5 px-3 font-bold text-xs uppercase tracking-wide text-muted-foreground">日期</th>
                                <th className="text-right py-2.5 px-3 font-bold text-xs uppercase tracking-wide" style={{ color: yearColors[y] }}>
                                  {priceField === "N" ? "N (元/kg)" : priceField === "M" ? "M (元)" : "超重价 (元/kg)"}
                                </th>
                                <th className="text-center py-2.5 px-3 font-bold text-xs uppercase tracking-wide text-muted-foreground">对比上期</th>
                                <th className="text-right py-2.5 px-3 font-bold text-xs uppercase tracking-wide text-muted-foreground">变化</th>
                              </tr>
                            </thead>
                            <tbody>
                              {changes.map((rec, idx) => (
                                <tr key={rec.date} className={`border-b border-border/40 transition-colors hover:bg-muted/20 ${idx % 2 === 0 ? "" : "bg-muted/5"}`}>
                                  <td className="py-2 px-3 font-mono text-sm font-medium">{rec.date}</td>
                                  <td className="text-right py-2 px-3 font-mono font-bold text-sm">¥{rec.value}</td>
                                  <td className="text-center py-2 px-3">
                                    {rec.prevDate ? (
                                      <span className="text-[11px] text-muted-foreground font-mono inline-flex items-center gap-1">
                                        {rec.prevDate}
                                        <ArrowRight className="w-3 h-3" />
                                        {rec.date}
                                      </span>
                                    ) : (
                                      <span className="text-muted-foreground/40 text-xs">首条记录</span>
                                    )}
                                  </td>
                                  <td className="text-right py-2 px-3">
                                    {rec.change !== null ? (
                                      <DeviationBadge absolute={rec.change} percentage={rec.changePct ?? 0} />
                                    ) : (
                                      <span className="text-muted-foreground/40 text-xs">—</span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      ) : (
                        <div className="py-12 text-center text-muted-foreground text-sm">
                          {y}年暂无该航线的数据
                        </div>
                      )}
                    </TabsContent>
                  );
                })}
              </Tabs>
            )}
          </CardContent>
        </Card>

        {/* ─── 使用说明 ─── */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[
            {
              title: "运价结构",
              desc: "M = 最低收费（起步价）；N = 基础运价（元/公斤）；+100KG/+45KG = 超过该重量后的每公斤价格。三者为三选一关系，取适用档位。",
            },
            {
              title: "如何使用",
              desc: "选择目的地航线和年份，图表自动显示跨年趋势对比。选择月份可做同期对比，偏差表格显示涨跌幅度（数值+百分比）。",
            },
            {
              title: "偏差解读",
              desc: "绿色 = 价格下降（有利），红色 = 价格上涨（不利）。可用于验证代理报价趋势是否与东航公布运价一致。",
            },
          ].map((item) => (
            <Card key={item.title} className="bg-muted/20 border-border/50">
              <CardContent className="pt-4 pb-3">
                <h3 className="text-xs font-bold text-foreground mb-1 uppercase tracking-wide">
                  {item.title}
                </h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {item.desc}
                </p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* ─── 数据更新说明 ─── */}
        <Card className="bg-blue-50/30 border-blue-200/50">
          <CardContent className="pt-4 pb-3">
            <h3 className="text-xs font-bold text-blue-700 mb-1 uppercase tracking-wide flex items-center gap-1">
              <Info className="w-3 h-3" />
              数据更新说明
            </h3>
            <p className="text-xs text-blue-600/80 leading-relaxed">
              运价数据存储在 prices.json 文件中，支持持续更新。收到新的运价通告后，只需将新数据按相同格式添加到该文件中，页面会自动加载最新数据。数据格式：{"{"}"date", "year", "month", "day", "route", "aircraft_type", "M", "N", "overweight_price", "overweight_type"{"}"} 。
            </p>
          </CardContent>
        </Card>

        {/* Footer */}
        <p className="text-center text-[10px] text-muted-foreground/50 pb-4">
          数据来源：中国货运航空有限公司市场营销部 危险品市场公布运价通告 ·
          数据以PDF原件为准
        </p>
      </main>
      </div>
      {/* ─── 全页面截图区域结束 ─── */}
    </div>
  );
}
