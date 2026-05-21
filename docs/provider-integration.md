# 模型接入指南

Nomi 支持接入任意 AI 供应商：文生图、图生视频、文生视频、OpenAI 兼容的文本模型均可。

---

## 接入流程

顶部工具栏 → **模型接入** → 添加供应商，按以下步骤填写：

1. 填写供应商名称和 API Base URL
2. 填写你的 API Key（仅存在本地，不上传任何服务器）
3. 选择模型类型（文本 / 图片 / 视频）
4. 配置请求字段（提示词、宽高比、时长、模型名等）
5. 点击「测试」验证连接
6. 保存后即可在画布节点中选用

---

## 推荐供应商

### 文本模型（用于写脚本、拆镜头）

| 供应商 | 推荐模型 | 获取 Key |
|--------|---------|---------|
| DeepSeek | deepseek-chat | [platform.deepseek.com](https://platform.deepseek.com) |
| OpenAI | gpt-4o | [platform.openai.com](https://platform.openai.com) |
| 通义千问 | qwen-turbo | [dashscope.aliyun.com](https://dashscope.aliyun.com) |
| Ollama | 任意本地模型 | 本地运行，免费 |

> OpenAI 兼容接口均支持，Base URL 填对应地址即可。

### 图片生成

| 供应商 | 特点 | 官网 |
|--------|------|------|
| 即梦（Jimeng） | 国内便宜，效果好 | [volcengine.com/product/jimeng](https://www.volcengine.com/product/jimeng) |
| Stable Diffusion（本地） | 免费，需本地部署 | [stability.ai](https://stability.ai) |

### 视频生成

| 供应商 | 特点 | 官网 |
|--------|------|------|
| 可灵（Kling） | 国内，按秒计费 | [klingai.com](https://klingai.com) |
| Runway | 国际主流 | [runwayml.com](https://runwayml.com) |
| Wan（万象） | 开源可本地部署 | — |

---

## 用 Agent 辅助接入

如果供应商文档比较复杂，可以把 API 文档 URL 发给终端 Agent：

```
帮我接入 xxx 供应商，API 文档在 https://docs.xxx.com/api
```

Agent 会读取文档、生成配置草稿，你确认后保存即可。

---

## 安全说明

- API Key 仅保存在本地，不会上传到任何服务器
- 不要把 `apps/agents/agents.config.json` 提交到 Git（已在 `.gitignore` 中排除）
