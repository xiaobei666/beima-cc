import { useState, useEffect, useMemo, forwardRef, useImperativeHandle, useRef } from "react";
import { useTranslation } from "react-i18next";
import {
  RefreshCw,
  Loader2,
  AlertCircle,
  Activity,
  Zap,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Cpu,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { usageLogApi } from "@/lib/api";
import type { UsageLogResult, ModelStatsResult, ModelStatsItem } from "@/lib/api/usageLog";
import type { AppId } from "@/lib/api/types";
import type { Provider } from "@/types";

export interface UsageLogPanelProps {
  appId: AppId;
  currentProvider: Provider | null;
  onOpenChange?: (open: boolean) => void;
  onLoadingChange?: (isLoading: boolean) => void;
}

export interface UsageLogPanelRef {
  refresh: () => void;
  period: "daily" | "monthly";
  setPeriod: (period: "daily" | "monthly") => void;
  isLoading: boolean;
  apiKey: string;
  providerName: string;
}

const DEFAULT_BASE_URL = "https://claude.kun8.vip";

// 从供应商配置中提取 API Key
export function extractApiKey(provider: Provider | null, appId: AppId): string {
  if (!provider?.settingsConfig) return "";

  try {
    const config =
      typeof provider.settingsConfig === "string"
        ? JSON.parse(provider.settingsConfig)
        : provider.settingsConfig;

    const env = config?.env ?? {};

    if (appId === "gemini") {
      return typeof env.GEMINI_API_KEY === "string" ? env.GEMINI_API_KEY : "";
    }

    if (appId === "codex") {
      const auth = config?.auth ?? {};
      return typeof auth.OPENAI_API_KEY === "string" ? auth.OPENAI_API_KEY : "";
    }

    const token = env.ANTHROPIC_AUTH_TOKEN;
    const apiKey = env.ANTHROPIC_API_KEY;
    return typeof token === "string"
      ? token
      : typeof apiKey === "string"
        ? apiKey
        : "";
  } catch {
    return "";
  }
}

// 从供应商获取官网地址
function extractWebsiteUrl(provider: Provider | null): string {
  if (!provider?.websiteUrl) return DEFAULT_BASE_URL;
  return provider.websiteUrl.trim() || DEFAULT_BASE_URL;
}

// 获取模型显示名称
function getModelDisplayName(model: string): string {
  if (model.includes("opus")) return "Opus";
  if (model.includes("sonnet")) return "Sonnet";
  if (model.includes("haiku")) return "Haiku";
  return model;
}

// 获取模型对应的颜色样式
function getModelColorStyle(model: string): { bg: string; text: string } {
  if (model.includes("opus")) {
    return { bg: "rgba(139, 92, 246, 0.1)", text: "#7c3aed" };
  }
  if (model.includes("sonnet")) {
    return { bg: "rgba(59, 130, 246, 0.1)", text: "#2563eb" };
  }
  if (model.includes("haiku")) {
    return { bg: "rgba(16, 185, 129, 0.1)", text: "#059669" };
  }
  return { bg: "rgba(107, 114, 128, 0.1)", text: "#4b5563" };
}

export const UsageLogPanel = forwardRef<UsageLogPanelRef, UsageLogPanelProps>(
  ({ appId, currentProvider, onLoadingChange }, ref) => {
    const { t } = useTranslation();

    const apiKey = useMemo(
      () => extractApiKey(currentProvider, appId),
      [currentProvider, appId]
    );
    const baseUrl = useMemo(
      () => extractWebsiteUrl(currentProvider),
      [currentProvider]
    );

    const [isUserLoading, setIsUserLoading] = useState(false);
    const [isModelLoading, setIsModelLoading] = useState(false);
    const [result, setResult] = useState<UsageLogResult | null>(null);
    const [modelStats, setModelStats] = useState<ModelStatsResult | null>(null);
    const [period, setPeriod] = useState<"daily" | "monthly">("daily");

    const requestSeq = useRef(0);
    const activeRequestId = useRef(0);

    const queryUsage = async (queryPeriod: "daily" | "monthly") => {
      if (!apiKey.trim()) return;

      const requestId = (requestSeq.current += 1);
      activeRequestId.current = requestId;

      const debug = (label: string, details?: Record<string, unknown>) => {
        if (!import.meta.env.DEV) return;
        // eslint-disable-next-line no-console
        console.debug(`[usageLog] ${label}`, details || {});
      };

      const now = () =>
        typeof performance !== "undefined" ? performance.now() : Date.now();

      setIsUserLoading(true);
      setIsModelLoading(true);

      const t0 = now();
      debug("query:start", {
        requestId,
        period: queryPeriod,
        appId,
        hasApiKey: Boolean(apiKey.trim()),
        baseUrl,
      });

      const userPromise = usageLogApi.query(apiKey, baseUrl, queryPeriod);
      const modelPromise = usageLogApi.queryModelStats(apiKey, baseUrl, queryPeriod);

      let userResult: UsageLogResult | null = null;

      const tUserStart = now();
      try {
        userResult = await userPromise;
        if (activeRequestId.current !== requestId) {
          void modelPromise.catch(() => undefined);
          return;
        }
        setResult(userResult);
      } catch (error) {
        if (activeRequestId.current !== requestId) {
          void modelPromise.catch(() => undefined);
          return;
        }
        setResult({ success: false, error: String(error) });
        userResult = { success: false, error: String(error) };
      } finally {
        if (activeRequestId.current === requestId) {
          setIsUserLoading(false);
          debug("query:user_done", { requestId, ms: Math.round(now() - tUserStart) });
        }
      }

      if (!userResult?.success) {
        void modelPromise.catch(() => undefined);
        if (activeRequestId.current === requestId) {
          setModelStats(null);
          setIsModelLoading(false);
          debug("query:end_error", { requestId, ms: Math.round(now() - t0) });
        }
        return;
      }

      const tModelStart = now();
      try {
        const modelResult = await modelPromise;
        if (activeRequestId.current !== requestId) return;
        setModelStats(modelResult);
      } catch (error) {
        if (activeRequestId.current !== requestId) return;
        setModelStats({ success: false, error: String(error) });
      } finally {
        if (activeRequestId.current === requestId) {
          setIsModelLoading(false);
          debug("query:model_done", { requestId, ms: Math.round(now() - tModelStart) });
          debug("query:end", { requestId, ms: Math.round(now() - t0) });
        }
      }
    };

    const handleQuery = async () => queryUsage(period);

    const handlePeriodChange = (newPeriod: "daily" | "monthly") => {
      setPeriod(newPeriod);
      if (apiKey) {
        void queryUsage(newPeriod);
      }
    };

    const isLoading = isUserLoading || isModelLoading;

    useEffect(() => {
      onLoadingChange?.(isLoading);
    }, [isLoading, onLoadingChange]);

    // 暴露给父组件的方法和状态
    useImperativeHandle(ref, () => ({
      refresh: handleQuery,
      period,
      setPeriod: handlePeriodChange,
      isLoading,
      apiKey,
      providerName: currentProvider?.name || "",
    }));

    useEffect(() => {
      if (apiKey) {
        void queryUsage(period);
      } else {
        setResult(null);
        setModelStats(null);
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [apiKey, baseUrl]);

    const formatDate = (dateStr?: string) => {
      if (!dateStr) return "-";
      return new Date(dateStr).toLocaleString();
    };

    const formatNumber = (num?: number) => {
      if (num === undefined || num === null) return "-";
      return num.toLocaleString();
    };

    const formatTokens = (num?: number) => {
      if (num === undefined || num === null) return "-";
      if (num >= 1000000) return `${(num / 1000000).toFixed(2)}M`;
      if (num >= 1000) return `${(num / 1000).toFixed(1)}K`;
      return num.toString();
    };

    const calcProgress = (current?: number, limit?: number) => {
      if (!current || !limit || limit === 0) return 0;
      return Math.min((current / limit) * 100, 100);
    };

    const data = result?.data;
    const allModels = useMemo(() => modelStats?.data ?? [], [modelStats?.data]);

    // 所有模型费用汇总（不做筛选，用于月统计）
    const allModelsCost = useMemo(
      () => allModels.reduce((sum, m) => sum + m.costs.total, 0),
      [allModels]
    );

    // 按 appId 过滤模型
    const models = useMemo(
      () =>
        allModels.filter((m) => {
          const model = m.model.toLowerCase();
          if (appId === "claude") {
            return (
              model.includes("claude") ||
              model.includes("anthropic") ||
              model.includes("sonnet") ||
              model.includes("opus") ||
              model.includes("haiku")
            );
          }
          if (appId === "codex") return model.includes("gpt") || model.includes("o1") || model.includes("o3") || model.includes("o4");
          if (appId === "gemini") return model.includes("gemini");
          return true;
        }),
      [allModels, appId]
    );

    // 从模型统计计算周期汇总数据
    const periodUsage = useMemo(() => {
      if (models.length === 0) return null;
      return models.reduce(
        (acc, m) => ({
          requests: acc.requests + m.requests,
          inputTokens: acc.inputTokens + m.inputTokens,
          outputTokens: acc.outputTokens + m.outputTokens,
          cacheCreateTokens: acc.cacheCreateTokens + m.cacheCreateTokens,
          cacheReadTokens: acc.cacheReadTokens + m.cacheReadTokens,
          allTokens: acc.allTokens + m.allTokens,
          cost: acc.cost + m.costs.total,
        }),
        { requests: 0, inputTokens: 0, outputTokens: 0, cacheCreateTokens: 0, cacheReadTokens: 0, allTokens: 0, cost: 0 }
      );
    }, [models]);

    return (
      <div className="flex flex-col h-full overflow-auto">
        {/* 加载状态 */}
        {isUserLoading && !result && (
          <div className="flex-1 flex items-center justify-center min-h-[300px]">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="h-10 w-10 animate-spin text-blue-500" />
              <span className="text-sm text-muted-foreground">
                {t("usageLog.loading", { defaultValue: "正在查询用量数据..." })}
              </span>
            </div>
          </div>
        )}

        {/* 错误状态 */}
        {!isUserLoading && result && !result.success && (
          <div className="flex-1 flex items-center justify-center min-h-[300px]">
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <div className="p-4 rounded-full bg-red-500/10">
                <AlertCircle className="h-10 w-10 text-red-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  {t("usageLog.error.title", { defaultValue: "查询失败" })}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {result.error ||
                    t("usageLog.error.unknown", { defaultValue: "未知错误" })}
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleQuery}>
                <RefreshCw className="h-4 w-4 mr-1.5" />
                {t("common.retry", { defaultValue: "重试" })}
              </Button>
            </div>
          </div>
        )}

        {/* 未配置状态 */}
        {!isUserLoading && !result && !apiKey && (
          <div className="flex-1 flex items-center justify-center min-h-[300px]">
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <div className="p-4 rounded-full bg-yellow-500/10">
                <AlertCircle className="h-10 w-10 text-yellow-500" />
              </div>
              <div>
                <h3 className="font-semibold text-foreground mb-1">
                  {t("usageLog.noApiKeyTitle", {
                    defaultValue: "未配置 API Key",
                  })}
                </h3>
                <p className="text-sm text-muted-foreground max-w-md">
                  {t("usageLog.noApiKeyDescription", {
                    defaultValue:
                      "请先在供应商配置中设置 API Key，用量查询将自动使用当前供应商的配置",
                  })}
                </p>
              </div>
            </div>
          </div>
        )}

        {/* 数据展示 */}
        {!isUserLoading && result?.success && data && (
          <div className="space-y-4">
            {/* 限制信息卡片 */}
            {data.limits && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-orange-500/10 text-orange-500">
                    <Clock size={18} />
                  </div>
                  <h3 className="font-medium text-foreground">
                    {t("usageLog.limits.title", { defaultValue: "总使用限制" })}
                  </h3>
                </div>
                <div className="space-y-4">
                  {period === "daily" ? (
                    // 日统计：显示每日费用
                    data.limits.dailyCostLimit !== undefined && (
                      <div>
                        <div className="flex justify-between text-sm mb-1.5">
                          <span className="text-muted-foreground">
                            {t("usageLog.limits.dailyCost", { defaultValue: "当日费用" })}
                          </span>
                          <span className="font-medium">
                            ${data.limits.currentDailyCost?.toFixed(4) || "0"} / ${data.limits.dailyCostLimit}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-orange-400 to-orange-500 transition-all"
                            style={{ width: `${calcProgress(data.limits.currentDailyCost, data.limits.dailyCostLimit)}%` }}
                          />
                        </div>
                      </div>
                    )
                  ) : (
                    // 月统计：显示当月费用（所有模型费用汇总）
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
	                        <span className="text-muted-foreground">
	                          {t("usageLog.limits.monthlyCost", { defaultValue: "当月费用" })}
	                        </span>
	                        <span className="font-medium flex items-center gap-2">
	                          {isModelLoading ? (
	                            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
	                          ) : (
	                            `$${allModelsCost.toFixed(4)}`
	                          )}
	                        </span>
	                      </div>
	                    </div>
	                  )}
                  {data.limits.totalCostLimit !== undefined && (
                    <div>
                      <div className="flex justify-between text-sm mb-1.5">
                        <span className="text-muted-foreground">
                          {t("usageLog.limits.totalCost", { defaultValue: "总费用" })}
                        </span>
                        <span className="font-medium">
                          ${data.limits.currentTotalCost?.toFixed(4) || "0"} / ${data.limits.totalCostLimit}
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-muted overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-blue-400 to-blue-500 transition-all"
                          style={{ width: `${calcProgress(data.limits.currentTotalCost, data.limits.totalCostLimit)}%` }}
                        />
                      </div>
                    </div>
                  )}
                  {data.limits.concurrencyLimit !== undefined && (
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">
                        {t("usageLog.limits.concurrency", { defaultValue: "并发限制" })}
                      </span>
                      <span className="font-medium">{data.limits.concurrencyLimit}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* 使用量统计卡片 - 使用周期汇总数据 */}
            {periodUsage && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-blue-500/10 text-blue-500">
                    <Zap size={18} />
                  </div>
                  <h3 className="font-medium text-foreground">
                    {t("usageLog.usage.title", { defaultValue: "使用量统计" })}
                  </h3>
                </div>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("usageLog.usage.requests", { defaultValue: "请求次数" })}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatNumber(periodUsage.requests)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("usageLog.usage.inputTokens", { defaultValue: "输入 Token" })}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatTokens(periodUsage.inputTokens)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("usageLog.usage.outputTokens", { defaultValue: "输出 Token" })}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatTokens(periodUsage.outputTokens)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("usageLog.usage.cacheCreate", { defaultValue: "缓存创建" })}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatTokens(periodUsage.cacheCreateTokens)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("usageLog.usage.cacheRead", { defaultValue: "缓存读取" })}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatTokens(periodUsage.cacheReadTokens)}
                    </p>
                  </div>
                  <div className="p-3 rounded-lg bg-muted/50">
                    <p className="text-xs text-muted-foreground mb-1">
                      {t("usageLog.usage.totalTokens", { defaultValue: "总 Token" })}
                    </p>
                    <p className="text-lg font-semibold tabular-nums">
                      {formatTokens(periodUsage.allTokens)}
                    </p>
                  </div>
                </div>
                {/* 费用 */}
                <div className="mt-4 p-4 rounded-lg bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-500/20">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <DollarSign size={18} className="text-blue-500" />
                      <span className="text-sm font-medium">
                        {t("usageLog.usage.totalCost", { defaultValue: "总费用" })}
                      </span>
                    </div>
                    <span className="text-xl font-bold text-blue-500">
                      ${periodUsage.cost.toFixed(4)}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {/* 模型统计卡片 */}
            {isModelLoading && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500">
                    <Cpu size={18} />
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>
                      {t("usageLog.loading", { defaultValue: "正在查询用量数据..." })}
                    </span>
                  </div>
                </div>
              </div>
            )}
            {!isModelLoading && models.length > 0 && (
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="flex items-center gap-3 mb-4">
                  <div className="p-2 rounded-lg bg-violet-500/10 text-violet-500">
                    <Cpu size={18} />
                  </div>
                  <h3 className="font-medium text-foreground">
                    {t("usageLog.modelStats.title", { defaultValue: "模型统计" })}
                  </h3>
                </div>
                <div className="space-y-4">
                  {models.map((model: ModelStatsItem) => {
                    const colorStyle = getModelColorStyle(model.model);
                    const displayName = getModelDisplayName(model.model);
                    return (
                      <div
                        key={model.model}
                        className="p-4 rounded-lg bg-muted/50 border border-border/50"
                      >
                        <div className="flex items-center justify-between mb-3">
                          <div className="flex items-center gap-2">
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                backgroundColor: colorStyle.bg,
                                color: colorStyle.text,
                              }}
                            >
                              {displayName}
                            </span>
                            <span className="text-xs text-muted-foreground font-mono">
                              {model.model}
                            </span>
                          </div>
                          <span className="text-lg font-bold text-blue-500">
                            {model.formatted.total}
                          </span>
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-5 gap-3 text-sm">
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("usageLog.usage.requests", { defaultValue: "请求" })}
                            </p>
                            <p className="font-medium tabular-nums">
                              {formatNumber(model.requests)}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("usageLog.modelStats.input", { defaultValue: "输入" })}
                            </p>
                            <p className="font-medium tabular-nums">
                              {model.formatted.input}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("usageLog.modelStats.output", { defaultValue: "输出" })}
                            </p>
                            <p className="font-medium tabular-nums">
                              {model.formatted.output}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("usageLog.modelStats.cacheWrite", { defaultValue: "缓存写" })}
                            </p>
                            <p className="font-medium tabular-nums">
                              {model.formatted.cacheWrite}
                            </p>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">
                              {t("usageLog.modelStats.cacheRead", { defaultValue: "缓存读" })}
                            </p>
                            <p className="font-medium tabular-nums">
                              {model.formatted.cacheRead}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 基本信息卡片 */}
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-500">
                  <Activity size={18} />
                </div>
                <h3 className="font-medium text-foreground">
                  {t("usageLog.info.title", { defaultValue: "基本信息" })}
                </h3>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("usageLog.info.name", { defaultValue: "名称" })}
                  </p>
                  <p className="text-sm font-medium">{data.name || "-"}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("usageLog.info.status", { defaultValue: "状态" })}
                  </p>
                  <div className="flex items-center gap-1.5">
                    {data.isActive ? (
                      <>
                        <CheckCircle2 size={14} className="text-emerald-500" />
                        <span className="text-sm font-medium text-emerald-500">
                          {t("usageLog.info.active", { defaultValue: "启用" })}
                        </span>
                      </>
                    ) : (
                      <>
                        <XCircle size={14} className="text-red-500" />
                        <span className="text-sm font-medium text-red-500">
                          {t("usageLog.info.inactive", { defaultValue: "禁用" })}
                        </span>
                      </>
                    )}
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("usageLog.info.createdAt", { defaultValue: "创建时间" })}
                  </p>
                  <p className="text-sm">{formatDate(data.createdAt)}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">
                    {t("usageLog.info.expiresAt", { defaultValue: "过期时间" })}
                  </p>
                  <p className="text-sm">{formatDate(data.expiresAt)}</p>
                </div>
              </div>
            </div>

          </div>
        )}
      </div>
    );
  }
);

UsageLogPanel.displayName = "UsageLogPanel";

export default UsageLogPanel;
