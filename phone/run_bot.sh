#!/data/data/com.termux/files/usr/bin/bash
# Run the Telegram bot forever: restart it if it crashes, pull code updates on each restart.
# Only ONE copy of the bot may run per token — set RUN_BOT=0 on Render while the phone runs it.
termux-wake-lock 2>/dev/null || true
cd ~/sb/streambreaker-backend || exit 1
while true; do
    git -C ~/sb pull --ff-only -q 2>/dev/null || true
    echo "[$(date '+%F %T')] starting bot"
    ~/sbenv/bin/python bot1_receptionist.py
    echo "[$(date '+%F %T')] bot exited with code $? — restarting in 15 s"
    sleep 15
done
