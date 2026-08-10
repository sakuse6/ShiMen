---
name: Office 解析台
description: 当用户要求读取、拆解、提取或检查 docx、xlsx、pptx 等 Office 文件内容、结构或图片资源时使用。适合对 Office 文档做文本提取、媒体抽取和结构排查。
---

# Office 解析台

用于解析常见 Office Open XML 文件：

- `docx`
- `xlsx`
- `pptx`

## 典型任务

- 提取正文文本
- 提取幻灯片文本
- 抽取内嵌图片
- 快速检查文档结构

## 推荐脚本

```powershell
python .\scripts\inspect_ooxml.py --input ".\report.docx" --output-dir ".\.lmentor\artifacts\report-inspect"
```

脚本会输出：

- `summary.json`
- `text.txt`
- `media/` 目录

## 使用原则

1. 先判断扩展名。
2. 解析结果默认写到项目目录内。
3. 如果抽取出图片，在最终回复中明确指出图片目录路径，方便前端渲染和复用。

