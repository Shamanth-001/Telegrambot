import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

// Advanced session persistence manager
class SessionPersistenceManager {
  constructor(sessionDir = './sessions') {
    this.sessionDir = sessionDir;
    this.sessions = new Map();
    this.ensureSessionDir();
  }

  // Ensure session directory exists
  ensureSessionDir() {
    if (!fs.existsSync(this.sessionDir)) {
      fs.mkdirSync(this.sessionDir, { recursive: true });
      console.log(`[SessionManager] Created session directory: ${this.sessionDir}`);
    }
  }

  // Generate session ID
  generateSessionId(domain) {
    const timestamp = Date.now().toString();
    const random = crypto.randomBytes(8).toString('hex');
    return `${domain}_${timestamp}_${random}`;
  }

  // Create new session
  createSession(domain, initialData = {}) {
    const sessionId = this.generateSessionId(domain);
    const session = {
      id: sessionId,
      domain,
      createdAt: new Date().toISOString(),
      lastAccessed: new Date().toISOString(),
      cookies: [],
      headers: {},
      metadata: {
        userAgent: '',
        viewport: { width: 1920, height: 1080 },
        language: 'en-US',
        timezone: 'UTC'
      },
      ...initialData
    };

    this.sessions.set(sessionId, session);
    this.saveSession(session);
    
    console.log(`[SessionManager] Created session: ${sessionId} for ${domain}`);
    return session;
  }

  // Load session from file
  loadSession(sessionId) {
    try {
      const sessionPath = path.join(this.sessionDir, `${sessionId}.json`);
      
      if (!fs.existsSync(sessionPath)) {
        return null;
      }

      const sessionData = JSON.parse(fs.readFileSync(sessionPath, 'utf8'));
      this.sessions.set(sessionId, sessionData);
      
      console.log(`[SessionManager] Loaded session: ${sessionId}`);
      return sessionData;
      
    } catch (error) {
      console.error(`[SessionManager] Error loading session ${sessionId}:`, error.message);
      return null;
    }
  }

  // Save session to file
  saveSession(session) {
    try {
      const sessionPath = path.join(this.sessionDir, `${session.id}.json`);
      fs.writeFileSync(sessionPath, JSON.stringify(session, null, 2));
      
      console.log(`[SessionManager] Saved session: ${session.id}`);
      return true;
      
    } catch (error) {
      console.error(`[SessionManager] Error saving session ${session.id}:`, error.message);
      return false;
    }
  }

  // Update session
  updateSession(sessionId, updates) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      console.warn(`[SessionManager] Session ${sessionId} not found`);
      return false;
    }

    // Update session data
    Object.assign(session, updates);
    session.lastAccessed = new Date().toISOString();
    
    this.sessions.set(sessionId, session);
    this.saveSession(session);
    
    return true;
  }

  // Add cookies to session
  addCookies(sessionId, cookies) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      console.warn(`[SessionManager] Session ${sessionId} not found`);
      return false;
    }

    // Merge new cookies with existing ones
    const existingCookies = new Map(session.cookies.map(c => [c.name, c]));
    
    for (const cookie of cookies) {
      existingCookies.set(cookie.name, {
        name: cookie.name,
        value: cookie.value,
        domain: cookie.domain || session.domain,
        path: cookie.path || '/',
        expires: cookie.expires || -1,
        httpOnly: cookie.httpOnly || false,
        secure: cookie.secure || false,
        sameSite: cookie.sameSite || 'Lax'
      });
    }

    session.cookies = Array.from(existingCookies.values());
    session.lastAccessed = new Date().toISOString();
    
    this.sessions.set(sessionId, session);
    this.saveSession(session);
    
    console.log(`[SessionManager] Added ${cookies.length} cookies to session ${sessionId}`);
    return true;
  }

  // Update headers
  updateHeaders(sessionId, headers) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      console.warn(`[SessionManager] Session ${sessionId} not found`);
      return false;
    }

    session.headers = { ...session.headers, ...headers };
    session.lastAccessed = new Date().toISOString();
    
    this.sessions.set(sessionId, session);
    this.saveSession(session);
    
    console.log(`[SessionManager] Updated headers for session ${sessionId}`);
    return true;
  }

  // Get session cookies for Puppeteer
  getPuppeteerCookies(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return [];
    }

    return session.cookies.map(cookie => ({
      name: cookie.name,
      value: cookie.value,
      domain: cookie.domain,
      path: cookie.path,
      expires: cookie.expires > 0 ? cookie.expires : undefined,
      httpOnly: cookie.httpOnly,
      secure: cookie.secure,
      sameSite: cookie.sameSite
    }));
  }

  // Get session headers
  getSessionHeaders(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return {};
    }

    return {
      ...session.headers,
      'User-Agent': session.metadata.userAgent,
      'Accept-Language': session.metadata.language
    };
  }

  // Get session for domain
  getSessionForDomain(domain) {
    const sessions = Array.from(this.sessions.values())
      .filter(session => session.domain === domain)
      .sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));

    return sessions.length > 0 ? sessions[0] : null;
  }

  // Create or get existing session for domain
  getOrCreateSession(domain) {
    let session = this.getSessionForDomain(domain);
    
    if (!session) {
      session = this.createSession(domain);
    } else {
      // Update last accessed time
      session.lastAccessed = new Date().toISOString();
      this.sessions.set(session.id, session);
      this.saveSession(session);
    }
    
    return session;
  }

  // Clean up expired sessions
  cleanupExpiredSessions(maxAge = 24 * 60 * 60 * 1000) { // 24 hours
    const now = Date.now();
    const expiredSessions = [];
    
    for (const [sessionId, session] of this.sessions.entries()) {
      const lastAccessed = new Date(session.lastAccessed).getTime();
      
      if (now - lastAccessed > maxAge) {
        expiredSessions.push(sessionId);
      }
    }
    
    for (const sessionId of expiredSessions) {
      this.deleteSession(sessionId);
    }
    
    console.log(`[SessionManager] Cleaned up ${expiredSessions.length} expired sessions`);
    return expiredSessions.length;
  }

  // Delete session
  deleteSession(sessionId) {
    const session = this.sessions.get(sessionId);
    
    if (session) {
      // Delete file
      const sessionPath = path.join(this.sessionDir, `${sessionId}.json`);
      if (fs.existsSync(sessionPath)) {
        fs.unlinkSync(sessionPath);
      }
      
      // Remove from memory
      this.sessions.delete(sessionId);
      
      console.log(`[SessionManager] Deleted session: ${sessionId}`);
      return true;
    }
    
    return false;
  }

  // Export session for external use
  exportSession(sessionId, format = 'json') {
    const session = this.sessions.get(sessionId);
    
    if (!session) {
      return null;
    }

    switch (format.toLowerCase()) {
      case 'json':
        return JSON.stringify(session, null, 2);
        
      case 'curl':
        const cookies = session.cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const headers = Object.entries(session.headers)
          .map(([key, value]) => `-H "${key}: ${value}"`)
          .join(' ');
        
        return `curl ${headers} -H "Cookie: ${cookies}"`;
        
      case 'wget':
        const wgetCookies = session.cookies.map(c => `${c.name}=${c.value}`).join('; ');
        const wgetHeaders = Object.entries(session.headers)
          .map(([key, value]) => `--header="${key}: ${value}"`)
          .join(' ');
        
        return `wget ${wgetHeaders} --header="Cookie: ${wgetCookies}"`;
        
      default:
        return session;
    }
  }

  // Import session from external source
  importSession(sessionData, domain) {
    try {
      let session;
      
      if (typeof sessionData === 'string') {
        session = JSON.parse(sessionData);
      } else {
        session = sessionData;
      }
      
      // Validate session data
      if (!session.id || !session.domain) {
        throw new Error('Invalid session data: missing id or domain');
      }
      
      // Update domain if provided
      if (domain) {
        session.domain = domain;
      }
      
      session.lastAccessed = new Date().toISOString();
      
      this.sessions.set(session.id, session);
      this.saveSession(session);
      
      console.log(`[SessionManager] Imported session: ${session.id}`);
      return session;
      
    } catch (error) {
      console.error(`[SessionManager] Error importing session:`, error.message);
      return null;
    }
  }

  // Get session statistics
  getSessionStats() {
    const stats = {
      totalSessions: this.sessions.size,
      domains: new Set(),
      totalCookies: 0,
      oldestSession: null,
      newestSession: null
    };
    
    let oldestTime = Infinity;
    let newestTime = 0;
    
    for (const session of this.sessions.values()) {
      stats.domains.add(session.domain);
      stats.totalCookies += session.cookies.length;
      
      const createdAt = new Date(session.createdAt).getTime();
      if (createdAt < oldestTime) {
        oldestTime = createdAt;
        stats.oldestSession = session;
      }
      if (createdAt > newestTime) {
        newestTime = createdAt;
        stats.newestSession = session;
      }
    }
    
    stats.domains = Array.from(stats.domains);
    
    return stats;
  }

  // List all sessions
  listSessions() {
    return Array.from(this.sessions.values()).map(session => ({
      id: session.id,
      domain: session.domain,
      createdAt: session.createdAt,
      lastAccessed: session.lastAccessed,
      cookieCount: session.cookies.length,
      headerCount: Object.keys(session.headers).length
    }));
  }
}

export default SessionPersistenceManager;
