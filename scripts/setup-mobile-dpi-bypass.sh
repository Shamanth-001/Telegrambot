#!/bin/bash
# Mobile DPI Bypass Setup Script for Termux
# This script sets up the best mobile solutions for bypassing DPI blocking

echo "🚀 Setting up Mobile DPI Bypass Solutions for Termux"
echo "=================================================="

# Update Termux packages
echo "📦 Updating Termux packages..."
pkg update && pkg upgrade -y

# Install required packages
echo "🔧 Installing required packages..."
pkg install -y wget curl git make clang rust

# Option 1: ByeDPI Android (Recommended)
echo "📱 Setting up ByeDPI Android (Recommended)..."
echo "Download ByeDPI Android from:"
echo "  F-Droid: https://f-droid.org/packages/ru.valdikss.goodbyedpi/"
echo "  GitHub: https://github.com/ValdikSS/GoodbyeDPI/releases"
echo ""
echo "Configuration settings to enable:"
echo "  ✅ Desync HTTP/HTTPS/UDP"
echo "  ✅ Host mixed case"
echo "  ✅ Split TLS Record"
echo ""
echo "Note: Fragment packets and auto-start are not available in ByeDPI Android"
echo ""

# Option 2: Shadowsocks-rust (Fallback)
echo "🔒 Setting up Shadowsocks-rust (Fallback solution)..."
cargo install shadowsocks-rust

# Create Shadowsocks config
mkdir -p ~/.shadowsocks
cat > ~/.shadowsocks/config.json << 'EOF'
{
    "server": "0.0.0.0",
    "server_port": 8080,
    "password": "your-secure-password-here",
    "method": "aes-256-gcm",
    "local_port": 1080,
    "timeout": 300,
    "fast_open": true
}
EOF

echo "Shadowsocks config created at: ~/.shadowsocks/config.json"
echo "To start Shadowsocks: ssserver -c ~/.shadowsocks/config.json"
echo ""

# Option 3: 3proxy (Advanced)
echo "🌐 Setting up 3proxy (Advanced solution)..."
git clone https://github.com/z3APA3A/3proxy.git ~/3proxy
cd ~/3proxy
make -f Makefile.Linux

# Create 3proxy config
mkdir -p ~/3proxy/logs
cat > ~/3proxy/3proxy.cfg << 'EOF'
nscache 65536
timeouts 1 5 30 60 180 1800 15 60
log /data/data/com.termux/files/home/3proxy/logs/3proxy.log D
auth none
internal 0.0.0.0
proxy -p8080
socks -p1080
EOF

echo "3proxy config created at: ~/3proxy/3proxy.cfg"
echo "To start 3proxy: cd ~/3proxy && ./3proxy 3proxy.cfg"
echo ""

# Create startup script
cat > ~/start-dpi-bypass.sh << 'EOF'
#!/bin/bash
echo "🚀 Starting DPI Bypass Solutions..."

# Check if ByeDPI is running (Android app)
if pgrep -f "goodbyedpi" > /dev/null; then
    echo "✅ ByeDPI Android is running"
else
    echo "⚠️  ByeDPI Android not detected - please start the app manually"
fi

# Start Shadowsocks if config exists
if [ -f ~/.shadowsocks/config.json ]; then
    echo "🔒 Starting Shadowsocks..."
    ssserver -c ~/.shadowsocks/config.json &
    echo "✅ Shadowsocks started on port 8080"
fi

# Start 3proxy if available
if [ -f ~/3proxy/3proxy ]; then
    echo "🌐 Starting 3proxy..."
    cd ~/3proxy && ./3proxy 3proxy.cfg &
    echo "✅ 3proxy started on ports 8080 (HTTP) and 1080 (SOCKS5)"
fi

echo "🎯 DPI Bypass solutions are ready!"
echo "Your bot will automatically detect and use the best available solution."
EOF

chmod +x ~/start-dpi-bypass.sh

echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "1. Install ByeDPI Android from F-Droid or GitHub"
echo "2. Configure ByeDPI with the recommended settings"
echo "3. Start ByeDPI Android app"
echo "4. Run your Telegram bot - it will automatically detect mobile environment"
echo ""
echo "🚀 To start all DPI bypass solutions:"
echo "   ./start-dpi-bypass.sh"
echo ""
echo "📱 Mobile advantages:"
echo "  • Residential IP addresses (less likely to be blocked)"
echo "  • Dynamic IP rotation (toggle airplane mode)"
echo "  • Natural traffic patterns (bypasses geo-blocking)"
echo ""
echo "🎯 Your bot will now automatically:"
echo "  • Detect mobile environment"
echo "  • Use ByeDPI for DPI bypass"
echo "  • Fallback to Shadowsocks/3proxy if needed"
echo "  • Optimize network settings for mobile"
