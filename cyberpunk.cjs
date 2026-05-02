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
    
    // Convert green to blue (cyan)
    content = content.replace(/green-500/g, 'cyan-400');
    content = content.replace(/green-400/g, 'cyan-300');
    content = content.replace(/green-600/g, 'cyan-500');

    // Convert red to purple (fuchsia/purple)
    // Be careful with shadow-red-500 etc. Let's do straight string replaces
    content = content.replace(/red-500/g, 'fuchsia-500');
    content = content.replace(/red-400/g, 'fuchsia-400');
    content = content.replace(/red-600/g, 'fuchsia-600');

    // Add glows to cyan
    content = content.replace(/text-cyan-400/g, 'text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]');
    content = content.replace(/border-cyan-400\/[0-9]+/g, '$& shadow-[0_0_15px_rgba(34,211,238,0.4)]');
    
    // Add glows to fuchsia
    content = content.replace(/text-fuchsia-500/g, 'text-fuchsia-500 drop-shadow-[0_0_8px_rgba(217,70,239,0.8)]');
    content = content.replace(/border-fuchsia-500\/[0-9]+/g, '$& shadow-[0_0_15px_rgba(217,70,239,0.4)]');

    // Fix double drop-shadows
    content = content.replace(/(drop-shadow-\[.*?\] )+drop-shadow-\[.*?\]/g, 'drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]'); // Rough fix

    if (content !== original) {
      fs.writeFileSync(file, content);
      console.log('Updated', file);
    }
  }
});
