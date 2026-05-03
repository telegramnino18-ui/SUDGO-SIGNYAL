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
      content = content.replace(/rgba\(34,211,238/g, 'rgba(129,140,248'); // cyan -> indigo
      content = content.replace(/text-cyan-/g, 'text-indigo-');
      content = content.replace(/border-cyan-/g, 'border-indigo-');
      content = content.replace(/shadow-cyan-/g, 'shadow-indigo-');
      content = content.replace(/rgba\(217,70,239/g, 'rgba(168,85,247'); // fuchsia -> purple
      content = content.replace(/text-fuchsia-/g, 'text-purple-');
      content = content.replace(/border-fuchsia-/g, 'border-purple-');
      content = content.replace(/shadow-fuchsia-/g, 'shadow-purple-');
      content = content.replace(/rgba\(249,115,22/g, 'rgba(139,92,246'); // orange -> violet
      content = content.replace(/text-orange-/g, 'text-violet-');
      content = content.replace(/border-orange-/g, 'border-violet-');
      content = content.replace(/shadow-orange-/g, 'shadow-violet-');
      
      content = content.replace(/rgba\(234,179,8/g, 'rgba(59,130,246'); // yellow -> blue
      content = content.replace(/text-yellow-/g, 'text-blue-');
      content = content.replace(/border-yellow-/g, 'border-blue-');
      content = content.replace(/shadow-yellow-/g, 'shadow-blue-');
      fs.writeFileSync(fullPath, content);
    }
  }
}

replaceColors('./src');
