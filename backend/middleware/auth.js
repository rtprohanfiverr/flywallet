const { verifyToken } = require('../lib/jwt');
const prisma = require('../lib/prisma');

/**
 * Middleware: require valid JWT
 */
async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization;
    if (!header || !header.startsWith('Bearer ')) {
      return res.status(401).json({ error: 'Unauthorized — token required' });
    }

    const token = header.slice(7);
    const decoded = verifyToken(token);

    // Attach user to request
    req.userId = decoded.id;
    req.userRole = decoded.role;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Unauthorized — invalid or expired token' });
  }
}

/**
 * Middleware: require ADMIN role
 */
async function requireAdmin(req, res, next) {
  await requireAuth(req, res, async () => {
    if (req.userRole !== 'ADMIN') {
      return res.status(403).json({ error: 'Forbidden — admin access required' });
    }
    next();
  });
}

/**
 * Middleware: check if user account is frozen
 */
async function checkNotFrozen(req, res, next) {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { isFrozen: true },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.isFrozen) return res.status(403).json({ error: 'Account is frozen. Contact support.' });
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = { requireAuth, requireAdmin, checkNotFrozen };
