const fs = require('fs');
const path = require('path');

function replaceColors(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      replaceColors(fullPath);
    } else if (fullPath.endsWith('.tsx') || fullPath.endsWith('.ts')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      content = content.replace(/from-orange-/g, 'from-violet-');
      content = content.replace(/to-orange-/g, 'to-violet-');
      content = content.replace(/from-cyan-/g, 'from-indigo-');
      content = content.replace(/to-cyan-/g, 'to-indigo-');
      content = content.replace(/from-yellow-/g, 'from-blue-');
      content = content.replace(/to-yellow-/g, 'to-blue-');
      content = content.replace(/from-fuchsia-/g, 'from-purple-');
      content = content.replace(/to-fuchsia-/g, 'to-purple-');
      fs.writeFileSync(fullPath, content);
    }
  }
}

replaceColors('./src');
