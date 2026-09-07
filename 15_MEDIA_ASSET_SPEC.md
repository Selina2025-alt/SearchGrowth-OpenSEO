# Media Asset Spec V1.0

## 1. R2 是源资产仓

独立 `MEDIA_BUCKET`：private。

不把短期 R2 Signed URL 永久写入文章。

## 2. MediaAsset

字段：

- project；
- MIME；
- bytes；
- SHA256；
- dimensions/duration；
- storage key；
- rights status；
- data classification；
- source；
- created by/time。

## 3. Platform Media Preparation

```text
asset://id
→ target adapter upload/transfer
→ PublishedMediaRef
→ stable platform URL/media id
```

### Website

CMS 上传并返回企业站永久 media URL。

### Wechatsync

由其平台 adapter 转存图片。

### yxer

使用 `yxer upload` 返回完整资源对象，不手写 key/raw。

### social-auto-upload

local file/download cache + hash check。

## 4. PublishedMediaRef

```text
asset_id
platform
account_id
external_media_id
public_url
sha256
adapter_version
created_at
```

## 5. Upload Security

- MIME allowlist；
- size limit；
- magic bytes/MIME check；
- random storage key；
- no executable；
- filename sanitize；
- signed URL TTL；
- Bridge download 后 SHA256 recheck。

## 6. Rights

`UNKNOWN`：

- 不允许全自动 public release；
- 需人工确认/补权利状态。

## 7. Delete

Project 删除可清理 R2 source asset；
不自动删除外部平台已发布媒体。
