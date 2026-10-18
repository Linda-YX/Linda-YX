import Papa from "papaparse";
import { id, type Position } from "./model";
export type Field =
  | "name"
  | "ticker"
  | "type"
  | "units"
  | "price"
  | "value"
  | "currency"
  | "date"
  | "account"
  | "institution"
  | "sector"
  | "region"
  | "classificationSource"
  | "classificationDate"
  | "rate"
  | "rateDate"
  | "rateSource";
export const FIELD_LABELS: Record<Field, string> = {
  name: "证券名称",
  ticker: "证券代码",
  type: "证券类别",
  units: "数量",
  price: "单价",
  value: "市值（必选）",
  currency: "币种",
  date: "报告日期",
  account: "账户",
  institution: "金融机构",
  sector: "行业",
  region: "地区",
  classificationSource: "分类来源",
  classificationDate: "分类日期",
  rate: "兑 CAD 汇率",
  rateDate: "汇率日期",
  rateSource: "汇率来源",
};
export interface Extracted {
  headers: string[];
  data: Record<string, string>[];
  mapping: Partial<Record<Field, string>>;
  positions: Position[];
  text: string;
  warnings: string[];
  detected: { institution: string; account: string; date: string };
}
const aliases: Record<Field, string[]> = {
  name: [
    "securityname",
    "name",
    "security",
    "description",
    "holding",
    "证券名称",
    "名称",
    "证券",
    "持仓名称",
  ],
  ticker: ["ticker", "symbol", "fundcode", "代码", "证券代码", "基金代码"],
  type: ["securitytype", "type", "assettype", "类别", "证券类别"],
  units: ["units", "quantity", "qty", "数量", "份额"],
  price: ["price", "unitprice", "单价", "价格"],
  value: [
    "marketvalue",
    "currentvalue",
    "value",
    "市值",
    "当前市值",
    "市场价值",
  ],
  currency: ["currency", "ccy", "币种", "货币"],
  date: ["date", "asofdate", "valuationdate", "reportdate", "报告日期", "日期"],
  account: ["account", "accountname", "账户", "账户名称"],
  institution: ["institution", "platform", "broker", "平台", "金融机构"],
  sector: ["sector", "industry", "行业"],
  region: ["region", "country", "geography", "地区", "国家"],
  classificationSource: ["classificationsource", "分类来源"],
  classificationDate: ["classificationdate", "分类日期"],
  rate: ["fxrate", "rate", "汇率"],
  rateDate: ["fxdate", "ratedate", "汇率日期"],
  rateSource: ["fxsource", "ratesource", "汇率来源"],
};
const normalize = (s: string) => s.toLowerCase().replace(/[\s_\-()（）]/g, "");
export function numeric(s: unknown): number | undefined {
  if (s === null || s === undefined || String(s).trim() === "")
    return undefined;
  const value = String(s)
    .trim()
    .replace(/[$,\s]/g, "")
    .replace(/^\((.+)\)$/, "-$1");
  if (!/^[+-]?(?:\d+\.?\d*|\.\d+)$/.test(value)) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}
export function parseCSV(text: string): Extracted {
  const parsed = Papa.parse<Record<string, string>>(
    text.replace(/^\uFEFF/, ""),
    {
      header: true,
      skipEmptyLines: "greedy",
      transformHeader: (h) => h.trim(),
    },
  );
  const headers = parsed.meta.fields || [];
  if (!headers.length || !parsed.data.length)
    throw new Error("CSV 中没有数据行。请检查文件，或下载示例模板。");
  if (parsed.data.length > 10000)
    throw new Error("单次最多导入 10,000 行，请拆分文件。");
  const mapping: Extracted["mapping"] = {};
  for (const [field, names] of Object.entries(aliases)) {
    const found = headers.find((h) => names.includes(normalize(h)));
    if (found) mapping[field as Field] = found;
  }
  const warnings = parsed.errors.map(
    (e) => `第 ${(e.row ?? 0) + 2} 行：${e.message}`,
  );
  if (
    parsed.errors.some(
      (e) =>
        e.type === "Quotes" ||
        e.code === "TooManyFields" ||
        e.code === "TooFewFields",
    )
  )
    warnings.push("CSV 结构不完整，请修正原文件后重新导入，避免错列。");
  const first = parsed.data[0];
  const get = (key: Field) => (mapping[key] ? first[mapping[key]!] || "" : "");
  const result: Extracted = {
    headers,
    data: parsed.data,
    mapping,
    positions: [],
    text: "",
    warnings,
    detected: {
      institution: get("institution"),
      account: get("account"),
      date: validDate(get("date")) ? get("date") : "",
    },
  };
  return result;
}
export function validDate(value: string) {
  return (
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    !Number.isNaN(Date.parse(value + "T12:00:00Z")) &&
    new Date(value + "T12:00:00Z").toISOString().slice(0, 10) === value
  );
}
export function mapRows(extracted: Extracted): {
  positions: Position[];
  warnings: string[];
} {
  const { mapping, data } = extracted;
  const warnings: string[] = [];
  if (!mapping.value || (!mapping.name && !mapping.ticker))
    return {
      positions: [],
      warnings: ["请匹配市值列，以及证券名称或代码列。"],
    };
  const positions = data.map((row, i): Position => {
    const get = (key: Field) =>
      mapping[key] ? String(row[mapping[key]!] ?? "").trim() : "";
    const value = numeric(get("value"));
    const name = get("name") || get("ticker");
    if (value === undefined || value < 0)
      warnings.push(`第 ${i + 2} 行的市值无效，请在核对表中修正。`);
    if (!name) warnings.push(`第 ${i + 2} 行缺少证券名称。`);
    const source = get("classificationSource"),
      date = get("classificationDate");
    return {
      id: id(),
      name,
      ticker: get("ticker"),
      type: get("type") || "其他",
      value: value ?? NaN,
      units: numeric(get("units")),
      price: numeric(get("price")),
      currency: get("currency").toUpperCase() || "",
      sourceRow: `CSV 第 ${i + 2} 条逻辑行（含标题）`,
      rate: numeric(get("rate")),
      rateDate: get("rateDate"),
      rateSource: get("rateSource"),
      classification:
        source && validDate(date)
          ? {
              sectors: get("sector")
                ? [{ label: get("sector"), weight: 1 }]
                : [],
              regions: get("region")
                ? [{ label: get("region"), weight: 1 }]
                : [],
              source,
              date,
              status: "confirmed",
            }
          : undefined,
    };
  });
  const dates = new Set(
    data.map((r) => (mapping.date ? r[mapping.date] : "")).filter(Boolean),
  );
  if (dates.size > 1)
    warnings.push(
      "文件中包含多个报告日期；本次按单份快照导入，请拆分文件或逐行确认统一日期。",
    );
  for (const field of ["account", "institution"] as const) {
    const values = new Set(
      data
        .map((r) => (mapping[field] ? r[mapping[field]!] : ""))
        .filter(Boolean),
    );
    if (values.size > 1)
      warnings.push(
        `文件包含多个${FIELD_LABELS[field]}，请先拆分为单账户文件。`,
      );
  }
  return { positions, warnings };
}
export async function fingerprint(file: File) {
  const hash = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(hash), (n) =>
    n.toString(16).padStart(2, "0"),
  ).join("");
}
export async function parsePDF(file: File): Promise<Extracted> {
  const pdfjs = await import("pdfjs-dist");
  const { default: worker } = await import(
    "pdfjs-dist/build/pdf.worker.min.mjs?url"
  );
  pdfjs.GlobalWorkerOptions.workerSrc = worker;
  const task = pdfjs.getDocument({
    data: new Uint8Array(await file.arrayBuffer()),
  });
  const lines: { text: string; page: number; cells: string[] }[] = [];
  try {
    const doc = await task.promise;
    if (doc.numPages > 100)
      throw new Error("PDF 超过 100 页，请导出所需的持仓页后重试。");
    for (let page = 1; page <= doc.numPages; page++) {
      const content = await (await doc.getPage(page)).getTextContent();
      const groups = new Map<number, { x: number; text: string }[]>();
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        const y = Math.round(item.transform[5] / 3) * 3;
        const group = groups.get(y) || [];
        group.push({ x: item.transform[4], text: item.str });
        groups.set(y, group);
      }
      for (const [, items] of [...groups].sort(([a], [b]) => b - a)) {
        const cells = items.sort((a, b) => a.x - b.x).map((i) => i.text.trim());
        lines.push({ text: cells.join(" | "), cells, page });
      }
    }
  } finally {
    await task.destroy();
  }
  const text = lines.map((l) => `第 ${l.page} 页：${l.text}`).join("\n");
  const plain = lines.map((l) => l.text).join("\n");
  const institution = /wealthsimple/i.test(plain)
    ? "Wealthsimple"
    : /\biA\b|industrial alliance/i.test(plain)
      ? "iA Mobile"
      : "";
  const account = /\b(TFSA|RRSP|FHSA|RESP)\b/i.exec(plain)?.[1] || "";
  const dateMatch =
    /(?:as\s*of|report\s*date|statement\s*date|报告日期|截至)[^\d]{0,12}(\d{4})[-/](\d{2})[-/](\d{2})/i.exec(
      plain.replaceAll(" | ", " "),
    );
  const date = dateMatch
    ? `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`
    : "";
  const positions: Position[] = [];
  // Only recognize explicitly structured holding rows. Never guess totals as holdings.
  for (const line of lines) {
    const cells = line.cells.flatMap((c) =>
      c
        .split("|")
        .map((s) => s.trim())
        .filter(Boolean),
    );
    // Supported text table: name | ticker | type | units | price | market value | currency.
    if (
      cells.length === 7 &&
      /^[A-Z]{3}$/.test(cells[6]) &&
      numeric(cells[5]) !== undefined &&
      numeric(cells[3]) !== undefined &&
      numeric(cells[4]) !== undefined &&
      !/total|合计|总额|balance/i.test(cells[0])
    ) {
      positions.push({
        id: id(),
        name: cells[0],
        ticker: cells[1],
        type: cells[2],
        units: numeric(cells[3]),
        price: numeric(cells[4]),
        value: numeric(cells[5])!,
        currency: cells[6],
        sourceRow: `PDF 第 ${line.page} 页：${line.text}`,
      });
    }
  }
  return {
    headers: [],
    data: [],
    mapping: {},
    positions,
    text,
    warnings: [
      positions.length
        ? "已提取结构化候选持仓；请对照原文逐项核对。这不是经过验证的机构专用解析器。"
        : plain.trim()
          ? "已提取 PDF 原文，但未可靠识别持仓表。请参照原文手动补全核对表，或改用 CSV。"
          : "此 PDF 可能是扫描件，当前不支持 OCR。请使用 CSV 或手动录入。",
    ],
    detected: { institution, account, date: validDate(date) ? date : "" },
  };
}
