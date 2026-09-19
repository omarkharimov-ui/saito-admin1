#!/bin/bash
# W-A1 P-7 pair + live session monitor (diagnostic run, 2026-09-19)
cd /Users/mr.apple/saito-admin1 || exit 2
L=.w-a1-audit/reflow
node .p7-gate.cjs > $L/P7h1.log 2>&1
echo "H1_EXIT=$?" >> $L/P7h1.log
sleep 15
node .w-a1-audit/w_a1_p7_session_monitor.cjs > /dev/null 2>&1 &
MON_PID=$!
P7_HALF=2 node .p7-gate.cjs > $L/P7h2.log 2>&1
echo "H2_EXIT=$?" >> $L/P7h2.log
kill $MON_PID 2>/dev/null
echo "PAIR_DONE $(date '+%H:%M:%S')" >> $L/P7h2.log
