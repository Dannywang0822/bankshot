# 弹个痛快 BANKSHOT!

默认是**弹球模式**：底部挡板左右拖，一颗球，3 条命，清完图案过关。开始屏可切回**经典模式**（原来的回合制瞄准）。两种模式最高分分开存。

在线玩：https://dannywang0822.github.io/bankshot/?v=10

```bash
node sim.js smart 10    # 经典平衡
node sim-trap.js        # 门闩 / 1000 关
node sim-endless.js     # 无尽
node sim-boss.js        # Boss
node sim-rules.js       # 随机玩法：复现、不重复、Boss 不抽、各规则可通关
node sim-score.js       # 每关可得分 vs 门槛（经典 / 随机 / 高关）
node sim-paddle.js      # 弹球：清图、门闩数量、技能不崩
```
