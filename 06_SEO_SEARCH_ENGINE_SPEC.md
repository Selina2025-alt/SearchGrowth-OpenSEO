# SEO / Search Engine Spec V1.0

## 1. SEO 目标

SEO 链路：

```text
Published
→ Discoverable
→ Crawled
→ Indexed
→ Ranking
→ Organic Visit
→ Key Event
```

## 2. Google

复用：

- GSC performance；
- URL inspection；
- rank/DataForSEO；
- GA4。

普通文章：

- sitemap；
- internal link；
- GSC observation。

**普通 SEO 页面禁止使用 Google Indexing API 作为通用提交接口。**

## 3. Baidu

P0：

- DataForSEO/当前可用 provider 的 Baidu SERP/rank contract smoke；
- robots/sitemap/canonical；
- 可获得合法站长接口时启用 submit/inspect adapter；
- 无接口时明确 `SUBMISSION_NOT_CONFIGURED`，不假成功。

## 4. Bing

- SERP/rank provider；
- IndexNow 可作为 URL notification；
- Bing Webmaster 可 P0.5。

## 5. SearchIndexAdapter

```ts
interface SearchIndexAdapter {
  engine: SearchEngine;
  capabilities(): Promise<{
    inspect: boolean;
    submit: boolean;
    sitemap: boolean;
  }>;
  inspect(url: string): Promise<IndexObservation>;
  submit?(url: string): Promise<SubmissionResult>;
}
```

## 6. Crawler Access Audit

Technical baseline 还检查：

- robots.txt；
- noindex；
- canonical；
- Googlebot/Bingbot；
- OAI-SearchBot；
- 配置中启用的其它 AI search crawlers。

只报告 `ALLOWED | BLOCKED | UNKNOWN`，P0 不自动改 robots/WAF。

## 7. PageFit / Cannibalization

NEW_PAGE 前至少查询：

- OpenSEO key pages；
- GSC landing pages；
- rank pages；
- sitemap/crawl pages；
- title/H1/topic intent。

输出：

- candidate URLs；
- similarity/intent evidence；
- action：NEW/REFRESH/MERGE。

## 8. OwnedSite Update

REFRESH_PAGE：

1. fetch current page/revision；
2. 保存 Before Snapshot；
3. diff；
4. Release Approval；
5. compare-and-set update；
6. verify。

不能静默覆盖人工刚更新的页面。
