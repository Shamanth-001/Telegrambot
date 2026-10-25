#!/data/data/com.termux/files/usr/bin/bash
# Set up the StreamBreaker Telegram bot on an Android phone (Termux).
# Run inside Termux:   bash ~/sb/phone/setup_termux.sh
# Then put the bot's settings in ~/sb/streambreaker-backend/.env and start it with ~/sb/phone/run_bot.sh
set -e

echo "==> Installing packages"
pkg update -y
pkg install -y python git openssh

echo "==> Getting the code"
if [ -d ~/sb/.git ]; then
    git -C ~/sb pull --ff-only
else
    git clone --depth 1 https://github.com/Shamanth-001/Telegrambot.git ~/sb
fi

echo "==> Installing Python packages (pure-Python builds, no compiler needed)"
# aiohttp and its helpers have optional C speedups; skip them so nothing needs compiling
export AIOHTTP_NO_EXTENSIONS=1 MULTIDICT_NO_EXTENSIONS=1 YARL_NO_EXTENSIONS=1 \
       FROZENLIST_NO_EXTENSIONS=1 PROPCACHE_NO_EXTENSIONS=1
python -m venv ~/sbenv
~/sbenv/bin/pip install --upgrade pip
~/sbenv/bin/pip install -r ~/sb/phone/requirements-phone.txt

echo "==> Auto-start at boot (needs the Termux:Boot app, opened once)"
mkdir -p ~/.termux/boot
cat > ~/.termux/boot/start-streambreaker.sh <<'EOF'
#!/data/data/com.termux/files/usr/bin/bash
termux-wake-lock
sshd
nohup ~/sb/phone/run_bot.sh > ~/sb/bot.log 2>&1 &
EOF
chmod +x ~/.termux/boot/start-streambreaker.sh ~/sb/phone/run_bot.sh

echo
echo "Done. Next:"
echo "  1. Create ~/sb/streambreaker-backend/.env with BOT1_TOKEN, TMDB_API_KEY, DATABASE_URL, ..."
echo "  2. Start:  nohup ~/sb/phone/run_bot.sh > ~/sb/bot.log 2>&1 &"
