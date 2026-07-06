(function () {
  "use strict";

  // ==================== 常量 ====================
  const OVERLAY_ID = "myself-focus-overlay";

  // ==================== 域名匹配 ====================

  /** 检查 hostname 是否命中黑名单（兼容子域名匹配） */
  function isHostBlocked(hostname, blockList) {
    if (!hostname || !blockList || blockList.length === 0) return false;
    for (let i = 0; i < blockList.length; i++) {
      const blocked = blockList[i];
      if (hostname === blocked || hostname.endsWith("." + blocked)) {
        return true;
      }
    }
    return false;
  }

  // ==================== 遮罩操作 ====================

  function overlayExists() {
    return !!document.getElementById(OVERLAY_ID);
  }

  function createOverlay() {
    if (overlayExists()) return;

    const overlay = document.createElement("div");
    overlay.id = OVERLAY_ID;
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 2147483647;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(8px);
      -webkit-backdrop-filter: blur(8px);
      display: flex; flex-direction: column;
      align-items: center; justify-content: center;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    `;

    const message = document.createElement("p");
    message.textContent = "当前处于专注状态，切勿分心";
    message.style.cssText = `
      color: #ccc; font-size: 22px; margin-bottom: 28px;
      text-align: center; letter-spacing: 2px;
    `;

    const button = document.createElement("button");
    button.textContent = "确认任务已完成，允许访问";
    button.style.cssText = `
      padding: 12px 32px; font-size: 16px; border: none;
      border-radius: 8px; cursor: pointer;
      background: #4caf50; color: #fff;
      transition: opacity 0.2s;
    `;
    button.addEventListener("mouseenter", () => { button.style.opacity = "0.85"; });
    button.addEventListener("mouseleave", () => { button.style.opacity = "1"; });

    button.addEventListener("click", () => {
      chrome.storage.local.set({ isFocusing: false }, () => {
        removeOverlay();
      });
    });

    overlay.appendChild(message);
    overlay.appendChild(button);
    document.documentElement.appendChild(overlay);
  }

  function removeOverlay() {
    const el = document.getElementById(OVERLAY_ID);
    if (el) el.remove();
  }

  // ==================== 核心逻辑 ====================

  const currentHostname = window.location.hostname;

  /**
   * 读取 storage 并决定是否注入遮罩。
   * 只有在「域名命中黑名单」且「isFocusing = true」时才创建遮罩。
   */
  function checkAndAct() {
    chrome.storage.local.get(["isFocusing", "blockList"], (result) => {
      // 未命中黑名单 → 零操作，直接返回
      if (!isHostBlocked(currentHostname, result.blockList)) return;

      // 命中黑名单 + 专注模式 → 显示遮罩
      if (result.isFocusing === true) {
        createOverlay();
      }
      // 命中黑名单 + 非专注模式 → 确保无遮罩残留
      else {
        removeOverlay();
      }
    });
  }

  /**
   * 监听存储变化，实时响应：
   * - isFocusing 变更 → 检查是否需要显示/隐藏遮罩
   * - blockList 变更 → 当前页面若被新拉黑则实时弹出遮罩，若被移除则实时关闭
   */
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== "local") return;

    const relevantChange = changes.isFocusing || changes.blockList;
    if (!relevantChange) return;

    // blockList 变更：重新判断当前域名是否仍在黑名单中
    if (changes.blockList) {
      const newList = changes.blockList.newValue || [];
      const wasBlocked = changes.blockList.oldValue
        ? isHostBlocked(currentHostname, changes.blockList.oldValue)
        : false;
      const isNowBlocked = isHostBlocked(currentHostname, newList);

      if (!wasBlocked && isNowBlocked) {
        // 刚被拉黑 → 如果在专注模式，立刻弹遮罩
        chrome.storage.local.get(["isFocusing"], (r) => {
          if (r.isFocusing === true) createOverlay();
        });
        return;
      }

      if (wasBlocked && !isNowBlocked) {
        // 刚被移出 → 移除遮罩
        removeOverlay();
        return;
      }
    }

    // isFocusing 变更：仅当当前域名在黑名单中时才响应
    if (changes.isFocusing) {
      chrome.storage.local.get(["isFocusing", "blockList"], (r) => {
        if (!isHostBlocked(currentHostname, r.blockList)) return;
        if (r.isFocusing === true) {
          createOverlay();
        } else {
          removeOverlay();
        }
      });
    }
  });

  // ==================== 启动 ====================

  // 页面加载时立即执行（document_start 确保在 DOM 构建前运行）
  // 使用 setTimeout 0 将 chrome.storage 的异步读取推迟到下一个微任务，
  // 避免阻塞页面加载关键路径；同时确保在 DOM 可用时快速注入遮罩。
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", checkAndAct);
  } else {
    checkAndAct();
  }
})();
