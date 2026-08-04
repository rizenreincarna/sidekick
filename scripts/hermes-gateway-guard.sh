#!/bin/bash
# hermes-gateway-guard.sh — detect & kill duplicate hermes gateway processes.
#
# Background: each profile should have exactly ONE `hermes -p <profile> gateway run`
# process. Two PM2 apps were once both configured to run Marie's gateway with
# --replace, causing them to SIGTERM each other in an infinite restart loop.
# PM2 cannot detect this (each app looks healthy individually), so this guard
# checks for duplicates and kills the rogue (youngest) process.
#
# Runs every 5 min via cron. Logs only on action.

set -euo pipefail

LOG=/var/log/hermes-gateway-guard.log

log() { echo "$(date -Is) $*" >> "$LOG"; }

# Count running gateway processes per profile (including the default/no-profile form).
# Format: "<profile> <pid> <etimes>" sorted youngest-first handled below.
declare -A seen

while read -r pid etimes args; do
    # Extract profile: "-p <name>" or "default" when absent
    profile="default"
    if [[ "$args" =~ -p[[:space:]]+([a-zA-Z0-9_-]+) ]]; then
        profile="${BASH_REMATCH[1]}"
    fi

    if [[ -n "${seen[$profile]:-}" ]]; then
        # Duplicate: we've already kept the OLDEST (first seen, since ps sorts by start time).
        # Kill this younger duplicate.
        log "DUPLICATE gateway for profile=$profile: keeping pid=${seen[$profile]}, killing pid=$pid (age=${etimes}s) args=$args"
        kill -TERM "$pid" 2>/dev/null || true
    else
        seen[$profile]="$pid"
    fi
done < <(ps -eo pid,etimes,args --sort=start_time | grep -E 'hermes( |.* )-?p? .*gateway run' | grep -v grep)

exit 0
