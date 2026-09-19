#!/bin/bash
# W-A1 P-7 pair runner with Class-C keep-warm heartbeat during half-2.
cd /Users/mr.apple/saito-admin1 || exit 2
L=.w-a1-audit/reflow
node .p7-gate.cjs > $L/P7h1.log 2>&1
echo "H1_EXIT=$?" >> $L/P7h1.log
sleep 30
node .w-a1-audit/w_a1_p7_heartbeat.cjs > $L/P7hb.log 2>&1 &
HB_PID=$!
sleep 10   # let heartbeat warm the pool before half-2's first check
P7_HALF=2 node .p7-gate.cjs > $L/P7h2.log 2>&1
echo "H2_EXIT=$?" >> $L/P7h2.log
kill $HB_PID 2>/dev/null
echo "PAIR_DONE $(date '+%H:%M:%S')" >> $L/P7h2.log
