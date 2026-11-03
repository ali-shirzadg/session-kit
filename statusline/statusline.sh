#!/bin/bash
# Claude Code status line — minimal, fast, self-defensive.
#
# Design rules (post-incident hardening + code.claude.com/docs/en/statusline):
#   - stdin read is BOUNDED (head -c), never open-ended: a leaked pipe fd from
#     the harness must not turn this process into a memory sink again
#   - one jq pass total; no network, no keychain — rate limits come on stdin
#   - git dirty-count is cached (10s TTL); git can be slow in big repos and
#     this script runs on every session update
#   - always prints something and exits 0
#
# Line 1: repo 🌿branch ±dirty | Model [effort] | ctx bar tok% | ~$cost | +A -R | ⏱dur
# Line 2: 5h bar % (reset) | 7d bar % (reset)

input=$(head -c 262144)
[ -z "$input" ] && { printf 'Claude'; exit 0; }
command -v jq >/dev/null 2>&1 || { printf 'Claude (jq missing)'; exit 0; }

row=$(printf '%s' "$input" | jq -r '[
  (.model.display_name // "Claude"),
  (.context_window.used_percentage // 0 | floor),
  (.cost.total_cost_usd // 0),
  (.cost.total_lines_added // 0),
  (.cost.total_lines_removed // 0),
  (.cost.total_duration_ms // 0),
  (.effort | if type == "object" then (.level // "NA") else (. // "NA") end),
  (.rate_limits.five_hour.used_percentage // "NA" | if . == "NA" then . else floor end),
  (.rate_limits.five_hour.resets_at // "NA"),
  (.rate_limits.seven_day.used_percentage // "NA" | if . == "NA" then . else floor end),
  (.rate_limits.seven_day.resets_at // "NA"),
  (.workspace.current_dir // .cwd // "NA")
] | @tsv' 2>/dev/null)
[ -z "$row" ] && { printf 'Claude'; exit 0; }
IFS=$'\t' read -r model ctx_pct cost ladd lrem dur_ms effort p5 r5 p7 r7 cwd <<< "$row"

# Last seen plan usage, for Claude to read between steps (one small write).
[ "$p5" != "NA" ] && printf '%s %s %s %s %s\n' "$(date +%s)" "$p5" "$r5" "$p7" "$r7" \
    > "${TMPDIR:-/tmp}/claude-usage.txt" 2>/dev/null

blue=$'\033[38;2;0;153;255m'; orange=$'\033[38;2;255;176;85m'
green=$'\033[38;2;0;160;0m';  cyan=$'\033[38;2;46;149;153m'
red=$'\033[38;2;255;85;85m';  yellow=$'\033[38;2;230;200;0m'
dim=$'\033[2m'; reset=$'\033[0m'

pct_color() {
    if   [ "$1" -ge 90 ] 2>/dev/null; then printf '%s' "$red"
    elif [ "$1" -ge 70 ] 2>/dev/null; then printf '%s' "$yellow"
    elif [ "$1" -ge 50 ] 2>/dev/null; then printf '%s' "$orange"
    else printf '%s' "$green"; fi
}

bar() {
    local pct=$1 filled empty
    [ "$pct" -gt 100 ] 2>/dev/null && pct=100
    [ "$pct" -lt 0 ] 2>/dev/null && pct=0
    filled=$(( pct / 10 )); empty=$(( 10 - filled ))
    local F='██████████' E='░░░░░░░░░░'
    printf '%s%s%s%s%s' "$(pct_color "$pct")" "${F:0:filled}" "$dim" "${E:0:empty}" "$reset"
}

now=$(date +%s)
until_epoch() {   # epoch -> "in 2h 5m" / "in 3d 1h" / "now"
    local diff=$(( $1 - now ))
    [ "$diff" -le 0 ] && { printf 'now'; return; }
    local d=$(( diff / 86400 )) h=$(( (diff % 86400) / 3600 )) m=$(( (diff % 3600) / 60 ))
    if   [ "$d" -gt 0 ]; then printf 'in %dd %dh' "$d" "$h"
    elif [ "$h" -gt 0 ]; then printf 'in %dh %dm' "$h" "$m"
    else printf 'in %dm' "$m"; fi
}

# ── git (branch is cheap; dirty count cached 10s per repo) ──
repo='' branch='' dirty=''
if [ "$cwd" != "NA" ] && [ -d "$cwd" ]; then
    git_root=$(git -C "$cwd" rev-parse --show-toplevel 2>/dev/null)
    if [ -n "$git_root" ]; then
        repo=${git_root##*/}
        branch=$(git -C "$cwd" branch --show-current 2>/dev/null)
        cache_dir=${TMPDIR:-/tmp}/claude-statusline-cache
        mkdir -p "$cache_dir" 2>/dev/null
        key=$(printf '%s' "$git_root" | tr '/ ' '__')
        cache_file="$cache_dir/$key.dirty"
        age=999
        if [ -f "$cache_file" ]; then
            mt=$(stat -c %Y "$cache_file" 2>/dev/null || stat -f %m "$cache_file" 2>/dev/null)
            [ -n "$mt" ] && age=$(( now - mt ))
        fi
        if [ "$age" -lt 10 ]; then
            dirty=$(head -c 16 "$cache_file" 2>/dev/null)
        else
            dirty=$(git -C "$cwd" status --porcelain 2>/dev/null | grep -c .)
            printf '%s' "$dirty" > "$cache_file" 2>/dev/null
        fi
        [ "$dirty" = "0" ] && dirty=''
    fi
fi

case "$effort" in
    low) eff="${green}L${reset}" ;; medium) eff="${orange}M${reset}" ;;
    high) eff="${yellow}H${reset}" ;; xhigh) eff="${red}XH${reset}" ;;
    max) eff="${red}X${reset}" ;; *) eff='' ;;
esac

dur=''
if [ "$dur_ms" -gt 0 ] 2>/dev/null; then
    s=$(( dur_ms / 1000 )); h=$(( s / 3600 )); m=$(( (s % 3600) / 60 ))
    if [ "$h" -gt 0 ]; then dur="${h}h${m}m"; else dur="${m}m$(( s % 60 ))s"; fi
fi

line1=''
if [ -n "$repo" ]; then
    line1+="${yellow}${repo}${reset}"
    [ -n "$branch" ] && line1+=" ${cyan}🌿(${branch})${reset}"
    [ -n "$dirty" ] && line1+=" ${orange}±${dirty}${reset}"
    line1+=" ${dim}|${reset} "
fi
line1+="${blue}${model}${reset}"
[ -n "$eff" ] && line1+=" $eff"
line1+=" ${dim}|${reset} $(bar "$ctx_pct") $(pct_color "$ctx_pct")${ctx_pct}%${reset}"
line1+=" ${dim}|${reset} ${dim}~\$$(printf '%.2f' "$cost" 2>/dev/null || printf '%s' "$cost")${reset}"
if [ "$ladd" -gt 0 ] 2>/dev/null || [ "$lrem" -gt 0 ] 2>/dev/null; then
    line1+=" ${dim}|${reset} ${green}+${ladd}${reset} ${red}-${lrem}${reset}"
fi
[ -n "$dur" ] && line1+=" ${dim}| ⏱${dur}${reset}"

line2=''
if [ "$p5" != "NA" ] || [ "$p7" != "NA" ]; then
    if [ "$p5" != "NA" ]; then
        line2+="5h $(bar "$p5") ${cyan}${p5}%${reset}"
        [ "$r5" != "NA" ] && line2+=" ${dim}$(until_epoch "$r5")${reset}"
    fi
    if [ "$p7" != "NA" ]; then
        [ -n "$line2" ] && line2+=" ${dim}|${reset} "
        line2+="7d $(bar "$p7") ${cyan}${p7}%${reset}"
        [ "$r7" != "NA" ] && line2+=" ${dim}$(until_epoch "$r7")${reset}"
    fi
fi

printf '%s' "$line1"
[ -n "$line2" ] && printf '\n%s' "$line2"
exit 0
