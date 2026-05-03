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
      
      content = content.replace(/className="([^"]*)"/g, (match, classes) => {
        let modified = false;

        // Violet buttons
        if (classes.includes('bg-violet-500') && classes.includes('text-white')) {
           classes = classes.replace('bg-violet-500', 'bg-white');
           classes = classes.replace('text-white', 'text-black');
           classes = classes.replace(/text-white/g, 'text-black'); // for multiple
           classes = classes.replace('hover:bg-violet-600', 'hover:bg-gray-200');
           classes = classes.replace('shadow-violet-500/20', 'shadow-white/20');
           modified = true;
        }
        
        // Indigo buttons
        if (classes.includes('bg-indigo-500')) {
           if (classes.includes('text-white') || classes.includes('text-black')) {
             classes = classes.replace('bg-indigo-500', 'bg-white');
             classes = classes.replace(/text-white/g, 'text-black');
             classes = classes.replace('hover:bg-indigo-600', 'hover:bg-gray-200');
             classes = classes.replace('hover:bg-indigo-400', 'hover:bg-gray-200');
             classes = classes.replace('shadow-indigo-500/20', 'shadow-white/20');
             modified = true;
           }
        }
        
        // Blue buttons
        if (classes.includes('bg-blue-500') && classes.includes('text-white') && classes.includes('shadow')) {
           classes = classes.replace('bg-blue-500', 'bg-white');
           classes = classes.replace(/text-white/g, 'text-black');
           classes = classes.replace('hover:bg-blue-600', 'hover:bg-gray-200');
           classes = classes.replace('shadow-blue-500/20', 'shadow-white/20');
           modified = true;
        }

        return `className="${classes}"`;
      });

      fs.writeFileSync(fullPath, content);
    }
  }
}

replaceColors('./src');
