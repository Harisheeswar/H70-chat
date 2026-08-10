import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const indexPath = path.join(__dirname, 'index.js');
let source = fs.readFileSync(indexPath, 'utf8');

const replacements = [
  ["const JWT_SECRET = process.env.JWT_SECRET || 'h70_fallback_secret_keys';", "const JWT_SECRET = process.env.JWT_SECRET;\nif (!JWT_SECRET) {\n  throw new Error('JWT_SECRET environment variable is required.');\n}"],
  ['app.post(\'/api/upload\', upload.single(\'media\'), (req, res) => {', 'app.post(\'/api/upload\', authenticateToken, upload.single(\'media\'), (req, res) => {'],
  ['const myRequests = async (user.friendRequests || []).filter(id => id !== friendId);', 'const myRequests = (user.friendRequests || []).filter(id => id !== friendId);'],
  ['const theirSentRequests = async (target.sentRequests || []).filter(id => id !== req.user.id);', 'const theirSentRequests = (target.sentRequests || []).filter(id => id !== req.user.id);'],
  ['const myRequests = async (user.friendRequests || []).filter(id => id !== friendId);', 'const myRequests = (user.friendRequests || []).filter(id => id !== friendId);'],
  ['const theirSent = async (target.sentRequests || []).filter(id => id !== req.user.id);', 'const theirSent = (target.sentRequests || []).filter(id => id !== req.user.id);'],
  ['let friends = async (user.friends || []).filter(id => id !== friendId);', 'let friends = (user.friends || []).filter(id => id !== friendId);'],
  ["const resetToken = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);", "const resetToken = crypto.randomBytes(32).toString('hex');"]
];

if (!source.includes("import crypto from 'crypto';")) {
  source = "import crypto from 'crypto';\n" + source;
}

for (const [from, to] of replacements) {
  if (source.includes(from)) source = source.replaceAll(from, to);
}

fs.writeFileSync(indexPath, source, 'utf8');

const child = spawn(process.execPath, [indexPath], {
  stdio: 'inherit',
  env: process.env
});
child.on('exit', code => process.exit(code ?? 0));
