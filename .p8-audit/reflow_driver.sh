#!/bin/bash
# P-8 final reflow: ALL frozen gates, sequential, solo (HANDOVER rule: never parallel).
cd /Users/mr.apple/saito-admin1 || exit 1
mkdir -p .p8-audit/reflow
: > .p8-audit/reflow/summary.txt
run(){
  name="$1"; shift
  echo "=== REFLOW START $name $(date +%H:%M:%S) ===" | tee -a .p8-audit/reflow/summary.txt
  "$@" > ".p8-audit/reflow/$name.log" 2>&1
  code=$?
  echo "=== REFLOW $name EXIT=$code $(date +%H:%M:%S) ===" | tee -a .p8-audit/reflow/summary.txt
  tail -4 ".p8-audit/reflow/$name.log" | tee -a .p8-audit/reflow/summary.txt
  if [ $code -ne 0 ]; then echo "!!! REFLOW HALT: $name failed" | tee -a .p8-audit/reflow/summary.txt; exit $code; fi
}
run A     node .a-regression.cjs
run ES    node .es-gate.cjs
run F     node .f-gate.cjs
run O     node .o-gate.cjs
run KL3   node .k-l3-probe.cjs
run KL4   node .k-l4-probe.cjs
run P1    node .p1-gate.cjs
run P2    node .p2-gate.cjs
run P3    node .p3-gate.cjs
run P4    node .p4-gate.cjs
run P5    node .p5-gate.cjs
run P6    node .p6-gate.cjs
run P7    node .p7-gate.cjs
echo "=== REFLOW COMPLETE $(date +%H:%M:%S) ===" | tee -a .p8-audit/reflow/summary.txt
