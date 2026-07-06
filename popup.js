// ==================== 常量 ====================
const DEFAULT_BLOCKLIST = [
  "bilibili.com", "youtube.com", "weibo.com", "instagram.com",
  "x.com", "twitter.com", "douyin.com", "zhihu.com",
  "xiaohongshu.com", "netflix.com"
];

// ==================== DOM 元素引用 ====================
const statusText       = document.getElementById("statusText");
const btnEnter         = document.getElementById("btnEnter");
const btnLeave         = document.getElementById("btnLeave");
const currentDomainEl  = document.getElementById("currentDomain");
const btnQuickToggle   = document.getElementById("btnQuickToggle");
const domainInput      = document.getElementById("domainInput");
const btnAdd           = document.getElementById("btnAdd");
const blocklistContainer = document.getElementById("blocklistContainer");

// 缓存当前标签页信息
let currentTabHostname = null;
let currentTabUrl      = null;

// ==================== 工具函数 ====================

/** 从 URL 字符串中提取 hostname（不含 www 等前缀的可靠方法） */
function extractHostname(urlStr) {
  try {
    return new URL(urlStr).hostname;
  } catch {
    return null;
  }
}

/** 规范化域名：去除首尾空白和多余的点，转为小写 */
function normalizeDomain(domain) {
  return domain.trim().replace(/^\.+|\.+$/g, "").toLowerCase();
}

/** 验证域名是否合法（简单校验） */
function isValidDomain(domain) {
  // 允许类似 "example.com" 或 "sub.example.co.uk" 的格式
  return /^([a-z0-9]([a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/i.test(domain);
}

// ==================== 初始化和默认值 ====================

/** 确保 storage 中有 blockList；不存在则写入默认值 */
function ensureBlockList(callback) {
  chrome.storage.local.get(["blockList"], (result) => {
    if (!result.blockList || !Array.isArray(result.blockList)) {
      chrome.storage.local.set({ blockList: DEFAULT_BLOCKLIST }, () => {
        callback(DEFAULT_BLOCKLIST);
      });
    } else {
      callback(result.blockList);
    }
  });
}

/** 获取当前活动标签页的 hostname */
function fetchCurrentTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs.length === 0) return callback(null, null);
    const tab = tabs[0];
    // 某些内部页面（如 chrome://, edge://）没有有意义的 hostname
    let hostname = extractHostname(tab.url);
    if (!hostname) {
      // 内部页面，给特殊标记
      hostname = null;
    }
    currentTabUrl = tab.url;
    currentTabHostname = hostname;
    callback(hostname, tab.url);
  });
}

// ==================== UI 渲染 ====================

/** 刷新全局控制区 */
function renderGlobalControl(isFocusing) {
  if (isFocusing) {
    statusText.textContent = "● 专注模式已开启";
    statusText.className = "status-text active";
    btnEnter.disabled = true;
    btnLeave.disabled = false;
  } else {
    statusText.textContent = "○ 专注模式未开启";
    statusText.className = "status-text";
    btnEnter.disabled = false;
    btnLeave.disabled = true;
  }
}

/** 刷新快捷操作区 */
function renderQuickAction(blockList) {
  if (!currentTabHostname) {
    currentDomainEl.textContent = "（当前页面无法拦截）";
    btnQuickToggle.textContent = "--";
    btnQuickToggle.disabled = true;
    return;
  }

  currentDomainEl.textContent = currentTabHostname;

  const isBlocked = blockList.some(
    (d) => d === currentTabHostname || currentTabHostname.endsWith("." + d)
  );

  if (isBlocked) {
    btnQuickToggle.textContent = "将当前网站移出黑名单";
    btnQuickToggle.className = "btn btn-quick";
  } else {
    btnQuickToggle.textContent = "一键拉黑当前网站";
    btnQuickToggle.className = "btn btn-quick";
  }
  btnQuickToggle.disabled = false;
}

/** 刷新黑名单列表区 */
function renderBlockList(blockList) {
  blocklistContainer.innerHTML = "";

  if (blockList.length === 0) {
    blocklistContainer.innerHTML = '<p class="blocklist-empty">黑名单为空</p>';
    return;
  }

  blockList.forEach((domain) => {
    const item = document.createElement("div");
    item.className = "blocklist-item";

    const domainSpan = document.createElement("span");
    domainSpan.className = "domain";
    domainSpan.textContent = domain;

    const delBtn = document.createElement("button");
    delBtn.className = "btn-del";
    delBtn.textContent = "✕";
    delBtn.title = "移出黑名单";
    delBtn.addEventListener("click", () => {
      removeFromBlockList(domain);
    });

    item.appendChild(domainSpan);
    item.appendChild(delBtn);
    blocklistContainer.appendChild(item);
  });
}

// ==================== 黑名单 CRUD ====================

/** 向 blockList 中添加域名 */
function addToBlockList(domain) {
  domain = normalizeDomain(domain);
  if (!isValidDomain(domain)) {
    alert("请输入有效的域名，如 v2ex.com");
    return;
  }

  chrome.storage.local.get(["blockList"], (result) => {
    const list = result.blockList || [];
    if (list.includes(domain)) {
      // 已存在，不重复添加，但静默处理
      return;
    }
    list.push(domain);
    chrome.storage.local.set({ blockList: list }, () => {
      refreshAll();
    });
  });
}

/** 从 blockList 中移除域名 */
function removeFromBlockList(domain) {
  chrome.storage.local.get(["blockList"], (result) => {
    const list = result.blockList || [];
    const newList = list.filter((d) => d !== domain);
    chrome.storage.local.set({ blockList: newList }, () => {
      refreshAll();
    });
  });
}

// ==================== 全面刷新 ====================

function refreshAll() {
  chrome.storage.local.get(["isFocusing", "blockList"], (result) => {
    const isFocusing = result.isFocusing === true;
    const blockList  = result.blockList || [];

    renderGlobalControl(isFocusing);
    renderQuickAction(blockList);
    renderBlockList(blockList);
  });
}

// ==================== 事件绑定 ====================

// 进入专注模式
btnEnter.addEventListener("click", () => {
  chrome.storage.local.set({ isFocusing: true }, () => {
    refreshAll();
  });
});

// 解除专注模式
btnLeave.addEventListener("click", () => {
  chrome.storage.local.set({ isFocusing: false }, () => {
    refreshAll();
  });
});

// 快捷操作：拉黑 / 移出黑名单
btnQuickToggle.addEventListener("click", () => {
  if (!currentTabHostname) return;

  chrome.storage.local.get(["blockList"], (result) => {
    const list = result.blockList || [];
    const isBlocked = list.some(
      (d) => d === currentTabHostname || currentTabHostname.endsWith("." + d)
    );

    if (isBlocked) {
      // 精确匹配域名移除；同时处理子域名情况
      // 找到实际匹配的黑名单条目
      const matched = list.find(
        (d) => d === currentTabHostname || currentTabHostname.endsWith("." + d)
      );
      if (matched) {
        removeFromBlockList(matched);
      }
    } else {
      addToBlockList(currentTabHostname);
    }
  });
});

// 手动添加域名
btnAdd.addEventListener("click", () => {
  const domain = domainInput.value;
  if (!domain) return;
  addToBlockList(domain);
  domainInput.value = "";
});

// 回车键添加
domainInput.addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    btnAdd.click();
  }
});

// ==================== 启动 ====================

// 1. 确保 blockList 存在（首次安装初始化）
ensureBlockList(() => {});

// 2. 获取当前标签页信息
fetchCurrentTab(() => {
  // 3. 全面刷新 UI
  refreshAll();
});
