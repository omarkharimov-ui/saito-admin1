#!/bin/bash
# P-8 final reflow part 2 (post-triage): A (post-residue-purge), O (O_ROUTE env),
# K-L3/L4, P1..P7 (P7_ALL=1). Sequential, solo.
cd /Users/mr.apple/saito-admin1 || exit 1
export O_ROUTE="$PWD/artifacts/saito-admin/src/app/api/orders/route.ts"
: > .p8-audit/reflow/summary2.txt
run(){
  name="$1"; shift
  echo "=== REFLOW2 START $name $(date +%H:%M:%S) ===" | tee -a .p8-audit/reflow/summary2.txt
  "$@" > ".p8-audit/reflow/${name}2.log" 2>&1
  code=$?
  echo "=== REFLOW2 $name EXIT=$code $(date +%H:%M:%S) ===" | tee -a .p8-audit/reflow/summary2.txt
  grep -E "TOTAL|ALL GREEN|SUMMARY|RISK|HARNESS|=====|GATE:|PASS [0-9]+/|FAIL [0-9]+|REAL-RISK" ".p8-audit/reflow/${name}2.log" | tail -6 | tee -a .p8-audit/reflow/summary2.txt
  if [ $code -ne 0 ]; then echo "!!! REFLOW2 HALT: $name failed" | tee -a .p8-audit/reflow/summary2.txt; exit $code; fi
}
run A     node .a-regression.cjs
run O     node .o-gate.cjs
run KL3   node .k-l3-probe.cjs
run KL4   node .k-l4-probe.cjs
run P1    node .p1-gate.cjs
run P2    node .p2-gate.cjs
run P3    node .p3-gate.cjs
run P4    node .p4-gate.cjs
run P5    node .p5-gate.cjs
run P6    node .p6-gate.cjs
run P7    env P7_ALL=1 node .p7-gate.cjs
echo "=== REFLOW2 COMPLETE $(date +%H:%M:%S) ===" | tee -a .p8-audit/reflow/summary2.txt
