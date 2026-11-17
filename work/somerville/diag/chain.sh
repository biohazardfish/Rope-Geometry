# usage: chain.sh start.json out.json stage1json stage2json ...
cur=$(cat "$1"); out=$2; shift 2
for st in "$@"; do node work/somerville/diag/march.mjs "$cur" "$st" 0.0002 /tmp/chain-step.json > /tmp/chain-log.txt; r=$(grep REACHED /tmp/chain-log.txt | awk '{print $2}'); echo "stage $st -> s=$r | $(grep -E '^(ok|fail)' /tmp/chain-log.txt | tail -1 | cut -c1-160)"; [ -s /tmp/chain-step.json ] && cur=$(cat /tmp/chain-step.json); rm -f /tmp/chain-step.json; done
echo "$cur" > "$out"; echo "$cur"
