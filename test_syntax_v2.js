
const fs = require('fs');
const content = fs.readFileSync('c:/workspace/image51New/src/components/BrushEditor.tsx', 'utf8');

const lines = content.split('\n');
const startIndex = lines.findIndex(l => l.includes('return ('));
const relevant = lines.slice(startIndex).join('\n');

let curly = 0;
let round = 0;
let square = 0;
let tags = [];

const regex = /<(\/?[a-zA-Z0-9]+)(\s[^>]*)?>|[\{\}\[\]\(\)]/g;
let match;
while ((match = regex.exec(relevant)) !== null) {
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
            console.log(`Mismatch: open ${last}, close ${tag} around line ${startIndex + 1 + relevant.substring(0, match.index).split('\n').length}`);
        }
    } else if (s.startsWith('<') && !s.endsWith('/>') && !s.startsWith('<!')) {
        const tag = s.substring(1).split(/[ \/>]/)[0].trim();
        if (tag && !['img', 'br', 'hr', 'input'].includes(tag.toLowerCase())) {
            tags.push(tag);
        }
    }
}

console.log('Curly:', curly);
console.log('Round:', round);
console.log('Square:', square);
console.log('Open Tags:', tags);
