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
      content = content.replace(/orange-500/g, 'violet-500');
      content = content.replace(/orange-600/g, 'violet-600');
      content = content.replace(/orange-400/g, 'violet-400');
      content = content.replace(/fuchsia-500/g, 'purple-500');
      content = content.replace(/fuchsia-400/g, 'purple-400');
      content = content.replace(/yellow-500/g, 'blue-500');
      content = content.replace(/cyan-500/g, 'indigo-500');
      content = content.replace(/cyan-400/g, 'indigo-400');
      fs.writeFileSync(fullPath, content);
    }
  }
}

replaceColors('./src');
