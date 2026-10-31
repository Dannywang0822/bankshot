# 弹个痛快 BANKSHOT!

拖动瞄准、松手发射，贴墙反弹叠倍率的打砖块肉鸽小游戏。默认是**随机玩法**：第 1 关热身，之后每关一条规则（同一种子可复现）。开始屏可以切回**经典模式**，手感和数值与以前相同。两种模式最高分分开存。每日挑战固定随机玩法。

在线玩：https://dannywang0822.github.io/bankshot/?v=8

```bash
node sim.js smart 10    # 经典平衡
node sim-trap.js        # 门闩 / 1000 关
node sim-endless.js     # 无尽
node sim-boss.js        # Boss
node sim-rules.js       # 随机玩法：复现、不重复、Boss 不抽、各规则可通关
node sim-score.js       # 每关可得分 vs 门槛（经典 / 随机 / 高关）
```
