const fs = require('fs');
let content = fs.readFileSync('src/components/Auth.tsx', 'utf8');
content = content.replace(/className="animate-spin rounded-full h-4 w-4 border-t-2 border-white"/g, 'className="animate-spin rounded-full h-4 w-4 border-t-2 border-black"');
fs.writeFileSync('src/components/Auth.tsx', content);
