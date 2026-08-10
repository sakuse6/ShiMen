---
name: 图解工坊
description: 当用户要求把内容输出为可渲染图像、svg 图表、信息卡片、流程图式说明、可视化概览或前端可直接展示的图片文件时使用。适合生成 svg 交付物并在回复里引用本地图片路径。
---

# 图解工坊

用于生成前端可直接渲染的本地图片文件，优先输出：

- `svg`
- 结构图
- 柱状图
- 信息卡片
- 表格式图解

## 何时使用

- “请用图表告诉我”
- “生成一张说明图”
- “做成可视化卡片”
- “输出一张前端能显示的图片”

## 推荐脚本

### 由 JSON 生成 SVG

```powershell
python .\scripts\make_svg_chart.py --input ".\chart.json" --output ".\.lmentor\artifacts\chart.svg" --title "模型对比"
```

支持的 `kind`：

- `bar`
- `cards`
- `timeline`
- `table`

## 输出原则

1. 产物必须写入项目目录。
2. 最终回复里明确写出图片路径。
3. 若用户要求“前端直接渲染”，优先输出 `svg`，其次再考虑位图。

