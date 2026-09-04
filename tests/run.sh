#!/usr/bin/env bash
# รันชุดทดสอบด้วยเบราว์เซอร์จริง
#
#   bash tests/run.sh            รันทั้งหมด
#   bash tests/run.sh doc pdf    รันเฉพาะที่ระบุ (ไม่ต้องใส่ .js)
#
# ต้องมีเซิร์ฟเวอร์สองตัวก่อน — ดู tests/README.md
set -u
cd "$(dirname "$0")"

pick=("$@")
if [ ${#pick[@]} -eq 0 ]; then
  mapfile -t pick < <(ls *.js | sed 's/\.js$//')
fi

fail=0
for name in "${pick[@]}"; do
  out=$(timeout 300 node "$name.js" 2>&1)
  code=$?
  line=$(echo "$out" | grep -E '✅|❌|สรุป' | tail -1)
  if [ $code -eq 0 ]; then
    printf '  ✓ %-14s %s\n' "$name" "${line:0:70}"
  else
    fail=1
    printf '  ✗ %-14s %s\n' "$name" "${line:0:70}"
    echo "$out" | grep '✗' | sed 's/^/      /'
  fi
done

if [ $fail -eq 0 ]; then echo; echo "✅ ผ่านหมด"; else echo; echo "❌ มีชุดที่ตก"; fi
exit $fail
