---
name: 文档工坊
description: 当用户要求把内容输出为 docx、html、pdf、研究简报、正式报告、可交付文档或带图片的书面成品时使用。适合把已有 Markdown、提纲、研究结果或聊天结论落成项目目录中的正式文档文件。
---

# 文档工坊

用于把内容稳定落成项目目录内的文档成品，重点支持：

- `docx`
- `html`
- `pdf`
- 文档输出目录整理

## 何时使用

当用户提出下面这类要求时优先使用本 skill：

- “导出成 Word”
- “生成一份正式报告”
- “把这段内容做成 PDF”
- “输出一份可提交的文档”
- “把研究结果整理到项目目录”

## 工作原则

1. 默认把产物写到当前项目目录下的 `.lmentor/artifacts/`。
2. 先确定输入来源：
   - 直接使用用户本轮提供的文本
   - 或读取项目中的 Markdown / TXT / JSON / CSV 文件
3. 优先同时产出：
   - 一个可编辑源文件，如 `md` 或 `html`
   - 一个交付文件，如 `docx` 或 `pdf`
4. 完成后在最终回复中明确给出文件路径。
5. 如果文档内引用了本地图像，尽量使用相对路径或同目录资源，避免脆弱绝对路径。

## 推荐脚本

### 1. 生成 HTML 报告

```powershell
python .\scripts\make_html_report.py --input ".\notes.md" --output ".\.lmentor\artifacts\report.html" --title "研究简报"
```

如果没有输入文件，也可把正文经标准输入传给脚本。

### 2. 生成 DOCX

```powershell
python .\scripts\make_docx.py --input ".\notes.md" --output ".\.lmentor\artifacts\report.docx" --title "研究简报"
```

### 3. 由 HTML 打印 PDF

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\make_pdf_via_edge.ps1 -InputHtml ".\.lmentor\artifacts\report.html" -OutputPdf ".\.lmentor\artifacts\report.pdf"
```

## 推荐流程

1. 先整理正文内容
2. 生成 `html`
3. 生成 `docx`
4. 若系统存在 Edge 或 Chrome，再生成 `pdf`
5. 向用户汇报所有成功产物与失败项

## 失败处理

- 若 `pdf` 打印失败：
  - 不要假装成功
  - 保留 `html` 与 `docx`
  - 在回复中说明浏览器打印链路失败原因
- 若正文很长：
  - 先生成 `html`
  - 再复用同一输入生成 `docx`

## 输出要求

最终回复至少包含：

- 生成了哪些文件
- 每个文件的路径
- 是否还有未成功的格式

