const fs = require('fs');
let file = fs.readFileSync('src/services/storage.ts', 'utf8');

const classBlock = `    // Add audit log
    const classes = await this.getClasses();
    const cls = classes.find((c) => c.id === classId);`;

const fastClassBlock = `    // Add audit log
    // Read from localStorage synchronously to prevent blocking the UI
    const rawClasses = localStorage.getItem('classes') || localStorage.getItem(STORAGE_KEYS.CLASSES);
    let cls;
    try {
       const classes = rawClasses ? JSON.parse(rawClasses) : [];
       cls = classes.find(c => c.id === classId);
    } catch(e) {}
`;

file = file.replace(classBlock, fastClassBlock);
fs.writeFileSync('src/services/storage.ts', file);
