# Skill: Next Action
version: 1.0
purpose: 根据实验结果和最新机会给出下一轮可执行动作。
inputs: experiment comparison, opportunity queue, technical blockers
outputs: one primary action + reasons + evidence + expected measurement
rules:
- 不自动扩大scope。
- 不因为单次波动生成大规模内容。
- 优先修blocking issue，再做新内容。
