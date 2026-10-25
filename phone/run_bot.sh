#!/data/data/com.termux/files/usr/bin/bash
# Run the Telegram bot forever: restart it if it crashes, and pick up new code from GitHub.
# Only ONE copy of the bot may run per token — set RUN_BOT=0 on Render while the phone runs it.
termux-wake-lock 2>/dev/null || true
cd ~/sb/streambreaker-backend || exit 1

# Every 10 minutes: if GitHub has new commits, pull them and stop the bot so the loop below
# restarts it on the new code (the loop itself pulls too, which is harmless).
(
    while sleep 600; do
        git -C ~/sb fetch -q origin main 2>/dev/null || continue
        if [ "$(git -C ~/sb rev-parse HEAD)" != "$(git -C ~/sb rev-parse origin/main)" ]; then
            git -C ~/sb pull --ff-only -q && echo "[$(date '+%F %T')] update pulled: $(git -C ~/sb log --oneline -1)"
            pkill -f "^python bot1_receptionist.py"
        fi
    done
) &

while true; do
    git -C ~/sb pull --ff-only -q 2>/dev/null || true
    echo "[$(date '+%F %T')] starting bot ($(git -C ~/sb log --oneline -1 | cut -c1-60))"
    python bot1_receptionist.py
    echo "[$(date '+%F %T')] bot exited with code $? — restarting in 15 s"
    sleep 15
done
