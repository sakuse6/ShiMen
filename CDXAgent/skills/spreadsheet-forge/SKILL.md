---
name: 表格工坊
description: 当用户要求把数据输出为 xlsx、csv、结构化清单、统计表、研究数据表或可交付电子表格时使用。适合把 JSON、CSV、列表记录写入项目目录中的表格文件。
---

# 表格工坊

用于生成结构化表格文件，重点支持：

- `xlsx`
- `csv`
- 研究台账
- 数据清单
- 结果汇总表

## 何时使用

- “生成 Excel”
- “把这些数据整理成表格”
- “做一个 xlsx 交付件”
- “输出字段清单 / 样本表 / 结果表”

## 推荐脚本

```powershell
python .\scripts\make_xlsx.py --json ".\rows.json" --output ".\.lmentor\artifacts\data.xlsx" --sheet "结果"
```

或：

```powershell
python .\scripts\make_xlsx.py --csv ".\rows.csv" --output ".\.lmentor\artifacts\data.xlsx"
```

## 使用要求

1. 尽量先明确列名。
2. 所有产物写入项目目录。
3. 如果用户只需要预览，也可先输出 `csv`。
4. 完成后报告文件路径与行列规模。

