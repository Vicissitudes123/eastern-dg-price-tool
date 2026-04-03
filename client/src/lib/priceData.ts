/*
 * 运价数据类型与工具函数
 * 设计：清晰工具型界面 - 暖白底色，三色年份区分
 */

import rawData from "@/data/prices.json";

export interface PriceRecord {
  date: string;
  year: number;
  month: number;
  day: number;
  route: string;
  aircraft_type: string;
  M: number;
  N: number;
  overweight_price: number;
  overweight_type: string;
}

export const priceData: PriceRecord[] = rawData as PriceRecord[];

// 航线名称映射
export const routeNames: Record<string, string> = {
  LAX: "洛杉矶",
  ORD: "芝加哥",
  YVR: "温哥华",
  YYZ: "多伦多",
  SFO: "旧金山",
  JFK: "纽约",
  AMS: "阿姆斯特丹",
  FRA: "法兰克福",
  CDG: "巴黎",
  MXP: "米兰",
  LHR: "伦敦希思罗",
  LGW: "伦敦盖特威克",
  MAD: "马德里",
  BUD: "布达佩斯",
  FCO: "罗马",
  RUH: "利雅得",
  AKL: "奥克兰",
  SYD: "悉尼",
  MEL: "墨尔本",
  BNE: "布里斯班",
  DEL: "德里",
  HAN: "河内",
  MNL: "马尼拉",
  SVO: "莫斯科",
  DXB: "迪拜",
  HKG: "香港",
  MFM: "澳门",
  TPE: "台北",
  SIN: "新加坡",
  BKK: "曼谷",
  NRT: "东京成田",
  KIX: "大阪",
  NGO: "名古屋",
  FUK: "福冈",
  HND: "东京羽田",
  ICN: "首尔仁川",
  PUS: "釜山",
  GMP: "首尔金浦",
  SGN: "胡志明市",
  CGK: "雅加达",
  MLE: "马尔代夫",
  HKT: "普吉岛",
  CEB: "宿务",
  KUL: "吉隆坡",
  PNH: "金边",
};

// 区域分组
export const regionGroups: Record<string, string[]> = {
  "北美": ["LAX", "ORD", "YVR", "YYZ", "SFO", "JFK"],
  "欧洲": ["AMS", "FRA", "CDG", "MXP", "LHR", "LGW", "MAD", "BUD", "FCO", "RUH"],
  "大洋洲": ["AKL", "SYD", "MEL", "BNE"],
  "东北亚": ["NRT", "KIX", "NGO", "FUK", "HND", "ICN", "PUS", "GMP"],
  "东南亚": ["SIN", "BKK", "HAN", "MNL", "SGN", "CGK", "HKT", "CEB", "KUL", "PNH"],
  "港澳台": ["HKG", "MFM", "TPE"],
  "南亚/中东/俄罗斯": ["DEL", "DXB", "SVO", "MLE"],
};

// 年份颜色
export const yearColors: Record<number, string> = {
  2024: "#4f46e5", // 靛蓝
  2025: "#059669", // 翠绿
  2026: "#d97706", // 琥珀
};

export const yearColorsBg: Record<number, string> = {
  2024: "#eef2ff",
  2025: "#ecfdf5",
  2026: "#fffbeb",
};

// 月份名称
export const monthNames = [
  "", "1月", "2月", "3月", "4月", "5月", "6月",
  "7月", "8月", "9月", "10月", "11月", "12月"
];

// 获取所有可用的航线
export function getAvailableRoutes(): string[] {
  const routes = Array.from(new Set(priceData.map(r => r.route)));
  return routes.sort();
}

// 获取所有可用年份
export function getAvailableYears(): number[] {
  return Array.from(new Set(priceData.map(r => r.year))).sort();
}

// 获取某年可用的月份
export function getAvailableMonths(year: number): number[] {
  return Array.from(new Set(priceData.filter(r => r.year === year).map(r => r.month))).sort((a, b) => a - b);
}

// 按航线和年份筛选数据
export function filterData(route: string, years: number[], months: number[]): PriceRecord[] {
  return priceData.filter(r => 
    r.route === route && 
    years.includes(r.year) &&
    (months.length === 0 || months.includes(r.month))
  ).sort((a, b) => a.date.localeCompare(b.date));
}

// 计算运费
export function calculateFreight(record: PriceRecord, weight: number): number {
  const mCost = record.M;
  const nCost = record.N * weight;
  const owCost = record.overweight_price * weight;
  
  // 三选一取最大
  if (record.overweight_type === "+100KG" && weight >= 100) {
    return Math.max(mCost, owCost);
  } else if (record.overweight_type === "+45KG" && weight >= 45) {
    return Math.max(mCost, owCost);
  }
  return Math.max(mCost, nCost);
}

// 为图表准备数据：按年份分组，X轴为月-日
export interface ChartPoint {
  date: string;
  monthDay: string;  // MM-DD format for x-axis alignment
  month: number;
  value: number;
  year: number;
  M: number;
  N: number;
  overweight_price: number;
  overweight_type: string;
  aircraft_type: string;
}

export type PriceField = "N" | "M" | "overweight_price";

export function prepareChartData(
  route: string,
  years: number[],
  months: number[],
  field: PriceField = "N"
): Record<number, ChartPoint[]> {
  const result: Record<number, ChartPoint[]> = {};
  
  for (const year of years) {
    const filtered = priceData.filter(r =>
      r.route === route &&
      r.year === year &&
      (months.length === 0 || months.includes(r.month))
    ).sort((a, b) => a.date.localeCompare(b.date));
    
    result[year] = filtered.map(r => ({
      date: r.date,
      monthDay: `${String(r.month).padStart(2, '0')}-${String(r.day).padStart(2, '0')}`,
      month: r.month,
      value: r[field],
      year: r.year,
      M: r.M,
      N: r.N,
      overweight_price: r.overweight_price,
      overweight_type: r.overweight_type,
      aircraft_type: r.aircraft_type,
    }));
  }
  
  return result;
}

// 计算日期间价格变化（同一年内相邻通告日期的涨跌）
export interface DateChangeRecord {
  date: string;
  value: number;
  prevDate: string | null;
  prevValue: number | null;
  change: number | null;
  changePct: number | null;
  aircraft_type: string;
  M: number;
  N: number;
  overweight_price: number;
  overweight_type: string;
}

export function calculateDateChanges(
  route: string,
  year: number,
  months: number[],
  field: PriceField = "N"
): DateChangeRecord[] {
  const records = priceData
    .filter(
      (r) =>
        r.route === route &&
        r.year === year &&
        (months.length === 0 || months.includes(r.month))
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return records.map((r, i) => {
    const prev = i > 0 ? records[i - 1] : null;
    const value = r[field];
    const prevValue = prev ? prev[field] : null;
    const change =
      prevValue !== null ? Math.round((value - prevValue) * 100) / 100 : null;
    const changePct =
      prevValue !== null && prevValue !== 0
        ? Math.round(((value - prevValue) / prevValue) * 10000) / 100
        : null;

    return {
      date: r.date,
      value,
      prevDate: prev ? prev.date : null,
      prevValue,
      change,
      changePct,
      aircraft_type: r.aircraft_type,
      M: r.M,
      N: r.N,
      overweight_price: r.overweight_price,
      overweight_type: r.overweight_type,
    };
  });
}

// 计算同期偏差
export interface DeviationResult {
  route: string;
  month: number;
  years: { year: number; avgPrice: number; dataPoints: number }[];
  deviations: { fromYear: number; toYear: number; absolute: number; percentage: number }[];
}

export function calculateDeviation(
  route: string,
  years: number[],
  months: number[],
  field: PriceField = "N"
): DeviationResult[] {
  const results: DeviationResult[] = [];
  
  const targetMonths = months.length > 0 ? months : [1,2,3,4,5,6,7,8,9,10,11,12];
  
  for (const month of targetMonths) {
    const yearData: { year: number; avgPrice: number; dataPoints: number }[] = [];
    
    for (const year of years) {
      const records = priceData.filter(r =>
        r.route === route && r.year === year && r.month === month
      );
      
      if (records.length > 0) {
        const avg = records.reduce((sum, r) => sum + r[field], 0) / records.length;
        yearData.push({ year, avgPrice: Math.round(avg * 100) / 100, dataPoints: records.length });
      }
    }
    
    if (yearData.length < 2) continue;
    
    const deviations: { fromYear: number; toYear: number; absolute: number; percentage: number }[] = [];
    for (let i = 1; i < yearData.length; i++) {
      const prev = yearData[i - 1];
      const curr = yearData[i];
      const abs = Math.round((curr.avgPrice - prev.avgPrice) * 100) / 100;
      const pct = prev.avgPrice !== 0 
        ? Math.round((abs / prev.avgPrice) * 10000) / 100 
        : 0;
      deviations.push({
        fromYear: prev.year,
        toYear: curr.year,
        absolute: abs,
        percentage: pct,
      });
    }
    
    results.push({ route, month, years: yearData, deviations });
  }
  
  return results;
}
