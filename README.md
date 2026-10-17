# Now Playing

用于 OBS 的本地正在播放组件，目前支持 Windows 官方 Apple Music，后续可扩展其他音乐源。直接使用 Windows 的 Global System Media Transport Controls 媒体会话，无需 NowPlaying、Cider、浏览器扩展、Apple 开发者密钥或额外登录。

## 启动

1. 使用 Windows 10 1809 或更新版本 / Windows 11，安装官方 Apple Music。
2. 需要 Node.js 18+。项目不包含 npm 第三方依赖，无需执行 `npm install`。启动脚本也能使用当前 Codex 随附的 Node.js。
3. 双击 `start.cmd`，或在本目录执行 `node server.mjs`。
4. 打开 **http://127.0.0.1:3963**，在 Apple Music 播放歌曲。
5. 在控制台选择皮肤，点击「复制 OBS 组件链接」。
6. 在 OBS 新增「浏览器」来源，粘贴地址，按控制台建议填写画布宽高。

默认组件地址：`http://127.0.0.1:3963/overlay?profile=default`

直播期间保持服务窗口运行，控制台网页可关闭。按 Ctrl+C 停止服务。默认端口为 3963；PowerShell 中可用 `$env:PORT = '3964'` 后运行 `node server.mjs` 来修改端口，OBS 地址需相应修改。

## 功能

- 14 种独立设计：Default、Experimental、Rotating、Rotating Dark、Modern、Modern V2、Transparent、Aiden Wallis Redesign、Rainbow、Aiden Wallis、Aurora、Prism、Pulse、Pulse Progress。
- 标题、艺术家、专辑、系统封面、播放进度、时间、Apple Music 标识和真实音频频谱。
- 7 个组件显示开关，3 种字体，强调色/文字色/背景色，宽度、透明度、圆角、缩放和对齐。
- 暂停延迟隐藏、动画开关、尊重系统减少动态效果设置。
- 多场景独立配置与稳定 OBS URL、自动保存、配置 JSON 导入导出。
- SSE 实时同步配置与歌曲信息，断线自动重连；服务断开或没有歌曲时 OBS 透明隐藏。
- 明确标注的演示预览、真实歌曲预览、深/浅/透明网格背景和全屏预览。
- Apple Music 上一曲、播放/暂停、下一曲（是否接受指令由官方客户端决定）。
- 连接诊断、当前运行期间的最近播放记录。

## 完整皮肤展示与频谱

控制台「全部 14 款总览」或 `http://127.0.0.1:3963/skins.html` 可以集中查看全部皮肤。

Default 的悬出封面与专辑模糊背景、Experimental 的上下渐变横条、Rotating / Rotating Dark 的外凸旋转唱片、Modern 的单行唱片图标、Modern V2 的字排分隔、Transparent 的透明金色文字、两款 Aiden 的不同排版、Rainbow 的上浮封面与进度，以及 Aurora 的氛围面板、Prism 的斜切封面、Pulse 的长波形进度均为独立布局。

选择皮肤会应用该款的参考配色和组件组合，同时保留 OBS 输出尺寸、缩放、字体、隐藏行为等场景参数。「恢复当前皮肤」可以重新应用参考样式。全部皮肤无需付费解锁。

从旧版更新后，旧配置会自动转换到新的布局默认值，原配置备份在 `.runtime/settings-before-skin-update.json`。场景 ID 和 OBS URL 保持有效。浏览器页面需刷新，正在运行的服务需重启以加载新的配置版本。

### 真实音频频谱

在「进度与频谱」中选择「实时音频频谱」，并打开「使用实时歌曲」预览。OBS 浏览器源会直接使用真实采集数据。

默认仅采集 Apple Music：会识别其实际输出声音的 `AppleMusic.exe` 或 `AMPLibraryAgent.exe` 会话并采集对应进程树，避免其他应用声音混入。此模式需要支持进程环回的 Windows 版本（Build 20348+，Windows 11 支持）。也可以明确选择「默认输出设备（全部声音）」来采集系统混音；切换默认输出设备后会重新连接。不会自动切换到系统混音。

采集模块通过系统自带 PowerShell 编译并运行本地 C# 源码，不需安装 NAudio 或其他库。44 个频段在本机计算，仅数值通过 SSE 传给组件，不录制、保存或传输原始音频。使用 2048 点 FFT（44.1 kHz 下约 46 毫秒的分析窗口），目标每 16 毫秒更新一次；实际频率取决于音频设备的回调周期。页面每次绘制只使用最新帧，不额外插值缓动；超过 150 毫秒的旧帧会丢弃。设备与进程检查在独立线程进行，避免阻塞采集。蓝牙、音频驱动和 OBS 的输出设置仍会影响最终声画同步。只有频谱组件连接时才会启动；切为进度条、关闭频谱或关闭所有使用频谱的页面后会自动停止。采集来源设置保存在 `.runtime/audio.json`。

如果连接状态为「当前无有效信号」，请确认音乐正在播放、音量未静音，且采集来源与播放输出一致。系统不支持、设备不可用或受保护音频返回静音时会如实显示，不会用模拟动画冒充真实频谱。

这些是参照参考页命名与风格制作的独立实现，不包含原站源代码或商用资源。

## 数据与限制

歌曲、封面和音频频谱仅通过本机 Windows 接口读取；没有外部网络请求。服务仅监听 `127.0.0.1`，不向局域网开放。设置和少量封面缓存在 `.runtime/`；关闭服务后可删除该目录恢复默认配置。最近播放仅保留在服务内存中。

Apple Music 的系统会话有时将「艺术家 — 专辑」合并到艺术家字段，本项目会在专辑字段为空时拆分该格式。未发布封面时使用音符占位图；未发布时长时显示 `--:--`。没有登录、未开始播放或客户端暂未发布媒体信息时，不会在 OBS 播放示例歌曲。

歌词和 Apple Music 动态封面暂不包含。真实音频频谱由独立的 WASAPI 环回采集模块计算，歌曲信息仍来自 Windows 媒体会话。黑胶等其他视觉动效为动画。本工具不向 OBS 发送可播放音频；声音请通过 OBS 桌面音频或应用程序音频采集获取。

所有皮肤都有「跟随皮肤默认 / 实时音频频谱 / 普通进度条 / 关闭」四种显示方式，以及频谱灵敏度。Pulse 默认显示频谱；新增的 Pulse Progress 默认显示进度条。实时预览和 OBS 的 44 根频谱柱由真实音频的 FFT 决定高度；演示预览和皮肤卡片仍是明确标注的模拟动效。

频谱和普通进度条均使用两段进度颜色：从开头到当前进度统一使用强调色，剩余部分使用「未播放颜色」（默认灰色），不再额外高亮进度附近的柱子。边界落在某一根柱子中间时，该柱子会按进度分为两色；柱子的高度仍独立由音频决定。

实时频谱会压低较弱频段、突出较强频段，并快速上升和回落，让高低差及节拍更明显。灵敏度使用平滑映射，避免提高灵敏度后多根柱子同时顶满。

在「外观」开启「主题色跟随封面」后，全部皮肤的进度条已播放部分、频谱已播放部分及使用强调色的文字和装饰，会自动使用封面的主要颜色，并根据背景明暗调整可读性。切歌后自动重新取色；未播放部分仍使用「未播放颜色」。无封面、封面无法取色或关闭开关时回退到手动强调色。开关按场景保存，切换皮肤时保留。

OBS 与 Apple Music 需要在同一台 Windows 电脑运行。如果 OBS 裁切组件，使用控制台推荐的浏览器画布尺寸；缩放超过 1 倍时应相应增加画布。

## 架构

```text
Apple Music 官方客户端
    ↓ Windows.Media.Control / WinRT
bridge/media.ps1（系统内置 Windows PowerShell 5.1）
    ↓ UTF-8 JSON 行 / 本地命令文件
server.mjs（Node.js 原生 HTTP + SSE，127.0.0.1）
    ├── /             中文控制台
    ├── /api/events   实时数据与配置
    └── /overlay      OBS 透明浏览器来源
```

音频支路：`bridge/audio.ps1` → `bridge/AudioCapture.cs`（WASAPI 环回、2048 点 FFT）→ `/api/spectrum` → 44 根频谱柱。普通进度条不启动这条采集支路。

`public/shared.js` 是样式默认值和皮肤目录的唯一来源。`lib/config.mjs` 负责服务端配置校验与媒体字段规范化。服务端拒绝跨站写入、非本机 Host 和静态目录越界访问。

## 验证与诊断

运行 `node --test`，验证配置校验、媒体进度、Apple Music 字段拆分、独立场景持久化与重启恢复、SSE 配置推送、输入和访问限制。

读取一次媒体状态：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\bridge\media.ps1 -RuntimePath "$PWD\.runtime" -Once
```

封面接口诊断：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\bridge\diagnose.ps1
```

如果未检测到歌曲，先确认 Windows 媒体浮层能显示 Apple Music，再重启官方客户端。系统媒体读取需要在登录用户的桌面会话运行，不适合放在隔离沙箱或无交互用户的 Windows 服务中。

参考：[皮肤与组件需求](https://nowplaying.site/#features) · [Windows 媒体会话接口](https://learn.microsoft.com/en-us/uwp/api/windows.media.control.globalsystemmediatransportcontrolssession)
