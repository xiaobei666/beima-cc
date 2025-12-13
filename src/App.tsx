import { useEffect, useMemo, useState, useRef } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Settings,
  Book,
  Wrench,
  Server,
  RefreshCw,
  Layers,
  ChevronRight,
  BarChart3,
  Loader2,
} from "lucide-react";
import type { Provider } from "@/types";
import type { EnvConflict } from "@/types/env";
import { useProvidersQuery } from "@/lib/query";
import {
  providersApi,
  settingsApi,
  type AppId,
  type ProviderSwitchEvent,
} from "@/lib/api";
import { checkAllEnvConflicts, checkEnvConflicts } from "@/lib/api/env";
import { useProviderActions } from "@/hooks/useProviderActions";
import { extractErrorMessage } from "@/utils/errorUtils";
import { cn } from "@/lib/utils";
import { AppSwitcher } from "@/components/AppSwitcher";
import { ProviderList } from "@/components/providers/ProviderList";
import { AddProviderDialog } from "@/components/providers/AddProviderDialog";
import { EditProviderDialog } from "@/components/providers/EditProviderDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { SettingsPage } from "@/components/settings/SettingsPage";
import { UpdateBadge } from "@/components/UpdateBadge";
import { EnvWarningBanner } from "@/components/env/EnvWarningBanner";
import UsageScriptModal from "@/components/UsageScriptModal";
import UnifiedMcpPanel from "@/components/mcp/UnifiedMcpPanel";
import PromptPanel from "@/components/prompts/PromptPanel";
import { SkillsPage } from "@/components/skills/SkillsPage";
import { AgentsPanel } from "@/components/agents/AgentsPanel";
import {
  UsageLogPanel,
  type UsageLogPanelRef,
  extractApiKey,
} from "@/components/usage/UsageLogPanel";
import { Button } from "@/components/ui/button";

type View =
  | "providers"
  | "settings"
  | "prompts"
  | "skills"
  | "mcp"
  | "agents"
  | "usageLog";

interface NavItem {
  id: View;
  icon: React.ElementType;
  labelKey: string;
  claudeOnly?: boolean;
}

const navItems: NavItem[] = [
  { id: "providers", icon: Layers, labelKey: "nav.providers" },
  { id: "prompts", icon: Book, labelKey: "nav.prompts" },
  { id: "mcp", icon: Server, labelKey: "nav.mcp" },
  { id: "skills", icon: Wrench, labelKey: "nav.skills", claudeOnly: true },
  { id: "usageLog", icon: BarChart3, labelKey: "nav.usageLog" },
  { id: "settings", icon: Settings, labelKey: "nav.settings" },
];

function App() {
  const { t } = useTranslation();

  const [activeApp, setActiveApp] = useState<AppId>("claude");
  const [currentView, setCurrentView] = useState<View>("providers");
  const [isAddOpen, setIsAddOpen] = useState(false);

  const [editingProvider, setEditingProvider] = useState<Provider | null>(null);
  const [usageProvider, setUsageProvider] = useState<Provider | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Provider | null>(null);
  const [envConflicts, setEnvConflicts] = useState<EnvConflict[]>([]);
  const [showEnvBanner, setShowEnvBanner] = useState(false);

  const promptPanelRef = useRef<any>(null);
  const mcpPanelRef = useRef<any>(null);
  const skillsPageRef = useRef<any>(null);
  const usageLogPanelRef = useRef<UsageLogPanelRef>(null);
  const [usageLogPeriod, setUsageLogPeriod] = useState<"daily" | "monthly">("daily");
  const [usageLogIsLoading, setUsageLogIsLoading] = useState(false);

  const { data, isLoading, refetch } = useProvidersQuery(activeApp);
  const providers = useMemo(() => data?.providers ?? {}, [data]);
  const currentProviderId = data?.currentProviderId ?? "";
  const isClaudeApp = activeApp === "claude";

  useEffect(() => {
    if (currentView !== "usageLog") {
      setUsageLogIsLoading(false);
    }
  }, [currentView]);

  const {
    addProvider,
    updateProvider,
    switchProvider,
    deleteProvider,
    saveUsageScript,
  } = useProviderActions(activeApp);

  // 监听来自托盘菜单的切换事件
  useEffect(() => {
    let unsubscribe: (() => void) | undefined;

    const setupListener = async () => {
      try {
        unsubscribe = await providersApi.onSwitched(
          async (event: ProviderSwitchEvent) => {
            if (event.appType === activeApp) {
              await refetch();
            }
          },
        );
      } catch (error) {
        console.error("[App] Failed to subscribe provider switch event", error);
      }
    };

    setupListener();
    return () => {
      unsubscribe?.();
    };
  }, [activeApp, refetch]);

  // 应用启动时检测所有应用的环境变量冲突
  useEffect(() => {
    const checkEnvOnStartup = async () => {
      try {
        const allConflicts = await checkAllEnvConflicts();
        const flatConflicts = Object.values(allConflicts).flat();

        if (flatConflicts.length > 0) {
          setEnvConflicts(flatConflicts);
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on startup:",
          error,
        );
      }
    };

    checkEnvOnStartup();
  }, []);

  // 应用启动时检查是否刚完成了配置迁移
  useEffect(() => {
    const checkMigration = async () => {
      try {
        const migrated = await invoke<boolean>("get_migration_result");
        if (migrated) {
          toast.success(
            t("migration.success", { defaultValue: "配置迁移成功" }),
          );
        }
      } catch (error) {
        console.error("[App] Failed to check migration result:", error);
      }
    };

    checkMigration();
  }, [t]);

  // 切换应用时检测当前应用的环境变量冲突
  useEffect(() => {
    const checkEnvOnSwitch = async () => {
      try {
        const conflicts = await checkEnvConflicts(activeApp);

        if (conflicts.length > 0) {
          setEnvConflicts((prev) => {
            const existingKeys = new Set(
              prev.map((c) => `${c.varName}:${c.sourcePath}`),
            );
            const newConflicts = conflicts.filter(
              (c) => !existingKeys.has(`${c.varName}:${c.sourcePath}`),
            );
            return [...prev, ...newConflicts];
          });
          const dismissed = sessionStorage.getItem("env_banner_dismissed");
          if (!dismissed) {
            setShowEnvBanner(true);
          }
        }
      } catch (error) {
        console.error(
          "[App] Failed to check environment conflicts on app switch:",
          error,
        );
      }
    };

    checkEnvOnSwitch();
  }, [activeApp]);

  const handleOpenWebsite = async (url: string) => {
    try {
      await settingsApi.openExternal(url);
    } catch (error) {
      const detail =
        extractErrorMessage(error) ||
        t("notifications.openLinkFailed", {
          defaultValue: "链接打开失败",
        });
      toast.error(detail);
    }
  };

  const handleEditProvider = async (provider: Provider) => {
    await updateProvider(provider);
    setEditingProvider(null);
  };

  const handleConfirmDelete = async () => {
    if (!confirmDelete) return;
    await deleteProvider(confirmDelete.id);
    setConfirmDelete(null);
  };

  const handleDuplicateProvider = async (provider: Provider) => {
    const newSortIndex =
      provider.sortIndex !== undefined ? provider.sortIndex + 1 : undefined;

    const duplicatedProvider: Omit<Provider, "id" | "createdAt"> = {
      name: `${provider.name} copy`,
      settingsConfig: JSON.parse(JSON.stringify(provider.settingsConfig)),
      websiteUrl: provider.websiteUrl,
      category: provider.category,
      sortIndex: newSortIndex,
      meta: provider.meta
        ? JSON.parse(JSON.stringify(provider.meta))
        : undefined,
      icon: provider.icon,
      iconColor: provider.iconColor,
    };

    if (provider.sortIndex !== undefined) {
      const updates = Object.values(providers)
        .filter(
          (p) =>
            p.sortIndex !== undefined &&
            p.sortIndex >= newSortIndex! &&
            p.id !== provider.id,
        )
        .map((p) => ({
          id: p.id,
          sortIndex: p.sortIndex! + 1,
        }));

      if (updates.length > 0) {
        try {
          await providersApi.updateSortOrder(updates, activeApp);
        } catch (error) {
          console.error("[App] Failed to update sort order", error);
          toast.error(
            t("provider.sortUpdateFailed", {
              defaultValue: "排序更新失败",
            }),
          );
          return;
        }
      }
    }

    await addProvider(duplicatedProvider);
  };

  const handleImportSuccess = async () => {
    await refetch();
    try {
      await providersApi.updateTrayMenu();
    } catch (error) {
      console.error("[App] Failed to refresh tray menu", error);
    }
  };

  const getPageTitle = () => {
    switch (currentView) {
      case "settings":
        return t("settings.title");
      case "prompts":
        return t("prompts.title", { appName: t(`apps.${activeApp}`) });
      case "skills":
        return t("skills.title");
      case "mcp":
        return t("mcp.unifiedPanel.title");
      case "agents":
        return t("agents.title");
      case "usageLog":
        return null; // 用量查询页面使用自定义标题栏
      default:
        return t("nav.providersTitle", { defaultValue: "Providers" });
    }
  };

  const renderContent = () => {
    switch (currentView) {
      case "settings":
        return (
          <SettingsPage
            open={true}
            onOpenChange={() => setCurrentView("providers")}
            onImportSuccess={handleImportSuccess}
          />
        );
      case "prompts":
        return (
          <PromptPanel
            ref={promptPanelRef}
            open={true}
            onOpenChange={() => setCurrentView("providers")}
            appId={activeApp}
          />
        );
      case "skills":
        return (
          <SkillsPage
            ref={skillsPageRef}
            onClose={() => setCurrentView("providers")}
          />
        );
      case "mcp":
        return (
          <UnifiedMcpPanel
            ref={mcpPanelRef}
            onOpenChange={() => setCurrentView("providers")}
          />
        );
      case "agents":
        return <AgentsPanel onOpenChange={() => setCurrentView("providers")} />;
      case "usageLog":
        return (
          <UsageLogPanel
            ref={usageLogPanelRef}
            appId={activeApp}
            currentProvider={providers[currentProviderId] ?? null}
            onOpenChange={() => setCurrentView("providers")}
            onLoadingChange={setUsageLogIsLoading}
          />
        );
      default:
        return (
          <ProviderList
            providers={providers}
            currentProviderId={currentProviderId}
            appId={activeApp}
            isLoading={isLoading}
            onSwitch={switchProvider}
            onEdit={setEditingProvider}
            onDelete={setConfirmDelete}
            onDuplicate={handleDuplicateProvider}
            onConfigureUsage={setUsageProvider}
            onOpenWebsite={handleOpenWebsite}
            onCreate={() => setIsAddOpen(true)}
          />
        );
    }
  };

  const renderHeaderActions = () => {
    switch (currentView) {
      case "prompts":
        return (
          <Button
            size="sm"
            onClick={() => promptPanelRef.current?.openAdd()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t("prompts.add", { defaultValue: "Add" })}
          </Button>
        );
      case "mcp":
        return (
          <Button
            size="sm"
            onClick={() => mcpPanelRef.current?.openAdd()}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t("mcp.unifiedPanel.addServer", { defaultValue: "Add Server" })}
          </Button>
        );
      case "skills":
        return (
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => skillsPageRef.current?.refresh()}
            >
              <RefreshCw className="h-4 w-4 mr-1.5" />
              {t("skills.refresh", { defaultValue: "Refresh" })}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => skillsPageRef.current?.openRepoManager()}
            >
              <Settings className="h-4 w-4 mr-1.5" />
              {t("skills.repoManager", { defaultValue: "Repos" })}
            </Button>
          </div>
        );
      case "providers":
        return (
          <Button
            size="sm"
            onClick={() => setIsAddOpen(true)}
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="h-4 w-4 mr-1.5" />
            {t("provider.add", { defaultValue: "Add Provider" })}
          </Button>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      {/* 左侧边栏 */}
      <aside
        className="sidebar w-56 flex-shrink-0 flex flex-col border-r border-[hsl(var(--sidebar-border))]"
        data-tauri-drag-region
        style={{ WebkitAppRegion: "drag" } as any}
      >
        {/* Logo 区域 */}
        <div
          className="h-14 flex items-center px-8 pt-6 border-b border-[hsl(var(--sidebar-border))]"
          data-tauri-drag-region
        >
          <span
            className="font-semibold text-[hsl(var(--sidebar-foreground))]"
            style={{ WebkitAppRegion: "no-drag" } as any}
          >
            BMAI Tools
          </span>
        </div>

        {/* 应用切换器 */}
        <div
          className="px-3 py-3 border-b border-[hsl(var(--sidebar-border))]"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          <AppSwitcher activeApp={activeApp} onSwitch={setActiveApp} />
        </div>

        {/* 导航菜单 */}
        <nav
          className="flex-1 px-3 py-4 space-y-1 overflow-y-auto"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          {navItems
            .filter((item) => !item.claudeOnly || isClaudeApp)
            .map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setCurrentView(item.id)}
                  className={cn(
                    "sidebar-nav-item w-full",
                    isActive && "active",
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="flex-1 text-left">
                    {t(item.labelKey, { defaultValue: item.id })}
                  </span>
                  {isActive && <ChevronRight className="h-4 w-4 opacity-60" />}
                </button>
              );
            })}
        </nav>

        {/* 底部更新提示 */}
        <div
          className="px-3 py-3 border-t border-[hsl(var(--sidebar-border))]"
          style={{ WebkitAppRegion: "no-drag" } as any}
        >
          <UpdateBadge onClick={() => setCurrentView("settings")} />
        </div>
      </aside>

      {/* 右侧主内容区 */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* 环境变量警告横幅 */}
        {showEnvBanner && envConflicts.length > 0 && (
          <EnvWarningBanner
            conflicts={envConflicts}
            onDismiss={() => {
              setShowEnvBanner(false);
              sessionStorage.setItem("env_banner_dismissed", "true");
            }}
            onDeleted={async () => {
              try {
                const allConflicts = await checkAllEnvConflicts();
                const flatConflicts = Object.values(allConflicts).flat();
                setEnvConflicts(flatConflicts);
                if (flatConflicts.length === 0) {
                  setShowEnvBanner(false);
                }
              } catch (error) {
                console.error(
                  "[App] Failed to re-check conflicts after deletion:",
                  error,
                );
              }
            }}
          />
        )}

        {/* 顶部标题栏 */}
        <header
          className="h-14 flex-shrink-0 flex items-center justify-between px-6 border-b border-border bg-background"
          data-tauri-drag-region
          style={{ WebkitAppRegion: "drag" } as any}
        >
          {currentView === "usageLog" ? (
            // 用量查询页面：自定义标题栏
            (() => {
              const currentProvider = providers[currentProviderId] || null;
              const usageLogApiKey = extractApiKey(currentProvider, activeApp);
              return (
                <>
                  <div
                    className="flex items-center gap-3"
                    style={{ WebkitAppRegion: "no-drag" } as any}
                  >
                    <h3 className="font-medium text-foreground">
                      {currentProvider?.name ||
                        t("usageLog.noProvider", {
                          defaultValue: "未选择供应商",
                        })}
                    </h3>
                    <span className="text-xs text-muted-foreground">
                      {usageLogApiKey
                        ? t("usageLog.usingProviderConfig", {
                            defaultValue: "使用当前供应商配置查询",
                          })
                        : t("usageLog.noApiKey", {
                            defaultValue: "当前供应商未配置 API Key",
                          })}
                    </span>
                  </div>
                  <div
                    className="flex items-center gap-2"
                    style={{ WebkitAppRegion: "no-drag" } as any}
                  >
                    <div className="flex rounded-lg border border-border overflow-hidden">
                      <button
                        onClick={() => {
                          usageLogPanelRef.current?.setPeriod("daily");
                          setUsageLogPeriod("daily");
                        }}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          usageLogPeriod === "daily"
                            ? "bg-blue-500 text-white"
                            : "bg-transparent text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t("usageLog.config.daily", { defaultValue: "日统计" })}
                      </button>
                      <div className="w-px bg-border" />
                      <button
                        onClick={() => {
                          usageLogPanelRef.current?.setPeriod("monthly");
                          setUsageLogPeriod("monthly");
                        }}
                        className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                          usageLogPeriod === "monthly"
                            ? "bg-blue-500 text-white"
                            : "bg-transparent text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {t("usageLog.config.monthly", {
                          defaultValue: "月统计",
                        })}
                      </button>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => usageLogPanelRef.current?.refresh()}
                      disabled={
                        !usageLogApiKey || usageLogIsLoading
                      }
                    >
                      {usageLogIsLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <RefreshCw size={14} />
                      )}
                    </Button>
                  </div>
                </>
              );
            })()
          ) : (
            // 其他页面：默认标题栏
            <>
              <h1
                className="text-lg font-semibold text-foreground"
                style={{ WebkitAppRegion: "no-drag" } as any}
              >
                {getPageTitle()}
              </h1>
              <div
                className="flex items-center gap-3"
                style={{ WebkitAppRegion: "no-drag" } as any}
              >
                {renderHeaderActions()}
              </div>
            </>
          )}
        </header>

        {/* 主内容区 */}
        <main className="flex-1 overflow-y-auto p-6 animate-fade-in">
          <div className="max-w-4xl mx-auto">{renderContent()}</div>
        </main>
      </div>

      {/* 对话框 */}
      <AddProviderDialog
        open={isAddOpen}
        onOpenChange={setIsAddOpen}
        appId={activeApp}
        onSubmit={addProvider}
      />

      <EditProviderDialog
        open={Boolean(editingProvider)}
        provider={editingProvider}
        onOpenChange={(open) => {
          if (!open) {
            setEditingProvider(null);
          }
        }}
        onSubmit={handleEditProvider}
        appId={activeApp}
      />

      {usageProvider && (
        <UsageScriptModal
          provider={usageProvider}
          appId={activeApp}
          isOpen={Boolean(usageProvider)}
          onClose={() => setUsageProvider(null)}
          onSave={(script) => {
            void saveUsageScript(usageProvider, script);
          }}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(confirmDelete)}
        title={t("confirm.deleteProvider")}
        message={
          confirmDelete
            ? t("confirm.deleteProviderMessage", {
                name: confirmDelete.name,
              })
            : ""
        }
        onConfirm={() => void handleConfirmDelete()}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}

export default App;
