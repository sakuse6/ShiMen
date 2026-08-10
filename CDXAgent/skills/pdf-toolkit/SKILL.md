---
name: PDF 工具箱
description: 当用户要求解析、提取、拆分、合并、重排、审阅或整理 PDF 文件时使用。适合处理论文、合同、报告、扫描件和导出的 PDF 成品。
---

# PDF 工具箱

该 skill 主要处理 PDF 输入与 PDF 后处理。

## 典型任务

- 提取全文文本
- 合并多个 PDF
- 按页拆分 PDF
- 导出每页文本摘要
- 检查 PDF 页数与元数据

## 推荐脚本

### 提取文本

```powershell
python .\scripts\pdf_toolkit.py extract --input ".\paper.pdf" --output ".\.lmentor\artifacts\paper.txt"
```

### 合并

```powershell
python .\scripts\pdf_toolkit.py merge --inputs ".\a.pdf" ".\b.pdf" --output ".\.lmentor\artifacts\merged.pdf"
```

### 拆分

```powershell
python .\scripts\pdf_toolkit.py split --input ".\paper.pdf" --output-dir ".\.lmentor\artifacts\paper-pages"
```

## 注意

1. 若 PDF 是图片扫描件，文本提取可能为空。
2. 若提取失败，应向用户明确说明是“扫描件 / 无文本层”。

