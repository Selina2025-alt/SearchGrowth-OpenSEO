#!/usr/bin/env bash
set -euo pipefail

# Official SkillHub.cn CLI-only installer path referenced by its installation guidance.
# Review the downloaded installer in high-assurance environments before execution.
curl -fsSL https://skillhub-1388575217.cos.ap-guangzhou.myqcloud.com/install/install.sh \
  | bash -s -- --cli-only

export PATH="$HOME/.local/bin:$PATH"
command -v skillhub
skillhub --help >/dev/null
echo "SkillHub CLI installed. Use it only for skill discovery/installation; Search Growth runtime does not depend on it."
