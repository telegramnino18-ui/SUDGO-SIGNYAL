const fs = require('fs');
const path = require('path');

function walkSync(dir, filelist) {
  const files = fs.readdirSync(dir);
  filelist = filelist || [];
  files.forEach(function(file) {
    if (fs.statSync(path.join(dir, file)).isDirectory()) {
      filelist = walkSync(path.join(dir, file), filelist);
    } else {
      filelist.push(path.join(dir, file));
    }
  });
  return filelist;
}

const files = walkSync('./src');
files.forEach(file => {
  if (file.endsWith('.tsx') || file.endsWith('.ts')) {
    let content = fs.readFileSync(file, 'utf8');
    let original = content;
    
    // Convert purple to blue-purple (indigo)
    content = content.replace(/purple-400/g, 'indigo-400');
    content = content.replace(/purple-500/g, 'indigo-500');
    content = content.replace(/purple-600/g, 'indigo-600');

    // Add glowing shadows to backgrounds and texts
    content = content.replace(/shadow-purple-500\/20/g, 'shadow-[0_0_20px_rgba(99,102,241,0.6)] border border-indigo-400/30');
    content = content.replace(/shadow-\[0_0_15px_rgba\(168,85,247,0\.([0-9])\)\]/g, 'shadow-[0_0_20px_rgba(99,102,241,0.8)] border border-indigo-400/50');
    
    // Add text glows
    content = content.replace(/text-indigo-400/g, 'text-indigo-400 drop-shadow-[0_0_10px_rgba(129,140,248,0.8)]');
    content = content.replace(/text-indigo-500/g, 'text-indigo-500 drop-shadow-[0_0_10px_rgba(99,102,241,0.8)]');
    
    // Fix any double drop-shadows if they occur
    content = content.replace(/(drop-shadow-\[.*?\] )+drop-shadow-\[.*?\]/g, 'drop-shadow-[0_0_10px_rgba(129,140,248,0.8)]');

    if (content !== original) {
      fs.writeFileSync(file, content);
      console.log('Updated', file);
    }
  }
});
