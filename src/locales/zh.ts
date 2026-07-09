export const zh = {
  island: {
    idle: "空闲",
    hover: "悬停",
    expanded: "已展开",
  },
  pin: {
    scale: "缩放",
    rotation: "旋转",
    opacity: "透明度",
    alwaysOnTop: "置顶",
    lock: "锁定",
    unlock: "解锁",
    close: "关闭",
    flipH: "水平翻转",
    flipV: "垂直翻转",
    rotate: "旋转 90°",
    copy: "复制到剪贴板",
    saveAs: "另存为...",
    hide: "隐藏",
    delete: "删除",
    displaying: "显示中",
    hidden: "已隐藏",
    closed: "已关闭",
    noPins: "暂无贴图",
    pinListTitle: "贴图管理",
  },
  clipboard: {
    newImage: "检测到新图片",
    pinToDesktop: "贴到桌面",
    dismiss: "忽略",
  },
  system: {
    trayShow: "显示/隐藏灵动岛",
    traySettings: "设置",
    trayQuit: "退出",
  },
} as const;

export type Locale = typeof zh;
