# Media / Social Publishing Spec V1.0

## 1. Creator Platform Route

对于抖音、小红书、视频号、B站、YouTube/TikTok 等，优先使用已有专用执行器，不强行走文章草稿流程。

## 2. social-auto-upload

定位：`SOCIAL_AUTO_UPLOAD_NATIVE`。

使用方式：
- 独立 Python/Playwright worker；
- 通过 Local Bridge 调 CLI/固定入口；
- cookie/storage state 留本地；
- pin commit/version；
- 每个平台独立 smoke。

主仓不需要把 Python uploader 逻辑重新写成 TypeScript。

## 3. Postiz

定位：海外/API 社交发布。

- 独立 Postiz service；
- Search Growth 主应用通过 API；
- 不把 AGPL 源码混入主仓；
- 商业化前做 AGPL 合规复核。

## 4. yxer media

若 yxer 对某视频/图文平台真实 smoke 更稳，可 PublicationExecutionPlan 选择 `YXER_NATIVE`，而不是同时调用 social-auto-upload。

## 5. Platform Constraints

Capability Registry 不只是 boolean，还保存：

```text
maxTitleChars
maxBodyChars
maxImages
maxVideoBytes
allowedMimeTypes
maxTags
supportsExternalLinks
supportsSchedule
scheduleWindow
coverRequirements
```

Content variant 在 Release Dry Run 前就完成适配。

## 6. Scheduling

定时发布只在用户/Release 明确配置时启用。

不把普通发布静默转换为定时。

## 7. Published Receipt

保存：
- platform/account；
- content/media hashes；
- external id；
- URL；
- adapter/version；
- submitted/published time；
- verification。
