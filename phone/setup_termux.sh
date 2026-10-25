#!/data/data/com.termux/files/usr/bin/bash
# Set up the StreamBreaker Telegram bot on an Android phone (Termux).
# Run inside Termux:   bash ~/sb/phone/setup_termux.sh
# Then put the bot's settings in ~/sb/streambreaker-backend/.env and start it with ~/sb/phone/run_bot.sh
set -e

echo "==> Installing packages"
# full-upgrade first: installing python alone can leave libraries (e.g. libexpat) out of date
export DEBIAN_FRONTEND=noninteractive
APT_OPTS="-y -o Dpkg::Options::=--force-confdef -o Dpkg::Options::=--force-confold"
apt-get update
apt-get $APT_OPTS full-upgrade
apt-get $APT_OPTS install python python-pip git openssh

echo "==> Getting the code"
if [ -d ~/sb/.git ]; then
    git -C ~/sb pull --ff-only
else
    git clone --depth 1 https://github.com/Shamanth-001/Telegrambot.git ~/sb
fi

echo "==> Installing Python packages (pure-Python builds, no compiler needed)"
# aiohttp and its helpers have optional C speedups; skip them so nothing needs compiling.
# Termux's python can't create venvs (no ensurepip), so packages go into Termux's own Python.
export AIOHTTP_NO_EXTENSIONS=1 MULTIDICT_NO_EXTENSIONS=1 YARL_NO_EXTENSIONS=1        FROZENLIST_NO_EXTENSIONS=1 PROPCACHE_NO_EXTENSIONS=1
python -m pip install -r ~/sb/phone/requirements-phone.txt

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
