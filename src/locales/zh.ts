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
