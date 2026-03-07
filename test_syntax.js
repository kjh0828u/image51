
const fs = require('fs');
const content = fs.readFileSync('c:/workspace/image51New/src/components/BrushEditor.tsx', 'utf8');

let curly = 0;
let round = 0;
let square = 0;
let tags = [];

// Simplified regex to match basic JSX tokens, tags, and brackets
const regex = /<(\/?[a-zA-Z0-9]+)(\s[^>]*)?>|[\{\}\[\]\(\)]/g;
let match;

while ((match = regex.exec(content)) !== null) {
    const s = match[0];
    if (s === '{') curly++;
    else if (s === '}') curly--;
    else if (s === '(') round++;
    else if (s === ')') round--;
    else if (s === '[') square++;
    else if (s === ']') square--;
    else if (s.startsWith('</')) {
        const tag = s.substring(2, s.length - 1).trim();
        const last = tags.pop();
        if (last !== tag) {
            console.log(`Mismatch: open ${last}, close ${tag} at pos ${match.index} (around line ${content.substring(0, match.index).split('\n').length})`);
        }
    } else if (s.startsWith('<') && !s.endsWith('/>') && !s.startsWith('<!') && !s.startsWith('<?')) {
        const tag = s.substring(1).split(/[ \/>]/)[0].trim();
        // Ignore known self-closing or void tags
        if (tag && !['img', 'br', 'hr', 'input', 'meta', 'link'].includes(tag.toLowerCase()) && !/^[A-Z]/.test(tag)) {
            // Note: Simple logic to skip Lucide icons for now if they are PascalCase
            tags.push(tag);
        } else if (tag && /^[A-Z]/.test(tag)) {
            tags.push(tag);
        }
    }
}

console.log('Curly:', curly);
console.log('Round:', round);
console.log('Square:', square);
console.log('Open Tags:', tags.length > 50 ? tags.length : tags);
