import { useEffect, useState } from "react";
import { AccountAction, AccountEditor, BalanceEditor } from "./Editors";
import { Accounts, Investments, Overview } from "./Dashboard";
import { Reports } from "./Reports";
import {
  STORAGE_KEY,
  demoState,
  emptyState,
  loadState,
  type Account,
  type State,
} from "./model";
import { Modal } from "./ui";
const PAGES = [
  { id: "overview", title: "总览", navLabel: "财务总览" },
  { id: "accounts", title: "账户", navLabel: "我的账户" },
  { id: "investments", title: "投资组合", navLabel: "投资分析" },
  { id: "reports", title: "报告导入", navLabel: "数据导入" },
];
function NavigationIcon({ page }: { page: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.85"
      strokeLinecap="round"
      strokeLinejoin="round"
      focusable="false"
    >
      {page === "overview" ? (
        <>
          {[
            [3, 3],
            [14, 3],
            [3, 14],
            [14, 14],
          ].map(([x, y]) => (
            <rect key={`${x}-${y}`} x={x} y={y} width="7" height="7" rx="1" />
          ))}
        </>
      ) : page === "accounts" ? (
        <>
          <path d="M20 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h15a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2H5a2 2 0 0 1 0-4" />
          <path d="M16 14h.01" />
        </>
      ) : page === "investments" ? (
        <>
          <path d="M3 3v18h18" />
          <path d="m7 16 5-5 3 3 6-7" />
        </>
      ) : (
        <>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M12 18v-7m-3 3 3-3 3 3" />
        </>
      )}
    </svg>
  );
}
function initial() {
  try {
    return { state: loadState(), error: "" };
  } catch (e) {
    return {
      state: emptyState(),
      error:
        e instanceof Error
          ? e.message
          : "无法读取浏览器数据。请检查隐私 / 存储设置。",
    };
  }
}
export default function App() {
  const [loaded] = useState(initial),
    [state, setState] = useState(loaded.state),
    [loadError, setLoadError] = useState(loaded.error),
    [page, setPage] = useState("overview"),
    [modal, setModal] = useState<
      "balance" | "account" | "account-action" | "delete" | "demo" | null
    >(null),
    [selected, setSelected] = useState<Account>(),
    [notice, setNotice] = useState(""),
    [storageError, setStorageError] = useState("");
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 5000);
    return () => clearTimeout(timer);
  }, [notice]);
  useEffect(() => {
    function sync(e: StorageEvent) {
      if (e.key !== STORAGE_KEY) return;
      try {
        setState(loadState());
        setNotice("数据已从另一个标签页同步。");
      } catch {
        setStorageError("另一个标签页的数据无法读取，请导出备份后刷新。");
      }
    }
    window.addEventListener("storage", sync);
    return () => window.removeEventListener("storage", sync);
  }, []);
  function commit(next: State, message?: string) {
    if (loadError) {
      setStorageError(
        "为保护原数据，已暂停保存。请先导出备份，再清空损坏的数据。",
      );
      return false;
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setState(next);
      setStorageError("");
      if (message) setNotice(message);
      return true;
    } catch {
      setStorageError(
        "保存失败：浏览器存储空间不足或不允许写入。当前操作未保存，请导出备份并检查浏览器设置。",
      );
      return false;
    }
  }
  function go(next: string) {
    setPage(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function exportData() {
    try {
      const content = loadError
        ? localStorage.getItem(STORAGE_KEY) || "{}"
        : JSON.stringify(state, null, 2);
      const url = URL.createObjectURL(
        new Blob([content], { type: "application/json" }),
      );
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `finances-backup-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setNotice("备份已导出，包含记录和审计历史，不含原始报告文件。");
    } catch {
      setStorageError("无法导出数据，请检查浏览器存储权限。");
    }
  }
  function reset(next: State) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setState(next);
      setLoadError("");
      setStorageError("");
      setModal(null);
      setNotice(next.demo ? "已载入虚构示例。" : "所有本地记录已删除。");
    } catch {
      setStorageError("无法清空本地数据，请在浏览器设置中管理此站点的存储。");
    }
  }
  return (
    <div className="app">
      <div className={`demo ${state.demo ? "" : "local-banner"}`}>
        <span>
          ●　
          {state.demo
            ? state.audit.length || state.imports.length
              ? "演示模式　·　含虚构示例，真实使用前请先清空"
              : "演示模式　·　全部为虚构示例数据"
            : "本地模式　·　数据仅保存在当前浏览器"}
        </span>
        {state.demo && (
          <button onClick={() => setModal("delete")}>
            清空示例，开始使用 →
          </button>
        )}
      </div>
      <div className="layout">
        <aside>
          <div className="brand">
            <span className="brand-mark" aria-hidden="true">
              ↗
            </span>
            finances<i>.</i>
          </div>
          <nav className="nav" aria-label="主要导航">
            {PAGES.map((p) => (
              <button
                key={p.id}
                className={page === p.id ? "active" : ""}
                aria-current={page === p.id ? "page" : undefined}
                onClick={() => go(p.id)}
              >
                <span className="icon" aria-hidden="true">
                  <NavigationIcon page={p.id} />
                </span>
                {p.navLabel}
              </button>
            ))}
          </nav>
          <div className="sidefoot">
            <div className="local-indicator">
              <span className="status-dot" />
              浏览器本地存储
            </div>
            <p>
              个人财务工作台
              <br />
              余额手动更新 · 报告核对导入
            </p>
            <button onClick={exportData}>↓ 导出备份</button>
            <button onClick={() => setModal("delete")}>清空数据</button>
            {!state.demo && (
              <button onClick={() => setModal("demo")}>载入虚构示例</button>
            )}
            <small>不连接银行或 AI 服务</small>
          </div>
        </aside>
        <main className="main">
          <header className="header">
            <div>
              <div className="kicker">
                {new Date().toLocaleDateString("zh-CN", {
                  year: "numeric",
                  month: "long",
                  day: "numeric",
                })}{" "}
                · {state.demo ? "演示快照" : "个人财务工作台"}
              </div>
              <h1>{PAGES.find((p) => p.id === page)?.title}</h1>
            </div>
            <div className="actions">
              <button
                className="btn"
                onClick={() => {
                  setSelected(undefined);
                  setModal("balance");
                }}
              >
                ＋ 记录余额
              </button>
              <button className="btn primary" onClick={() => go("reports")}>
                ↑ 导入投资报告
              </button>
            </div>
          </header>
          {loadError && (
            <div className="form-error" role="alert">
              {loadError}{" "}
              <button className="smalllink" onClick={exportData}>
                导出原数据
              </button>
              <button
                className="smalllink negative"
                onClick={() => setModal("delete")}
              >
                清空并重新开始
              </button>
            </div>
          )}
          {storageError && (
            <div className="form-error" role="alert">
              {storageError}
            </div>
          )}
          {page === "overview" && <Overview state={state} go={go} />}
          {page === "accounts" && (
            <Accounts
              state={state}
              onAdd={() => setModal("account")}
              onEdit={(a) => {
                setSelected(a);
                setModal("balance");
              }}
              onManage={(a) => {
                setSelected(a);
                setModal("account-action");
              }}
            />
          )}
          {page === "investments" && (
            <Investments state={state} onImport={() => go("reports")} />
          )}
          {page === "reports" && (
            <Reports
              state={state}
              commit={commit}
              onAddAccount={() => setModal("account")}
            />
          )}
          <footer className="main-footer">
            <span>
              finances. <span>·</span> 私人财务，一目了然
            </span>
            <span>显示币种 CAD · 本地保存</span>
          </footer>
          <div className="mobile-data-actions">
            <button className="smalllink" onClick={exportData}>
              ↓ 导出备份
            </button>
            <button
              className="smalllink negative"
              onClick={() => setModal("delete")}
            >
              清空数据
            </button>
            {!state.demo && (
              <button className="smalllink" onClick={() => setModal("demo")}>
                载入示例
              </button>
            )}
          </div>
        </main>
      </div>
      {modal === "account" && (
        <AccountEditor
          state={state}
          commit={commit}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "account-action" && selected && (
        <AccountAction
          state={state}
          account={selected}
          commit={commit}
          onClose={() => setModal(null)}
        />
      )}
      {modal === "balance" && (
        <BalanceEditor
          state={state}
          account={selected}
          commit={commit}
          onClose={() => setModal(null)}
          onAdd={() => setModal("account")}
        />
      )}
      {modal === "delete" && (
        <Modal
          title={state.demo ? "清空示例，开始使用" : "删除本地数据"}
          subtitle="此操作会删除当前浏览器中此网站的所有记录"
          onClose={() => setModal(null)}
        >
          <div className="warning">
            包括账户、余额历史、持仓、待核对及已确认导入、文件指纹和审计记录。
            {state.demo ? "你对示例数据的修改也将删除。" : ""}
            删除后无法撤销，建议先导出备份。
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={exportData}>
              先导出备份
            </button>
            <button className="btn" onClick={() => setModal(null)}>
              取消
            </button>
            <button className="btn danger" onClick={() => reset(emptyState())}>
              确认删除全部数据
            </button>
          </div>
        </Modal>
      )}
      {modal === "demo" && (
        <Modal
          title="载入虚构示例"
          subtitle="用于体验页面和功能"
          onClose={() => setModal(null)}
        >
          <div className="warning">
            载入示例会替换当前全部本地记录。请先导出备份。示例中的账户、金额、持仓与分类均为虚构。
          </div>
          <div className="modal-actions">
            <button className="btn" onClick={exportData}>
              导出备份
            </button>
            <button className="btn" onClick={() => setModal(null)}>
              取消
            </button>
            <button className="btn primary" onClick={() => reset(demoState())}>
              确认替换为示例
            </button>
          </div>
        </Modal>
      )}
      {notice && (
        <div className="notification" role="status">
          <span>✓</span>
          {notice}
          <button onClick={() => setNotice("")} aria-label="关闭提示">
            ×
          </button>
        </div>
      )}
    </div>
  );
}
